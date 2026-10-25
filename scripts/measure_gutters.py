#!/usr/bin/env python3
"""Mede as bordas brancas reais no PDF imponento do panfleto.
Renderiza a página e localiza colunas/linhas 100% brancas (gutters)."""
import subprocess, sys
from PIL import Image

subprocess.run(["pdftoppm", "-png", "-r", "150", "flyer-check.pdf", "flyer-render"], check=True)
img = Image.open("flyer-render-1.png").convert("RGB")
W, H = img.size
px = img.load()
print(f"render: {W}x{H} @150dpi ({W/150*25.4:.1f} x {H/150*25.4:.1f} mm)")

def col_all_white(x, y0, y1):
    return all(px[x, y] >= (248, 248, 248) for y in range(y0, y1, 2))

def row_all_white(y, x0, x1):
    return all(px[x, y] >= (248, 248, 248) for x in range(x0, x1, 2))

MM = 150 / 25.4  # px por mm

# Colunas brancas (varre y entre 25% e 75% da página)
y0, y1 = int(H * 0.25), int(H * 0.75)
white_cols = [x for x in range(W) if col_all_white(x, y0, y1)]
# Agrupa em runs
runs = []
for x in white_cols:
    if runs and x == runs[-1][1] + 1:
        runs[-1][1] = x
    else:
        runs.append([x, x])
print("\nFolgas verticais (colunas brancas contínuas):")
for a, b in runs:
    mm = (b - a + 1) / MM
    if mm >= 1.5:
        print(f"  x={a}..{b}  largura={mm:.2f} mm")

# Linhas brancas (varre x entre 25% e 75%)
x0, x1 = int(W * 0.25), int(W * 0.75)
white_rows = [y for y in range(H) if row_all_white(y, x0, x1)]
runs = []
for y in white_rows:
    if runs and y == runs[-1][1] + 1:
        runs[-1][1] = y
    else:
        runs.append([y, y])
print("\nFolgas horizontais (linhas brancas contínuas):")
for a, b in runs:
    mm = (b - a + 1) / MM
    if mm >= 1.5:
        print(f"  y={a}..{b}  altura={mm:.2f} mm")

print("\nEsperado: gutters laterais ≈ 3.3 mm (3 folgas), verticais ≈ 3.0 mm (3 folgas)")
