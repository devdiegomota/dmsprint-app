#!/usr/bin/env python3
"""E2E do pacote "Restauração com IA" na etapa 3 (tratamento) do ImpressA4.

Fluxo validado (API /api/enhance-ai simulada por interceptação de rede):
  1. Upload de arte de BAIXA resolução (400×580) → produto Panfleto → analisar;
  2. Etapa 2: aplicar recorte sem alterações;
  3. Etapa 3: card "Restauração com IA" visível, botão HABILITADO,
     texto "≈104 DPI hoje → ≈206 DPI" (estimativa correta);
  4. Clicar em "Restaurar com IA" → estado "Arte restaurada" com os 2 DPIs,
     diagnóstico atualizado para 206 DPI;
  5. "Desfazer restauração" → volta a 104 DPI e ao botão;
  6. Restaurar de novo (re-execução após undo) e seguir para a etapa 4.

Servidor de produção Next.js na porta 3100 (build já compilado).
"""
import base64
import io
import os
import subprocess
import sys
import time
import urllib.request

from PIL import Image, ImageDraw
from playwright.sync_api import expect, sync_playwright

BASE = "http://localhost:3100"
ART = "/home/z/my-project/scripts/e2e_ai_art.png"
FAILSHOT = "/home/z/my-project/scripts/e2e_ai_fail.png"

checks = []


def ok(label, cond=True):
    checks.append((label, bool(cond)))
    print(("PASS  " if cond else "FAIL  ") + label)
    if not cond:
        raise AssertionError(label)


def make_art():
    """Arte de teste 400×580 (baixa resolução p/ panfleto 98×142 → ≈104 DPI)."""
    img = Image.new("RGB", (400, 580), "#ffffff")
    d = ImageDraw.Draw(img)
    d.rectangle([20, 20, 380, 120], fill="#b45309")  # faixa âmbar
    d.rectangle([20, 140, 380, 420], fill="#0f172a")  # bloco escuro
    d.rectangle([20, 440, 380, 560], fill="#e2e8f0")  # rodapé claro
    img.save(ART)


def make_fake_ai_png():
    """PNG 864×1152 (resposta simulada da IA) em base64 puro."""
    img = Image.new("RGB", (864, 1152), "#dde6f0")
    d = ImageDraw.Draw(img)
    d.rectangle([30, 30, 834, 250], fill="#b45309")
    d.rectangle([30, 280, 834, 850], fill="#0f172a")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


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


def run_flow(page, fake_b64):
    calls = {"n": 0}

    def mock_api(route):
        body = (route.request.post_data or "").replace(" ", "").replace("%20", "")
        assert '"size":"864x1152"' in body, "payload deve pedir 864x1152"
        assert '"image":"data:image/' in body, "payload deve enviar data URL"
        calls["n"] += 1
        route.fulfill(
            status=200,
            content_type="application/json",
            body=f'{{"image":"{fake_b64}","size":"864x1152"}}',
        )

    page.route("**/api/enhance-ai", mock_api)

    # --- Etapa 1: produto + upload + analisar ---
    page.goto(BASE)
    page.get_by_role("button", name="Panfleto / Encarte").first.click()
    page.locator('input[type="file"]').set_input_files(ART)
    page.get_by_role("button", name="Analisar e preparar arte").click()

    # --- Etapa 2: seguir sem recortar (caminho onApply(null)) ---
    page.get_by_role("button", name="Continuar sem recortar").click()

    # --- Etapa 3: card de IA com estimativa correta ---
    expect(page.get_by_text("Restauração com IA")).to_be_visible()
    btn = page.get_by_role("button", name="Restaurar com IA")
    expect(btn).to_be_enabled()
    ok("card IA visível com botão habilitado (104→206 DPI)")
    expect(page.get_by_text("≈104 DPI hoje → ≈206 DPI")).to_be_visible()
    ok("texto de estimativa exato: ≈104 DPI hoje → ≈206 DPI")
    ok("diagnóstico inicial mostra 104 DPI", page.get_by_text("104 DPI").count() > 0)

    # --- Restaurar (1ª vez) ---
    btn.click()
    expect(page.get_by_text("Arte restaurada")).to_be_visible(timeout=30000)
    ok("estado 'Arte restaurada' após resposta da IA (%d mock consumido)" % calls["n"])
    expect(page.get_by_text("≈104 DPI → ≈206 DPI")).to_be_visible()
    ok("done mostra os 2 DPIs: ≈104 DPI → ≈206 DPI")
    expect(page.get_by_text("206 DPI").first).to_be_visible()
    ok("diagnóstico atualizado para 206 DPI (re-análise do pipeline)")

    # --- Desfazer ---
    page.get_by_role("button", name="Desfazer restauração").click()
    expect(page.get_by_role("button", name="Restaurar com IA")).to_be_visible()
    ok("desfazer volta ao estado idle com botão")
    ok("diagnóstico de volta a 104 DPI", page.get_by_text("104 DPI").count() > 0)

    # --- Restaurar de novo + seguir para a etapa 4 ---
    page.get_by_role("button", name="Restaurar com IA").click()
    expect(page.get_by_text("Arte restaurada")).to_be_visible(timeout=30000)
    ok("re-restauração após undo funciona (%d mocks consumidos)" % calls["n"])
    page.get_by_role("button", name="Montar folha A4").click()
    expect(page.get_by_text("Resumo da imposição")).to_be_visible()
    ok("segue à etapa 4 (folha A4) com a arte restaurada")


def main():
    make_art()
    fake_b64 = make_fake_ai_png()
    env = {**os.environ, "PORT": "3100"}
    proc = subprocess.Popen(
        ["npm", "run", "start"], cwd="/home/z/my-project", env=env,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        wait_server(proc)
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 1000})
            page.set_default_timeout(20000)
            page.on("console", lambda m: m.type == "error" and print("[console.error]", m.text[:300]))
            try:
                run_flow(page, fake_b64)
            except Exception:
                page.screenshot(path=FAILSHOT)
                print("[estado na falha]", page.inner_text("body")[:1200].replace("\n", " | "))
                raise
            finally:
                browser.close()
        print("\n%d/%d verificações OK" % (len(checks), sum(1 for c in checks if c[1])))
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
