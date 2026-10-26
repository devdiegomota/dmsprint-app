#!/usr/bin/env python3
"""Mede as margens reais da folha two-cut a partir do PDF exportado.

Renderiza a página a 300 DPI e localiza as 4 artes pelos elementos de marca da
arte de teste (cabeçalho laranja + faixa lateral escura) → margens externas,
faixas brancas centrais e linhas de corte em mm."""
import subprocess, sys, os
from PIL import Image

pdf = sys.argv[1] if len(sys.argv) > 1 else "/home/z/Downloads/impressa4-panfleto.pdf"
base = "/home/z/my-project/scripts/two-cut-render"
for f in os.listdir("/home/z/my-project/scripts"):
    if f.startswith("two-cut-render"):
        os.remove(os.path.join("/home/z/my-project/scripts", f))

subprocess.run(["pdftoppm", "-png", "-r", "300", pdf, base], check=True)
img = Image.open(base + "-1.png").convert("RGB")
W, H = img.size
px = img.load()
MM = 300 / 25.4
print(f"render: {W}x{H} @300dpi ({W/MM*25.4:.1f} x {H/MM*25.4:.1f} mm)")


def is_mark(p):
    r, g, b = p
    dark = r < 110 and g < 110 and b < 110
    orange = r > 170 and 40 < g < 170 and b < 100
    return dark or orange


# Uma coluna tem marca se algum pixel (amostrado) é laranja/escuro; idem linhas.
col_mark = [any(is_mark(px[x, y]) for y in range(0, H, 4)) for x in range(W)]
row_mark = [any(is_mark(px[x, y]) for x in range(0, W, 4)) for y in range(H)]


def runs(flags):
    out = []
    for i, v in enumerate(flags):
        if v:
            if out and i == out[-1][1] + 1:
                out[-1][1] = i
            else:
                out.append([i, i])
    return out


def mm(p):
    return p / MM


cruns, rruns = runs(col_mark), runs(row_mark)
print(f"Colunas com arte: {cruns}")
print(f"Linhas com arte:  {rruns}")
assert len(cruns) == 2 and len(rruns) == 2, "esperava exatamente 2 colunas e 2 linhas de arte"
(x0a, x1a), (x0b, x1b) = cruns
(y0a, y1a), (y0b, y1b) = rruns

print()
print(f"Margem esquerda : {mm(x0a):6.2f} mm   (esperado ~1,5)")
print(f"Faixa vertical  : {mm(x0b - x1a - 1):6.2f} mm   (esperado ~6,9) -> branco por peca ~{mm(x0b - x1a - 1) / 2:.2f}")
print(f"Margem direita  : {mm(W - 1 - x1b):6.2f} mm   (esperado ~1,5)")
print(f"Corte vertical no meio da faixa: {mm((x1a + x0b) / 2):.2f} mm da lateral (esperado ~105)")
print()
print(f"Margem topo     : {mm(y0a):6.2f} mm   (esperado ~1,0)")
print(f"Faixa horizontal: {mm(y0b - y1a - 1):6.2f} mm   (esperado ~5,9) -> branco por peca ~{mm(y0b - y1a - 1) / 2:.2f}")
print(f"Margem base     : {mm(H - 1 - y1b):6.2f} mm   (esperado ~2,0)")
print(f"Corte horizontal no meio da faixa: {mm((y1a + y0b) / 2):.2f} mm do topo (esperado ~148)")
print()
print(f"Tamanho da peca : {mm(x1a - x0a + 1):.1f} x {mm(y1a - y0a + 1):.1f} mm (alvo 100 x 144)")
