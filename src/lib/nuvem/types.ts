/**
 * Tipos da Nuvem DMS — PDFs exportados no celular e acessíveis no computador.
 *
 * Modelo de acesso: cada "dispositivo" (navegador) tem um código de 6 caracteres
 * que funciona como chave de acesso. O PDF vai para `nuvem/{code}/{id}.pdf` no
 * Storage e os metadados para `nuvem/{code}/pdfs/{id}` no Firestore — quem conhece
 * o código, enxerga a fila (regras espelhadas em firestore.rules / storage.rules).
 */

import type { ProductId } from "@/lib/print/constants";

/** Estados da fila de impressão (novo → impresso → arquivado). */
export type NuvemStatus = "novo" | "impresso" | "arquivado";

/** Metadados de um PDF na nuvem (documento Firestore). */
export interface NuvemPdfDoc {
  id: string;
  /** Nome do arquivo (sem .pdf), editável na exportação. */
  name: string;
  product: ProductId;
  productName: string;
  /** Tamanho do PDF em bytes (exibido e usado para custo de download). */
  sizeBytes: number;
  /** Epoch ms da criação — base da ordenação e da limpeza automática. */
  createdAt: number;
  status: NuvemStatus;
  /** Fixado: NUNCA é removido pela limpeza automática/manual (arte de cliente recorrente). */
  pinned: boolean;
  /** Caminho do objeto no Storage (nuvem/{code}/{id}.pdf). */
  storagePath: string;
}

/** Limite de segurança para um PDF na nuvem (folhas A4 300 DPI ficam entre 3–60 MB). */
export const NUVEM_MAX_BYTES = 200 * 1024 * 1024;

/** Chaves de localStorage usadas pela nuvem (centralizadas p/ evitar typo). */
export const NUVEM_LS = {
  code: "dms_nuvem_code",
  autoSend: "dms_nuvem_auto",
  markOnDownload: "dms_nuvem_mark_download",
  retentionDays: "dms_nuvem_retention",
} as const;

/** Opções de retenção (dias) para a limpeza — 0 significa "nunca limpar". */
export const RETENTION_OPTIONS = [30, 60, 90, 0] as const;
export type RetentionDays = (typeof RETENTION_OPTIONS)[number];

export const DEFAULT_RETENTION_DAYS: RetentionDays = 60;
