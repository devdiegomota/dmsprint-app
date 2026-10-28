/**
 * Teste unitário do núcleo puro do detector de bordas (detectBoundsFromPixels).
 * Roda fora do navegador: compila com tsc e executa com node.
 *   npx tsc scripts/test_detect_bounds.ts --outDir scripts/.tmp --module commonjs \
 *     --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck
 *   node scripts/.tmp/scripts/test_detect_bounds.js
 */
import { detectBoundsFromPixels } from "../src/lib/print/crop";

let failures = 0;

function mk(
  w: number,
  h: number,
  paint: (x: number, y: number) => [number, number, number, number],
): { data: Uint8ClampedArray; w: number; h: number } {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = paint(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { data, w, h };
}

function approx(r: { x: number; y: number; w: number; h: number } | null,
  x: number, y: number, w: number, h: number, tol = 2): boolean {
  return !!r && Math.abs(r.x - x) <= tol && Math.abs(r.y - y) <= tol &&
    Math.abs(r.w - w) <= tol && Math.abs(r.h - h) <= tol;
}

function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failures++;
}

const WHITE: [number, number, number, number] = [255, 255, 255, 255];
const BLACK: [number, number, number, number] = [20, 20, 20, 255];

// 1. Peça escura centralizada em fundo branco → bounding box exato (±2 px)
{
  const img = mk(400, 300, (x, y) =>
    x >= 80 && x < 280 && y >= 60 && y < 210 ? BLACK : WHITE,
  );
  const r = detectBoundsFromPixels(img.data, img.w, img.h);
  check("peça central em fundo branco", approx(r, 80, 60, 200, 150), JSON.stringify(r));
}

// 2. Fundo totalmente branco → null (nada a recortar)
{
  const img = mk(200, 200, () => WHITE);
  const r = detectBoundsFromPixels(img.data, img.w, img.h);
  check("fundo vazio → null", r === null, JSON.stringify(r));
}

// 3. Imagem inteira preta → null (peça já ocupa tudo)
{
  const img = mk(200, 200, () => BLACK);
  const r = detectBoundsFromPixels(img.data, img.w, img.h);
  check("imagem 100% conteúdo → null", r === null, JSON.stringify(r));
}

// 4. Poeira isolada (pixels soltos) → null (supressão de ruído)
{
  const img = mk(400, 300, () => WHITE);
  const specks: Array<[number, number]> = [[50, 40], [300, 250], [200, 20], [10, 280]];
  for (const [sx, sy] of specks) {
    const i = (sy * img.w + sx) * 4;
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const j = ((sy + dy) * img.w + (sx + dx)) * 4;
        img.data[j] = 20;
        img.data[j + 1] = 20;
        img.data[j + 2] = 20;
        img.data[j + 3] = 255;
      }
  }
  const r = detectBoundsFromPixels(img.data, img.w, img.h);
  check("poeira isolada → null", r === null, JSON.stringify(r));
}

// 5. Poeira + peça real → detecta a peça, ignora a poeira
{
  const img = mk(400, 300, (x, y) =>
    x >= 100 && x < 340 && y >= 80 && y < 260 ? [30, 60, 120, 255] : WHITE,
  );
  const i = (15 * img.w + 30) * 4; // sujeira no canto
  img.data[i] = 0; img.data[i + 1] = 0; img.data[i + 2] = 0; img.data[i + 3] = 255;
  const r = detectBoundsFromPixels(img.data, img.w, img.h);
  check("poeira + peça → peça exata", approx(r, 100, 80, 240, 180), JSON.stringify(r));
}

// 6. Fundo cinza-claro uniforme com peça colorida → detecta
{
  const img = mk(300, 300, (x, y) =>
    x >= 60 && x < 240 && y >= 90 && y < 270 ? [180, 40, 40, 255] : [238, 238, 238, 255],
  );
  const r = detectBoundsFromPixels(img.data, img.w, img.h);
  check("fundo cinza uniforme + peça vermelha", approx(r, 60, 90, 180, 180), JSON.stringify(r));
}

// 7. Fundo NÃO uniforme (cantos diferentes) → null (sem confiança)
{
  const img = mk(300, 300, (x, y) => {
    const left = x < 150;
    const top = y < 150;
    const shade = (left ? 255 : 190) + (top ? 0 : 40);
    return [shade, shade, shade, 255];
  });
  const r = detectBoundsFromPixels(img.data, img.w, img.h);
  check("fundo não uniforme → null", r === null, JSON.stringify(r));
}

// 8. Peça tocando as bordas (imagem já recortada) → null (nada a recortar)
{
  const img = mk(300, 300, () => [40, 90, 160, 255]);
  const r = detectBoundsFromPixels(img.data, img.w, img.h);
  check("peça sem folga → null", r === null, JSON.stringify(r));
}

// 9. Peça encostada em DUAS bordas mas com folga nas outras → detecta o retângulo
{
  const img = mk(300, 300, (x, y) => (x >= 150 && y >= 120 ? [50, 50, 50, 255] : WHITE));
  const r = detectBoundsFromPixels(img.data, img.w, img.h);
  check("peça em canto (folga N e W)", approx(r, 150, 120, 150, 180), JSON.stringify(r));
}

console.log(failures === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${failures} TESTE(S) FALHARAM`);
process.exit(failures === 0 ? 0 : 1);
