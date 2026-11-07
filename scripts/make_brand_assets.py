#!/usr/bin/env python3
"""Task 23 — Gera os assets de marca DMS Print a partir da logo enviada.

Saídas:
  src/assets/dms-print-logo.png       -> DMS+EMPILHADO PRINT (sem slogan), fundo transparente (p/ fundo claro)
  src/assets/dms-print-logo-dark.png  -> mesma marca com azul-marinho recolorido p/ branco (p/ fundo escuro)
  src/app/icon.png                    -> tile 512x512 (azul-marinho, DMS branco) — favicon via convenção Next
  src/app/apple-icon.png              -> 180x180 para iOS
  public/og-image.png                 -> 1200x630 com a logo completa (com slogan) p/ compartilhamento
"""
from PIL import Image
import numpy as np
from collections import Counter
import os

BASE = "/home/z/my-project"
SRC = os.path.join(BASE, "upload", "ChatGPT Image 28 de ago. de 2026, 22_03_38.png")

im = Image.open(SRC).convert("RGB")
rgb = np.asarray(im).astype(np.int16)
H, W, _ = rgb.shape
mn = rgb.min(axis=2)

# ---------- blocos horizontais de conteúdo (DMS / PRINT / slogan) ----------
nonwhite = mn < 245
rows = nonwhite.any(axis=1)
blocks = []
in_b = False
for y in range(H):
    if rows[y] and not in_b:
        start = y
        in_b = True
    elif not rows[y] and in_b:
        blocks.append([start, y])
        in_b = False
if in_b:
    blocks.append([start, H])
# mescla blocos com vão < 15 px
merged = []
for b in blocks:
    if merged and b[0] - merged[-1][1] < 15:
        merged[-1][1] = b[1]
    else:
        merged.append(b)
print(f"imagem {W}x{H}; blocos: {merged}")
assert len(merged) >= 3, f"esperava 3 blocos (DMS/PRINT/slogan), achei {len(merged)}"
dms, prnt, slogan = merged[0], merged[1], merged[2]


def trim_bbox(alpha, thr=8):
    ys, xs = np.where(alpha > thr)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def build_transparent(y0, y1):
    """RGBA com fundo branco removido; mantém cores originais."""
    sub = rgb[y0:y1]
    sub_mn = mn[y0:y1]
    alpha = np.clip((245.0 - sub_mn) / (245.0 - 180.0), 0, 1)
    alpha = (alpha * 255).astype(np.uint8)
    rgba = np.dstack([sub.astype(np.uint8), alpha])
    x0, yy0, x1, yy1 = trim_bbox(alpha)
    return Image.fromarray(rgba[yy0:yy1, x0:x1], "RGBA")


def to_dark(img):
    """Recolore família azul (B>=R) para branco; laranja permanece."""
    arr = np.asarray(img).copy()
    r, g, b = arr[..., 0].astype(int), arr[..., 1].astype(int), arr[..., 2].astype(int)
    navy = (b >= r) & (arr[..., 3] > 0)
    arr[navy, 0] = 255
    arr[navy, 1] = 255
    arr[navy, 2] = 255
    return Image.fromarray(arr, "RGBA")


os.makedirs(os.path.join(BASE, "src", "assets"), exist_ok=True)

# ---------- 1/2) logo do header (clara e escura) ----------
logo_light = build_transparent(dms[0], prnt[1])
logo_dark = to_dark(logo_light)
logo_light.save(os.path.join(BASE, "src", "assets", "dms-print-logo.png"))
logo_dark.save(os.path.join(BASE, "src", "assets", "dms-print-logo-dark.png"))
print(f"header logo: {logo_light.size} (ratio {logo_light.size[0]/logo_light.size[1]:.2f}:1)")

# ---------- 3/4) ícone tipo tile (azul-marinho, DMS branco) ----------
dark_px = rgb[mn < 60]
navy = Counter(map(tuple, dark_px[::7])).most_common(1)[0][0]
print("azul-marinho amostrado:", navy)

icon_px = 512
tile = Image.new("RGBA", (icon_px, icon_px), tuple(navy) + (255,))
dms_img = build_transparent(dms[0], dms[1])
w, h = dms_img.size
target_w = int(icon_px * 0.74)
scale = target_w / w
dms_scaled = dms_img.resize((target_w, max(1, int(h * scale))), Image.LANCZOS)
# DMS em branco: mantém só o alfa
arr = np.asarray(dms_scaled).copy()
arr[..., 0] = 255
arr[..., 1] = 255
arr[..., 2] = 255
dms_white = Image.fromarray(arr, "RGBA")
tile.alpha_composite(dms_white, ((icon_px - dms_scaled.size[0]) // 2, (icon_px - dms_scaled.size[1]) // 2))
tile.save(os.path.join(BASE, "src", "app", "icon.png"))
tile.resize((180, 180), Image.LANCZOS).save(os.path.join(BASE, "src", "app", "apple-icon.png"))
print("icon.png 512 + apple-icon.png 180 ok")

# ---------- 5) OG image 1200x630 ----------
og_w, og_h = 1200, 630
og = Image.new("RGB", (og_w, og_h), (255, 255, 255))
full = build_transparent(merged[0][0], merged[-1][1])  # logo completa (com slogan)
fw, fh = full.size
avail_w, avail_h = int(og_w * 0.78), int(og_h * 0.72)
scale = min(avail_w / fw, avail_h / fh)
full_scaled = full.resize((int(fw * scale), int(fh * scale)), Image.LANCZOS)
# composição em RGB sobre branco
white = Image.new("RGBA", full_scaled.size, (255, 255, 255, 255))
full_rgb = Image.alpha_composite(white, full_scaled).convert("RGB")
og.paste(full_rgb, ((og_w - full_rgb.size[0]) // 2, (og_h - full_rgb.size[1]) // 2))
og.save(os.path.join(BASE, "public", "og-image.png"))
print(f"og-image.png {og.size} ok (logo {full_rgb.size})")
print("TODOS OS ASSETS GERADOS")
