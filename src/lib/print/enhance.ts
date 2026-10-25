/**
 * Tratamento de arte para impressão — 100% client-side via Canvas/pixel ops.
 *
 *  1. preparePrintCanvas(): reamostra a arte para o tamanho exato de impressão (300 DPI)
 *     com interpolação de alta qualidade.
 *  2. unsharpMask(): máscara de contraste (unsharp mask) clássica, com threshold
 *     para não amplificar ruído — recupera nitidez de artes borradas/upscaladas.
 *  3. reinforceThinText(): reforço morfológico (dilação direcionada) que engrossa
 *     traços finos de texto sem afetar áreas planas:
 *      - fundo claro  → min-filter (dilação do escuro) → engrossa texto escuro;
 *      - fundo escuro → max-filter (dilação do claro) → engrossa texto claro.
 *     A mistura final é limitada por uma máscara de borda, preservando fotos e
 *     áreas chapadas.
 */

import { type ProductSpec, productPixelSize } from "./constants";
import { type ImageAnalysis, makeCanvas, blurGray } from "./analysis";

export interface EnhanceSettings {
  sharpenEnabled: boolean;
  /** Intensidade do unsharp mask (0–1.5). */
  sharpenAmount: number;
  /** Raio do blur interno do unsharp mask, em px @300DPI. */
  sharpenRadius: number;
  /** Threshold de luminância para não amplificar ruído (0–50). */
  sharpenThreshold: number;
  textReinforceEnabled: boolean;
  /** Força do reforço de texto (0–1). */
  textStrength: number;
  /** Direção do reforço: automático por fundo, ou forçado. */
  textMode: "auto" | "dark-on-light" | "light-on-dark";
}

export function recommendSettings(a: ImageAnalysis): EnhanceSettings {
  const sharpenAmount = a.sharpnessScore < 30 ? 1.15 : a.sharpnessScore < 45 ? 0.95 : a.sharpnessScore < 65 ? 0.65 : 0.35;
  const textStrength = a.thinTextScore >= 70 ? 0.85 : a.thinTextScore >= 45 ? 0.7 : 0.4;
  return {
    sharpenEnabled: true,
    sharpenAmount,
    sharpenRadius: 2,
    sharpenThreshold: 4,
    textReinforceEnabled: true,
    textStrength,
    textMode: "auto",
  };
}

/** Reamostra a arte para o tamanho exato de impressão do produto (300 DPI). */
export function preparePrintCanvas(
  source: HTMLCanvasElement,
  spec: ProductSpec,
): HTMLCanvasElement {
  const { widthPx, heightPx } = productPixelSize(spec);
  const canvas = makeCanvas(widthPx, heightPx);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Fundo branco garante bordas válidas caso a arte tenha transparência (PNG).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, widthPx, heightPx);
  ctx.drawImage(source, 0, 0, widthPx, heightPx);
  return canvas;
}

// ---------------------------------------------------------------------------
// Utilitários de pixel
// ---------------------------------------------------------------------------

interface Plane {
  data: Float32Array;
  w: number;
  h: number;
}

function extractPlanes(img: ImageData): Plane[] {
  const { width: w, height: h, data } = img;
  const planes: Plane[] = [];
  for (let c = 0; c < 3; c++) {
    const arr = new Float32Array(w * h);
    for (let i = 0, p = c; i < arr.length; i++, p += 4) arr[i] = data[p];
    planes.push({ data: arr, w, h });
  }
  return planes;
}

function boxBlurPlane(plane: Plane, radius: number): Float32Array {
  return blurGray(plane.data, plane.w, plane.h, radius);
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * Máscara de contraste (unsharp mask) direto no canvas.
 * out = orig + amount * (orig - blur), suavizada por threshold de luminância.
 */
export function unsharpMaskInPlace(
  canvas: HTMLCanvasElement,
  amount: number,
  radius: number,
  threshold: number,
): void {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const planes = extractPlanes(img);
  const blurred = planes.map((p) => boxBlurPlane(p, Math.max(1, Math.round(radius))));

  const { data, width: w, height: h } = img;
  const thr = threshold;
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    // Diferença de luminância para gatilho do threshold
    const lumO = 0.2126 * planes[0].data[i] + 0.7152 * planes[1].data[i] + 0.0722 * planes[2].data[i];
    const lumB = 0.2126 * blurred[0][i] + 0.7152 * blurred[1][i] + 0.0722 * blurred[2][i];
    const dl = Math.abs(lumO - lumB);
    if (dl <= thr) continue;
    // Ramp suave acima do threshold (evita halo e ruído)
    const t = Math.min(1, (dl - thr) / 12);
    const k = amount * t;
    data[p] = clamp255(planes[0].data[i] + k * (planes[0].data[i] - blurred[0][i]));
    data[p + 1] = clamp255(planes[1].data[i] + k * (planes[1].data[i] - blurred[1][i]));
    data[p + 2] = clamp255(planes[2].data[i] + k * (planes[2].data[i] - blurred[2][i]));
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------------
// Reforço de texto fino (morfologia direcionada)
// ---------------------------------------------------------------------------

/** Min-filter (erosão do claro = dilação do escuro) ou Max-filter, separável 3×3. */
function morphPlane(plane: Plane, op: "min" | "max"): Float32Array {
  const { data: src, w, h } = plane;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  // Passada horizontal
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const a = src[row + Math.max(0, x - 1)];
      const b = src[row + x];
      const c = src[row + Math.min(w - 1, x + 1)];
      tmp[row + x] = op === "min" ? Math.min(a, b, c) : Math.max(a, b, c);
    }
  }
  // Passada vertical
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = tmp[Math.max(0, y - 1) * w + x];
      const b = tmp[y * w + x];
      const c = tmp[Math.min(h - 1, y + 1) * w + x];
      out[y * w + x] = op === "min" ? Math.min(a, b, c) : Math.max(a, b, c);
    }
  }
  return out;
}

/**
 * Engrossa traços finos. Só altera pixels onde a morfologia realmente mudou
 * (máscara de borda), preservando fotos e áreas chapadas.
 */
export function reinforceThinTextInPlace(
  canvas: HTMLCanvasElement,
  strength: number,
  mode: "dark-on-light" | "light-on-dark",
): void {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const planes = extractPlanes(img);
  const morphed = planes.map((p) => morphPlane(p, mode === "dark-on-light" ? "min" : "max"));

  const { data, width: w, height: h } = img;
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    const lumO = 0.2126 * planes[0].data[i] + 0.7152 * planes[1].data[i] + 0.0722 * planes[2].data[i];
    const lumM = 0.2126 * morphed[0][i] + 0.7152 * morphed[1][i] + 0.0722 * morphed[2][i];
    // Máscara: só onde a morfologia mudou a estrutura (traços/bordas)
    const change = Math.abs(lumO - lumM);
    if (change < 2) continue;
    const mask = Math.min(1, change / 40) * strength;
    data[p] = clamp255(planes[0].data[i] + (morphed[0][i] - planes[0].data[i]) * mask);
    data[p + 1] = clamp255(planes[1].data[i] + (morphed[1][i] - planes[1].data[i]) * mask);
    data[p + 2] = clamp255(planes[2].data[i] + (morphed[2][i] - planes[2].data[i]) * mask);
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------------
// Pipeline completo
// ---------------------------------------------------------------------------

export interface EnhanceResult {
  canvas: HTMLCanvasElement;
  appliedSharpen: boolean;
  appliedTextReinforce: boolean;
  textModeResolved: "dark-on-light" | "light-on-dark";
}

/**
 * Executa o pipeline de tratamento sobre a arte já reamostrada.
 * Retorna um NOVO canvas (o original permanece intacto para comparação).
 */
export function applyEnhancements(
  prepared: HTMLCanvasElement,
  settings: EnhanceSettings,
  analysis: ImageAnalysis,
): EnhanceResult {
  const out = makeCanvas(prepared.width, prepared.height);
  out.getContext("2d")!.drawImage(prepared, 0, 0);

  let appliedSharpen = false;
  let appliedTextReinforce = false;

  if (settings.sharpenEnabled && settings.sharpenAmount > 0.01) {
    unsharpMaskInPlace(out, settings.sharpenAmount, settings.sharpenRadius, settings.sharpenThreshold);
    appliedSharpen = true;
  }

  const resolvedMode: "dark-on-light" | "light-on-dark" =
    settings.textMode === "auto"
      ? analysis.lightBackground
        ? "dark-on-light"
        : "light-on-dark"
      : settings.textMode;

  if (settings.textReinforceEnabled && settings.textStrength > 0.01) {
    reinforceThinTextInPlace(out, settings.textStrength, resolvedMode);
    appliedTextReinforce = true;
  }

  return { canvas: out, appliedSharpen, appliedTextReinforce, textModeResolved: resolvedMode };
}
