/**
 * Formato "Tenda A4 única" — UM calendário completo por folha A4 (Tasks 29–31).
 *
 * Tenda com PÉ (aba de colagem): o A4 é impresso FRENTE E VERSO (virar pela
 * borda longa) e leva 2 vincos:
 *  - Dobra 1 (cumeeira), a faceMm da borda superior — une as duas faces;
 *  - Dobra 2 (pé), a 2·faceMm — a aba restante dobra para dentro e cola na
 *    borda interna da face de trás, virando o "assoalho" do triângulo.
 * O perímetro do triângulo é a altura do papel: 2·face + pé = 297 mm, então
 * face = (297 − pé) / 2 (117 mm com o pé padrão de 63 mm). Pé maior = tenda
 * mais aberta e estável; menor = tenda mais fechada.
 *
 * O PDF sai com 1 página (a folha impressa: verso Jul–Dez de cabeça para baixo
 * em cima + frente Jan–Jun embaixo + aba do pé em branco) — SEM marcas de
 * dobra e SEM página de instruções: a DMS entrega as tendas já dobradas
 * (Task 31). Sem marcas, a posição dos vincos é dada pelas medidas (faceMm e
 * 2·faceMm da borda).
 *
 * A arte de cada face aceita posicionamento manual (ArtPlacement: arraste +
 * zoom + preencher/enquadrar, com âncora vertical — no Enquadrar a arte cola
 * no topo ou na base da faixa, Task 36) e a LARGURA DA FAIXA é ajustável em mm
 * (artWidthMm — Task 33). computeArtRect/panPlacement e artWidthPx alimentam o
 * editor da prévia e o PDF com a MESMA matemática — o que se vê é o que sai.
 */

import { makeCanvas } from "@/lib/print/analysis";
import { mmToPx } from "@/lib/print/constants";
import {
  MONTH_NAMES,
  WEEKDAY_LABELS,
  buildMonthGrid,
  holidayLegend,
} from "./dates";
import { FACE_H_PX, FACE_W_PX, luminance, type CalendarStyle } from "./compose";

export const SHEET_W_PX = FACE_W_PX; // 2480
export const SHEET_H_PX = FACE_H_PX * 2; // 3508

/** Largura da faixa de arte da face — AJUSTÁVEL pelo slider da página, em mm.
 * Limites: abaixo de ~45 mm o título/ano não cabem; acima de ~100 mm os
 * mini-meses ficam apertados demais. Padrão mantém o layout de sempre. */
export const ART_W_MIN_MM = 45;
export const ART_W_MAX_MM = 100;
export const ART_W_DEFAULT_MM = 64.5;

/** Largura da faixa em px de impressão (300 DPI) para uma largura em mm —
 * a MESMA conversão alimenta editor e PDF: o visto é o impresso. */
export function artWidthPx(artWidthMm: number): number {
  const mm = Math.min(ART_W_MAX_MM, Math.max(ART_W_MIN_MM, artWidthMm));
  return Math.round(mmToPx(mm));
}

/** Pé da tenda (aba de colagem) — limites e padrão, em mm. */
export const FOOT_MIN_MM = 45;
export const FOOT_MAX_MM = 80;
export const FOOT_DEFAULT_MM = 63;

/** Rótulos dos 2 slots deste formato. */
export const A4_SLOT_LABELS = ["Frente (Jan–Jun)", "Verso (Jul–Dez)"] as const;

export const a4Filename = (year: number): string => `calendario-tenda-a4-${year}.pdf`;

const FONT_STACK = 'Arial, "Helvetica Neue", Helvetica, sans-serif';

// ---------------------------------------------------------------------------
// Posicionamento da arte (editor ↔ PDF)
// ---------------------------------------------------------------------------

/** Como a arte entra na faixa da face. fx/fy = ponto da imagem (0–1): onde há
 * transbordo, esse ponto fica no centro da faixa; na folga vertical do
 * Enquadrar, fy ancora a arte (0 = colada no topo, 0,5 = centrada, 1 = base). */
export interface ArtPlacement {
  fitMode: "cover" | "contain";
  /** Zoom relativo ao ajuste base (1 = preencher/enquadrar exato). */
  zoom: number;
  fx: number;
  fy: number;
}

export const DEFAULT_PLACEMENT: ArtPlacement = { fitMode: "cover", zoom: 1, fx: 0.5, fy: 0.5 };
export const PLACEMENT_ZOOM_MIN = 1;
export const PLACEMENT_ZOOM_MAX = 4;

export function clampZoom(zoom: number): number {
  return Math.max(PLACEMENT_ZOOM_MIN, Math.min(PLACEMENT_ZOOM_MAX, zoom));
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Retângulo da imagem dentro da faixa — ÚNICA fonte de verdade usada pelo
 * editor e pelo PDF, então prévia e impresso nunca divergem.
 */
export function computeArtRect(
  img: { width: number; height: number },
  band: { width: number; height: number },
  p: ArtPlacement,
): { dw: number; dh: number; dx: number; dy: number } {
  const fit =
    p.fitMode === "cover"
      ? Math.max(band.width / img.width, band.height / img.height)
      : Math.min(band.width / img.width, band.height / img.height);
  const zoom = clampZoom(p.zoom);
  const dw = img.width * fit * zoom;
  const dh = img.height * fit * zoom;
  let dx = band.width / 2 - clamp(p.fx, 0, 1) * dw;
  let dy = band.height / 2 - clamp(p.fy, 0, 1) * dh;
  dx = dw >= band.width ? clamp(dx, band.width - dw, 0) : (band.width - dw) / 2;
  if (dh >= band.height) {
    dy = clamp(dy, band.height - dh, 0);
  } else {
    // Folga vertical (Enquadrar com arte mais baixa que a faixa): fy ancora a
    // arte no slot — 0 cola no topo, 0,5 centra (comportamento de sempre),
    // 1 cola na base (Task 36).
    dy = clamp(p.fy, 0, 1) * (band.height - dh);
  }
  return { dw, dh, dx, dy };
}

/** Aplica um arraste (em px da própria faixa) ao posicionamento. */
export function panPlacement(
  img: { width: number; height: number },
  band: { width: number; height: number },
  p: ArtPlacement,
  ddx: number,
  ddy: number,
): ArtPlacement {
  const { dw, dh, dx, dy } = computeArtRect(img, band, p);
  const next = { ...p };
  // Arraste onde há transbordo; na folga vertical do Enquadrar, o arraste
  // vertical muda a âncora fy — nas extremidades a arte cola no topo/base.
  if (dw > band.width + 0.5) next.fx = clamp((band.width / 2 - (dx + ddx)) / dw, 0, 1);
  if (dh > band.height + 0.5) {
    next.fy = clamp((band.height / 2 - (dy + ddy)) / dh, 0, 1);
  } else if (p.fitMode === "contain" && dh < band.height - 0.5) {
    next.fy = clamp((dy + ddy) / (band.height - dh), 0, 1);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Geometria da folha com pé
// ---------------------------------------------------------------------------

/** Altura da face (perna) e da aba em px para um pé de `footMm` — a folha fecha exata em 3508 px. */
export function legHeightPx(footMm: number): { leg: number; foot: number } {
  const foot = Math.round(clamp(footMm, FOOT_MIN_MM, FOOT_MAX_MM));
  const leg = Math.floor((SHEET_H_PX - mmToPx(foot)) / 2);
  return { leg, foot: SHEET_H_PX - leg * 2 };
}

function setShadow(ctx: CanvasRenderingContext2D, on: boolean): void {
  ctx.shadowColor = on ? "rgba(0, 0, 0, 0.45)" : "rgba(0, 0, 0, 0)";
  ctx.shadowBlur = on ? 12 : 0;
  ctx.shadowOffsetY = on ? 3 : 0;
}

/** Reduz a fonte até o texto caber na largura (ou chegar no tamanho mínimo). */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number,
  startPx: number,
  minPx: number,
  maxWidth: number,
): number {
  let size = startPx;
  ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  while (ctx.measureText(text).width > maxWidth && size > minPx) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  }
  return size;
}

/** Quebra um texto em linhas pela largura (legenda de feriados e guias). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ---------------------------------------------------------------------------
// Face da tenda (perna): faixa de arte + 6 mini-meses
// ---------------------------------------------------------------------------

/**
 * Face da tenda (2480 × legH px): faixa de arte à esquerda com posicionamento
 * manual + 6 mini-meses à direita. `monthStart` = 1 (frente, Jan–Jun) ou 7
 * (verso, Jul–Dez). As métricas escalam com a altura da face (o pé encolhe as
 * faces) e a largura da faixa (`artW`) é ajustável — os mini-meses ocupam o
 * que sobra da face.
 */
export function composeTendaA4Leg(
  monthStart: 1 | 7,
  art: HTMLCanvasElement | null,
  style: CalendarStyle,
  label: string,
  year: number,
  placement: ArtPlacement,
  legH: number,
  artW: number,
): HTMLCanvasElement {
  const W = FACE_W_PX;
  const H = legH;
  const s = H / FACE_H_PX; // escala das métricas (a face pode ser menor que 148,5 mm)
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível neste navegador.");

  // Fundo branco: só a faixa da esquerda recebe arte; a área dos meses precisa
  // ser branca (o canvas nasce transparente e o JPEG embutido não tem alfa).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // ---- Faixa de arte à esquerda (com posicionamento manual) ----
  if (art) {
    // Clipe: em "cover" com zoom a arte transborda a faixa e invadiria a área
    // dos meses — recorta tudo à largura da faixa.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, artW, H);
    ctx.clip();
    const band = { width: artW, height: H };
    const rect = computeArtRect(art, band, placement);
    if (placement.fitMode === "contain") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, artW, H);
    }
    ctx.drawImage(art, rect.dx, rect.dy, rect.dw, rect.dh);
    ctx.restore();
  } else {
    ctx.fillStyle = "#e7e5e4";
    ctx.fillRect(0, 0, artW, H);
    ctx.fillStyle = "#78716c";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    // Rótulo em 2 linhas: em faixas estreitas o texto inteiro não caberia.
    fitFont(ctx, label, 700, Math.round(56 * s), Math.round(34 * s), artW - Math.round(80 * s));
    ctx.fillText(label, artW / 2, H / 2 - Math.round(20 * s));
    ctx.font = `500 ${Math.round(40 * s)}px ${FONT_STACK}`;
    ctx.fillText("sem arte", artW / 2, H / 2 + Math.round(28 * s));
  }

  // ---- Título + ano sobre a arte (scrim na base da faixa) ----
  const scrimH = Math.round(400 * s);
  const darkText = luminance(style.textColor) < 0.55;
  const solid = darkText ? "rgba(255, 255, 255, 0.88)" : "rgba(12, 10, 9, 0.72)";
  const grad = ctx.createLinearGradient(0, H - scrimH - Math.round(80 * s), 0, H - scrimH + Math.round(60 * s));
  grad.addColorStop(0, darkText ? "rgba(255, 255, 255, 0)" : "rgba(12, 10, 9, 0)");
  grad.addColorStop(1, solid);
  ctx.fillStyle = grad;
  ctx.fillRect(0, H - scrimH - Math.round(80 * s), artW, Math.round(140 * s));
  ctx.fillStyle = solid;
  ctx.fillRect(0, H - scrimH + Math.round(60 * s), artW, scrimH - Math.round(60 * s));

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  setShadow(ctx, !darkText);
  ctx.fillStyle = style.textColor;
  fitFont(ctx, style.coverTitle, 700, Math.round(84 * s), Math.round(34 * s), artW - Math.round(90 * s));
  ctx.fillText(style.coverTitle, artW / 2, H - Math.round(235 * s));
  ctx.font = `900 ${Math.round(210 * s)}px ${FONT_STACK}`;
  ctx.fillText(String(year), artW / 2, H - Math.round(60 * s));
  setShadow(ctx, false);

  // ---- 6 mini-meses em grade 2 × 3 ----
  const monthsX0 = artW + 60;
  const monthsX1 = W - 110;
  const gapX = Math.round(50 * s);
  const gapY = Math.round(40 * s);
  const padTop = Math.round(84 * s);
  const padBottom = Math.round(84 * s);
  const cellW = (monthsX1 - monthsX0 - gapX) / 2;
  const cellH = (H - padTop - padBottom - gapY * 2) / 3;

  for (let i = 0; i < 6; i++) {
    const month = monthStart + i;
    const col = i % 2;
    const row = Math.floor(i / 2);
    drawMiniMonth(
      ctx,
      month,
      monthsX0 + col * (cellW + gapX),
      padTop + row * (cellH + gapY),
      cellW,
      cellH,
      style,
      year,
      s,
    );
  }
  return canvas;
}

/** Mini-mês: nome, cabeçalho D S T Q Q S S, dias e legenda de feriados. Métricas × `s`. */
function drawMiniMonth(
  ctx: CanvasRenderingContext2D,
  month: number,
  x: number,
  y: number,
  w: number,
  h: number,
  style: CalendarStyle,
  year: number,
  s: number,
): void {
  const grid = buildMonthGrid(year, month);
  const legend = style.showHolidayNames ? holidayLegend(year, month) : [];

  // Legenda de feriados: QUEBRA em linhas em vez de cortar com reticências —
  // o nome inteiro precisa ser legível (Task 31). Encolhe a fonte antes de
  // ocupar mais linhas (até 4; com os feriados reais bastam 2).
  let legendLines: string[] = [];
  let legendSize = Math.round(30 * s);
  if (legend.length > 0) {
    const text = legend.join("  ·  ");
    for (;;) {
      ctx.font = `500 ${legendSize}px ${FONT_STACK}`;
      legendLines = wrapText(ctx, text, w - 4);
      if (legendLines.length <= 4 || legendSize <= Math.round(22 * s)) break;
      legendSize -= 2;
    }
    legendLines = legendLines.slice(0, 4);
  }
  const legendH =
    legendLines.length > 0
      ? Math.round(4 * s) + legendLines.length * Math.round(38 * s)
      : Math.round(10 * s);

  // Nome do mês — na cor dos meses (independente dos números e dos gerais)
  const name = MONTH_NAMES[month - 1];
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  fitFont(ctx, name, 900, Math.round(72 * s), Math.round(40 * s), w);
  ctx.fillStyle = style.monthColor;
  ctx.fillText(name, x + 4, y + Math.round(62 * s));

  // Cabeçalho dos dias da semana
  const colW = w / 7;
  const headerY = y + Math.round(112 * s);
  ctx.textAlign = "center";
  ctx.font = `700 ${Math.round(36 * s)}px ${FONT_STACK}`;
  ctx.globalAlpha = 0.75;
  for (let c = 0; c < 7; c++) {
    ctx.fillText(WEEKDAY_LABELS[c], x + colW * (c + 0.5), headerY);
  }
  ctx.globalAlpha = 1;

  // Dias — altura das linhas se adapta a meses de 4 a 6 semanas
  const gridTop = headerY + Math.round(16 * s);
  const gridH = h - (gridTop - y) - legendH - Math.round(8 * s);
  const rowH = gridH / grid.length;
  const daySize = rowH > Math.round(74 * s) ? Math.round(52 * s) : Math.round(44 * s);
  ctx.font = `700 ${daySize}px ${FONT_STACK}`;
  ctx.textBaseline = "middle";
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < 7; c++) {
      const cell = grid[r][c];
      if (!cell) continue;
      const cx = x + colW * (c + 0.5);
      const cy = gridTop + rowH * r + rowH / 2;
      ctx.fillStyle = cell.sunday || cell.holiday !== null ? style.accentColor : style.dayColor;
      ctx.fillText(String(cell.day), cx, cy);
    }
  }

  // Legenda "dd/mm nome" — em quantas linhas forem precisas (até 4)
  if (legendLines.length > 0) {
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `500 ${legendSize}px ${FONT_STACK}`;
    ctx.fillStyle = style.accentColor;
    const step = Math.round(38 * s);
    const lastY = y + h - Math.round(10 * s);
    legendLines.forEach((line, i) => {
      ctx.fillText(line, x + 2, lastY - (legendLines.length - 1 - i) * step);
    });
  }
}

// ---------------------------------------------------------------------------
// Folha impressa: verso de cabeça para baixo + frente + aba do pé
// ---------------------------------------------------------------------------

/** Cópia girada 180° da perna (para a metade de cima da folha). */
function rotate180(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = makeCanvas(src.width, src.height);
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível neste navegador.");
  ctx.translate(src.width, src.height);
  ctx.rotate(Math.PI);
  ctx.drawImage(src, 0, 0);
  return out;
}

/** Aba do pé (em branco no lado de fora) + nota discreta. `footMm` só para o texto. */
function drawFlapStrip(
  ctx: CanvasRenderingContext2D,
  yTop: number,
  footPx: number,
  footMm: number,
): void {
  ctx.fillStyle = "#a8a29e";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 52px ${FONT_STACK}`;
  ctx.fillText(
    `Aba de colagem (${footMm} mm) — dobra para dentro e cola por dentro`,
    SHEET_W_PX / 2,
    yTop + footPx / 2,
  );
}

export interface TendaA4Options {
  /** Pé da tenda (aba de colagem) em mm — 45 a 80. */
  footMm: number;
  /** Largura da faixa de arte em mm — 45 a 100 (padrão 64,5). */
  artWidthMm: number;
  /** Ano do calendário (grade e feriados). */
  year: number;
  /** Posicionamento da arte na faixa da frente e do verso. */
  placementFront: ArtPlacement;
  placementBack: ArtPlacement;
}

/**
 * A folha A4 do calendário completo (1 página, impressa frente-e-verso):
 * verso (Jul–Dez) de cabeça para baixo em cima, frente (Jan–Jun) embaixo e a
 * aba do pé em branco. Sem marcas de dobra e sem página de instruções — a
 * posição dos vincos é dada pelas medidas (faceMm e 2·faceMm da borda).
 * Se a arte do verso não for enviada, a da frente é repetida.
 */
export function composeTendaA4Sheet(
  artFront: HTMLCanvasElement | null,
  artBack: HTMLCanvasElement | null,
  style: CalendarStyle,
  opts: TendaA4Options,
): HTMLCanvasElement {
  // Normaliza o pé e a largura da faixa para mm UMA vez: o resto do código usa
  // mm nos textos e px (leg/foot/artW) só na geometria — misturar as unidades
  // quebrou o guia na 1ª rodada.
  const footMm = Math.round(clamp(opts.footMm, FOOT_MIN_MM, FOOT_MAX_MM));
  const { leg, foot } = legHeightPx(footMm);
  const artW = artWidthPx(opts.artWidthMm);
  const back = artBack ?? artFront;
  const frontLeg = composeTendaA4Leg(
    1,
    artFront,
    style,
    A4_SLOT_LABELS[0],
    opts.year,
    opts.placementFront,
    leg,
    artW,
  );
  const backLeg = composeTendaA4Leg(
    7,
    back,
    style,
    A4_SLOT_LABELS[1],
    opts.year,
    opts.placementBack,
    leg,
    artW,
  );
  const sheet = makeCanvas(SHEET_W_PX, SHEET_H_PX);
  const ctx = sheet.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível neste navegador.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SHEET_W_PX, SHEET_H_PX);
  ctx.drawImage(rotate180(backLeg), 0, 0);
  ctx.drawImage(frontLeg, 0, leg);
  drawFlapStrip(ctx, leg * 2, foot, footMm);
  return sheet;
}
