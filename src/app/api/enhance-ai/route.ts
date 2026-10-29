/**
 * POST /api/enhance-ai — Restauração de artes de baixa resolução via IA.
 *
 * Recebe { image: dataURL, size: "WxH" } e devolve { image: base64, mime, size }.
 * O modelo de imagem recria a arte em alta nitidez preservando composição,
 * cores e textos (mesmo wording). Roda 100% server-side via Google Gemini
 * (edição de imagem / "Nano Banana") — o SDK do sandbox (z-ai-web-dev-sdk)
 * não existe fora deste ambiente, por isso a chamada é feita direto na API
 * pública com a chave em variável de ambiente:
 *
 *   GEMINI_API_KEY      (obrigatória — segredo no Secret Manager/App Hosting)
 *   GEMINI_IMAGE_MODEL  (opcional — padrão: gemini-2.5-flash-image)
 *
 * Sem a chave, a rota responde 503 com mensagem clara (degradação honesta
 * em vez de erro genérico). O contrato com o cliente (ai-restore.ts) é o
 * mesmo do backend anterior: data URL de imagem entra, base64 sai.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash-image";
/** Teto do servidor (cliente aborta em 180 s — margem de 30 s). */
const TIMEOUT_MS = 150_000;

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

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Restauração por IA não está configurada neste servidor (GEMINI_API_KEY ausente)." },
      { status: 503 },
    );
  }
  const model = process.env.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_MODEL;

  try {
    const body = await req.json().catch(() => null);
    const image: unknown = body?.image;
    const size: SupportedSize =
      typeof body?.size === "string" && SUPPORTED_SET.has(body.size)
        ? (body.size as SupportedSize)
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

    // Timeout próprio: o único abort possível é o nosso (mensagem dedicada).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

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
      return NextResponse.json({ error: geminiHttpMessage(res.status, apiMessage) }, { status: 502 });
    }

    const data = (await res.json()) as GeminiResponse;

    const blockReason = data.promptFeedback?.blockReason;
    if (blockReason) {
      return NextResponse.json(
        { error: `A IA recusou processar esta imagem (${blockReason}). Tente outra arte.` },
        { status: 422 },
      );
    }

    const candidate = data.candidates?.[0];
    const outPart = candidate?.content?.parts?.find((p) => p.inlineData?.data);
    const outBase64 = outPart?.inlineData?.data;
    if (!outBase64) {
      const reason = candidate?.finishReason;
      console.error(`[enhance-ai] Resposta sem imagem (finishReason: ${reason ?? "nulo"})`);
      return NextResponse.json(
        { error: "O modelo de IA não retornou resultado. Tente novamente." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      image: outBase64,
      mime: outPart.inlineData?.mimeType ?? "image/png",
      size,
    });
  } catch (err) {
    // AbortError aqui só acontece pelo nosso timeout (o do cliente morre no fetch do cliente)
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json(
        { error: "A IA demorou demais para responder. Tente novamente em instantes." },
        { status: 504 },
      );
    }
    console.error("[enhance-ai]", err);
    return NextResponse.json(
      { error: "Falha na restauração por IA. Verifique a conexão e tente novamente." },
      { status: 500 },
    );
  }
}
