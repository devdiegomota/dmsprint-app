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
