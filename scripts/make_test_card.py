"""Gera arte de teste para cartão de visita 9,5 × 5,6 cm @ 300 DPI (1122 × 661 px)."""
from PIL import Image, ImageDraw, ImageFont

W, H = 1122, 661  # 95mm x 56mm @ 300dpi
img = Image.new("RGB", (W, H), "#fdfdfb")
d = ImageDraw.Draw(img)

# Faixa superior colorida
d.rectangle([0, 0, W, 120], fill="#b45309")
d.rectangle([0, 120, W, 132], fill="#78350f")

# Texto do cartão
try:
    f_big = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 64)
    f_mid = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 34)
    f_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 26)
except OSError:
    f_big = f_mid = f_small = ImageFont.load_default()

d.text((60, 28), "GRAFICA IMPRESSA4", font=f_big, fill="#ffffff")
d.text((60, 190), "Maria Silva", font=f_big, fill="#1c1917")
d.text((60, 280), "Designer Grafica", font=f_mid, fill="#44403c")
d.text((60, 360), "tel: (11) 99999-0000", font=f_mid, fill="#44403c")
d.text((60, 420), "maria@impressa4.com.br", font=f_mid, fill="#44403c")
d.text((60, 500), "Rua das Artes, 100 - Sao Paulo/SP", font=f_small, fill="#78716c")
d.text((60, 545), "www.impressa4.com.br", font=f_small, fill="#78716c")

# Marca de canto para verificacao de escala (quadrado 10mm = 118px)
d.rectangle([W - 128, H - 128, W - 10, H - 10], outline="#b45309", width=6)

img.save("/home/z/my-project/scripts/test-card.png", dpi=(300, 300))
print("OK:", img.size)
