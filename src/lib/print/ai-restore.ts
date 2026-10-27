/**
 * Restauração de artes de baixa resolução via IA (client-side helpers).
 *
 * A API de edição de imagem aceita apenas 7 tamanhos fixos (ex.: 864×1152).
 * Para preservar a composição da arte em qualquer proporção:
 *
 *  1. PLANEJAR   — escolhe o tamanho de IA com proporção mais próxima da arte
 *                  (comparação logarítmica de ratio, simétrica p/ retrato/paisagem).
 *  2. ENQUADRAR  — a arte é contida (letterbox branco, estilo "papel") dentro do
 *                  tamanho-alvo; a posição/área exata da arte é guardada no plano.
 *  3. RESTAURAR  — a IA recria a imagem no tamanho-alvo (nitidez + texto nítido).
 *  4. RECOLHER   — do resultado, recorta exatamente a região da arte (remove o
 *                  letterbox) e devolve um canvas que substitui a fonte original.
 *
 * Assim a arte restaurada mantém a mesma proporção do arquivo enviado e o resto
 * do pipeline (análise → enquadramento → tratamento → imposição) funciona sem
 * nenhuma alteração.
 */

import { makeCanvas } from "./analysis";

/** Tamanhos aceitos pela API de edição de imagem. */
export const AI_SIZES = [
  { w: 1024, h: 1024 },
  { w: 768, h: 1344 },
  { w: 864, h: 1152 },
  { w: 1344, h: 768 },
  { w: 1152, h: 864 },
  { w: 1440, h: 720 },
  { w: 720, h: 1440 },
] as const;

export interface AiPlacement {
  /** String de tamanho enviada à API, ex. "864x1152". */
  size: string;
  /** Dimensões da imagem enviada e devolvida pela IA. */
  targetW: number;
  targetH: number;
  /** Posição do canto da arte dentro do alvo (letterbox centralizado). */
  dx: number;
  dy: number;
  /** Tamanho da arte dentro do alvo. */
  drawW: number;
  drawH: number;
}

/** Escolhe o tamanho de IA mais próximo da proporção e calcula o letterbox. */
export function planAiPlacement(srcW: number, srcH: number): AiPlacement {
  const srcRatio = srcW / srcH;
  let best: (typeof AI_SIZES)[number] = AI_SIZES[0];
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const s of AI_SIZES) {
    // log-ratio: diferença simétrica (retrato/paisagem) e multiplicativa
    const diff = Math.abs(Math.log(s.w / s.h / srcRatio));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s;
    }
  }
  // "contain": a arte inteira cabe dentro do alvo, sem distorção
  const scale = Math.min(best.w / srcW, best.h / srcH);
  const drawW = Math.max(1, Math.round(srcW * scale));
  const drawH = Math.max(1, Math.round(srcH * scale));
  return {
    size: `${best.w}x${best.h}`,
    targetW: best.w,
    targetH: best.h,
    dx: Math.round((best.w - drawW) / 2),
    dy: Math.round((best.h - drawH) / 2),
    drawW,
    drawH,
  };
}

/** Monta a imagem de entrada da IA: arte contida em fundo branco do tamanho-alvo. */
export function buildAiInput(source: HTMLCanvasElement, plan: AiPlacement): string {
  const canvas = makeCanvas(plan.targetW, plan.targetH);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, plan.targetW, plan.targetH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, plan.dx, plan.dy, plan.drawW, plan.drawH);
  return canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * Recorta da resposta da IA a região correspondente à arte original.
 * Se a IA devolver dimensão diferente da pedida, normaliza antes do recorte.
 */
export function cropAiResult(aiCanvas: HTMLCanvasElement, plan: AiPlacement): HTMLCanvasElement {
  let norm = aiCanvas;
  if (aiCanvas.width !== plan.targetW || aiCanvas.height !== plan.targetH) {
    norm = makeCanvas(plan.targetW, plan.targetH);
    const nctx = norm.getContext("2d")!;
    nctx.imageSmoothingEnabled = true;
    nctx.imageSmoothingQuality = "high";
    nctx.drawImage(aiCanvas, 0, 0, plan.targetW, plan.targetH);
  }
  const out = makeCanvas(plan.drawW, plan.drawH);
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    norm,
    plan.dx, plan.dy, plan.drawW, plan.drawH, // região da arte no resultado da IA
    0, 0, plan.drawW, plan.drawH,             // canvas de saída no tamanho da arte
  );
  return out;
}

/** Chama a API de restauração e devolve o data URL (PNG) da arte recriada. */
export async function restoreWithAI(imageDataUrl: string, size: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch("/api/enhance-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageDataUrl, size }),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Falha na restauração (HTTP ${res.status}).`);
  }
  const data: unknown = await res.json();
  const base64 =
    typeof data === "object" && data !== null && "image" in data
      ? (data as { image: unknown }).image
      : null;
  if (typeof base64 !== "string" || base64.length < 100) {
    throw new Error("Resposta da IA vazia ou inválida.");
  }
  return `data:image/png;base64,${base64}`;
}

/** Carrega um data URL em um canvas no tamanho natural. */
export async function dataUrlToCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Falha ao decodificar a imagem restaurada."));
    img.src = dataUrl;
  });
  const canvas = makeCanvas(img.naturalWidth, img.naturalHeight);
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  return canvas;
}
