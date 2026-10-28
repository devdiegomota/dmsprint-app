#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Valida o PDF exportado pelo app com o panfleto 98x142 mm (teste C validado):
 - 1 página A4 exata;
 - bounding box da arte = margens 3,5 mm (lat.) / ~3,0 mm (topo/base);
 - grade 2x2 com peças de 98x142 mm e faixa branca central de 7 mm.
"""
import base64
from pypdfium2 import PdfDocument

PDF = "/home/z/my-project/scripts/exported.pdf"
PXM = 300 / 25.4  # px por mm @ 300 DPI

fails = []


def check(name, cond, detail=""):
    print(("[OK]  " if cond else "[FAIL]") + " " + name + (" " + detail if detail else ""))
    if not cond:
        fails.append(name)


pdf = PdfDocument(PDF)
check("1 página", len(pdf) == 1, "=%d" % len(pdf))
w, h = pdf[0].get_size()
check("A4 exato", abs(w / 72 * 25.4 - 210) < 0.05 and abs(h / 72 * 25.4 - 297) < 0.05,
      "%.2f x %.2f mm" % (w / 72 * 25.4, h / 72 * 25.4))

pil = pdf[0].render(scale=300 / 72).to_pil().convert("RGB")
W, H = pil.size
check("raster 300 DPI", abs(W - 2480) <= 2 and abs(H - 3508) <= 2, "%dx%d" % (W, H))
px = pil.load()


def is_white(r, g, b):
    return r >= 246 and g >= 246 and b >= 246  # tolera artefato de compressão JPEG (±6)


def is_content(r, g, b):
    return r < 240 or g < 240 or b < 240  # borda escura da arte: imune a ruído JPEG


# bounding box da arte (threshold imune a ruído JPEG)
minX, maxX, minY, maxY = W, -1, H, -1
for y in range(0, H, 2):
    for x in range(0, W, 2):
        r, g, b = px[x, y]
        if is_content(r, g, b):
            if x < minX: minX = x
            if x > maxX: maxX = x
            if y < minY: minY = y
            if y > maxY: maxY = y

mm = lambda p: p / 300 * 25.4
m_esq, m_dir = mm(minX), mm(W - 1 - maxX)
m_topo, m_base = mm(minY), mm(H - 1 - maxY)
larg, alt = mm(maxX - minX), mm(maxY - minY)
check("margem esquerda ≈3,5 mm", 3.2 <= m_esq <= 3.9, "%.2f mm" % m_esq)
check("margem direita ≈3,5 mm", 3.2 <= m_dir <= 3.9, "%.2f mm" % m_dir)
check("margem topo ≈3,0 mm", 2.8 <= m_topo <= 3.4, "%.2f mm" % m_topo)
check("margem base ≈3,0 mm (guarda)", 2.7 <= m_base <= 3.3, "%.2f mm" % m_base)
check("grade largura ≈203 mm (2×98+7)", 202.3 <= larg <= 203.7, "%.2f mm" % larg)
check("grade altura ≈291 mm (2×142+7)", 290.3 <= alt <= 291.7, "%.2f mm" % alt)

# peça individual 98 x 142 mm: canto superior esquerdo deve ter arte até ~101,5 mm
# (3,5 + 98) na horizontal e ~105,1 mm (3,1 + 142) na vertical
# peça individual: largura = (grade - faixa central 7 mm) / 2 = 98 mm
check("peça: largura 98 mm", 97.4 <= (larg - 7) / 2 <= 98.6, "%.2f mm" % ((larg - 7) / 2))
check("peça: altura 142 mm", 141.4 <= (alt - 7) / 2 <= 142.6, "%.2f mm" % ((alt - 7) / 2))
# faixa branca central vertical: x em [105-3,5, 105+3,5] mm, em y = topo + 71 mm (meio da linha superior)
y_meio_linha = int((m_topo + 142 / 2) * PXM)
faixa_x = [int((105 - 3.0) * PXM), int((105 + 3.0) * PXM)]
ok_faixa = all(is_white(*px[x, y_meio_linha]) for x in range(faixa_x[0] + 4, faixa_x[1] - 4, 8))
check("faixa branca central vertical", ok_faixa, "centro x=105 mm, linha superior")

# faixa branca central horizontal: y em [148,5-3,5, 148,5+3,5] mm, x = 30 mm (dentro da coluna esq.)
x_col = int(30 * PXM)
faixa_y = [int((148.5 - 3.0) * PXM), int((148.5 + 3.0) * PXM)]
ok_faixay = all(is_white(*px[x_col, y]) for y in range(faixa_y[0] + 4, faixa_y[1] - 4, 8))
check("faixa branca central horizontal", ok_faixay, "centro y=148,5 mm")

# 4 peças com arte: amostra 8 mm abaixo do TOPO de cada célula (cai na barra azul do design)
M_LAT, M_VERT = 3.5, 3.0
PW, PHH = 98.0, 142.0
cell_origins = [(M_LAT, M_VERT), (210 - M_LAT - PW, M_VERT),
                (M_LAT, 297 - M_VERT - PHH), (210 - M_LAT - PW, 297 - M_VERT - PHH)]
ok_pecas = all(not is_white(*px[int((cx + 20) * PXM), int((cy + 8) * PXM)]) for cx, cy in cell_origins)
check("4 peças com arte presente", ok_pecas)

print()
if fails:
    print("FALHAS: %d -> %s" % (len(fails), fails))
    raise SystemExit(1)
print("TUDO OK - PDF do app com panfleto 98x142 mm e margens do teste C validadas")
