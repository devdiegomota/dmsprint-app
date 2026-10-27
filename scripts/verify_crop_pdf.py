"""Valida o PDF do fluxo recorte+rotação: as 10 peças devem conter APENAS o
cartão recortado (cabeçalho laranja no lado direito, banda escura, resto branco)
— nenhum pixel do ambiente teal pode sobrar.
"""
import pypdfium2 as pdfium

PDF = "/home/z/Downloads/impressa4-cartao-visita (1).pdf"
doc = pdfium.PdfDocument(PDF)
page = doc[0]
w_pt, h_pt = page.get_size()
print(f"Pagina: {w_pt*25.4/72:.2f} x {h_pt*25.4/72:.2f} mm")

img = page.render(scale=300 / 72).to_pil().convert("RGB")
W, H = img.size
print(f"Render: {W} x {H} px")

cw, ch = 1122, 661
colX = [118, 1240]
rowY = [102, 763, 1424, 2085, 2746]

def px(x, y):
    return img.getpixel((x, y))

def near(v, target, tol=30):
    return all(abs(a - b) <= tol for a, b in zip(v, target))

ORANGE = (180, 83, 9)    # #b45309
DARK = (120, 53, 15)     # #78350f
TEAL = (15, 118, 110)    # #0f766e (ambiente — não deve existir)
TEAL2 = (17, 94, 89)     # #115e59 (linhas do ambiente)

fails = []
teal_count = 0

# Varredura teal: grelha esparsa pela folha inteira
for y in range(20, H - 20, 40):
    for x in range(20, W - 20, 40):
        v = px(x, y)
        if near(v, TEAL, 25) or near(v, TEAL2, 25):
            teal_count += 1

for r, y0 in enumerate(rowY):
    for c, x0 in enumerate(colX):
        # cabeçalho laranja do cartão girado: x_local ∈ [942, 1122)
        if not near(px(x0 + 1000, y0 + 330), ORANGE):
            fails.append(f"peça ({c},{r}): laranja ausente @({x0+1000},{y0+330}) = {px(x0+1000, y0+330)}")
        # banda escura: x_local ∈ [924, 942)
        if not near(px(x0 + 930, y0 + 330), DARK):
            fails.append(f"peça ({c},{r}): banda escura ausente @({x0+930},{y0+330}) = {px(x0+930, y0+330)}")
        # branco no corpo
        v = px(x0 + 300, y0 + 330)
        if not (v[0] > 245 and v[1] > 245 and v[2] > 245):
            fails.append(f"peça ({c},{r}): corpo não branco @({x0+300},{y0+330}) = {v}")

print(f"Varredura teal: {teal_count} pixels de ambiente encontrados")
if fails:
    print(f"FALHAS ({len(fails)}):")
    for f in fails[:10]:
        print(" -", f)
elif teal_count == 0:
    print("\nTUDO OK: A4 exato, 10 peças = cartão girado+recortado (laranja à direita), zero ambiente")
else:
    print("\nFALHOU: ambiente presente no PDF")
