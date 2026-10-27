/**
 * Valida o prompt de restauração IA sobre arte embaçada (mesma chamada da API route).
 * Uso: bun scripts/test_ai_restore.ts <input.png> <output.png> <WxH>
 */
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";

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

async function main() {
  const [input, output, size = "864x1152"] = process.argv.slice(2);
  if (!input || !output) throw new Error("uso: bun test_ai_restore.ts <in> <out> [WxH]");

  const b64 = fs.readFileSync(input).toString("base64");
  const dataUrl = `data:image/png;base64,${b64}`;

  const zai = await ZAI.create();
  const t0 = Date.now();
  const res = await zai.images.generations.edit({
    prompt: RESTORE_PROMPT,
    images: [{ url: dataUrl }],
    size,
  });
  const outB64 = res?.data?.[0]?.base64;
  if (!outB64) throw new Error("resposta sem base64");
  fs.writeFileSync(output, Buffer.from(outB64, "base64"));
  console.log(`ok: ${output} (${size}) em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error("ERRO:", e?.message ?? e);
  process.exit(1);
});
