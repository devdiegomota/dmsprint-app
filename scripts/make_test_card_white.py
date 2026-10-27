"""Arte de teste: cartão 9,5 × 5,6 cm com FUNDO BRANCO e poucos dados.

Simula o caso real do usuário: cartão claro que some contra a folha na hora
da guilhotina. Todo o conteúdo fica no miolo (margens ≥ 80 px brancas em
todos os lados) para permitir sondas de pixel limpas nas bordas.
"""
from PIL import Image, ImageDraw, ImageFont

W, H = 1122, 661  # 95mm x 56mm @ 300dpi
img = Image.new("RGB", (W, H), "#ffffff")
d = ImageDraw.Draw(img)

try:
    f_big = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 56)
    f_mid = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 32)
    f_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 26)
except OSError:
    f_big = f_mid = f_small = ImageFont.load_default()

# Conteúdo centralizado no miolo — cantos e bordas 100% brancos
d.text((330, 200), "ANA SOUZA", font=f_big, fill="#3f3f46")
d.text((400, 300), "Consultora de Vendas", font=f_mid, fill="#52525b")
d.text((370, 370), "tel: (11) 98888-7777", font=f_mid, fill="#52525b")
d.text((410, 440), "ana@email.com.br", font=f_small, fill="#71717a")

img.save("/home/z/my-project/upload/test-card-branco.png", dpi=(300, 300))
print("OK:", img.size)
