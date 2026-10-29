/**
 * Valida a restauração IA end-to-end: POST /api/enhance-ai (a MESMA chamada que o app faz).
 * Uso: bun scripts/test_ai_restore.ts <input.png> <output.png> [WxH] [baseURL]
 *   baseURL padrão: http://localhost:3000 — aceita a URL de produção para testar o deploy
 *   (ex.: https://dmsprint-app--dmsprintapp.us-east4.hosted.app).
 * Requer que o servidor tenha GEMINI_API_KEY configurada (.env.local local ou secret no App Hosting).
 */
import fs from "fs";

interface EnhanceResponse {
  image?: unknown;
  mime?: unknown;
  error?: unknown;
}

async function main() {
  const [input, output, size = "864x1152", base = process.env.BASE_URL ?? "http://localhost:3000"] =
    process.argv.slice(2);
  if (!input || !output) {
    throw new Error("uso: bun test_ai_restore.ts <in> <out> [WxH] [baseURL]");
  }

  const b64 = fs.readFileSync(input).toString("base64");
  const dataUrl = `data:image/png;base64,${b64}`;

  const t0 = Date.now();
  const res = await fetch(`${base.replace(/\/+$/, "")}/api/enhance-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataUrl, size }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as EnhanceResponse | null;
    throw new Error(`HTTP ${res.status}: ${body?.error ?? res.statusText}`);
  }
  const data = (await res.json()) as EnhanceResponse;
  const outB64 = data.image;
  if (typeof outB64 !== "string" || outB64.length < 100) throw new Error("resposta sem base64");
  const mime = typeof data.mime === "string" ? data.mime : "image/png";
  fs.writeFileSync(output, Buffer.from(outB64, "base64"));
  console.log(`ok: ${output} (${mime}, ${size}) em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error("ERRO:", e?.message ?? e);
  process.exit(1);
});
