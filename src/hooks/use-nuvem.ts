"use client";

/**
 * Hooks da Nuvem DMS — código de dispositivo + fila em tempo real.
 *
 * Flags locais (código, retenção, auto-envio) leem localStorage em inicializadores
 * lazy de useState — SSR-safe e sem setState síncrono em effect. A fila toca a
 * rede só dentro de useEffect (nunca no servidor).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ensureDeviceCode, getStoredDeviceCode, saveDeviceCode } from "@/lib/nuvem/device-code";
import { subscribeNuvemPdfs } from "@/lib/nuvem/store";
import {
  DEFAULT_RETENTION_DAYS,
  NUVEM_LS,
  type NuvemPdfDoc,
  type RetentionDays,
} from "@/lib/nuvem/types";

/** Lê flag booleana do localStorage com default ligado ("0" = desligado). */
export function readStoredFlag(key: string): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(key) !== "0";
}

/** Lê a retenção salva; valores fora da lista caem no padrão (60 dias). */
function readStoredDays(): RetentionDays {
  if (typeof window === "undefined") return DEFAULT_RETENTION_DAYS;
  const raw = window.localStorage.getItem(NUVEM_LS.retentionDays);
  if (raw === null || raw === "") return DEFAULT_RETENTION_DAYS; // Number(null)=0 colidiria com "Nunca"
  const parsed = Number(raw);
  return ([30, 60, 90, 0] as number[]).includes(parsed)
    ? (parsed as RetentionDays)
    : DEFAULT_RETENTION_DAYS;
}

/** Código deste navegador (gera na primeira montagem) + troca manual. */
export function useDeviceCode() {
  // Inicializador lazy (não effect): evita setState síncrono e não afeta o HTML
  // inicial — o código só é exibido dentro do painel, que começa fechado.
  const [code, setCodeState] = useState<string | null>(() =>
    typeof window !== "undefined" ? ensureDeviceCode() : null,
  );

  const setCode = useCallback((raw: string) => {
    if (saveDeviceCode(raw)) setCodeState(getStoredDeviceCode());
  }, []);

  return { code, setCode };
}

/** Fila em tempo real do dispositivo — aparece no PC assim que o celular envia. */
export function useNuvemPdfs(code: string | null) {
  const [docs, setDocs] = useState<NuvemPdfDoc[] | null>(null);
  // Erro vinculado ao código que o gerou — trocar de código esconde o erro antigo
  // sem precisar de setState síncrono no corpo do effect.
  const [errorState, setErrorState] = useState<{ code: string; message: string } | null>(null);
  // Evita repetir o toast de erro a cada reconexão do listener (1 por código).
  const reportedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!code) return;
    const unsub = subscribeNuvemPdfs(
      code,
      (list) => {
        setDocs(list);
        setErrorState(null);
      },
      (message) => {
        if (reportedFor.current !== code) {
          reportedFor.current = code;
          setErrorState({ code, message });
        }
      },
    );
    return () => unsub();
  }, [code]);

  const error = errorState && errorState.code === code ? errorState.message : null;
  return { docs, error };
}

/** Contagem de PDFs "novos" para o badge do header — listener próprio e leve. */
export function useNuvemNovosCount(code: string | null): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!code) return;
    // Sem filtro server-side (evita índice composto): a fila do operador é pequena
    // (centenas), e o listener só re-transmite quando algum documento muda.
    const unsub = subscribeNuvemPdfs(
      code,
      (list) => setCount(list.filter((d) => d.status === "novo").length),
      () => setCount(0),
    );
    return () => unsub();
  }, [code]);

  return count;
}

/** Retenção (dias) configurável para a limpeza automática. */
export function useRetentionDays() {
  const [days, setDaysState] = useState<RetentionDays>(readStoredDays);

  const setDays = useCallback((d: RetentionDays) => {
    setDaysState(d);
    window.localStorage.setItem(NUVEM_LS.retentionDays, String(d));
  }, []);

  return { days, setDays };
}
