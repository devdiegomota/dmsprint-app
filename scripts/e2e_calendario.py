#!/usr/bin/env python3
"""E2E do Calendário Tenda (Tasks 28–33): sobe /calendario local e valida os
dois formatos.

Formato "Tenda A4 única" (padrão da página): 2 artes, auto-extração de cor no
upload + paleta da arte + conta-gotas no editor, largura da faixa da arte
ajustável em mm, seletor de ano, pé ajustável (aba de colagem), editor de
posicionamento da arte (arrastar + zoom), prévia da folha (1 página, sem guia
de montagem), PDF de 1 página A4 e nuvem habilitada.
Formato "13 cartões": troca de formato, 13 artes, prévia capa/março, PDF de
13 páginas A4.

Saídas: /tmp/render/cal-e2e-*.png (prévias), /tmp/cal-a4.pdf e /tmp/cal-teste.pdf.
"""

import glob
import os
import re
import sys

from PIL import Image
from pypdf import PdfReader
from playwright.sync_api import sync_playwright

BASE = os.environ.get("CAL_BASE", "http://localhost:3100")
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

    # ============ Formato 1: Tenda A4 única (pé + editor de arte) ============
    multi = page.locator("input[type=file][multiple]")
    multi.set_input_files(ARTES[:2])  # capa (azul) → frente; janeiro (vermelho) → verso
    page.wait_for_timeout(2500)
    checar(page.locator("img[alt='']").count() == 2, "2 slots de arte preenchidos no formato A4")

    page.get_by_role("button", name="Extrair da arte").click()
    page.wait_for_timeout(700)
    valor_cor = page.locator("#text-color").input_value()
    checar(valor_cor != "#292524", f"cor extraída da arte mudou o texto ({valor_cor})")

    # Color picker (Task 32): auto-extração no upload + paleta + conta-gotas
    cor_upload = page.locator("#text-color").input_value()
    checar(cor_upload != "#292524", f"upload já aplica a cor extraída da arte ({cor_upload})")
    paleta = page.locator("[data-testid='art-palette'] button")
    checar(paleta.count() >= 3, f"paleta da arte com 3+ swatches ({paleta.count()})")
    alvo = paleta.nth(1).get_attribute("data-color")
    paleta.nth(1).click()
    page.wait_for_timeout(400)
    checar(page.locator("#text-color").input_value() == alvo,
           f"clique na paleta aplica a cor ao texto ({alvo})")

    # Conta-gotas: ponto (100, meio) da faixa cai na área lisa da capa (azul 31,119,180)
    page.get_by_role("button", name="Conta-gotas").click()
    page.wait_for_timeout(300)
    checar("amostrar a cor" in page.locator("main").inner_text(),
           "conta-gotas ativo mostra a dica de amostragem")
    faixa_pick = page.locator("canvas[data-testid='art-band-editor']")
    faixa_pick.scroll_into_view_if_needed()
    caixa_pick = faixa_pick.bounding_box()
    largura_faixa = faixa_pick.evaluate("c => c.width")
    px_css = caixa_pick["x"] + caixa_pick["width"] * (100 / largura_faixa)
    py_css = caixa_pick["y"] + caixa_pick["height"] / 2
    page.mouse.click(px_css, py_css)
    page.wait_for_timeout(500)
    cor_pick = page.locator("#text-color").input_value()
    checar(re.fullmatch(r"#[0-9a-f]{6}", cor_pick) is not None,
           f"conta-gotas aplica um hex válido ({cor_pick})")
    im = Image.open(ARTES[0]).convert("RGB")
    esperado = im.getpixel((im.width // 4, im.height // 2))
    got = tuple(int(cor_pick[i:i + 2], 16) for i in (1, 3, 5))
    checar(all(abs(a - b) <= 12 for a, b in zip(got, esperado)),
           f"conta-gotas pegou o pixel da área lisa ({cor_pick} vs RGB{esperado})")

    # Largura da área da arte (Task 33): slider em mm muda a faixa no editor e na prévia
    faixa_w = page.locator("canvas[data-testid='art-band-editor']")
    w_padrao = faixa_w.evaluate("c => c.width")
    checar(w_padrao == 762, f"faixa de arte padrão = 64,5 mm → 762 px (encontrada {w_padrao})")
    src_padrao = previa.get_attribute("src")
    page.locator("#art-width-range").focus()
    page.keyboard.press("End")  # → 100 mm
    page.wait_for_timeout(700)
    w_max = faixa_w.evaluate("c => c.width")
    checar(w_max == 1181, f"faixa em 100 mm → 1181 px (encontrada {w_max})")
    checar(previa.get_attribute("src") != src_padrao,
           "mudar a largura da arte recompõe a prévia")
    previa.screenshot(path="/tmp/render/cal-e2e-faixa-100mm.png")
    page.keyboard.press("Home")  # → 45 mm
    page.wait_for_timeout(700)
    w_min = faixa_w.evaluate("c => c.width")
    checar(w_min == 531, f"faixa em 45 mm → 531 px (encontrada {w_min})")
    previa.screenshot(path="/tmp/render/cal-e2e-faixa-45mm.png")
    for _ in range(39):  # 45 + 39 × 0,5 = 64,5 mm — de volta ao padrão
        page.keyboard.press("ArrowRight")
    page.wait_for_timeout(700)
    checar(faixa_w.evaluate("c => c.width") == 762, "faixa de volta ao padrão de 64,5 mm")

    # Seletor de ano: 2028 atualiza o título automático da capa; volta para 2027
    page.locator("#cal-year").select_option("2028")
    page.wait_for_timeout(400)
    checar(page.locator("#cover-title").input_value() == "Calendário 2028",
           "seletor de ano atualiza o título automático da capa")
    page.locator("#cal-year").select_option("2027")
    page.wait_for_timeout(400)

    # Pé ajustável: padrão 63 mm (faces de 117 mm) → 70 mm (faces de 113,5 mm)
    corpo = page.locator("main").inner_text()
    checar("117 mm de altura" in corpo, "pé padrão de 63 mm → faces de 117 mm")
    page.locator("#foot-range").focus()
    for _ in range(7):
        page.keyboard.press("ArrowRight")
    page.wait_for_timeout(400)
    checar("113,5 mm de altura" in page.locator("main").inner_text(),
           "pé em 70 mm → faces de 113,5 mm")
    for _ in range(7):
        page.keyboard.press("ArrowLeft")
    page.wait_for_timeout(400)

    # Editor de posicionamento: arrastar muda a prévia; zoom pelo slider
    editor = page.locator("canvas[data-testid='art-band-editor']")
    checar(editor.is_visible(), "editor da arte visível no formato A4")
    page.wait_for_timeout(800)
    src0 = previa.get_attribute("src")
    editor.scroll_into_view_if_needed()
    page.wait_for_timeout(300)
    caixa = editor.bounding_box()
    cx, cy = caixa["x"] + caixa["width"] / 2, caixa["y"] + caixa["height"] / 2
    page.mouse.move(cx, cy)
    page.mouse.down()
    page.mouse.move(cx + 70, cy, steps=6)
    page.mouse.up()
    page.wait_for_timeout(900)
    checar(previa.get_attribute("src") != src0, "arrastar a arte reposiciona o recorte na prévia")
    page.locator("[data-testid='art-zoom']").focus()
    for _ in range(10):
        page.keyboard.press("ArrowRight")
    page.wait_for_timeout(500)
    checar("120%" in page.locator("main").inner_text(), "zoom da arte em 120% pelo slider")
    page.get_by_role("button", name="Centralizar").click()
    page.wait_for_timeout(800)

    previa.screenshot(path="/tmp/render/cal-e2e-a4-folha.png")

    # Sem página de instruções: o toggle do guia foi removido (PDF de 1 página)
    checar(page.get_by_role("button", name="Guia de montagem (verso)").count() == 0,
           "toggle do guia de montagem removido (PDF de 1 página)")

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
