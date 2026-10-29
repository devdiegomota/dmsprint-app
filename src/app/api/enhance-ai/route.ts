/**
 * POST /api/enhance-ai — Restauração de artes de baixa resolução via IA.
 *
 * Recebe { image: dataURL, size: "WxH" } e devolve { image: base64, mime, size }.
 *
 * PROVEDORES (env AI_PROVIDER — padrão "auto"):
 *
 *   "auto"    → tenta o Gemini (recriação semântica, melhor qualidade) e, se
 *               falhar por qualquer motivo (sem chave, 402 sem crédito, 429,
 *               5xx, rede...), cai automaticamente para o ESRGAN local.
 *               Quando o crédito do AI Studio voltar, o Gemini volta a ser
 *               usado sozinho — sem nenhuma mudança de código.
 *   "esrgan"  → apenas super-resolução local (Real-ESRGAN General x4v3 rodando
 *               neste servidor via onnxruntime-node — gratuita, sem quota;
 *               ver src/lib/server/esrgan.ts).
 *   "gemini"  → apenas Google Gemini (comportamento histórico; exige
 *               GEMINI_API_KEY com crédito ativo no AI Studio).
 *
 *   GEMINI_API_KEY      (secret no Secret Manager/App Hosting)
 *   GEMINI_IMAGE_MODEL  (opcional — padrão: gemini-2.5-flash-image)
 *   ESRGAN_MODEL_URL    (opcional — fonte do zip do modelo ESRGAN)
 *
 * O contrato com o cliente (ai-restore.ts) é o mesmo para todos os provedores:
 * data URL de imagem entra, base64 sai (o cliente normaliza e recorta).
 */
import { NextRequest, NextResponse } from "next/server";
import { esrganRestore, EsrganError } from "@/lib/server/esrgan";

export const runtime = "nodejs";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash-image";
/**
 * Orçamentos por modo (o cliente aborta em 180 s):
 *  - dedicado: 150 s (margem de 30 s);
 *  - auto: 80 s para cada tentativa (pior caso 160 s < 180 s).
 */
const TIMEOUT_SOLO_MS = 150_000;
const TIMEOUT_AUTO_STEP_MS = 80_000;

/** Tamanhos suportados pelo contrato do cliente (planAiPlacement). */
const SUPPORTED_SIZES = [
  "1024x1024",
  "768x1344",
  "864x1152",
  "1344x768",
  "1152x864",
  "1440x720",
  "720x1440",
] as const;
type SupportedSize = (typeof SUPPORTED_SIZES)[number];
const SUPPORTED_SET: ReadonlySet<string> = new Set<string>(SUPPORTED_SIZES);

/**
 * Prompt de restauração (validado com artes de teste):
 * - preserva composição, cores, layout e posicionamento;
 * - proíbe corrigir/completar/inventar texto (anti-alucinação);
 * - mantém texto coberto por formas como coberto;
 * - foco: bordas nítidas, sem blur nem artefatos de compressão.
 */
const RESTORE_PROMPT =
  "Restore and enhance this low-resolution graphic artwork for professional printing. " +
  "Keep the exact same composition, layout, colors and position of every element. " +
  "Copy every text character exactly as it appears in the original — same wording, spelling, numbers, " +
  "punctuation, accents and font style; do NOT correct, complete, guess or invent any text. " +
  "If a word or number is cut off at the edge or hard to read, keep it exactly as it is, do not try to finish it. " +
  "Text that is partially covered by a box or shape must stay partially covered — never reveal, reconstruct or complete what is behind shapes. " +
  "Keep all decorative boxes, shapes, lines and backgrounds exactly where they are, same size and color. " +
  "Only make text and edges crisp, sharp and perfectly legible; remove blur, noise and JPEG compression artifacts. " +
  "Do not add, remove, move or redesign any element. Do not crop or extend the image.";

/** Partes mínimas da resposta do Gemini que interessam à restauração. */
interface GeminiPart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
}
interface GeminiResponse {
  candidates?: Array<{ finishReason?: string; content?: { parts?: GeminiPart[] } }>;
  promptFeedback?: { blockReason?: string };
}

/** Falha do provedor Gemini com mensagem já em PT-BR. */
class GeminiFailure extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "GeminiFailure";
    this.status = status;
  }
}

/** Mensagem PT-BR para erros HTTP conhecidos da API do Gemini. */
function geminiHttpMessage(status: number, apiMessage: string): string {
  switch (status) {
    case 400:
      return "A IA rejeitou a imagem enviada. Tente novamente com outra arte ou refaça o recorte.";
    case 401:
    case 403:
      return "A chave da IA é inválida ou está sem permissão — confira GEMINI_API_KEY no servidor.";
    case 402:
      return "A IA está sem crédito no servidor — a chave precisa de cobrança ativa no Google AI Studio. Avise o administrador ou tente mais tarde.";
    case 404:
      return "Modelo de IA indisponível — confira GEMINI_IMAGE_MODEL no servidor.";
    case 429:
      return "A IA atingiu o limite de uso neste momento. Aguarde alguns segundos e tente de novo.";
    default:
      return apiMessage
        ? `Falha na restauração por IA (HTTP ${status}). Tente novamente.`
        : "Falha na restauração por IA. Verifique a conexão e tente novamente.";
  }
}

interface GeminiAttempt {
  base64: string;
  mime: string;
}

/** Fluxo Gemini (recriação semântica). Lança GeminiFailure em qualquer falha. */
async function runGemini(inMime: string, inBase64: string, timeoutMs: number): Promise<GeminiAttempt> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiFailure(
      "Restauração por IA não está configurada neste servidor (GEMINI_API_KEY ausente).",
      503,
    );
  }
  const model = process.env.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_MODEL;

  // Timeout próprio: o único abort possível é o nosso (mensagem dedicada).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: RESTORE_PROMPT }, { inlineData: { mimeType: inMime, data: inBase64 } }],
          },
        ],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
      signal: controller.signal,
    });
  } catch {
    throw new GeminiFailure("A IA demorou demais para responder. Tente novamente em instantes.", 504);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const raw = await res.text();
    console.error(`[enhance-ai] Gemini HTTP ${res.status} (modelo ${model}):`, raw.slice(0, 500));
    let apiMessage = "";
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && "error" in parsed) {
        const msg = (parsed as { error?: { message?: unknown } }).error?.message;
        if (typeof msg === "string") apiMessage = msg;
      }
    } catch {
      // corpo de erro não-JSON: seguimos com mensagem genérica
    }
    throw new GeminiFailure(geminiHttpMessage(res.status, apiMessage));
  }

  const data = (await res.json().catch(() => null)) as GeminiResponse | null;
  if (!data) {
    throw new GeminiFailure("Resposta inválida da IA. Tente novamente.");
  }

  const blockReason = data.promptFeedback?.blockReason;
  if (blockReason) {
    throw new GeminiFailure(`A IA recusou processar esta imagem (${blockReason}). Tente outra arte.`, 422);
  }

  const candidate = data.candidates?.[0];
  const outPart = candidate?.content?.parts?.find((p) => p.inlineData?.data);
  const outBase64 = outPart?.inlineData?.data;
  if (!outBase64) {
    const reason = candidate?.finishReason;
    console.error(`[enhance-ai] Resposta sem imagem (finishReason: ${reason ?? "nulo"})`);
    throw new GeminiFailure("O modelo de IA não retornou resultado. Tente novamente.");
  }
  return { base64: outBase64, mime: outPart.inlineData?.mimeType ?? "image/png" };
}

/** Fluxo ESRGAN local (super-resolução, gratuita). Lança EsrganError. */
async function runEsrgan(dataUrl: string, budgetMs: number): Promise<GeminiAttempt> {
  const result = await esrganRestore(dataUrl, budgetMs);
  return { base64: result.base64, mime: result.mime };
}

export async function POST(req: NextRequest) {
  const provider = (process.env.AI_PROVIDER?.trim() || "auto").toLowerCase();
  const sizeInput = await req.json().catch(() => null);

  const image: unknown = sizeInput?.image;
  const size: SupportedSize =
    typeof sizeInput?.size === "string" && SUPPORTED_SET.has(sizeInput.size)
      ? (sizeInput.size as SupportedSize)
      : "1024x1024";

  if (typeof image !== "string" || !image.startsWith("data:image/")) {
    return NextResponse.json(
      { error: "Imagem inválida — envie um data URL de imagem." },
      { status: 400 },
    );
  }

  // data URL → (mime, base64). O cliente sempre envia JPEG/PNG gerado por canvas.
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!match) {
    return NextResponse.json(
      { error: "Formato de imagem não suportado — use PNG, JPEG ou WebP em base64." },
      { status: 400 },
    );
  }
  const inMime = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  const inBase64 = match[2];
  const dataUrl = image;

  try {
    if (provider === "esrgan") {
      const out = await runEsrgan(dataUrl, TIMEOUT_SOLO_MS);
      return NextResponse.json({ image: out.base64, mime: out.mime, size });
    }

    if (provider === "gemini") {
      const out = await runGemini(inMime, inBase64, TIMEOUT_SOLO_MS);
      return NextResponse.json({ image: out.base64, mime: out.mime, size });
    }

    // ---- modo "auto" (padrão): Gemini primeiro, ESRGAN como reserva ----
    let geminiError: unknown = null;
    if (process.env.GEMINI_API_KEY) {
      try {
        const out = await runGemini(inMime, inBase64, TIMEOUT_AUTO_STEP_MS);
        return NextResponse.json({ image: out.base64, mime: out.mime, size });
      } catch (err) {
        geminiError = err;
        console.error(
          "[enhance-ai] auto: Gemini indisponível — usando super-resolução local:",
          err instanceof Error ? err.message : err,
        );
      }
    } else {
      console.error("[enhance-ai] auto: GEMINI_API_KEY ausente — usando super-resolução local");
    }

    try {
      const out = await runEsrgan(dataUrl, TIMEOUT_AUTO_STEP_MS);
      return NextResponse.json({ image: out.base64, mime: out.mime, size });
    } catch (esrganErr) {
      // Ambos falharam: o erro do ESRGAN (caminho gratuito) é o mais acionável.
      const status = esrganErr instanceof EsrganError ? esrganErr.status : 502;
      console.error(
        "[enhance-ai] auto: ESRGAN também falhou —",
        esrganErr instanceof Error ? esrganErr.message : esrganErr,
        "| erro Gemini original:",
        geminiError instanceof Error ? geminiError.message : geminiError,
      );
      return NextResponse.json(
        {
          error:
            esrganErr instanceof Error && esrganErr.message
              ? esrganErr.message
              : "Falha na restauração por IA. Tente novamente.",
        },
        { status },
      );
    }
  } catch (err) {
    // Provedores dedicados (esrgan/gemini) chegam aqui com seus erros mapeados.
    if (err instanceof EsrganError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof GeminiFailure) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[enhance-ai]", err);
    return NextResponse.json(
      { error: "Falha na restauração por IA. Verifique a conexão e tente novamente." },
      { status: 500 },
    );
  }
}
