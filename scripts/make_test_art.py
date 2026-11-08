#!/usr/bin/env python3
"""Gera 13 artes de teste para o E2E do calendário tenda (capa + 12 meses).

Cores bem distintas + nome do painel escrito grande, 1600×1100 (DPI bom).
Saída: /tmp/cal-artes/{00-capa.jpg,01-janeiro.jpg,...}
"""

import os

from PIL import Image, ImageDraw

OUT = "/tmp/cal-artes"
os.makedirs(OUT, exist_ok=True)

PAINELS = ["Capa", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
           "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

CORES = [
    ( ( 31, 119, 180), (255, 255, 255)),
    ((214, 39, 40), (255, 255, 255)),
    ((44, 160, 44), (255, 255, 255)),
    ((148, 103, 189), (255, 255, 255)),
    ((255, 127, 14), (60, 40, 20)),
    ((23, 190, 207), (20, 40, 45)),
    ((188, 128, 189), (255, 255, 255)),
    ((227, 119, 194), (255, 255, 255)),
    ((140, 86, 75), (255, 255, 255)),
    ((127, 127, 127), (255, 255, 255)),
    ((219, 133, 28), (60, 40, 20)),
    ((57, 59, 121), (255, 255, 255)),
    (( 82, 84, 163), (255, 255, 255)),
]

W, H = 1600, 1100
for i, nome in enumerate(PAINELS):
    base, cor_texto = CORES[i]
    img = Image.new("RGB", (W, H), base)
    d = ImageDraw.Draw(img)
    # faixa diagonal mais clara pra ter variação de cor na extração
    for k in range(6):
        alpha = 18 + k * 6
        cor = tuple(min(255, c + alpha) for c in base)
        d.rectangle([W // 2 + k * 90, 0, W, H], fill=cor)
    d.text((60, 80), nome, fill=cor_texto)
    d.text((60, 200), f"Arte de teste {i:02d}", fill=cor_texto)
    d.ellipse([W - 420, H - 420, W - 100, H - 100], outline=cor_texto, width=14)
    caminho = f"{OUT}/{i:02d}-{nome.lower()}.jpg"
    img.save(caminho, quality=82)
    print(caminho, os.path.getsize(caminho) // 1024, "KB")
