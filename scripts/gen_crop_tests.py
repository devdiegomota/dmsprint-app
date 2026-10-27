#!/usr/bin/env python3
"""Gera artes de teste para o recorte: peça sobre fundo de ambiente (mockup/foto).

- test-crop-cartao.jpg  — cartão de visita 95×56 (ratio 1.696) sobre mesa de madeira,
                          levemente descentralizado, com sombra suave.
- test-crop-panfleto.jpg — panfleto 98×141.5 (ratio 0.6926) sobre fundo degradê.
Retorna também os retângulos exatos (ground truth) para validar a detecção.
"""
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(42)

OUT = "/home/z/my-project/scripts"


def wood_background(w, h):
    """Fundo de mesa de madeira: tábuas horizontais + ruído + vinheta."""
    img = Image.new("RGB", (w, h), (146, 106, 66))
    d = ImageDraw.Draw(img)
    plank = h // 9
    for i in range(9):
        tone = random.randint(-18, 18)
        y0 = i * plank
        d.rectangle([0, y0, w, y0 + plank], fill=(146 + tone, 106 + tone, 66 + tone))
        # veios
        for _ in range(14):
            yv = y0 + random.randint(4, plank - 4)
            x0 = random.randint(0, w - 200)
            ln = random.randint(80, 320)
            d.line([x0, yv, x0 + ln, yv + random.randint(-3, 3)],
                   fill=(120 + tone, 86 + tone, 52 + tone), width=2)
        d.line([0, y0, w, y0], fill=(96, 68, 40), width=3)
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    # ruído
    px = img.load()
    for _ in range(w * h // 22):
        x, y = random.randint(0, w - 1), random.randint(0, h - 1)
        r, g, b = px[x, y]
        n = random.randint(-14, 14)
        px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
    # vinheta realista (até ~22% de escurecimento nos cantos)
    vign = Image.new("L", (w, h), 0)
    dv = ImageDraw.Draw(vign)
    dv.ellipse([-w // 3, -h // 3, w + w // 3, h + h // 3], fill=56)
    vign = vign.filter(ImageFilter.GaussianBlur(120))
    black = Image.new("RGB", (w, h), (20, 12, 6))
    img = Image.composite(black, img, vign)
    return img


def card_art(w, h):
    """Arte simples de cartão 95×56: faixa superior colorida + textos."""
    img = Image.new("RGB", (w, h), (250, 250, 248))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w, int(h * 0.30)], fill=(192, 84, 26))  # laranja
    d.rectangle([0, int(h * 0.30), w, int(h * 0.33)], fill=(40, 40, 44))
    # "logo"
    d.ellipse([int(w * 0.05), int(h * 0.07), int(w * 0.13), int(h * 0.23)], fill=(255, 255, 255))
    for label, dy, size, color in [
        ("PADARIA DO ZE", 0.42, 30, (30, 30, 34)),
        ("Pães e confeitos", 0.56, 20, (90, 90, 96)),
        ("(11) 99999-9999", 0.72, 24, (192, 84, 26)),
        ("Rua das Flores, 123", 0.85, 18, (60, 60, 66)),
    ]:
        d.text((int(w * 0.06), int(h * dy)), label, fill=color)
    return img


def flyer_art(w, h):
    """Arte simples de panfleto: cabeçalho, bloco de preço, rodapé."""
    img = Image.new("RGB", (w, h), (255, 252, 246))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w, int(h * 0.18)], fill=(23, 84, 68))
    d.text((int(w * 0.07), int(h * 0.05)), "PROMOCAO DA SEMANA", fill=(255, 255, 255))
    d.rectangle([int(w * 0.08), int(h * 0.28), int(w * 0.92), int(h * 0.52)], fill=(23, 84, 68))
    d.text((int(w * 0.14), int(h * 0.33)), "2x1 EM TODA", fill=(255, 255, 255))
    d.text((int(w * 0.14), int(h * 0.42)), "A PADARIA", fill=(255, 255, 255))
    d.text((int(w * 0.08), int(h * 0.62)), "Valido ate domingo", fill=(120, 60, 20))
    d.rectangle([0, int(h * 0.90), w, h], fill=(23, 84, 68))
    d.text((int(w * 0.10), int(h * 0.93)), "@padariadoze", fill=(255, 255, 255))
    return img


def paste_with_shadow(bg, art, x, y, blur=14, alpha=90, offset=(10, 14)):
    """Cola a arte com sombra suave deslocada (estilo mockup)."""
    w, h = art.size
    shadow = Image.new("RGBA", bg.size, (0, 0, 0, 0))
    ds = ImageDraw.Draw(shadow)
    ds.rectangle([x + offset[0], y + offset[1], x + w + offset[0], y + h + offset[1]],
                 fill=(0, 0, 0, alpha))
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    bg = Image.alpha_composite(bg.convert("RGBA"), shadow)
    bg.paste(art.convert("RGBA"), (x, y))
    return bg.convert("RGB")


# ---- Cartão 95×56 sobre mesa de madeira ----
W, H = 1600, 1200
cw, ch = 950, 560  # ratio 1.696 ≈ 95/56
bg = wood_background(W, H)
cx, cy = 300, 330  # ground truth do cartão
art = card_art(cw, ch)
photo = paste_with_shadow(bg, art, cx, cy)
photo.save(f"{OUT}/test-crop-cartao.jpg", quality=92)
print(f"cartao: foto {W}x{H}, cartao em ({cx},{cy}) {cw}x{ch}")

# ---- Panfleto 98×141.5 sobre fundo degradê ----
W2, H2 = 1400, 1050
fw, fh = 660, 953  # ratio 0.6926
bg2 = Image.new("RGB", (W2, H2), (0, 0, 0))
d2 = ImageDraw.Draw(bg2)
for y in range(H2):
    t = y / H2
    d2.line([(0, y), (W2, y)], fill=(int(40 + 70 * t), int(60 + 60 * t), int(90 + 80 * t)))
fx, fy = 370, 60
flyer = flyer_art(fw, fh)
photo2 = paste_with_shadow(bg2, flyer, fx, fy, blur=18, alpha=110)
photo2.save(f"{OUT}/test-crop-panfleto.jpg", quality=92)
print(f"panfleto: foto {W2}x{H2}, panfleto em ({fx},{fy}) {fw}x{fh}")
