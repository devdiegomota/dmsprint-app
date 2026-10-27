"""Arte de teste: cartão EM PÉ (retrato) dentro de um ambiente (fundo teal).

Simula o caso real do usuário: cliente manda a arte do cartão na vertical
dentro de um ambiente/fundo. Fluxo esperado no app: girar 90° no recorte →
cartão fica deitado → recortar exatamente na borda do cartão.

Geometria: imagem 1200 × 1400; cartão 661 × 1122 colado em (270, 139).
Após girar 90° cw (imagem vira 1400 × 1200), o cartão ocupa (139, 270, 1122, 661).
"""
from PIL import Image, ImageDraw, ImageFont

ENV_W, ENV_H = 1200, 1400
CARD_W, CARD_H = 661, 1122
CARD_X, CARD_Y = 270, 139

# Ambiente teal com leve variação (parecido com foto de ambiente)
env = Image.new("RGB", (ENV_W, ENV_H), "#0f766e")
d = ImageDraw.Draw(env)
for i in range(0, ENV_W, 60):
    d.line([(i, 0), (i, ENV_H)], fill="#115e59", width=2)
for j in range(0, ENV_H, 60):
    d.line([(0, j), (ENV_W, j)], fill="#115e59", width=2)

# Cartão em pé: fundo branco, cabeçalho laranja no TOPO (o conteúdo está "em pé")
card = Image.new("RGB", (CARD_W, CARD_H), "#ffffff")
cd = ImageDraw.Draw(card)
cd.rectangle([0, 0, CARD_W, 180], fill="#b45309")
cd.rectangle([0, 180, CARD_W, 198], fill="#78350f")
try:
    f_big = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 64)
    f_mid = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 36)
except OSError:
    f_big = f_mid = ImageFont.load_default()
cd.text((60, 300), "MARIA SILVA", font=f_big, fill="#1c1917")
cd.text((60, 430), "Designer Grafica", font=f_mid, fill="#44403c")
cd.text((60, 520), "tel: (11) 99999-0000", font=f_mid, fill="#44403c")
cd.text((60, 610), "maria@impressa4.com.br", font=f_mid, fill="#44403c")

env.paste(card, (CARD_X, CARD_Y))
env.save("/home/z/my-project/upload/test-card-ambiente-pe.png", dpi=(300, 300))
print("OK:", env.size, "| card em", (CARD_X, CARD_Y, CARD_X + CARD_W, CARD_Y + CARD_H))
