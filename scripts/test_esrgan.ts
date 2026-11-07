/**
 * Teste E2E local do pipeline ESRGAN (exatamente o algoritmo que vai para a rota).
 *
 * Pipeline: dataURL → sharp (flatten branco, RGB) → tiles 128×128 (overlap 32)
 *   → Real-ESRGAN-General-x4v3 (x4, NCHW 0–1) → remonte → volta ao tamanho original
 *   → PNG.
 *
 * Uso: node --experimental-strip-types scripts/test_esrgan.ts <entrada> <saída> [maxLado]
 */
import * as ort from "onnxruntime-node";
import sharp from "sharp";
import fs from "node:fs";
import os from "node:os";
import { unzipSync } from "fflate";

const ZIP_URL =
  "https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/real_esrgan_general_x4v3/releases/v0.65.0/real_esrgan_general_x4v3-onnx-float.zip";
const MODEL_DIR = os.tmpdir() + "/realesrgan-x4v3";
const MODEL_PATH = MODEL_DIR + "/real_esrgan_general_x4v3.onnx";

const TILE = 128;
const OVERLAP = 32;
const STRIDE = TILE - OVERLAP; // 96

async function ensureModel(): Promise<ort.InferenceSession> {
  if (!(fs.existsSync(MODEL_PATH) && fs.statSync(MODEL_PATH).size > 100_000)) {
    const res = await fetch(ZIP_URL, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar modelo`);
    const entries = unzipSync(new Uint8Array(Buffer.from(await res.arrayBuffer())));
    fs.mkdirSync(MODEL_DIR, { recursive: true });
    for (const name of Object.keys(entries)) {
      const base = name.split("/").pop();
      if (base) fs.writeFileSync(`${MODEL_DIR}/${base}`, Buffer.from(entries[name]));
    }
  }
  return ort.InferenceSession.create(MODEL_PATH, {
    graphOptimizationLevel: "all",
    executionMode: "sequential",
    intraOpNumThreads: 1, // Cloud Run cpu=1
  });
}

/** Posições de tile com clamp na borda (garante overlap ≥ 0 e cobertura total). */
function tilePositions(total: number): number[] {
  if (total <= TILE) return [0];
  const pos: number[] = [];
  for (let p = 0; p + TILE < total; p += STRIDE) pos.push(p);
  pos.push(total - TILE);
  return pos;
}

/**
 * Super-resolução x4 tiled. Entrada/saída: RGB interleaved (Uint8Array).
 * Retorna buffer RGB no tamanho W*4 × H*4.
 */
async function upscaleTiled(
  session: ort.InferenceSession,
  rgb: Uint8Array,
  w: number,
  h: number,
): Promise<{ out: Uint8Array; w: number; h: number; tiles: number }> {
  const padW = Math.max(w, TILE) - w;
  const padH = Math.max(h, TILE) - h;
  let src = rgb;
  let W = w;
  let H = h;
  if (padW > 0 || padH > 0) {
    // bordas extrapolam o tile: espelha conteúdo (extend com borda replicada)
    const padded = await sharp(Buffer.from(rgb), { raw: { width: w, height: h, channels: 3 } })
      .extend({
        top: 0,
        left: 0,
        right: padW,
        bottom: padH,
        background: { r: 255, g: 255, b: 255 },
      })
      .raw()
      .toBuffer();
    src = new Uint8Array(padded);
    W = w + padW;
    H = h + padH;
  }

  const ow = W * 4;
  const oh = H * 4;
  const out = new Uint8Array(ow * oh * 3);
  const xs = tilePositions(W);
  const ys = tilePositions(H);
  let tiles = 0;

  for (const py of ys) {
    for (const px of xs) {
      // monta o tile NCHW 0–1 a partir do RGB interleaved
      const tile = new Float32Array(3 * TILE * TILE);
      for (let y = 0; y < TILE; y++) {
        const srcRow = ((py + y) * W + px) * 3;
        for (let x = 0; x < TILE; x++) {
          const s = srcRow + x * 3;
          tile[0 * TILE * TILE + y * TILE + x] = src[s] / 255;
          tile[1 * TILE * TILE + y * TILE + x] = src[s + 1] / 255;
          tile[2 * TILE * TILE + y * TILE + x] = src[s + 2] / 255;
        }
      }
      const results = await session.run({ image: new ort.Tensor("float32", tile, [1, 3, TILE, TILE]) });
      const upscaled = results.upscaled_image as ort.Tensor;
      const odata = upscaled.data as Float32Array;

      // região válida do tile (corta meio overlap de cada lado interno)
      const cutL = px > 0 ? OVERLAP / 2 : 0;
      const cutR = px + TILE < W ? OVERLAP / 2 : 0;
      const cutT = py > 0 ? OVERLAP / 2 : 0;
      const cutB = py + TILE < H ? OVERLAP / 2 : 0;
      const OT = TILE * 4; // 512 — lado do tile na saída
      const validW = (TILE - cutL - cutR) * 4; // px de saída válidos por linha
      // o tensor de saída é NCHW (planar): converte canal a canal para RGB intercalado
      for (let c = 0; c < 3; c++) {
        const plane = c * OT * OT;
        for (let y = cutT; y < TILE - cutB; y++) {
          for (let sy = 0; sy < 4; sy++) {
            const y4 = y * 4 + sy;
            const srcRow = plane + y4 * OT + cutL * 4;
            const dstRow = ((py + y) * 4 + sy) * ow * 3 + (px + cutL) * 4 * 3 + c;
            for (let i = 0; i < validW; i++) {
              const v = odata[srcRow + i] * 255;
              out[dstRow + i * 3] = v <= 0 ? 0 : v >= 255 ? 255 : v | 0;
            }
          }
        }
      }
      tiles++;
    }
  }

  return { out, w: ow, h: oh, tiles };
}

async function main() {
  const [, , inPath, outPath, maxLadoArg] = process.argv;
  if (!inPath || !outPath) {
    console.error("uso: node --experimental-strip-types scripts/test_esrgan.ts <in> <out> [maxLado]");
    process.exit(1);
  }
  const maxLado = maxLadoArg ? parseInt(maxLadoArg, 10) : 1440;

  const t0 = performance.now();
  const session = await ensureModel();
  console.log(`[esrgan] sessão pronta em ${(performance.now() - t0).toFixed(0)} ms`);

  // pré-processamento idêntico ao da rota: flatten branco + RGB + teto de lado
  const img = sharp(inPath).flatten({ background: "#ffffff" }).removeAlpha();
  const meta = await img.metadata();
  const w0 = meta.width ?? 0;
  const h0 = meta.height ?? 0;
  const scale = Math.min(1, maxLado / Math.max(w0, h0));
  const rw = Math.max(1, Math.round(w0 * scale));
  const rh = Math.max(1, Math.round(h0 * scale));
  console.log(`[esrgan] entrada ${w0}x${h0} → processada ${rw}x${rh}`);

  const t1 = performance.now();
  const raw = new Uint8Array(await img.resize(rw, rh, { kernel: "lanczos3" }).raw().toBuffer());
  console.log(`[esrgan] decode+resize: ${(performance.now() - t1).toFixed(0)} ms`);

  const t2 = performance.now();
  const { out, w: ow, h: oh, tiles } = await upscaleTiled(session, raw, rw, rh);
  const dt = (performance.now() - t2) / 1000;
  console.log(`[esrgan] inferência: ${dt.toFixed(1)} s (${tiles} tiles → ${(dt / tiles * 1000).toFixed(0)} ms/tile), saída ${ow}x${oh}`);

  // volta ao tamanho de entrada (contrato do cliente normaliza de qualquer jeito)
  const t3 = performance.now();
  const png = await sharp(Buffer.from(out), { raw: { width: ow, height: oh, channels: 3 } })
    .resize(rw, rh, { kernel: "lanczos3" })
    .png({ compressionLevel: 6 })
    .toBuffer();
  console.log(`[esrgan] pós-processo: ${(performance.now() - t3).toFixed(0)} ms → PNG ${(png.length / 1e6).toFixed(2)} MB`);

  fs.writeFileSync(outPath, png);
  console.log(`[esrgan] salvo: ${outPath}`);
  console.log(`[esrgan] RSS final: ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);
  console.log(`[esrgan] TOTAL: ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}

main().catch((err) => {
  console.error("[esrgan] ERRO:", err);
  process.exit(1);
});
