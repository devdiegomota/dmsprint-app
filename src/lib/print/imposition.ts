/**
 * Imposição de peças em folha A4 (2480 × 3508 px @ 300 DPI).
 *
 *  - Cartão de Visita: grade 2 × 5 = 10 unidades COLADAS (gap 0), bloco centralizado
 *    — ideal para corte em guilhotina (corta-se a pilha em tiras e depois em peças).
 *  - Panfleto: grade 2 × 2 = 4 unidades com layout EXATO PARA 2 CORTES de guilhotina:
 *    1 corte vertical e 1 horizontal passando no CENTRO exato da folha (105 × 148,5 mm).
 *    Cada peça fica com 3,5 mm de borda branca até a linha de corte (folga segura para a
 *    lâmina); a folga restante vai para as bordas externas da folha (1,5 mm lat. /
 *    1,0 mm vert.), onde a lâmina não passa. Observação: 3,5 mm em TODOS os lados de
 *    todas as peças exigiria 214 × 302 mm — não cabe no A4; no fluxo de 2 cortes, a
 *    folga crítica é a da linha de corte, e é ela que o layout garante.
 *
 * Todas as posições são inteiras (px) para evitar interpolação sub-pixel e manter
 * os vincos/cortes pixel-perfect na impressão.
 */

import { A4, type ProductSpec, pxToMm, mmToPx } from "./constants";
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

/** Folga branca de segurança entre a peça e a linha de corte (modo 2 cortes). */
export const CUT_CLEARANCE_PX = mmToPx(3.5); // 41 px ≈ 3,5 mm

/**
 * Posições para o modo "2 cortes": a lâmina passa no centro exato do eixo e cada
 * peça fica a 3,5 mm dela. Retorna [posição da 1ª peça, posição da 2ª peça].
 */
function twoCutPositions(pagePx: number, cellPx: number, clearancePx: number): number[] {
  const cut = pagePx / 2;
  return [Math.round(cut - clearancePx - cellPx), Math.round(cut + clearancePx)];
}

export function computeLayout(spec: ProductSpec): ImpositionLayout {
  const cellWidthPx = Math.round((spec.widthMm / 25.4) * 300);
  const cellHeightPx = Math.round((spec.heightMm / 25.4) * 300);

  let colX: number[];
  let rowY: number[];

  if (spec.gapMode === "glued") {
    colX = computePositions(A4.widthPx, cellWidthPx, spec.cols, 0);
    rowY = computePositions(A4.heightPx, cellHeightPx, spec.rows, 0);
  } else if (spec.gapMode === "two-cut") {
    colX = twoCutPositions(A4.widthPx, cellWidthPx, CUT_CLEARANCE_PX);
    rowY = twoCutPositions(A4.heightPx, cellHeightPx, CUT_CLEARANCE_PX);
  } else {
    colX = computePositions(A4.widthPx, cellWidthPx, spec.cols, computedGapPx(A4.widthPx, cellWidthPx, spec.cols));
    rowY = computePositions(A4.heightPx, cellHeightPx, spec.rows, computedGapPx(A4.heightPx, cellHeightPx, spec.rows));
  }

  // Vão branco total entre peças vizinhas (px) — no modo 2 cortes, a lâmina passa no
  // meio desse vão (≈3,5 mm de branco por peça).
  const gapXPx = Math.max(0, colX[1] - (colX[0] + cellWidthPx));
  const gapYPx = Math.max(0, rowY[1] - (rowY[0] + cellHeightPx));

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
    gapXPx,
    gapYPx,
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
  } else if (spec.gapMode === "two-cut") {
    lines.push(
      `2 cortes na guilhotina (centro da folha: ${A4.widthMm / 2} × ${A4.heightMm / 2} mm) · branco por peça na linha de corte: ${pxToMm(layout.gapXPx / 2).toFixed(1)} mm (lat.) × ${pxToMm(layout.gapYPx / 2).toFixed(1)} mm (vert.)`,
    );
    lines.push(
      `Margem externa (sem corte): ${pxToMm(layout.outerLeftPx).toFixed(1)} mm (lat.) × ${pxToMm(layout.outerTopPx).toFixed(1)} mm (vert.)`,
    );
  } else {
    lines.push(
      `Borda branca por peça: ≈${pxToMm(layout.gapXPx).toFixed(1)} mm (lat.) × ≈${pxToMm(layout.gapYPx).toFixed(1)} mm (vert.) — máximo possível no A4`,
    );
  }
  return lines;
}
