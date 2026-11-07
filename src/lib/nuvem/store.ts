/**
 * Operações da Nuvem DMS (Firebase Storage + Firestore).
 *
 * Fluxo: o PDF nasce no navegador (jsPDF/pdf-lib, 100% local) e, opcionalmente,
 * sobe para `nuvem/{code}/{id}.pdf`. Os metadados vivem em
 * `nuvem/{code}/pdfs/{id}` no Firestore, com listener em TEMPO REAL — quando o
 * celular envia, o computador vê aparecer na fila sem recarregar.
 *
 * Limpeza: é feita pelo próprio app (lazy ao abrir o painel + botão manual), sem
 * Cloud Functions — o plano de custo se mantém previsível e a lógica fica toda
 * auditável aqui. Arquivos FIXADOS nunca são removidos.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { getFirebase } from "@/lib/firebase/config";
import { NUVEM_MAX_BYTES, type NuvemPdfDoc, type NuvemStatus } from "./types";

/** Teto total do upload (redes móveis lentas) — não deixa o botão girando para sempre. */
const UPLOAD_OVERALL_TIMEOUT_MS = 180_000;
/**
 * Depois que os bytes sobem, a gravação do metadado no Firestore deve ser rápida.
 * Se estourar, quase sempre é o banco do Firestore com ID diferente de (default) ou
 * sem regras: o SDK fica em retry infinito SEM rejeitar, travando a UI em loop.
 */
const FIRESTORE_ACK_TIMEOUT_MS = 20_000;

/** Erro com a mesma cara dos FirebaseError (campo `code`) para o friendlyFirebaseError. */
function syntheticError(code: string): Error {
  const err = new Error(code);
  (err as { code?: string }).code = code;
  return err;
}

/** Rejeita se `p` não resolver em `ms` — transforma travamento silencioso em erro visível. */
function withTimeout<T>(p: Promise<T>, ms: number, code: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(syntheticError(code)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export interface UploadMeta {
  name: string;
  product: NuvemPdfDoc["product"];
  productName: string;
}

/**
 * Envia o PDF (blob gerado no cliente) para a nuvem e cria o documento de
 * metadados. `onProgress` recebe 0–100. Retorna o id do documento.
 */
export function uploadNuvemPdf(
  code: string,
  blob: Blob,
  meta: UploadMeta,
  onProgress?: (pct: number) => void,
): Promise<string> {
  if (blob.size <= 0) return Promise.reject(new Error("PDF vazio."));
  if (blob.size > NUVEM_MAX_BYTES) return Promise.reject(new Error("PDF maior que 200 MB."));

  const { storage, db } = getFirebase();
  const id = crypto.randomUUID();
  const storagePath = `nuvem/${code}/${id}.pdf`;
  const task = uploadBytesResumable(ref(storage, storagePath), blob, {
    contentType: "application/pdf",
    customMetadata: { deviceCode: code, product: meta.product },
  });

  return new Promise<string>((resolve, reject) => {
    // Watchdog total: se a rede prender, cancela o upload e rejeita com erro claro.
    const overall = setTimeout(() => {
      task.cancel();
      reject(syntheticError("nuvem/timeout-storage"));
    }, UPLOAD_OVERALL_TIMEOUT_MS);
    task.on(
      "state_changed",
      (snap) => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      (err) => {
        clearTimeout(overall);
        reject(err);
      },
      async () => {
        try {
          const payload: Omit<NuvemPdfDoc, "id"> = {
            name: meta.name.replace(/\.pdf$/i, ""),
            product: meta.product,
            productName: meta.productName,
            sizeBytes: blob.size,
            createdAt: Date.now(),
            status: "novo" satisfies NuvemStatus,
            pinned: false,
            storagePath,
          };
          await withTimeout(
            setDoc(doc(db, "nuvem", code, "pdfs", id), payload),
            FIRESTORE_ACK_TIMEOUT_MS,
            "nuvem/timeout-firestore",
          );
          clearTimeout(overall);
          resolve(id);
        } catch (err) {
          clearTimeout(overall);
          // O PDF pode ter subido sem o metadado (a fila nunca confirmou) — remove o
          // órfão do Storage para não acumular arquivo invisível. Falha silenciosa:
          // se as regras também negarem delete, não há mais nada a fazer aqui.
          deleteObject(ref(storage, storagePath)).catch(() => {});
          reject(err);
        }
      },
    );
  });
}

/**
 * Listener em tempo real da fila do dispositivo (ordenado do mais novo ao mais
 * velho). Chama onError com mensagem amigável quando o backend não está
 * ativado/regras ausentes.
 */
export function subscribeNuvemPdfs(
  code: string,
  onData: (docs: NuvemPdfDoc[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  const { db } = getFirebase();
  const q = query(collection(db, "nuvem", code, "pdfs"), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => {
          const v = d.data() as Omit<NuvemPdfDoc, "id">;
          return { ...v, id: d.id };
        }),
      );
    },
    (err) => onError(friendlyFirebaseError(err)),
  );
}

/** URL de download temporária (V4, expira em 1 h) para abrir/baixar o PDF. */
export async function nuvemDownloadUrl(storagePath: string): Promise<string> {
  const { storage } = getFirebase();
  return getDownloadURL(ref(storage, storagePath));
}

/** Atualiza status/pin do documento. */
export function updateNuvemDoc(
  code: string,
  id: string,
  patch: Partial<Pick<NuvemPdfDoc, "status" | "pinned">>,
): Promise<void> {
  const { db } = getFirebase();
  return updateDoc(doc(db, "nuvem", code, "pdfs", id), patch);
}

/** Remove o arquivo do Storage (tolera ausência) e o documento do Firestore. */
export async function deleteNuvemPdf(code: string, target: NuvemPdfDoc): Promise<void> {
  const { storage, db } = getFirebase();
  try {
    await deleteObject(ref(storage, target.storagePath));
  } catch (err) {
    // object-not-found é ok: limpar o metadado órfão é justamente o objetivo.
    const codeName = (err as { code?: string }).code ?? "";
    if (codeName !== "storage/object-not-found") throw err;
  }
  await deleteDoc(doc(db, "nuvem", code, "pdfs", target.id));
}

/**
 * Limpeza por retenção: remove (exceto fixados) os PDFs mais antigos que
 * `days`. Retorna quantos foram removidos. days <= 0 desativa.
 */
export async function cleanupNuvemByAge(code: string, days: number): Promise<number> {
  if (days <= 0) return 0;
  const cutoff = Date.now() - days * 86_400_000;
  const { db } = getFirebase();
  const snap = await getDocs(collection(db, "nuvem", code, "pdfs"));
  const targets: NuvemPdfDoc[] = snap.docs
    .map((d) => ({ ...(d.data() as Omit<NuvemPdfDoc, "id">), id: d.id }))
    .filter((v) => !v.pinned && v.createdAt < cutoff);
  for (const t of targets) await deleteNuvemPdf(code, t);
  return targets.length;
}

/** Limpeza total: remove TODOS os PDFs não fixados. Retorna quantos foram. */
export async function cleanupNuvemAll(code: string): Promise<number> {
  const { db } = getFirebase();
  const snap = await getDocs(collection(db, "nuvem", code, "pdfs"));
  const targets: NuvemPdfDoc[] = snap.docs
    .map((d) => ({ ...(d.data() as Omit<NuvemPdfDoc, "id">), id: d.id }))
    .filter((v) => !v.pinned);
  for (const t of targets) await deleteNuvemPdf(code, t);
  return targets.length;
}

/** Traduz erros comuns do Firebase para mensagens acionáveis em PT-BR. */
export function friendlyFirebaseError(err: unknown): string {
  const code = (err as { code?: string }).code ?? "";
  if (code === "nuvem/timeout-firestore") {
    return "A fila não confirmou o envio — o PDF não entrou. Causa mais comum: o banco do Firestore precisa existir com o ID exato (default) (não um nome personalizado) e ter as regras publicadas.";
  }
  if (code === "nuvem/timeout-storage") {
    return "O envio passou de 3 minutos e foi interrompido. Verifique a internet e tente de novo.";
  }
  if (code.includes("permission-denied") || code.includes("unauthorized")) {
    return "Acesso negado: as regras de segurança da Nuvem DMS ainda não foram publicadas (ou estão erradas) no console — Firestore e Storage, aba Regras.";
  }
  if (code.includes("not-found")) {
    return "Serviço não encontrado: ative o Cloud Firestore e o Storage no console do Firebase.";
  }
  if (code.includes("unavailable") || code.includes("network")) {
    return "Sem conexão com a nuvem agora. Verifique a internet e tente de novo.";
  }
  if (code.includes("canceled")) return "Envio cancelado.";
  if (code.includes("retry-after") || code.includes("quota")) {
    return "Limite temporário do Firebase atingido — aguarde alguns minutos.";
  }
  return "Falha inesperada na nuvem. Tente novamente.";
}
