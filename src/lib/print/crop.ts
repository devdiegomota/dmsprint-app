/**
 * Recorte e rotação (90°) da arte original antes do tratamento.
 *
 * A tela de recorte ("Recortar a arte") existe para artes enviadas com fundo em
 * volta do cartão/panfleto (ex.: foto da peça em um ambiente) ou na orientação
 * errada (cartão em pé / panfleto deitado): o operador isola a peça e gira para
 * a orientação correta sem sair do app.
 *
 * Convenções:
 *  - Rotação é acumulada em graus no sentido horário (0 / 90 / 180 / 270).
 *  - O retângulo de recorte vive no espaço da imagem ROTACIONADA (imagem de
 *    trabalho); ao girar, ele é remapeado junto para continuar sobre o mesmo
 *    conteúdo.
 *  - Todas as funções são puras (entrada/saída por parâmetro) e não interpolam
 *    — a cópia de pixels é 1:1, sem reamostragem.
 */

import { makeCanvas } from "./analysis";

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Estado do editor de recorte, persistido no page.tsx para sobreviver à navegação entre etapas. */
export interface CropSession {
  /** Rotação acumulada (cw) em graus: 0 / 90 / 180 / 270. */
  rotation: number;
  /** Retângulo de recorte no espaço rotacionado atual (px da imagem de trabalho). */
  rect: CropRect;
}

/** Gira a imagem 90° (cw = horário, ccw = anti-horário) sem interpolação. */
export function rotateCanvas90(src: HTMLCanvasElement, dir: "cw" | "ccw"): HTMLCanvasElement {
  const dst = makeCanvas(src.height, src.width);
  const ctx = dst.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  if (dir === "cw") {
    // (x, y) → (H − y, x)
    ctx.translate(src.height, 0);
    ctx.rotate(Math.PI / 2);
  } else {
    // (x, y) → (y, W − x)
    ctx.translate(0, src.width);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(src, 0, 0);
  return dst;
}

/**
 * Remapeia o retângulo de recorte para o novo espaço após girar a imagem 90°.
 * O retângulo gira junto — o recorte continua exatamente sobre o mesmo conteúdo.
 * `srcW`/`srcH` são as dimensões ANTES da rotação.
 */
export function rotateRect(rect: CropRect, srcW: number, srcH: number, dir: "cw" | "ccw"): CropRect {
  if (dir === "cw") {
    // (x, y) → (srcH − y, x) ⇒ novo x = srcH − (y + h), novo y = x, w ↔ h
    return { x: srcH - (rect.y + rect.h), y: rect.x, w: rect.h, h: rect.w };
  }
  // ccw: (x, y) → (y, srcW − x) ⇒ novo x = y, novo y = srcW − (x + w), w ↔ h
  return { x: rect.y, y: srcW - (rect.x + rect.w), w: rect.h, h: rect.w };
}

/** Extrai o recorte da imagem de trabalho (cópia 1:1 dos pixels, sem reamostragem). */
export function cropCanvas(src: HTMLCanvasElement, rect: CropRect): HTMLCanvasElement {
  const x = Math.max(0, Math.round(rect.x));
  const y = Math.max(0, Math.round(rect.y));
  const w = Math.max(1, Math.min(src.width - x, Math.round(rect.w)));
  const h = Math.max(1, Math.min(src.height - y, Math.round(rect.h)));
  const dst = makeCanvas(w, h);
  dst.getContext("2d")!.drawImage(src, x, y, w, h, 0, 0, w, h);
  return dst;
}

/** O recorte cobre a imagem inteira? (tolerância de 0,5 px para arredondamentos) */
export function isFullRect(rect: CropRect, w: number, h: number): boolean {
  return rect.x <= 0.5 && rect.y <= 0.5 && rect.w >= w - 0.5 && rect.h >= h - 0.5;
}

/** Há algo aplicável nesta sessão (rotação ≠ 0 ou recorte menor que a imagem)? */
export function sessionHasCrop(
  session: { rotation: number; rect: CropRect },
  srcW: number,
  srcH: number,
): boolean {
  const swapped = Math.abs(session.rotation % 180) === 90;
  const w = swapped ? srcH : srcW;
  const h = swapped ? srcW : srcH;
  return session.rotation % 360 !== 0 || !isFullRect(session.rect, w, h);
}

/** Compara duas sessões com tolerância de 0,5 px (para saber se o pipeline já consumiu este recorte). */
export function sessionsEqual(a: CropSession, b: CropSession): boolean {
  if (a.rotation % 360 !== b.rotation % 360) return false;
  const t = 0.5;
  return (
    Math.abs(a.rect.x - b.rect.x) <= t &&
    Math.abs(a.rect.y - b.rect.y) <= t &&
    Math.abs(a.rect.w - b.rect.w) <= t &&
    Math.abs(a.rect.h - b.rect.h) <= t
  );
}

/** DPI efetivo de uma largura em px no tamanho de corte físico (mm). */
export function effectiveDpi(px: number, mm: number): number {
  return Math.round(px / (mm / 25.4));
}

// ---------------------------------------------------------------------------
// Detecção automática da borda da peça (transplante e evolução do recorte
// antigo em diálogo): encontra o bounding box do conteúdo contra um fundo
// uniforme (branco/papel/mesa lisa) estimado a partir dos 4 cantos.
// ---------------------------------------------------------------------------

/** Lado máximo da análise (downsample para velocidade em artes grandes). */
const DETECT_MAX_SIDE = 1000;
/** Diferença mínima de cor (max |ΔR|,|ΔG|,|ΔB|) para o pixel contar como conteúdo. */
const DETECT_TOLERANCE = 30;
/** Divergência máxima de cor entre os 4 cantos para aceitar o fundo como uniforme. */
const DETECT_CORNER_SPREAD = 24;

/**
 * Núcleo PURO do detector (testável fora do navegador): recebe os pixels RGBA
 * e devolve o bounding box do conteúdo, ou null quando não há confiança.
 * Robusto a ruído isolado: uma linha/coluna só é aceita como borda se tiver
 * uma fração mínima de conteúdo (3 pixels soltos não esticam a caixa).
 */
export function detectBoundsFromPixels(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): CropRect | null {
  if (w < 16 || h < 16) return null;

  // 1) Fundo estimado pela média de um quadrado em cada canto. Cantos com cores
  //    muito diferentes entre si = fundo não uniforme (foto em ambiente) → aborta.
  const patch = Math.max(6, Math.min(40, Math.round(Math.min(w, h) * 0.06)));
  const corners: Array<[number, number, number]> = [];
  const offs: Array<[number, number]> = [
    [0, 0],
    [w - patch, 0],
    [0, h - patch],
    [w - patch, h - patch],
  ];
  for (const [ox, oy] of offs) {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let y = oy; y < oy + patch; y++) {
      for (let x = ox; x < ox + patch; x++) {
        const i = (y * w + x) * 4;
        if (data[i + 3] < 128) continue; // pixel transparente não define fundo
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n++;
      }
    }
    if (n === 0) return null;
    corners.push([r / n, g / n, b / n]);
  }
  let spread = 0;
  // Fundo = MAIORIA dos cantos (≥3 mutuamente próximos): tolera a peça ocupar
  // um dos cantos e continua rejeitando fundos não uniformes (2×2 divergentes).
  const close = (a: [number, number, number], b: [number, number, number]) =>
    Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])) <=
    DETECT_CORNER_SPREAD;
  let group: Array<[number, number, number]> = [];
  for (const seed of corners) {
    const g = corners.filter((c) => close(seed, c));
    if (g.length > group.length) group = g;
  }
  if (group.length < 3) return null; // fundo não uniforme (ex.: foto em ambiente)
  for (let c = 0; c < 3; c++) {
    let mn = 255;
    let mx = 0;
    for (const col of group) {
      mn = Math.min(mn, col[c]);
      mx = Math.max(mx, col[c]);
    }
    spread = Math.max(spread, mx - mn);
  }
  if (spread > DETECT_CORNER_SPREAD) return null;
  const bg = [0, 1, 2].map((c) => group.reduce((s, col) => s + col[c], 0) / group.length);

  // 2) Máscara de conteúdo + contagens por linha/coluna (uma passada).
  const colCount = new Int32Array(w);
  const rowCount = new Int32Array(h);
  let content = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = (row + x) * 4;
      const delta = Math.max(
        Math.abs(data[i] - bg[0]),
        Math.abs(data[i + 1] - bg[1]),
        Math.abs(data[i + 2] - bg[2]),
      );
      const isContent = data[i + 3] < 128 || delta > DETECT_TOLERANCE;
      if (isContent) {
        colCount[x]++;
        rowCount[y]++;
        content++;
      }
    }
  }

  // 3) Salvaguardas de confiança — na dúvida, devolve null (a UI orienta o ajuste manual).
  const ratio = content / (w * h);
  if (ratio < 0.004 || ratio > 0.97) return null; // vazio ou peça já ocupa tudo

  const colThr = Math.max(2, Math.round(h * 0.008));
  const rowThr = Math.max(2, Math.round(w * 0.008));
  let x0 = -1;
  let x1 = -1;
  let y0 = -1;
  let y1 = -1;
  for (let x = 0; x < w; x++) if (colCount[x] >= colThr) { x0 = x; break; }
  for (let x = w - 1; x >= 0; x--) if (colCount[x] >= colThr) { x1 = x; break; }
  for (let y = 0; y < h; y++) if (rowCount[y] >= rowThr) { y0 = y; break; }
  for (let y = h - 1; y >= 0; y--) if (rowCount[y] >= rowThr) { y1 = y; break; }
  if (x0 < 0 || y0 < 0 || x1 <= x0 || y1 <= y0) return null;

  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  if (bw < w * 0.05 || bh < h * 0.05) return null; // "peça" minúscula = ruído
  if (bw >= w * 0.98 && bh >= h * 0.98) return null; // nada a recortar

  return { x: x0, y: y0, w: bw, h: bh };
}

/**
 * Detecta a borda da peça em um canvas (opcionalmente girado). Analisa em até
 * 1000 px de lado (downsample suave) e devolve as coordenadas no espaço do
 * canvas de entrada, com 1 px de folga para não cortar a borda da peça.
 * Retorna null quando o fundo não é uniforme ou a detecção não é confiável.
 */
export function detectArtworkBounds(src: HTMLCanvasElement): CropRect | null {
  const W = src.width;
  const H = src.height;
  if (W < 16 || H < 16) return null;

  const scale = Math.min(1, DETECT_MAX_SIDE / Math.max(W, H));
  let data: Uint8ClampedArray;
  let aw = W;
  let ah = H;
  if (scale < 1) {
    aw = Math.max(1, Math.round(W * scale));
    ah = Math.max(1, Math.round(H * scale));
    const tmp = makeCanvas(aw, ah);
    const tctx = tmp.getContext("2d")!;
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = "high";
    tctx.drawImage(src, 0, 0, aw, ah);
    data = tctx.getImageData(0, 0, aw, ah).data;
  } else {
    data = src.getContext("2d")!.getImageData(0, 0, W, H).data;
  }

  const found = detectBoundsFromPixels(data, aw, ah);
  if (!found) return null;

  // Volta às coordenadas originais (+1 px de folga em cada lado).
  const x0 = Math.max(0, Math.floor(found.x / scale) - 1);
  const y0 = Math.max(0, Math.floor(found.y / scale) - 1);
  const x1 = Math.min(W - 1, Math.ceil((found.x + found.w) / scale) + 1);
  const y1 = Math.min(H - 1, Math.ceil((found.y + found.h) / scale) + 1);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
