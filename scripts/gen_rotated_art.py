#!/usr/bin/env python3
"""Gera artes GIRADAS (cenário real: cliente manda cartão em pé / panfleto deitado).

- test-flyer-deitada.png : panfleto 760x1097 girado 90° anti-horário -> 1097x760 (deitado).
  Correção no app: Girar 90° À DIREITA (sentido horário).
- test-card-em-pe.png    : cartão 700x420 girado 90° horário -> 420x700 (em pé).
  Correção no app: Girar 90° À ESQUERDA (anti-horário).
- test-card-ambiente-rot.png : a foto de ambiente 1600x1200 (cartão 950x560 dentro)
  girada 90° anti-horária -> 1200x1600 com cartão 560x950 em pé.
  Correção: girar à direita e depois detectar/recortar.
"""
from PIL import Image

UP = "/home/z/my-project/upload/"

# Panfleto deitado (ROTATE_90 do PIL = anti-horário)
flyer = Image.open(UP + "test-flyer.png")
flyer.transpose(Image.ROTATE_90).save(UP + "test-flyer-deitada.png", "PNG")
print("ok: test-flyer-deitada.png", flyer.transpose(Image.ROTATE_90).size)

# Cartão em pé (ROTATE_270 do PIL = horário)
card = Image.open(UP + "test-card.png")
card.transpose(Image.ROTATE_270).save(UP + "test-card-em-pe.png", "PNG")
print("ok: test-card-em-pe.png", card.transpose(Image.ROTATE_270).size)

# Ambiente girado (cartão dentro da foto fica em pé)
env = Image.open("/home/z/my-project/scripts/test-crop-cartao.jpg")
env.transpose(Image.ROTATE_90).save(UP + "test-card-ambiente-rot.png", "PNG")
print("ok: test-card-ambiente-rot.png", env.transpose(Image.ROTATE_90).size)
