/**
 * Imposição de peças em folha A4 (2480 × 3508 px @ 300 DPI).
 *
 *  - Cartão de Visita: grade 2 × 5 = 10 unidades COLADAS (gap 0), bloco centralizado
 *    — ideal para corte em guilhotina (corta-se a pilha em tiras e depois em peças).
 *  - Panfleto: grade 2 × 2 = 4 unidades com layout EXATO PARA 2 CORTES de guilhotina:
 *    1 corte vertical (a 105 mm da lateral) e 1 horizontal (no meio da faixa branca
 *    central). Observação: 3,5 mm em TODOS os lados de todas as peças exigiria
 *    214 × 302 mm — não cabe no A4. A folga vertical (9 mm) é distribuída por
 *    prioridade: (1) GUARDA DE BASE ajustável (padrão 3,0 mm — medido em impressora
 *    real: a zona não imprimível na base chega a ~3 mm mesmo no modo "sem margens"),
 *    (2) seguro mínimo de 0,5 mm no topo, (3) o resto vai para a folga da linha de
 *    corte (até 3,5 mm por peça). A guarda é ajustável na UI porque cada impressora
 *    tem uma margem não imprimível diferente na base.
 *  - Linha de corte (opcional): fio cinza-claro desenhado 100% DENTRO da borda de
 *    cada peça — guia a guilhotina em artes com fundo branco/claro, em que o limite
 *    da peça é invisível contra o papel. O tamanho de corte continua exato.
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
  /** Folga externa na base (px) — no modo 2 cortes inclui a guarda de impressora. */
  outerBottomPx: number;
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

/** Folga branca de segurança entre a peça e a linha de corte (modo 2 cortes, eixo X). */
export const CUT_CLEARANCE_PX = mmToPx(3.5); // 41 px ≈ 3,5 mm

/**
 * Linha de corte fina ("hairline") desenhada na borda de cada peça, para artes com
 * fundo branco/claro — em pilhas de cartões assim o operador não enxerga onde a
 * guilhotina deve passar e os cortes saem com tamanhos aleatórios.
 *  - 2 px @ 300 DPI ≈ 0,17 mm: fio fino que imprime de forma confiável (1 px some
 *    em muitas impressoras).
 *  - Cinza claro (#c8c8c8): visível o bastante para guiar o corte na folha, quase
 *    invisível no produto final.
 * O traço é alinhado a pixels inteiros e desenhado integralmente DENTRO da peça,
 * então o tamanho de corte permanece exato (a lâmina passa raspando a linha).
 */
export const CUT_LINE_WIDTH_PX = 2; // ≈ 0,17 mm @ 300 DPI
export const CUT_LINE_COLOR = "#c8c8c8";

/**
 * Guarda de base (modo 2 cortes): branco extra na BASE da folha para absorver a margem
 * não imprimível da impressora — maior ali mesmo no modo "sem margens". Testes em
 * impressora real (Epson/HP domésticas) mostraram de ~1 a ~3 mm de perda na base; o
 * padrão de 3,0 mm cobre o pior caso medido e é ajustável na UI (ver ExportPanel),
 * pois o valor exato varia por modelo.
 */
export const DEFAULT_BOTTOM_GUARD_MM = 3;
/** Limite do slider na UI — acima disso a folga de corte vertical ficaria < 2 mm. */
export const MAX_BOTTOM_GUARD_MM = 5;
/** Seguro mínimo no topo (a margem não imprimível do topo é ~0 em borderless). */
const MIN_TOP_MARGIN_PX = mmToPx(0.5); // 6 px

/**
 * Posições para o modo "2 cortes": a lâmina passa no centro exato do eixo e cada
 * peça fica a `clearancePx` dela. Retorna [posição da 1ª peça, posição da 2ª peça].
 */
function twoCutPositions(pagePx: number, cellPx: number, clearancePx: number): number[] {
  const cut = pagePx / 2;
  return [Math.round(cut - clearancePx - cellPx), Math.round(cut + clearancePx)];
}

/**
 * Linhas do modo "2 cortes" com guarda de base ADAPTATIVA. Folga vertical total do A4
 * (slack) = topo + 2 × folga de corte + guarda de base. Prioridades:
 *  1. guarda de base = valor escolhido pelo usuário (clampado à folga existente);
 *  2. seguro mínimo de 0,5 mm no topo (nunca zero — a arte não pode encostar na borda);
 *  3. o restante vira folga de corte (máx. 3,5 mm por peça, igual ao eixo X).
 * A faixa de corte deixa de estar centrada na folha — por isso a instrução de corte
 * usa o MEIO DA FAIXA branca, não o centro da folha.
 */
function twoCutRows(pagePx: number, cellPx: number, guardPx: number): number[] {
  const slack = pagePx - 2 * cellPx;
  const guard = Math.min(Math.max(0, Math.round(guardPx)), slack);
  const remaining = slack - guard; // topo + 2 × folga de corte
  const topMin = Math.min(MIN_TOP_MARGIN_PX, Math.floor(remaining / 3));
  const clearance = Math.min(CUT_CLEARANCE_PX, Math.floor((remaining - topMin) / 2));
  const top = remaining - 2 * clearance;
  return [top, top + cellPx + 2 * clearance];
}

/** Opções de imposição ajustáveis na UI. */
export interface ImpositionOptions {
  /** Branco extra na base da folha, em mm (padrão: {@link DEFAULT_BOTTOM_GUARD_MM}). */
  bottomGuardMm?: number;
  /** Desenha a linha de corte fina ({@link CUT_LINE_COLOR}) na borda de cada peça. */
  cutLine?: boolean;
}

export function computeLayout(spec: ProductSpec, options: ImpositionOptions = {}): ImpositionLayout {
  const cellWidthPx = Math.round((spec.widthMm / 25.4) * 300);
  const cellHeightPx = Math.round((spec.heightMm / 25.4) * 300);

  let colX: number[];
  let rowY: number[];

  if (spec.gapMode === "glued") {
    colX = computePositions(A4.widthPx, cellWidthPx, spec.cols, 0);
    rowY = computePositions(A4.heightPx, cellHeightPx, spec.rows, 0);
  } else if (spec.gapMode === "two-cut") {
    colX = twoCutPositions(A4.widthPx, cellWidthPx, CUT_CLEARANCE_PX);
    const guardPx = mmToPx(options.bottomGuardMm ?? DEFAULT_BOTTOM_GUARD_MM);
    rowY = twoCutRows(A4.heightPx, cellHeightPx, guardPx);
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
    outerBottomPx: A4.heightPx - (rowY[rowY.length - 1] + cellHeightPx),
  };
}

/** Renderiza a folha A4 completa (fundo branco + peças repetidas) em 300 DPI. */
export function renderImposedSheet(
  art: HTMLCanvasElement,
  spec: ProductSpec,
  options: ImpositionOptions = {},
): { canvas: HTMLCanvasElement; layout: ImpositionLayout } {
  const layout = computeLayout(spec, options);
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

  // Linha de corte fina na borda de cada peça (opcional — artes de fundo claro).
  // Traço em pixels inteiros, 100% dentro da peça: o tamanho de corte continua
  // exato (a lâmina passa raspando a linha). Em peças coladas, os traços vizinhos
  // se encontram formando um fio duplo de 4 px exatamente sobre a linha de vinco.
  if (options.cutLine) {
    const lw = CUT_LINE_WIDTH_PX;
    ctx.strokeStyle = CUT_LINE_COLOR;
    ctx.lineWidth = lw;
    for (let r = 0; r < layout.rows; r++) {
      for (let c = 0; c < layout.cols; c++) {
        ctx.strokeRect(
          layout.colX[c] + lw / 2,
          layout.rowY[r] + lw / 2,
          layout.cellWidthPx - lw,
          layout.cellHeightPx - lw,
        );
      }
    }
  }
  return { canvas, layout };
}

/** Resumo legível (pt-BR) do layout para exibir na UI. */
export function describeLayout(spec: ProductSpec, options: ImpositionOptions = {}): string[] {
  const layout = computeLayout(spec, options);
  const lines: string[] = [];
  lines.push(`${spec.cols} colunas × ${spec.rows} linhas = ${layout.unitCount} unidades por folha`);
  if (spec.gapMode === "glued") {
    lines.push(
      `Peças coladas (0 mm) · margem externa: ${pxToMm(layout.outerLeftPx).toFixed(1)} mm (lat.) × ${pxToMm(layout.outerTopPx).toFixed(1)} mm (vert.)`,
    );
  } else if (spec.gapMode === "two-cut") {
    const cutXMm = pxToMm((layout.colX[0] + layout.cellWidthPx + layout.colX[1]) / 2);
    const cutYMm = pxToMm((layout.rowY[0] + layout.cellHeightPx + layout.rowY[1]) / 2);
    lines.push(
      `2 cortes na guilhotina: vertical a ${cutXMm.toFixed(1)} mm da lateral · horizontal a ${cutYMm.toFixed(1)} mm do topo (meio da faixa branca central) · branco por peça na linha de corte: ${pxToMm(layout.gapXPx / 2).toFixed(1)} mm (lat.) × ${pxToMm(layout.gapYPx / 2).toFixed(1)} mm (vert.)`,
    );
    lines.push(
      `Margem externa: ${pxToMm(layout.outerLeftPx).toFixed(1)} mm (lat.) × ${pxToMm(layout.outerTopPx).toFixed(1)} mm (topo) / ${pxToMm(layout.outerBottomPx).toFixed(1)} mm (base — reserva para a margem não imprimível da impressora)`,
    );
  } else {
    lines.push(
      `Borda branca por peça: ≈${pxToMm(layout.gapXPx).toFixed(1)} mm (lat.) × ≈${pxToMm(layout.gapYPx).toFixed(1)} mm (vert.) — máximo possível no A4`,
    );
  }
  if (options.cutLine) {
    lines.push(
      `Linha de corte fina ativada: fio cinza-claro de ≈${pxToMm(CUT_LINE_WIDTH_PX).toFixed(2)} mm na borda de cada peça (guia para artes de fundo branco/claro).`,
    );
  }
  return lines;
}
