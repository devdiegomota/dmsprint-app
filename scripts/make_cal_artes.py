#!/usr/bin/env python3
"""Gera as 13 artes de teste do E2E do Calendário Tenda em /tmp/cal-artes/.

Quadradas (900×900) de propósito: no Enquadrar dentro da faixa 762×1382 sobram
~620 px de folga vertical — cenário do teste de ancoragem topo/base (Task 36).
A capa tem área lisa azul em (w/4, h/2) para o conta-gotas e 3+ cores vivas
para a paleta da arte. Recrie com: python scripts/make_cal_artes.py
"""
import os

from PIL import Image, ImageDraw

OUT = "/tmp/cal-artes"
os.makedirs(OUT, exist_ok=True)
N = 900

def base(cor):
    im = Image.new("RGB", (N, N), cor)
    return im, ImageDraw.Draw(im)

# Capa: azul liso no quadrante (w/4, h/2) + círculo vermelho + barra amarela +
# canto branco — paleta com 3+ cores distintas.
im, d = base((31, 119, 180))
d.ellipse((560, 120, 860, 420), fill=(220, 38, 38))
d.rectangle((0, 640, N, 720), fill=(250, 204, 21))
d.rectangle((700, 0, N, 300), fill=(255, 255, 255))
im.save(f"{OUT}/00-capa.jpg", quality=92)

MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho",
         "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
CORES = [(13, 148, 136), (124, 58, 237), (219, 39, 119), (234, 88, 12),
         (22, 163, 74), (37, 99, 235), (161, 98, 7), (190, 18, 60),
         (79, 70, 229), (5, 150, 105), (217, 119, 6), (29, 78, 216)]
for i, (nome, cor) in enumerate(zip(MESES, CORES), start=1):
    im, d = base(cor)
    d.ellipse((80, 80, 420, 420), fill=(255, 255, 255))
    d.rectangle((450, 450, 880, 880), fill=(28, 25, 23))
    im.save(f"{OUT}/{i:02d}-{nome}.jpg", quality=92)

print(f"13 artes em {OUT}")
