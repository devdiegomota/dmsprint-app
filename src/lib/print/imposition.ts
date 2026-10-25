/**
 * Imposição de peças em folha A4 (2480 × 3508 px @ 300 DPI).
 *
 *  - Cartão de Visita: grade 2 × 5 = 10 unidades COLADAS (gap 0), bloco centralizado
 *    — ideal para corte em guilhotina (corta-se a pilha em tiras e depois em peças).
 *  - Panfleto: grade 2 × 2 = 4 unidades com borda branca CALCULADA ao redor de cada
 *    peça: o espaço livre da folha é distribuído igualmente entre as 3 folgas de cada
 *    eixo (esquerda / meio / direita), maximizando a margem branca dentro do A4.
 *
 * Todas as posições são inteiras (px) para evitar interpolação sub-pixel e manter
 * os vincos/cortes pixel-perfect na impressão.
 */

import { A4, type ProductSpec, pxToMm } from "./constants";
import { makeCanvas } from "./analysis";

export interface ImpositionLayout {
  pageWidthPx: number;
  pageHeightPx: number;
  cellWidthPx: number;
  cellHeightPx: number;
  cols: number;
  rows: number;
  unitCount: number;
  /** Posição X (px) de cada coluna. */
  colX: number[];
  /** Posição Y (px) de cada linha. */
  rowY: number[];
  /** Espaçamento efetivo entre peças (px). */
  gapXPx: number;
  gapYPx: number;
  /** Folga externa esquerda/direita e topo/base (px). */
  outerLeftPx: number;
  outerTopPx: number;
}

/**
 * Calcula posições inteiras para n células de tamanho `cellPx` dentro de `pagePx`.
 *  - gapPx = 0  → bloco colado, centralizado (guilhotina).
 *  - gapPx > 0  → (n+1) folgas iguais (borda externa + entre peças) distribuídas
 *                 por arredondamento cumulativo (sem acúmulo de erro).
 */
function computePositions(pagePx: number, cellPx: number, n: number, gapPx: number): number[] {
  const positions: number[] = [];
  if (gapPx <= 0) {
    const block = cellPx * n;
    const margin = (pagePx - block) / 2;
    for (let i = 0; i < n; i++) positions.push(Math.round(margin + i * cellPx));
    return positions;
  }
  const gaps = n + 1;
  const step = cellPx + gapPx;
  for (let i = 0; i < n; i++) {
    positions.push(Math.round(gapPx + i * step));
  }
  return positions;
}

/** Espaçamento disponível por folga (px float) para o modo borda calculada. */
export function computedGapPx(pagePx: number, cellPx: number, n: number): number {
  return (pagePx - n * cellPx) / (n + 1);
}

export function computeLayout(spec: ProductSpec): ImpositionLayout {
  const cellWidthPx = Math.round((spec.widthMm / 25.4) * 300);
  const cellHeightPx = Math.round((spec.heightMm / 25.4) * 300);

  const gapXPx =
    spec.gapMode === "glued" ? 0 : computedGapPx(A4.widthPx, cellWidthPx, spec.cols);
  const gapYPx =
    spec.gapMode === "glued" ? 0 : computedGapPx(A4.heightPx, cellHeightPx, spec.rows);

  const colX = computePositions(A4.widthPx, cellWidthPx, spec.cols, gapXPx);
  const rowY = computePositions(A4.heightPx, cellHeightPx, spec.rows, gapYPx);

  return {
    pageWidthPx: A4.widthPx,
    pageHeightPx: A4.heightPx,
    cellWidthPx,
    cellHeightPx,
    cols: spec.cols,
    rows: spec.rows,
    unitCount: spec.cols * spec.rows,
    colX,
    rowY,
    gapXPx: Math.round(gapXPx),
    gapYPx: Math.round(gapYPx),
    outerLeftPx: colX[0],
    outerTopPx: rowY[0],
  };
}

/** Renderiza a folha A4 completa (fundo branco + peças repetidas) em 300 DPI. */
export function renderImposedSheet(
  art: HTMLCanvasElement,
  spec: ProductSpec,
): { canvas: HTMLCanvasElement; layout: ImpositionLayout } {
  const layout = computeLayout(spec);
  const canvas = makeCanvas(layout.pageWidthPx, layout.pageHeightPx);
  const ctx = canvas.getContext("2d")!;

  // Folha branca
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false; // cópia 1:1 — a arte já está no tamanho exato

  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      ctx.drawImage(
        art,
        0,
        0,
        art.width,
        art.height,
        layout.colX[c],
        layout.rowY[r],
        layout.cellWidthPx,
        layout.cellHeightPx,
      );
    }
  }
  return { canvas, layout };
}

/** Resumo legível (pt-BR) do layout para exibir na UI. */
export function describeLayout(spec: ProductSpec): string[] {
  const layout = computeLayout(spec);
  const lines: string[] = [];
  lines.push(`${spec.cols} colunas × ${spec.rows} linhas = ${layout.unitCount} unidades por folha`);
  if (spec.gapMode === "glued") {
    lines.push(
      `Peças coladas (0 mm) · margem externa: ${pxToMm(layout.outerLeftPx).toFixed(1)} mm (lat.) × ${pxToMm(layout.outerTopPx).toFixed(1)} mm (vert.)`,
    );
  } else {
    lines.push(
      `Borda branca por peça: ≈${pxToMm(layout.gapXPx).toFixed(1)} mm (lat.) × ≈${pxToMm(layout.gapYPx).toFixed(1)} mm (vert.) — máximo possível no A4`,
    );
  }
  return lines;
}
