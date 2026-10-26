/**
 * Especificações de produtos e métricas de página para impressão gráfica.
 * Toda a matemática do app deriva destas constantes (300 DPI).
 */

export const PRINT_DPI = 300;
export const MM_PER_INCH = 25.4;

/** Converte milímetros para pixels na resolução de impressão. */
export function mmToPx(mm: number, dpi: number = PRINT_DPI): number {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

/** Converte pixels para milímetros na resolução de impressão. */
export function pxToMm(px: number, dpi: number = PRINT_DPI): number {
  return (px / dpi) * MM_PER_INCH;
}

export type ProductId = "cartao-visita" | "panfleto";

export interface ProductSpec {
  id: ProductId;
  name: string;
  /** Dimensões finais de corte, em mm (largura × altura). */
  widthMm: number;
  heightMm: number;
  /** Quantidade de unidades por folha A4. */
  unitsPerSheet: number;
  /** Grade de imposição: colunas × linhas. */
  cols: number;
  rows: number;
  /**
   * Política de espaçamento entre células.
   *  - "glued": colado (0 mm), ideal para corte na guilhotina — cartões.
   *  - "two-cut": layout exato para 2 cortes (1 vertical + 1 horizontal no centro do A4);
   *    cada peça recebe 3,5 mm de borda branca na linha de corte, e o restante da folga
   *    fica nas bordas externas (onde a lâmina não passa) — panfletos.
   *  - "auto-border": espaçamento calculado para maximizar a borda branca uniforme ao
   *    redor de cada peça (legado/alternativo).
   */
  gapMode: "glued" | "two-cut" | "auto-border";
  /** Descrição da política de espaçamento exibida na UI. */
  spacingNote: string;
}

export const PRODUCTS: Record<ProductId, ProductSpec> = {
  "cartao-visita": {
    id: "cartao-visita",
    name: "Cartão de Visita",
    widthMm: 95,
    heightMm: 56,
    unitsPerSheet: 10,
    cols: 2,
    rows: 5,
    gapMode: "glued",
    spacingNote: "Peças coladas (0 mm) para corte direto na guilhotina.",
  },
  panfleto: {
    id: "panfleto",
    name: "Panfleto / Encarte",
    widthMm: 100,
    heightMm: 144,
    unitsPerSheet: 4,
    cols: 2,
    rows: 2,
    gapMode: "two-cut",
    spacingNote:
      "Exato para 2 cortes na guilhotina (1 vertical + 1 horizontal): ≈3,5 mm (lat.) × ≈3,0 mm (vert.) de borda branca por peça na linha de corte e 2 mm extras de branco na base da folha para a margem não imprimível da impressora.",
  },
};

export const A4 = {
  widthMm: 210,
  heightMm: 297,
  get widthPx() {
    return mmToPx(this.widthMm); // 2480
  },
  get heightPx() {
    return mmToPx(this.heightMm); // 3508
  },
};

/** Dimensão da arte final em px (300 DPI) para um produto. */
export function productPixelSize(spec: ProductSpec): { widthPx: number; heightPx: number } {
  return { widthPx: mmToPx(spec.widthMm), heightPx: mmToPx(spec.heightMm) };
}

/** Formata um número em mm com até 1 casa decimal, vírgula decimal pt-BR. */
export function fmtMm(mm: number): string {
  const rounded = Math.round(mm * 10) / 10;
  return rounded.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}
