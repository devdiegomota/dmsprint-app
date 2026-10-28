#!/usr/bin/env python3
"""Smoke test da API REAL /api/enhance-ai: envia uma arte de baixa resolução
e valida que a IA devolve uma imagem restaurada. Salva o resultado em
download/ai-restore-smoke.png como evidência.
"""
import base64
import io
import json
import os
import subprocess
import sys
import time
import urllib.request

from PIL import Image, ImageDraw

BASE = "http://localhost:3101"
OUT = "/home/z/my-project/download/ai-restore-smoke.png"


def make_art_data_url():
    """Arte de teste 400×580 (baixa resolução, tipo foto de WhatsApp)."""
    img = Image.new("RGB", (400, 580), "#ffffff")
    d = ImageDraw.Draw(img)
    d.rectangle([20, 20, 380, 120], fill="#b45309")
    d.ellipse([120, 180, 280, 340], fill="#0f172a")
    d.rectangle([20, 440, 380, 560], fill="#e2e8f0")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def wait_server(proc, timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError("servidor morreu na inicialização")
        try:
            with urllib.request.urlopen(BASE, timeout=2) as r:
                if r.status == 200:
                    return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("servidor não respondeu a tempo")


def main():
    env = {**os.environ, "PORT": "3101"}
    proc = subprocess.Popen(
        ["npm", "run", "start"], cwd="/home/z/my-project", env=env,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        wait_server(proc)
        payload = json.dumps({"image": make_art_data_url(), "size": "864x1152"}).encode("utf-8")
        req = urllib.request.Request(
            BASE + "/api/enhance-ai",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        t0 = time.time()
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        dt = time.time() - t0
        b64 = data.get("image")
        assert isinstance(b64, str) and len(b64) > 1000, "resposta sem imagem válida"
        assert data.get("size") == "864x1152", f"size inesperado: {data.get('size')}"
        raw = base64.b64decode(b64)
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        with open(OUT, "wb") as f:
            f.write(raw)
        img = Image.open(io.BytesIO(raw))
        print(f"PASS  IA real respondeu em {dt:.1f}s · {len(b64)//1024} KB (base64) · PNG {img.size[0]}×{img.size[1]}")
        print(f"      evidência salva em {OUT}")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except Exception:
            proc.kill()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("ERRO:", e)
        sys.exit(1)
