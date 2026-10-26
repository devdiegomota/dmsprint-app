"""Arte de teste QUADRADA (800x800) — proporção errada de propósito para validar enquadramento."""
from PIL import Image, ImageDraw, ImageFont

S = 800
img = Image.new("RGB", (S, S), "#eef2ff")
d = ImageDraw.Draw(img)

try:
    f_big = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 56)
    f_mid = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 30)
except OSError:
    f_big = f_mid = ImageFont.load_default()

d.rectangle([0, 0, S, 110], fill="#4338ca")
d.text((30, 28), "ARTE QUADRADA 800x800", font=f_big, fill="#ffffff")
d.text((30, 180), "Logotipo central visivel", font=f_big, fill="#1e1b4b")
d.text((30, 260), "Se esticar: circulos viram ovos", font=f_mid, fill="#4338ca")
d.text((30, 310), "Se conter: barras brancas", font=f_mid, fill="#4338ca")
d.text((30, 360), "Se preencher: recorta lados", font=f_mid, fill="#4338ca")
# Circulos de referencia — devem permanecer circulos (prova anti-distorcao)
d.ellipse([560, 180, 760, 380], outline="#4338ca", width=8)
d.ellipse([80, 470, 240, 630], outline="#4338ca", width=8)
d.line([0, 0, S, S], fill="#a5b4fc", width=4)

img.save("/home/z/my-project/scripts/test-square.png", dpi=(300, 300))
print("OK:", img.size)
