#!/usr/bin/env python3
"""E2E do Calendário Tenda (Tasks 28–35): sobe /calendario local e valida os
dois formatos.

Formato "Tenda A4 única" (padrão da página): 2 artes, auto-extração de cor no
upload (pinta meses, números e gerais) + paleta da arte e conta-gotas mirando o
último campo de cor tocado, cores separadas para meses/números verificadas em
PIXELS do PDF gerado, largura da faixa da arte ajustável em mm, seletor de ano,
pé ajustável (aba de colagem), editor de posicionamento da arte (arrastar +
zoom), prévia da folha (1 página, sem guia de montagem), PDF de 1 página A4 e
nuvem habilitada.
Formato "13 cartões": troca de formato, 13 artes, prévia capa/março, PDF de
13 páginas A4.

Saídas: /tmp/render/cal-e2e-*.png (prévias), /tmp/cal-a4.pdf e /tmp/cal-teste.pdf.
"""

import glob
import os
import re
import subprocess
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


def set_color_input(page, sel, hexv):
    """Escreve um input[type=color] via o setter NATIVO e dispara input/change.
    Atribuir el.value direto atualiza o value tracker do React e o onChange é
    deduplicado (não dispara) — o setter do protótipo contorna isso."""
    page.locator(sel).evaluate(
        "(el, v) => {"
        " const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;"
        " set.call(el, v);"
        " el.dispatchEvent(new Event('input', { bubbles: true }));"
        " el.dispatchEvent(new Event('change', { bubbles: true })); }",
        hexv,
    )


def conta_cor(png, box, alvo_hex, tol):
    """Quantos pixels de box (x0, y0, x1, y1) ficam a até `tol` por canal do hex."""
    alvo = tuple(int(alvo_hex[i:i + 2], 16) for i in (1, 3, 5))
    im = Image.open(png).convert("RGB").crop(box)
    return sum(1 for p in im.getdata() if all(abs(a - b) <= tol for a, b in zip(p, alvo)))


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(accept_downloads=True, viewport={"width": 1440, "height": 1000})
    page = ctx.new_page()
    erros_console = []
    page.on("pageerror", lambda e: erros_console.append(str(e)))

    # ============ Navegação: acesso ao calendário pela grade "Tipo de produto" ============
    # A home mantém tráfego permanente (contador da Nuvem) — networkidle nunca dispara;
    # o tile é <a> real, então domcontentloaded basta.
    page.goto(BASE, wait_until="domcontentloaded", timeout=90000)
    html_home = page.content().replace("<!-- -->", "")
    header = page.locator("header")
    checar(header.locator("a[href='/calendario']").count() == 0, "header da home NÃO tem mais botão do calendário")
    checar("Abrir fluxo" in html_home, "grade 'Tipo de produto' mostra o tile 'Abrir fluxo' do calendário")
    checar("Calendário Tenda A4" not in html_home, "variante A4 também sai da grade de imposição (ambas viram fluxo)")
    tile = page.locator("a[href='/calendario']").first
    tile.click()
    # networkidle aqui é corrida (listeners do Firebase mantêm tráfego) — o tile
    # é <a> real: domcontentloaded basta, igual ao goto da home.
    page.wait_for_url(f"{BASE}/calendario", wait_until="domcontentloaded")
    checar("Calendário de Mesa Tenda 2027" in page.content().replace("<!-- -->", ""), "tile da home leva à página /calendario")

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
    txt_estilo = page.locator("main").inner_text()
    checar("Cor dos meses" in txt_estilo and "Cor dos números" in txt_estilo,
           "Estilo tem campos separados para meses e números (Task 35)")
    checar(page.locator("#month-color").input_value() == cor_upload,
           "upload aplica a cor extraída também aos meses")
    checar(page.locator("#day-color").input_value() == cor_upload,
           "upload aplica a cor extraída também aos números")
    paleta = page.locator("[data-testid='art-palette'] button")
    checar(paleta.count() >= 3, f"paleta da arte com 3+ swatches ({paleta.count()})")
    alvo = paleta.nth(1).get_attribute("data-color")
    paleta.nth(1).click()
    page.wait_for_timeout(400)
    checar(page.locator("#text-color").input_value() == alvo,
           f"clique na paleta aplica a cor ao texto ({alvo})")

    # Paleta mira o ÚLTIMO campo de cor tocado (Task 35): foca o campo dos meses
    alvo2 = None
    for i in range(paleta.count()):
        c = paleta.nth(i).get_attribute("data-color")
        if c and c != cor_upload and i != 1:
            alvo2 = (i, c)
            break
    page.locator("#month-color").focus()
    paleta.nth(alvo2[0]).click()
    page.wait_for_timeout(400)
    checar(page.locator("#month-color").input_value() == alvo2[1],
           f"paleta aplica ao campo em destaque: cor dos meses ({alvo2[1]})")
    checar(page.locator("#text-color").input_value() == alvo,
           "cor dos textos gerais intacta quando o alvo da paleta é outro campo")

    # Conta-gotas: ponto (100, meio) da faixa cai na área lisa da capa (azul 31,119,180)
    page.locator("#text-color").focus()  # conta-gotas volta a mirar os textos gerais
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

    # Cores separadas (Task 35): meses vermelho e números azul — validadas em
    # PIXELS do PDF gerado mais abaixo (prévia = impresso).
    set_color_input(page, "#month-color", "#ff0000")
    set_color_input(page, "#day-color", "#0000ff")
    page.wait_for_timeout(700)

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

    # Pixels no PDF (Task 35): nome "Janeiro" em vermelho (#ff0000) e os números
    # da grade em azul (#0000ff). O "sem cor antiga" é por RAZÃO, não zero: o
    # undershoot do JPEG nas bordas dos glifos produz alguns pixels escuros
    # casuais (3 aqui) — num build quebrado a cor antiga dominaria a região.
    subprocess.run(["pdftoppm", "-r", "150", "-jpeg", "-jpegopt", "quality=95",
                    PDF_A4, "/tmp/render/cal-cor"], check=True)
    pag = "/tmp/render/cal-cor-1.jpg"
    nome_box = (412, 726, 523, 751)   # "Janeiro" do 1º mini-mês da frente
    dias_box = (413, 776, 786, 836)   # grade de números do mesmo mini-mês
    nome_verm = conta_cor(pag, nome_box, "#ff0000", 70)
    nome_pad = conta_cor(pag, nome_box, "#292524", 60)
    dias_azul = conta_cor(pag, dias_box, "#0000ff", 70)
    dias_pad = conta_cor(pag, dias_box, "#292524", 60)
    checar(nome_verm > 15, f"PDF: nome do mês na cor dos meses (vermelho, {nome_verm} px)")
    checar(nome_pad * 20 < nome_verm,
           f"PDF: nome do mês sem traço da cor antiga (padrão {nome_pad} × vermelho {nome_verm})")
    checar(dias_azul > 15, f"PDF: números dos dias na cor dos números (azul, {dias_azul} px)")
    checar(dias_pad * 20 < dias_azul,
           f"PDF: números sem traço da cor antiga (padrão {dias_pad} × azul {dias_azul})")

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
