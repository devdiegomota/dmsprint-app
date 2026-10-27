/**
 * POST /api/enhance-ai — Restauração de artes de baixa resolução via IA.
 *
 * Recebe { image: dataURL, size: "WxH" } e devolve { image: base64, size }.
 * O modelo de imagem recria a arte em alta nitidez preservando composição,
 * cores e textos (mesmo wording). Roda 100% server-side (z-ai-web-dev-sdk).
 */
import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";

/** Tamanhos suportados pela API de edição de imagem. */
const SUPPORTED_SIZES = new Set([
  "1024x1024",
  "768x1344",
  "864x1152",
  "1344x768",
  "1152x864",
  "1440x720",
  "720x1440",
]);

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const image: unknown = body?.image;
    const size: string =
      typeof body?.size === "string" && SUPPORTED_SIZES.has(body.size)
        ? body.size
        : "1024x1024";

    if (typeof image !== "string" || !image.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "Imagem inválida — envie um data URL de imagem." },
        { status: 400 },
      );
    }

    const zai = await ZAI.create();
    const res = await zai.images.generations.edit({
      prompt: RESTORE_PROMPT,
      images: [{ url: image }],
      size,
    });

    const base64 = res?.data?.[0]?.base64;
    if (!base64) {
      return NextResponse.json(
        { error: "O modelo de imagem não retornou resultado. Tente novamente." },
        { status: 502 },
      );
    }

    return NextResponse.json({ image: base64, size });
  } catch (err) {
    console.error("[enhance-ai]", err);
    return NextResponse.json(
      { error: "Falha na restauração por IA. Verifique a conexão e tente novamente." },
      { status: 500 },
    );
  }
}
