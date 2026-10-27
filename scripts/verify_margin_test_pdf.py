#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Verifica a geometria do PDF de teste de margem da impressora (300 DPI):
 - 12 páginas A4 exatas;
 - página 1: réguas presentes a 1 mm e 20 mm das 4 bordas + texto central;
 - páginas de teste (A, C, K): molduras das peças nas posições exatas,
   margem externa branca, faixa central branca e preenchimento da arte.
"""
from pypdfium2 import PdfDocument

PDF = "/home/z/my-project/download/teste-margem-impressora-panfleto.pdf"
SCALE = 300 / 72
PXM = 300 / 25.4  # px por mm ≈ 11.811

fails = []


def check(name, cond, detail=""):
    print(("[OK]  " if cond else "[FAIL]") + " " + name + (" " + detail if detail else ""))
    if not cond:
        fails.append(name)


def render(pdf, idx):
    bmp = pdf[idx].render(scale=SCALE)
    return bmp.to_pil().convert("L"), bmp.to_pil().convert("RGB")


def dark_in_row(px, y, x0, x1, thr=160, need=2):
    cnt = sum(1 for x in range(x0, x1) if px[x, y] < thr)
    return cnt >= need


def dark_in_col(px, x, y0, y1, thr=160, need=2):
    cnt = sum(1 for y in range(y0, y1) if px[x, y] < thr)
    return cnt >= need


def scan_row_band(gray, y0, y1, x0, x1, thr=160, need=2):
    px = gray.load()
    return any(dark_in_row(px, y, x0, x1, thr, need) for y in range(y0, y1))


def scan_col_band(gray, x0, x1, y0, y1, thr=160, need=2):
    px = gray.load()
    return any(dark_in_col(px, x, y0, y1, thr, need) for x in range(x0, x1))


def near_white(rgb, x, y, tol=12):
    r, g, b = rgb.getpixel((x, y))
    return r >= 255 - tol and g >= 255 - tol and b >= 255 - tol


pdf = PdfDocument(PDF)
check("12 páginas", len(pdf) == 12, "=%d" % len(pdf))

# ---------- páginas A4 exatas ----------
ok = True
for i in range(len(pdf)):
    w, h = pdf[i].get_size()
    if abs(w / 72 * 25.4 - 210) > 0.1 or abs(h / 72 * 25.4 - 297) > 0.1:
        ok = False
check("todas as páginas com 210x297 mm", ok)

# ---------- página 1: calibração ----------
gray, rgb = render(pdf, 0)
W, H = gray.size  # ~2480 x 3508
cx0, cx1 = int(100 * PXM), int(112 * PXM)
# linhas das réguas a 1 mm e a 20 mm de cada borda
check("régua topo: linha a 1 mm", scan_row_band(gray, int(0.6 * PXM), int(1.6 * PXM), cx0, cx1))
check("régua topo: linha a 20 mm", scan_row_band(gray, int(19.5 * PXM), int(20.5 * PXM), cx0, cx1))
check("régua base: linha a 1 mm", scan_row_band(gray, H - int(1.6 * PXM), H - int(0.6 * PXM), cx0, cx1))
check("régua base: linha a 20 mm", scan_row_band(gray, H - int(20.5 * PXM), H - int(19.5 * PXM), cx0, cx1))
cy0, cy1 = int(170 * PXM), int(180 * PXM)
check("régua esquerda: linha a 1 mm", scan_col_band(gray, int(0.6 * PXM), int(1.6 * PXM), cy0, cy1))
check("régua esquerda: linha a 20 mm", scan_col_band(gray, int(19.5 * PXM), int(20.5 * PXM), cy0, cy1))
check("régua direita: linha a 1 mm", scan_col_band(gray, W - int(1.6 * PXM), W - int(0.6 * PXM), cy0, cy1))
check("régua direita: linha a 20 mm", scan_col_band(gray, W - int(20.5 * PXM), W - int(19.5 * PXM), cy0, cy1))
# bloco central de instruções (texto escuro presente)
gpx = gray.load()
dark = sum(1 for y in range(int(140 * PXM), int(160 * PXM), 4) for x in range(int(60 * PXM), int(150 * PXM), 4) if gpx[x, y] < 120)
check("bloco de instruções presente", dark > 30, "px_escuros=%d" % dark)


# ---------- páginas de teste: geometria das peças ----------
def check_test_page(idx, letter, sw, sh):
    m_lat = (210 - 2 * sw - 7) / 2
    m_vert = (297 - 2 * sh - 7) / 2
    gray, rgb = render(pdf, idx)
    W, H = gray.size
    y_mid_top = int((m_vert + sh / 2) * PXM)          # meio da coluna esquerda (linha do topo)
    x_mid_left = int((m_lat + sw / 2) * PXM)          # meio da linha superior

    # molduras externas (linha de corte do teste) nas 4 bordas (origem y = TOPO)
    lx, rx = m_lat * PXM, (210 - m_lat) * PXM
    ty, by = m_vert * PXM, (297 - m_vert) * PXM
    win = 4
    check("%s: moldura esquerda em %.1f mm" % (letter, m_lat), scan_col_band(gray, int(lx) - win, int(lx) + win, y_mid_top - 60, y_mid_top + 60))
    check("%s: moldura direita em %.1f mm" % (letter, 210 - m_lat), scan_col_band(gray, int(rx) - win, int(rx) + win, y_mid_top - 60, y_mid_top + 60))
    check("%s: moldura topo em %.1f mm" % (letter, m_vert), scan_row_band(gray, int(ty) - win, int(ty) + win, x_mid_left - 60, x_mid_left + 60))
    check("%s: moldura base em %.1f mm" % (letter, m_vert), scan_row_band(gray, int(by) - win, int(by) + win, x_mid_left - 60, x_mid_left + 60))

    # margem externa branca (1 mm fora da moldura)
    check("%s: margem branca fora da moldura" % letter,
          near_white(rgb, max(2, int(lx) - int(1.0 * PXM)), y_mid_top) and near_white(rgb, min(W - 3, int(rx) + int(1.0 * PXM)), y_mid_top))

    # faixa central branca entre as peças (no meio da folha, longe do texto)
    check("%s: faixa central vertical branca" % letter, near_white(rgb, int(105 * PXM), y_mid_top))

    # preenchimento da arte presente dentro da peça (azul claro)
    sx, sy = int((m_lat + 10) * PXM), int((m_vert + 10) * PXM)
    r, g, b = rgb.getpixel((sx, sy))
    check("%s: preenchimento da arte presente" % letter, r < 246 and b > r, "rgb=(%d,%d,%d)" % (r, g, b))

    # etiqueta central (texto na faixa horizontal)
    gpx = gray.load()
    dark = sum(1 for y in range(int(147.5 * PXM), int(149.5 * PXM)) for x in range(int(80 * PXM), int(130 * PXM), 2) if gpx[x, y] < 120)
    check("%s: etiqueta central presente" % letter, dark > 40, "px_escuros=%d" % dark)


check_test_page(1, "A", 100, 144)   # margens 1,5 / 1,0 mm (layout atual)
check_test_page(3, "C", 98, 142)    # margens 3,5 / 3,0 mm
check_test_page(11, "K", 90, 134)   # margens 11,5 / 11,0 mm

print()
if fails:
    print("FALHAS: %d -> %s" % (len(fails), fails))
    raise SystemExit(1)
print("TUDO OK - geometria do PDF de teste validada")
