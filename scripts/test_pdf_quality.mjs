/**
 * Task 24 — Auditoria empírica da qualidade dos PDFs exportados.
 *
 * Cadeia real do app: canvas 2480×3508 → toDataURL(jpeg,q) → jsPDF addImage
 * (processJPEG = pass-through DCTDecode) OU toDataURL(png) → pdf-lib embedPng.
 *
 * Este script replica a cadeia em Node (mesmas libs) e mede:
 *  1. jsPDF JPEG: bytes embutidos == bytes de entrada? (pass-through byte-a-byte)
 *  2. jsPDF JPEG com "FAST" vs "NONE": resultado idêntico?
 *  3. pdf-lib PNG: pixels decodificados == pixels originais? (lossless real)
 *  4. PSNR do JPEG q95 vs q100 contra o PNG original + tamanhos de arquivo
 */
import sharp from "sharp";
import { jsPDF } from "jspdf";
import { PDFDocument } from "pdf-lib";
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, statSync, mkdirSync } from "node:fs";

const W = 2480, H = 3508; // A4 @ 300 DPI
const OUT = "work/pdf-quality";
mkdirSync(OUT, { recursive: true });

// ---------- 1) Folha de estresse: texto fino impresso + linhas hairline + bordas de cor ----------
// 6 pt a 300 DPI ≈ 25 px de altura; 4 pt ≈ 17 px. Linha hairline de 0,1 mm ≈ 1,2 px.
const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  ${[25, 20, 17, 14, 12, 10].map((h, i) => `
    <text x="120" y="${300 + i * 90}" font-family="DejaVu Sans" font-size="${h}" font-weight="${i % 2 ? "normal" : "bold"}" fill="#000000">Teste ${h}px (≈${(h / 300 * 72).toFixed(1)}pt) — nitidez de texto fino 0123456789 açãié</text>`).join("")}
  ${[1, 2, 3, 4].map((w, i) => `<rect x="120" y="${900 + i * 40}" width="1200" height="${w}" fill="#000000"/>`).join("")}
  ${[1, 2, 3, 4].map((w, i) => `<rect x="120" y="${1100 + i * 40}" width="1200" height="${w}" fill="#cc3d0c"/>`).join("")}
  <line x1="120" y1="1300" x2="2000" y2="1900" stroke="#000" stroke-width="1.2"/>
  <line x1="2000" y1="1300" x2="120" y2="1900" stroke="#cc3d0c" stroke-width="1.2"/>
  <text x="120" y="2050" font-family="DejaVu Sans" font-size="25" fill="#cc3d0c" font-weight="bold">Laranja sobre branco — bordas de croma (checa subsampling 4:2:0)</text>
  <text x="120" y="2110" font-family="DejaVu Sans" font-size="25" fill="#1b2a4a" font-weight="bold">Azul-marinho sobre branco — bordas de croma (checa subsampling 4:2:0)</text>
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#1b2a4a"/><stop offset="0.5" stop-color="#cc3d0c"/><stop offset="1" stop-color="#ffffff"/>
  </linearGradient></defs>
  <rect x="120" y="2200" width="1800" height="400" fill="url(#g)"/>
  ${Array.from({ length: 40 }, (_, i) => `<rect x="${120 + i * 45}" y="2700" width="30" height="300" fill="${i % 2 ? "#000" : "#fff"}"/>`).join("")}
  <text x="120" y="3200" font-family="DejaVu Sans" font-size="17" fill="#000">Grade fina: ${(0).toFixed(0)} · margem ${120}px ≈ 10,2 mm</text>
</svg>`;
const pngOrig = await sharp(Buffer.from(svg)).png().toBuffer();
writeFileSync(`${OUT}/original.png`, pngOrig);
console.log(`original.png: ${statSync(`${OUT}/original.png`).size} bytes (${W}×${H})`);

// ---------- 2) JPEGs equivalentes ao canvas (q95 e q100) ----------
const jpeg95 = await sharp(pngOrig).jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer();
const jpeg95Sub = await sharp(pngOrig).jpeg({ quality: 95, chromaSubsampling: "4:2:0" }).toBuffer(); // pior caso típico de canvas
const jpeg100 = await sharp(pngOrig).jpeg({ quality: 100, chromaSubsampling: "4:4:4" }).toBuffer();
writeFileSync(`${OUT}/jpeg95.jpg`, jpeg95);
writeFileSync(`${OUT}/jpeg95-sub.jpg`, jpeg95Sub);
writeFileSync(`${OUT}/jpeg100.jpg`, jpeg100);
for (const [n, b] of [["q95 4:4:4", jpeg95], ["q95 4:2:0", jpeg95Sub], ["q100 4:4:4", jpeg100]])
  console.log(`${n}: ${(b.length / 1024 / 1024).toFixed(2)} MB`);

// ---------- 3) jsPDF: JPEG via addImage "FAST" e "NONE" ----------
async function jspdfPath(jpegBytes, compression) {
  // espelha pdf.ts: dataURL → addImage(dataUrl,"JPEG",0,0,210,297,undefined,comp)
  const dataUrl = `data:image/jpeg;base64,${jpegBytes.toString("base64")}`;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  pdf.addImage(dataUrl, "JPEG", 0, 0, 210, 297, undefined, compression);
  return Buffer.from(pdf.output("arraybuffer"));
}
const pdfFast = await jspdfPath(jpeg95, "FAST");
const pdfNone = await jspdfPath(jpeg95, "NONE");
const pdfFast100 = await jspdfPath(jpeg100, "FAST");
writeFileSync(`${OUT}/q95-fast.pdf`, pdfFast);
writeFileSync(`${OUT}/q95-none.pdf`, pdfNone);
writeFileSync(`${OUT}/q100-fast.pdf`, pdfFast100);
console.log(`PDF jsPDF q95/FAST: ${(pdfFast.length / 1024 / 1024).toFixed(2)} MB · q95/NONE: ${(pdfNone.length / 1024 / 1024).toFixed(2)} MB · q100/FAST: ${(pdfFast100.length / 1024 / 1024).toFixed(2)} MB`);

// ---------- 4) pdf-lib: PNG FlateDecode ----------
{
  const dataUrl = `data:image/png;base64,${pngOrig.toString("base64")}`;
  const pdf = await PDFDocument.create();
  const img = await pdf.embedPng(dataUrl);
  const page = pdf.addPage([595.28, 841.89]);
  page.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
  const bytes = await pdf.save();
  writeFileSync(`${OUT}/png-pdflib.pdf`, Buffer.from(bytes));
  console.log(`PDF pdf-lib PNG: ${(bytes.length / 1024 / 1024).toFixed(2)} MB`);
}

// ---------- 5) Extração das imagens embutidas (poppler pdfimages) ----------
execSync(`cd ${OUT} && pdfimages -list q95-fast.pdf && pdfimages -all q95-fast.pdf ex-fast && pdfimages -all q100-fast.pdf ex-100 && pdfimages -all png-pdflib.pdf ex-png`, { stdio: "inherit" });
console.log("extração ok");

// ---------- 6) PSNR contra o original ----------
function psnr(aBuf, bBuf, w, h) {
  const a = aBuf.length === w * h * 3 ? aBuf : null;
  if (!a) throw new Error("formato inesperado");
  let se = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - bBuf[i]; se += d * d; }
  const mse = se / a.length;
  return mse === 0 ? Infinity : 10 * Math.log10(255 * 255 / mse);
}
async function rawOf(file) {
  return sharp(file).removeAlpha().raw().toBuffer();
}
const origRaw = await rawOf(`${OUT}/original.png`);
async function report(name, file) {
  const meta = await sharp(file).metadata();
  const r = await rawOf(file);
  const p = psnr(origRaw, r, meta.width, meta.height);
  console.log(`PSNR ${name}: ${p === Infinity ? "∞ (idêntico)" : p.toFixed(2) + " dB"} · ${meta.width}×${meta.height}`);
}
const fast95img = execSync(`ls ${OUT}/ex-fast* | head -1`).toString().trim();
const fast100img = execSync(`ls ${OUT}/ex-100* | head -1`).toString().trim();
const pngEmb = execSync(`ls ${OUT}/ex-png* | head -1`).toString().trim();
await report("jpeg q95 (FAST)", fast95img);
await report("jpeg q100 (FAST)", fast100img);
await report("png (pdf-lib)", pngEmb);

// ---------- 7) pass-through byte-a-byte? ----------
const { createHash } = await import("node:crypto");
const md5 = (b) => createHash("md5").update(b).digest("hex");
console.log(`md5 entrada q95:      ${md5(jpeg95)}`);
console.log(`md5 embutido q95/FAST: ${md5(readFileSync(fast95img))}`);
console.log(`md5 embutido q95/NONE: ${md5(readFileSync(`${OUT}/q95-none.pdf`).length ? execSync(`cd ${OUT} && pdfimages -all q95-none.pdf -f 1 -l 1 ex-none && ls ex-none* | head -1`).toString().trim() : "")}`);
console.log(`idêntico FAST vs NONE (PDFs): ${md5(pdfFast) === md5(pdfNone)}`);
