#!/usr/bin/env python3
"""Gera artes de teste 'problemáticas' para validar o pipeline do ImpressA4:
baixa resolução + leve desfoque + textos finos (cenário típico de cliente)."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

DEJAVU_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
DEJAVU = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

def make_art(w, h, title, subtitle, out):
    img = Image.new("RGB", (w, h), "#ffffff")
    d = ImageDraw.Draw(img)
    # Cabeçalho colorido
    d.rectangle([0, 0, w, int(h * 0.18)], fill="#e05d00")
    # Faixa lateral
    d.rectangle([0, int(h * 0.18), int(w * 0.06), h], fill="#1c1c1c")
    # Título (meio grosso)
    f_title = ImageFont.truetype(DEJAVU_BOLD, int(h * 0.11))
    d.text((int(w * 0.12), int(h * 0.24)), title, font=f_title, fill="#1c1c1c")
    # Subtítulo
    f_sub = ImageFont.truetype(DEJAVU, int(h * 0.065))
    d.text((int(w * 0.12), int(h * 0.42)), subtitle, font=f_sub, fill="#e05d00")
    # TEXTO MUITO FINO E PEQUENO (o alvo do reforço)
    f_tiny = ImageFont.truetype(DEJAVU, max(9, int(h * 0.028)))
    d.text((int(w * 0.12), int(h * 0.58)),
           "Rua das Flores, 123 - Centro  (11) 99999-9999", font=f_tiny, fill="#333333")
    d.text((int(w * 0.12), int(h * 0.66)),
           "atendimento@graficarapida.com.br - @grafica", font=f_tiny, fill="#333333")
    # Preço promocional
    f_price = ImageFont.truetype(DEJAVU_BOLD, int(h * 0.13))
    d.text((int(w * 0.12), int(h * 0.74)), "R$ 19,90", font=f_price, fill="#0a7a3d")
    # Bloco decorativo
    d.rectangle([int(w * 0.7), int(h * 0.55), int(w * 0.94), int(h * 0.92)], fill="#f3f4f6", outline="#d1d5db")

    # Degrada a arte: leve desfoque (simula arte "sem qualidade")
    img = img.filter(ImageFilter.GaussianBlur(radius=1.1))
    img.save(out, "PNG")
    print(f"ok: {out} ({w}x{h})")

# Cartão de visita: alvo 1063x638 px -> enviamos bem menor (baixa resolução)
make_art(700, 420, "PADARIA DO BAIRRO", "Pão quente a toda hora!", "/home/z/my-project/upload/test-card.png")
# Panfleto: alvo 1181x1701 px -> enviamos bem menor
make_art(760, 1080, "SUPER OFERTA", "Só neste fim de semana", "/home/z/my-project/upload/test-flyer.png")
