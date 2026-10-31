/**
 * Código de dispositivo da Nuvem DMS.
 *
 * 6 caracteres gerados uma vez por navegador (localStorage). Funciona como chave
 * de acesso à fila: no celular gera automaticamente; no computador o operador
 * digita o código do celular uma única vez. Alfabeto sem caracteres ambíguos
 * (I/L/O/0/1) para ditar e ler em voz alta sem confusão.
 */

import { NUVEM_LS } from "./types";

/** Sem I, L, O, 0 e 1 — evita confusão ao ler/ditar o código. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

/** Regex que valida o formato do código (espelhada nas Security Rules). */
export const CODE_PATTERN = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);

/** Gera um código aleatório criptograficamente seguro (ex.: "DMX7K2"). */
export function generateDeviceCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const b of bytes) code += ALPHABET[b % ALPHABET.length];
  return code;
}

/** Código salvo neste navegador, ou null se ainda não existe. */
export function getStoredDeviceCode(): string | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(NUVEM_LS.code);
  return stored && CODE_PATTERN.test(stored) ? stored : null;
}

/** Garante que este navegador tenha um código (gera na primeira vez). */
export function ensureDeviceCode(): string {
  const existing = getStoredDeviceCode();
  if (existing) return existing;
  const code = generateDeviceCode();
  window.localStorage.setItem(NUVEM_LS.code, code);
  return code;
}

/** Salva manualmente um código (acessar a fila de outro dispositivo). */
export function saveDeviceCode(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  if (!CODE_PATTERN.test(normalized)) return false;
  window.localStorage.setItem(NUVEM_LS.code, normalized);
  return true;
}
