/**
 * Super-resolução Real-ESRGAN (General x4v3) 100% server-side — gratuita.
 *
 * Por quê: a restauração via Gemini exige crédito no AI Studio (HTTP 402 quando
 * a carteira pré-paga está a US$ 0). Este provedor roda o modelo de super-
 * resolução REAL-ESRGAN (SRVGGNetCompact, BSD-3-Clause) LOCALMENTE no Node via
 * onnxruntime-node — sem API externa, sem chave, sem quota, sem custo. Quando
 * o crédito do Gemini voltar, o modo "auto" da rota /api/enhance-ai volta a
 * preferir o Gemini automaticamente (este módulo continua como rede de reserva).
 *
 * Modelo: Real-ESRGAN-General-x4v3 (xinntao/Real-ESRGAN, exportado pela
 * Qualcomm AI Hub — bucket S3 público, ~4.5 MB zip: .onnx + pesos externos).
 *   Entrada : "image"  [1,3,128,128] float32 NCHW, faixa 0.0–1.0
 *   Saída   : "upscaled_image" [1,3,512,512] (×4), mesma faixa
 *
 * Estratégia: a arte chega em letterbox branco (até 1440×720 pelos 7 tamanhos
 * do cliente). Processamos tiles de 128×128 com overlap 32 (sem costuras),
 * remontamos em 4× e devolvemos no TAMANHO ORIGINAL (o cliente normaliza e
 * recorta a região da arte — mesmo contrato do Gemini).
 *
 * Custos medidos (Xeon 1 thread): ~300 ms/tile → pior caso (1024×1024,
 * 121 tiles) ≈ 35 s; RSS ≈ 300 MB. Limite de memória do backend: 1024 MiB.
 *
 * Concorrência: no máximo 2 inferências simultâneas por instância + 2 na fila
 * (protege RAM/CPU do Cloud Run cpu=1). Acima disso → 503 "ocupado".
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { unzipSync } from "fflate";
import type { InferenceSession } from "onnxruntime-node";

/** Módulo onnxruntime-node carregado sob demanda (binding nativo). */
type OrtModule = typeof import("onnxruntime-node");

/** ZIP oficial (onnx float) no bucket público da Qualcomm AI Hub. */
const DEFAULT_MODEL_ZIP_URL =
  "https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/real_esrgan_general_x4v3/releases/v0.65.0/real_esrgan_general_x4v3-onnx-float.zip";

const MODEL_DIR = path.join(os.tmpdir(), "realesrgan-x4v3");
const MODEL_ONNX = path.join(MODEL_DIR, "real_esrgan_general_x4v3.onnx");
const MODEL_DATA = path.join(MODEL_DIR, "real_esrgan_general_x4v3.data");

/** Geometria do tiling (validada: sem costuras visíveis). */
const TILE = 128;
const OVERLAP = 32;
const STRIDE = TILE - OVERLAP; // 96

/** Teto de entrada: os 7 tamanhos do cliente cabem (máx. 1024×1024 ≈ 1,05 Mpx). */
const MAX_SIDE = 1440;
const MAX_PIXELS = 1_200_000;

export class EsrganError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "EsrganError";
    this.status = status;
  }
}

/* ------------------------------------------------------------------ */
/* Sessão ORT (singleton por processo) + download do modelo em /tmp    */
/* ------------------------------------------------------------------ */

let sessionPromise: Promise<InferenceSession> | null = null;
let ortRef: OrtModule | null = null;

async function ensureModelFiles(): Promise<void> {
  if (
    fs.existsSync(MODEL_ONNX) &&
    fs.statSync(MODEL_ONNX).size > 100_000 &&
    fs.existsSync(MODEL_DATA) &&
    fs.statSync(MODEL_DATA).size > 1_000_000
  ) {
    return;
  }
  const url = process.env.ESRGAN_MODEL_URL?.trim() || DEFAULT_MODEL_ZIP_URL;
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new EsrganError(
      "Não foi possível baixar o modelo de super-resolução (rede do servidor). Tente novamente mais tarde.",
      502,
    );
  }
  if (!res.ok) {
    throw new EsrganError(
      `Fonte do modelo de super-resolução indisponível (HTTP ${res.status}). Tente novamente mais tarde.`,
      502,
    );
  }
  const zip = Buffer.from(await res.arrayBuffer());
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(zip));
  } catch {
    throw new EsrganError("Arquivo do modelo de super-resolução corrompido no download.", 502);
  }
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  let onnxOk = false;
  let dataOk = false;
  for (const name of Object.keys(entries)) {
    const base = name.split("/").pop();
    if (!base) continue;
    fs.writeFileSync(path.join(MODEL_DIR, base), Buffer.from(entries[name]));
    if (base.endsWith(".onnx")) onnxOk = true;
    if (base.endsWith(".data")) dataOk = true;
  }
  if (!onnxOk || !dataOk) {
    throw new EsrganError("Modelo de super-resolução incompleto no pacote baixado.", 502);
  }
}

async function ensureSession(): Promise<InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      await ensureModelFiles();
      const ort = await import("onnxruntime-node");
      ortRef = ort;
      return ort.InferenceSession.create(MODEL_ONNX, {
        graphOptimizationLevel: "all",
        executionMode: "sequential",
        intraOpNumThreads: 1, // Cloud Run cpu=1: evita oversubscription
      });
    })();
    // Falha permanentemente cacheada não é desejável: libera para nova tentativa.
    sessionPromise.catch(() => {
      sessionPromise = null;
    });
  }
  return sessionPromise;
}

/* ------------------------------------------------------------------ */
/* Semáforo: protege RAM/CPU da instância                              */
/* ------------------------------------------------------------------ */

const MAX_RUNNING = 2;
const MAX_QUEUE = 2;
let running = 0;
const waiters: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (running < MAX_RUNNING) {
    running++;
    return;
  }
  if (waiters.length >= MAX_QUEUE) {
    throw new EsrganError(
      "O servidor de super-resolução está ocupado neste momento. Aguarde alguns segundos e tente de novo.",
      503,
    );
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  running++;
}

function releaseSlot(): void {
  running--;
  const next = waiters.shift();
  if (next) next();
}

/* ------------------------------------------------------------------ */
/* Inferência tiled                                                    */
/* ------------------------------------------------------------------ */

/** Posições de tile com clamp na borda direita/inferior (cobertura total). */
function tilePositions(total: number): number[] {
  if (total <= TILE) return [0];
  const pos: number[] = [];
  for (let p = 0; p + TILE < total; p += STRIDE) pos.push(p);
  pos.push(total - TILE);
  return pos;
}

async function upscaleTiled(
  ort: OrtModule,
  session: InferenceSession,
  rgb: Uint8Array,
  w: number,
  h: number,
  deadline: number,
): Promise<{ out: Uint8Array; ow: number; oh: number }> {
  // Borda: se o lado é menor que o tile, estende com branco (letterbox é branco).
  const padW = Math.max(0, TILE - w);
  const padH = Math.max(0, TILE - h);
  let src = rgb;
  let W = w;
  let H = h;
  if (padW > 0 || padH > 0) {
    const padded = await sharp(Buffer.from(rgb), { raw: { width: w, height: h, channels: 3 } })
      .extend({ top: 0, left: 0, right: padW, bottom: padH, background: { r: 255, g: 255, b: 255 } })
      .raw()
      .toBuffer();
    src = new Uint8Array(padded);
    W = w + padW;
    H = h + padH;
  }

  const ow = W * 4;
  const oh = H * 4;
  const out = new Uint8Array(ow * oh * 3);
  const xs = tilePositions(W);
  const ys = tilePositions(H);

  for (const py of ys) {
    for (const px of xs) {
      if (Date.now() > deadline) {
        throw new EsrganError(
          "A super-resolução demorou demais para concluir. Tente novamente em instantes.",
          504,
        );
      }

      // Tile de entrada: RGB intercalado → NCHW float32 [0,1].
      const tile = new Float32Array(3 * TILE * TILE);
      for (let y = 0; y < TILE; y++) {
        const srcRow = ((py + y) * W + px) * 3;
        for (let x = 0; x < TILE; x++) {
          const s = srcRow + x * 3;
          tile[y * TILE + x] = src[s] / 255;
          tile[TILE * TILE + y * TILE + x] = src[s + 1] / 255;
          tile[2 * TILE * TILE + y * TILE + x] = src[s + 2] / 255;
        }
      }

      const results = await session.run({
        image: new ort.Tensor("float32", tile, [1, 3, TILE, TILE]),
      });
      // Tensor NCHW [1,3,512,512] → RGB intercalado na região válida do tile.
      const odata = results.upscaled_image.data as Float32Array;
      const cutL = px > 0 ? OVERLAP / 2 : 0;
      const cutR = px + TILE < W ? OVERLAP / 2 : 0;
      const cutT = py > 0 ? OVERLAP / 2 : 0;
      const cutB = py + TILE < H ? OVERLAP / 2 : 0;
      const OT = TILE * 4; // 512
      const validW = (TILE - cutL - cutR) * 4;
      for (let c = 0; c < 3; c++) {
        const plane = c * OT * OT;
        for (let y = cutT; y < TILE - cutB; y++) {
          for (let sy = 0; sy < 4; sy++) {
            const y4 = y * 4 + sy;
            const srcRow = plane + y4 * OT + cutL * 4;
            const dstRow = ((py + y) * 4 + sy) * ow * 3 + (px + cutL) * 4 * 3 + c;
            for (let i = 0; i < validW; i++) {
              const v = odata[srcRow + i] * 255;
              out[dstRow + i * 3] = v <= 0 ? 0 : v >= 255 ? 255 : v | 0;
            }
          }
        }
      }
    }
  }

  return { out, ow, oh };
}

/* ------------------------------------------------------------------ */
/* API pública                                                         */
/* ------------------------------------------------------------------ */

export interface EsrganResult {
  base64: string;
  mime: "image/png";
  width: number;
  height: number;
}

/**
 * Restauração por super-resolução: recebe o data URL da arte (letterbox ou
 * não) e devolve PNG base64 NO MESMO TAMANHO da entrada, com bordas/texto
 * mais nítidos e artefatos de compressão removidos. Nunca inventa conteúdo.
 */
export async function esrganRestore(dataUrl: string, budgetMs = 120_000): Promise<EsrganResult> {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) {
    throw new EsrganError("Imagem inválida para super-resolução (esperado data URL PNG/JPEG/WebP).", 400);
  }
  const input = Buffer.from(match[2], "base64");

  await acquireSlot();
  try {
    // Pré: alpha plano sobre branco (mesma estética do letterbox do cliente).
    const base = sharp(input).flatten({ background: "#ffffff" }).removeAlpha();
    const meta = await base.metadata();
    const w0 = meta.width ?? 0;
    const h0 = meta.height ?? 0;
    if (w0 < 8 || h0 < 8) {
      throw new EsrganError("Imagem muito pequena para super-resolução.", 400);
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0), Math.sqrt(MAX_PIXELS / (w0 * h0)));
    const rw = Math.max(1, Math.round(w0 * scale));
    const rh = Math.max(1, Math.round(h0 * scale));

    const raw = new Uint8Array(
      await base.resize(rw, rh, { kernel: "lanczos3" }).raw().toBuffer(),
    );

    const session = await ensureSession();
    const ort = ortRef as OrtModule;
    const deadline = Date.now() + budgetMs;
    const { out, ow, oh } = await upscaleTiled(ort, session, raw, rw, rh, deadline);

    // Pós: de volta ao tamanho de entrada (contrato estável para o cliente).
    const png = await sharp(Buffer.from(out), { raw: { width: ow, height: oh, channels: 3 } })
      .resize(rw, rh, { kernel: "lanczos3" })
      .png({ compressionLevel: 6 })
      .toBuffer();

    return { base64: png.toString("base64"), mime: "image/png", width: rw, height: rh };
  } finally {
    releaseSlot();
  }
}
