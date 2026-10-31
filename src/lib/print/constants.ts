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

export type ProductId = "cartao-visita" | "panfleto" | "panfleto-quadrado";

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
   *  - "multi-cut": mesma lógica do "two-cut" generalizada para 3+ linhas (lâmina no
   *    MEIO de cada faixa branca entre linhas vizinhas): 1 corte vertical + (linhas − 1)
   *    horizontais, folga de corte de até 3,5 mm e folga externa distribuída
   *    SIMETRICAMENTE entre topo e base (a base inclui a guarda de impressora) —
   *    panfleto quadrado 2 × 3.
   *  - "auto-border": espaçamento calculado para maximizar a borda branca uniforme ao
   *    redor de cada peça (legado/alternativo).
   */
  gapMode: "glued" | "two-cut" | "multi-cut" | "auto-border";
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
  "panfleto-quadrado": {
    id: "panfleto-quadrado",
    name: "Panfleto Quadrado",
    // 92 × 92 mm — escolhido por estudo (Task 26): 3 quadrados empilhados no A4 (297 mm)
    // deixam 21 mm de folga vertical, exatamente o suficiente para reproduzir o perfil de
    // segurança VALIDADO do panfleto de 4: ≈3,5 mm de branco por peça na linha de corte e
    // ≈3,5 mm de branco no topo/base da folha (guarda de base 3,0 mm). Os 9,5 mm laterais
    // sobram da largura (2 × 92 + 7 de faixa de corte = 191 mm). 95 mm caberia, mas
    // espremeria o branco de corte para ~1,5–2,1 mm (a lâmina mordiria a arte).
    widthMm: 92,
    heightMm: 92,
    unitsPerSheet: 6,
    cols: 2,
    rows: 3,
    gapMode: "multi-cut",
    spacingNote:
      "Exato para 3 cortes na guilhotina (1 vertical + 2 horizontais): ≈3,5 mm de borda branca por peça na linha de corte e ≈3,5 mm de branco no topo/base da folha (guarda de base ajustável, como no panfleto de 4 — validado em impressora real).",
  },
  panfleto: {
    id: "panfleto",
    name: "Panfleto / Encarte",
    // 98 × 142 mm — reduzido de 100 × 144 (−2 mm por dimensão) e VALIDADO em impressora
    // real (teste "C" do PDF de calibração): com esse tamanho a grade 2 × 2 deixa
    // ≈3,5 mm (lat.) e ≈3,0 mm (topo/base) de branco nas bordas da folha, absorvendo a
    // margem não imprimível da impressora em TODOS os lados sem morder a arte.
    widthMm: 98,
    heightMm: 142,
    unitsPerSheet: 4,
    cols: 2,
    rows: 2,
    gapMode: "two-cut",
    spacingNote:
      "Exato para 2 cortes na guilhotina (1 vertical + 1 horizontal): ≈3,5 mm de borda branca por peça na linha de corte (lat. e vert.) e ≈3,0–3,5 mm de branco nas bordas da folha para a margem não imprimível da impressora (validado em impressora real).",
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
