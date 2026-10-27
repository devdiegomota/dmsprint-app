"""Gera arte de teste: foto simulada de panfleto sobre fundo de papel branco."""
from PIL import Image, ImageDraw

W, H = 1600, 1200
img = Image.new("RGB", (W, H), (252, 252, 250))  # fundo papel
d = ImageDraw.Draw(img)

# peça central (panfleto azul escuro com texto claro) — folga de ~200px em volta
x0, y0, x1, y1 = 220, 180, 1380, 1020
d.rectangle([x0, y0, x1, y1], fill=(28, 60, 110))
# ruído leve no fundo para simular foto real (bem abaixo do threshold)
import random
random.seed(7)
px = img.load()
for _ in range(6000):
    x, y = random.randrange(W), random.randrange(H)
    if x0 <= x < x1 and y0 <= y < y1:
        continue
    v = 252 - random.randrange(6)
    px[x, y] = (v, v, v - 1 if v > 0 else 0)

# "texto" na peça
for i, ty in enumerate(range(300, 900, 90)):
    d.rectangle([320, ty, 1280, ty + 40], fill=(235, 235, 230) if i % 2 == 0 else (200, 160, 40))

img.save("/home/z/my-project/scripts/teste-foto-panfleto.png")
print("OK: scripts/teste-foto-panfleto.png", img.size)
