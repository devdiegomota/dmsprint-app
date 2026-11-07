#!/usr/bin/env python3
"""E2E do Calendário Tenda (Tasks 28–29): sobe /calendario local e valida os
dois formatos.

Formato "Tenda A4 única" (padrão da página): 2 artes, extração de cor, prévia
da folha completa, PDF de 1 página A4 e nuvem habilitada.
Formato "13 cartões": troca de formato, 13 artes, prévia capa/março, PDF de
13 páginas A4.

Saídas: /tmp/render/cal-e2e-*.png (prévias), /tmp/cal-a4.pdf e /tmp/cal-teste.pdf.
"""

import glob
import os
import sys

from pypdf import PdfReader
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3100"
ARTES = sorted(glob.glob("/tmp/cal-artes/*.jpg"))
PDF_A4 = "/tmp/cal-a4.pdf"
PDF_13 = "/tmp/cal-teste.pdf"

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
    checar("Tenda A4 única" in html, "formato padrão é a Tenda A4 única")

    previa = page.locator("img[alt^='Prévia']")

    # ============ Formato 1: Tenda A4 única (1 folha, calendário completo) ============
    multi = page.locator("input[type=file][multiple]")
    multi.set_input_files(ARTES[:2])  # capa (azul) → frente; janeiro (vermelho) → verso
    page.wait_for_timeout(2500)
    checar(page.locator("img[alt='']").count() == 2, "2 slots de arte preenchidos no formato A4")

    page.get_by_role("button", name="Extrair da arte").click()
    page.wait_for_timeout(700)
    valor_cor = page.locator("#text-color").input_value()
    checar(valor_cor != "#292524", f"cor extraída da arte mudou o texto ({valor_cor})")

    page.wait_for_timeout(900)
    previa.screenshot(path="/tmp/render/cal-e2e-a4-folha.png")

    with page.expect_download(timeout=180000) as dl:
        page.get_by_role("button", name="Gerar PDF e baixar").click()
    dl.value.save_as(PDF_A4)
    tam = os.path.getsize(PDF_A4)
    checar(tam > 300_000, f"PDF A4 baixado com tamanho plausível ({tam // 1024} KB)")
    r = PdfReader(PDF_A4)
    checar(len(r.pages) == 1, f"1 página no PDF do formato A4 (encontradas: {len(r.pages)})")
    box = r.pages[0].mediabox
    checar(abs(float(box.width) - 595.28) < 1 and abs(float(box.height) - 841.89) < 1,
           f"página A4 em pontos ({float(box.width):.1f} × {float(box.height):.1f})")
    checar(page.get_by_role("button", name="Enviar para a nuvem").is_enabled(),
           "envio à nuvem habilitado após gerar o PDF (A4)")

    # ============ Formato 2: 13 cartões (capa + 12 meses) ============
    page.get_by_role("button", name="13 cartões").click()
    page.wait_for_timeout(600)
    # Slots 0 e 1 já têm arte do teste anterior; o multi-upload preenche os 11 restantes
    multi.set_input_files(ARTES)
    page.wait_for_timeout(2500)
    thumbs = page.locator("img[alt='']").count()
    checar(thumbs == 13, f"13 miniaturas preenchidas (encontradas: {thumbs})")

    checar(previa.count() == 1, "prévia presente")
    previa.screenshot(path="/tmp/render/cal-e2e-capa.png")

    page.locator("button[aria-label^='Painel Março']").click()
    page.wait_for_timeout(900)
    previa.screenshot(path="/tmp/render/cal-e2e-marco.png")
    nota = page.locator("main").inner_text()
    checar("DPI" in nota, "nota de DPI visível")

    with page.expect_download(timeout=180000) as dl:
        page.get_by_role("button", name="Gerar PDF e baixar").click()
    dl.value.save_as(PDF_13)
    tam = os.path.getsize(PDF_13)
    checar(tam > 500_000, f"PDF baixado com tamanho plausível ({tam // 1024} KB)")
    r = PdfReader(PDF_13)
    checar(len(r.pages) == 13, f"13 páginas no PDF (encontradas: {len(r.pages)})")
    box = r.pages[0].mediabox
    checar(abs(float(box.width) - 595.28) < 1 and abs(float(box.height) - 841.89) < 1,
           f"página A4 em pontos ({float(box.width):.1f} × {float(box.height):.1f})")

    checar(not erros_console, f"sem erros de página ({erros_console[:2]})")
    browser.close()

print()
if falhas:
    print(f"{len(falhas)} FALHAS ❌")
    sys.exit(1)
print("E2E COMPLETO — TUDO OK ✅")
