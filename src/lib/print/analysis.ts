/**
 * Análise de qualidade da arte enviada pelo cliente.
 *
 * Métricas calculadas (100% no cliente, via Canvas):
 *  1. DPI efetivo no tamanho final de impressão.
 *  2. Nitidez — variância do filtro Laplaciano (métrica clássica de blur detection).
 *  3. Probabilidade de texto fino — atenuação de gradientes após blur de 1px
 *     (traços de 1px perdem muita energia; blocos grossos perdem pouco).
 *  4. Luminância média — define se o reforço de texto deve usar min-filter
 *     (texto escuro em fundo claro) ou max-filter (texto claro em fundo escuro).
 */

import { PRINT_DPI, MM_PER_INCH, type ProductSpec } from "./constants";

export interface ImageAnalysis {
  naturalWidth: number;
  naturalHeight: number;
  /** DPI efetivo da imagem no tamanho final de corte. */
  effectiveDpi: number;
  /** Score de nitidez 0–100 (>= 60 = boa). */
  sharpnessScore: number;
  /** Score de probabilidade de texto fino 0–100 (>= 45 = provável). */
  thinTextScore: number;
  isBlurry: boolean;
  isLowRes: boolean;
  likelyThinText: boolean;
  /** Luminância média 0–255 (>= 128 = fundo claro → texto escuro). */
  meanLuminance: number;
  lightBackground: boolean;
}

/** Cria um canvas offscreen com o tamanho e conteúdo desejados. */
export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/** Desenha uma fonte (img/canvas) em um canvas com interpolação de alta qualidade. */
export function drawScaled(
  source: CanvasImageSource,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Converte um canvas para luminância (Uint8ClampedArray) já reduzido. */
function toGrayscale(source: HTMLCanvasElement, maxDim: number): { gray: Float32Array; w: number; h: number } {
  const scale = Math.min(1, maxDim / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const small = drawScaled(source, w, h);
  const data = small.getContext("2d")!.getImageData(0, 0, w, h).data;
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
  }
  return { gray, w, h };
}

/**
 * Blur gaussiano aproximado por box blur separável (3 passadas).
 * Implementação puro-JS com janela deslizante — funciona em todos os browsers,
 * sem depender de ctx.filter (suporte irregular no Safari).
 */
export function blurGray(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  if (radius < 1) return src;
  let current = src;
  // 3 box passes ≈ gaussiana
  for (let pass = 0; pass < 3; pass++) {
    current = boxBlurH(current, w, h, radius);
    current = boxBlurV(current, w, h, radius);
  }
  return current;
}

function boxBlurH(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const out = new Float32Array(src.length);
  const win = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = src[row] * (r + 1);
    for (let x = 1; x <= r; x++) acc += src[row + Math.min(x, w - 1)];
    for (let x = 0; x < w; x++) {
      out[row + x] = acc / win;
      const add = src[row + Math.min(x + r + 1, w - 1)];
      const sub = src[row + Math.max(x - r, 0)];
      acc += add - sub;
    }
  }
  return out;
}

function boxBlurV(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const out = new Float32Array(src.length);
  const win = 2 * r + 1;
  for (let x = 0; x < w; x++) {
    let acc = src[x] * (r + 1);
    for (let y = 1; y <= r; y++) acc += src[Math.min(y, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / win;
      const add = src[Math.min(y + r + 1, h - 1) * w + x];
      const sub = src[Math.max(y - r, 0) * w + x];
      acc += add - sub;
    }
  }
  return out;
}

/** Gradiente de Sobel (magnitude) de uma imagem em tons de cinza. */
function sobelMagnitude(gray: Float32Array, w: number, h: number): Float32Array {
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = gray[i - w - 1], tc = gray[i - w], tr = gray[i - w + 1];
      const ml = gray[i - 1], mr = gray[i + 1];
      const bl = gray[i + w - 1], bc = gray[i + w], br = gray[i + w + 1];
      const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
      const gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
      mag[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return mag;
}

/**
 * Analisa nitidez (variância Laplaciana) e texto fino (atenuação de gradiente).
 * `targetWidthMm/HeightMm` são as dimensões de corte do produto.
 */
export function analyzeArtwork(
  source: HTMLCanvasElement,
  spec: ProductSpec,
): ImageAnalysis {
  const naturalWidth = source.width;
  const naturalHeight = source.height;

  // ---- 1. DPI efetivo no tamanho final de corte ----
  const widthInches = spec.widthMm / MM_PER_INCH;
  const heightInches = spec.heightMm / MM_PER_INCH;
  const effectiveDpi = Math.round(Math.min(naturalWidth / widthInches, naturalHeight / heightInches));

  // ---- 2. Nitidez: variância Laplaciana em versão reduzida ----
  const { gray, w, h } = toGrayscale(source, 800);
  const blurred = blurGray(gray, w, h, 1);
  let lapSum = 0;
  let lapSumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      lapSum += lap;
      lapSumSq += lap * lap;
      n++;
    }
  }
  const mean = lapSum / Math.max(1, n);
  const variance = lapSumSq / Math.max(1, n) - mean * mean;
  // Mapeia variância (~0 borrada … ~3000+ nítida) para 0–100
  const sharpnessScore = Math.max(0, Math.min(100, Math.round(Math.sqrt(Math.max(0, variance)) / 0.6)));

  // ---- 3. Texto fino: perda relativa de gradiente após blur de 1px ----
  const g1 = sobelMagnitude(gray, w, h);
  const g2 = sobelMagnitude(blurred, w, h);
  let edgePixels = 0;
  let attenuation = 0;
  for (let i = 0; i < g1.length; i++) {
    if (g1[i] > 60) {
      edgePixels++;
      attenuation += Math.max(0, g1[i] - g2[i]) / (g1[i] + 1e-6);
    }
  }
  const avgAttenuation = edgePixels > 0 ? attenuation / edgePixels : 0;
  const thinTextScore = Math.max(0, Math.min(100, Math.round(avgAttenuation * 160)));

  // ---- 4. Luminância média (fundo claro vs escuro) ----
  let lumSum = 0;
  for (let i = 0; i < gray.length; i++) lumSum += gray[i];
  const meanLuminance = lumSum / Math.max(1, gray.length);

  return {
    naturalWidth,
    naturalHeight,
    effectiveDpi,
    sharpnessScore,
    thinTextScore,
    isBlurry: sharpnessScore < 45,
    isLowRes: effectiveDpi < PRINT_DPI,
    likelyThinText: thinTextScore >= 45,
    meanLuminance,
    lightBackground: meanLuminance >= 128,
  };
}
