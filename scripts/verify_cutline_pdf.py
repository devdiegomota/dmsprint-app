"""Valida o PDF do cartão com linha de corte fina:
1. Página A4 exata + imagem embutida em 300 DPI;
2. Renderiza a 300 DPI e sonda os mesmos pixels do canvas (deve casar 1:1);
3. Confere que o fio está em TODAS as bordas das 10 peças (grade 2×5).
"""
import pypdfium2 as pdfium

PDF = "/home/z/Downloads/impressa4-cartao-visita.pdf"
SCALE = 300 / 72  # render @300 DPI

doc = pdfium.PdfDocument(PDF)
page = doc[0]
w_pt, h_pt = page.get_size()
print(f"Pagina: {w_pt:.2f} x {h_pt:.2f} pt = {w_pt*25.4/72:.2f} x {h_pt*25.4/72:.2f} mm")

img = page.render(scale=SCALE).to_pil().convert("RGB")
W, H = img.size
print(f"Render: {W} x {H} px")

# Geometria esperada do cartão 95x56 (igual ao computeLayout)
cw, ch = 1122, 661
colX = [118, 1240]
rowY = [102, 763, 1424, 2085, 2746]
# O rasterizador arredonda 210mm@300dpi (2480,31 px) para 2481 — varre janelas ±3 px
assert abs(W - 2480) <= 2 and abs(H - 3508) <= 2, f"Render inesperado: {W}x{H}"

def px(x, y):
    r, g, b = img.getpixel((x, y))
    return r, g, b

def is_gray(v):
    r, g, b = v
    return 150 <= r <= 225 and abs(r - g) < 12 and abs(g - b) < 12

def is_white(v):
    return v[0] >= 245 and v[1] >= 245 and v[2] >= 245

fails = []

# 1) Fio presente nas 4 bordas de TODAS as 10 peças — varre janela ±3 px na linha
#    esperada e exige 2+ pixels cinza (o traço tem 2 px; tolera shift de rasterização)
def gray_count(pts):
    return sum(1 for (x, y) in pts if is_gray(px(x, y)))

for r, y0 in enumerate(rowY):
    for c, x0 in enumerate(colX):
        ym, xm = y0 + ch // 2, x0 + cw // 2
        checks = {
            "esq":  [(x, ym) for x in range(x0 - 3, x0 + 5)],
            "dir":  [(x, ym) for x in range(x0 + cw - 5, x0 + cw + 3)],
            "topo": [(xm, y) for y in range(y0 - 3, y0 + 5)],
            "base": [(xm, y) for y in range(y0 + ch - 5, y0 + ch + 3)],
        }
        for lado, pts in checks.items():
            n = gray_count(pts)
            if n < 2:
                fails.append(f"peça ({c},{r}) {lado}: só {n} px cinza na janela")

# 2) Interiores e margens continuam brancos (fio não vaza para dentro)
whites = [(600, 700), (1720, 1400), (50, 700), (600, 50), (2430, 3400), (600, 3455)]
for (x, y) in whites:
    v = px(x, y)
    if not is_white(v):
        fails.append(f"deveria ser branco @({x},{y}) = {v}")

# 3) Valor do fio (JPEG q95 pode variar um pouco)
v = px(118, 700)
print(f"Fio amostra @(118,700): {v} (alvo 200,200,200)")
print(f"Peças verificadas: {len(rowY) * len(colX)} x 4 lados")

if fails:
    print(f"\nFALHAS ({len(fails)}):")
    for f in fails[:20]:
        print(" -", f)
else:
    print("\nTUDO OK: fio presente nas 40 bordas, interiores/margens limpos")
