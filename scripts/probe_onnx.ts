/**
 * Sonda do ONNX Real-ESRGAN-General-x4v3 (Qualcomm AI Hub, bucket S3 público).
 *
 * 1. Baixa o ZIP (~5 MB) do S3 e extrai o .onnx para /tmp via fflate.
 * 2. Cria a sessão ORT (1 thread intra-op = simula o vCPU do Cloud Run).
 * 3. Descobre nome/shape/layout da entrada e saída.
 * 4. Roda inferências de um tile 128×128 e mede tempo médio + RSS.
 *
 * Uso: node --experimental-strip-types scripts/probe_onnx.ts
 */
import * as ort from "onnxruntime-node";
import fs from "node:fs";
import os from "node:os";
import { unzipSync } from "fflate";

const ZIP_URL =
  "https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/real_esrgan_general_x4v3/releases/v0.65.0/real_esrgan_general_x4v3-onnx-float.zip";
const ZIP_PATH = os.tmpdir() + "/realesrgan-x4v3-onnx.zip";
const MODEL_DIR = os.tmpdir() + "/realesrgan-x4v3";
const MODEL_PATH = MODEL_DIR + "/real_esrgan_general_x4v3.onnx";

async function downloadModel(): Promise<string> {
  if (fs.existsSync(MODEL_PATH) && fs.statSync(MODEL_PATH).size > 100_000) {
    console.log(`[probe] modelo já em cache: ${MODEL_PATH}`);
    return MODEL_PATH;
  }
  console.log(`[probe] baixando ZIP de qaihub-public-assets.s3 ...`);
  const res = await fetch(ZIP_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} no S3`);
  const zipBuf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(ZIP_PATH, zipBuf);
  console.log(`[probe] ZIP salvo: ${(zipBuf.length / 1e6).toFixed(2)} MB`);

  const entries = unzipSync(new Uint8Array(zipBuf));
  const names = Object.keys(entries);
  console.log(`[probe] conteúdo do ZIP: ${names.join(", ")}`);
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  for (const name of names) {
    const base = name.split("/").pop() ?? name;
    if (!base) continue;
    fs.writeFileSync(`${MODEL_DIR}/${base}`, Buffer.from(entries[name]));
    const size = entries[name].length;
    console.log(`[probe] extraído: ${base} (${(size / 1e6).toFixed(2)} MB)`);
  }
  if (!fs.existsSync(MODEL_PATH)) throw new Error("nenhum .onnx dentro do ZIP");
  return MODEL_PATH;
}

async function main() {
  const modelPath = await downloadModel();

  console.log(`[probe] cpus disponíveis: ${os.cpus().length} (modelo: ${os.cpus()[0]?.model ?? "?"})`);
  const session = await ort.InferenceSession.create(modelPath, {
    graphOptimizationLevel: "all",
    executionMode: "sequential",
  });

  console.log(`[probe] inputs:  ${JSON.stringify(session.inputNames)}`);
  console.log(`[probe] outputs: ${JSON.stringify(session.outputNames)}`);

  const anySession = session as unknown as {
    inputMetadata?: unknown;
    outputMetadata?: unknown;
  };
  console.log(`[probe] inputMetadata:  ${JSON.stringify(anySession.inputMetadata)}`);
  console.log(`[probe] outputMetadata: ${JSON.stringify(anySession.outputMetadata)}`);

  const inputName = session.inputNames[0];
  const candidates: Array<{ dims: number[]; label: string }> = [];
  const metaShape = (() => {
    try {
      const m = anySession.inputMetadata as Array<{ shape?: number[] }> | undefined;
      return m?.[0]?.shape ?? null;
    } catch {
      return null;
    }
  })();
  if (metaShape && metaShape.length && metaShape.every((d) => typeof d === "number" && d > 0)) {
    candidates.push({ dims: metaShape, label: "metadata" });
  } else {
    candidates.push(
      { dims: [1, 3, 128, 128], label: "NCHW?" },
      { dims: [1, 128, 128, 3], label: "NHWC?" },
    );
  }

  let working: { dims: number[] } | null = null;
  for (const cand of candidates) {
    const n = cand.dims.reduce((a, b) => a * b, 1);
    try {
      const data = new Float32Array(n);
      for (let i = 0; i < n; i++) data[i] = (i % 255) / 255;
      const tensor = new ort.Tensor("float32", data, cand.dims);
      const t0 = performance.now();
      const out = await session.run({ [inputName]: tensor });
      const ms = performance.now() - t0;
      const outT = Object.values(out)[0] as ort.Tensor;
      console.log(
        `[probe] OK layout=${cand.label} dims=${JSON.stringify(cand.dims)} → saída dims=${JSON.stringify(outT.dims)} (1ª: ${ms.toFixed(0)} ms)`,
      );
      working = { dims: cand.dims };
      break;
    } catch (err) {
      console.log(`[probe] recusado layout=${cand.label}: ${(err as Error).message.split("\n")[0]}`);
    }
  }

  if (working) {
    const n = working.dims.reduce((a, b) => a * b, 1);
    const data = new Float32Array(n);
    for (let i = 0; i < n; i++) data[i] = (i % 255) / 255;
    const tensor = new ort.Tensor("float32", data, working.dims);
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      await session.run({ [inputName]: tensor });
      times.push(performance.now() - t0);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    console.log(
      `[probe] tempo por tile ${JSON.stringify(working.dims)} (1 thread): médio ${avg.toFixed(0)} ms / melhor ${min.toFixed(0)} ms`,
    );
    console.log(`[probe] RSS após inferências: ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);
  } else {
    console.log("[probe] NENHUM layout funcionou — inspecionar ONNX manualmente");
  }
}

main().catch((err) => {
  console.error("[probe] ERRO:", err);
  process.exit(1);
});
