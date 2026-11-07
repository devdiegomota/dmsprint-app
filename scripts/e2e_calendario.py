#!/usr/bin/env python3
"""E2E do Calendário Tenda (Task 28): sobe /calendario local, importa as 13 artes,
testa extração de cor, gera o PDF e valida estrutura (13 páginas A4).

Saídas: /tmp/render/cal-e2e-*.png (prévias) e /tmp/cal-teste.pdf.
"""

import glob
import sys

from pypdf import PdfReader
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3100"
ARTES = sorted(glob.glob("/tmp/cal-artes/*.jpg"))
PDF_OUT = "/tmp/cal-teste.pdf"

falhas = []


def checar(cond, msg):
    print(("OK  — " if cond else "FALHOU — ") + msg)
    if not cond:
        falhas.append(msg)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(accept_downloads=True, viewport={"width": 1440, "height": 1000})
    page = ctx.new_page()
    erros_console = []
    page.on("pageerror", lambda e: erros_console.append(str(e)))

    page.goto(f"{BASE}/calendario", wait_until="networkidle")
    # SSR insere <!-- --> entre nós de texto JSX; normaliza antes de buscar o título
    html = page.content().replace("<!-- -->", "")
    checar("Calendário de Mesa Tenda 2027" in html, "página /calendario carrega com o título")

    # ---- Importa as 13 artes de uma vez (input múltiplo, escondido) ----
    multi = page.locator("input[type=file][multiple]")
    multi.set_input_files(ARTES)
    page.wait_for_timeout(2500)
    thumbs = page.locator("img[alt='']").count()
    checar(thumbs == 13, f"13 miniaturas preenchidas (encontradas: {thumbs})")

    # ---- Prévia da capa ----
    previa = page.locator("img[alt^='Prévia']")
    checar(previa.count() == 1, "prévia presente")
    previa.screenshot(path="/tmp/render/cal-e2e-capa.png")

    # ---- Extração de cor da arte (capa é a 1ª) ----
    page.get_by_role("button", name="Extrair da arte").click()
    page.wait_for_timeout(700)
    valor_cor = page.locator("#text-color").input_value()
    checar(valor_cor != "#292524", f"cor extraída da arte mudou o texto ({valor_cor})")

    # ---- Prévia de um mês (painel 3 = Março: tem Carnaval + Sexta Santa) ----
    page.locator("button[aria-label^='Painel Março']").click()
    page.wait_for_timeout(900)
    previa.screenshot(path="/tmp/render/cal-e2e-marco.png")
    nota = page.locator("main").inner_text()
    checar("DPI" in nota, "nota de DPI visível")

    # ---- Gera o PDF ----
    with page.expect_download(timeout=180000) as dl:
        page.get_by_role("button", name="Gerar PDF e baixar").click()
    dl.value.save_as(PDF_OUT)
    import os

    tam = os.path.getsize(PDF_OUT)
    checar(tam > 500_000, f"PDF baixado com tamanho plausível ({tam // 1024} KB)")
    r = PdfReader(PDF_OUT)
    checar(len(r.pages) == 13, f"13 páginas no PDF (encontradas: {len(r.pages)})")
    box = r.pages[0].mediabox
    checar(abs(float(box.width) - 595.28) < 1 and abs(float(box.height) - 841.89) < 1,
           f"página A4 em pontos ({float(box.width):.1f} × {float(box.height):.1f})")

    # ---- Botão de nuvem habilitado após gerar ----
    checar(page.get_by_role("button", name="Enviar para a nuvem").is_enabled(),
           "envio à nuvem habilitado após gerar o PDF")

    checar(not erros_console, f"sem erros de página ({erros_console[:2]})")
    browser.close()

print()
if falhas:
    print(f"{len(falhas)} FALHAS ❌")
    sys.exit(1)
print("E2E COMPLETO — TUDO OK ✅")
