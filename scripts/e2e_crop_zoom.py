"""E2E do recorte melhorado (zoom + detecção de bordas) com Playwright puro.
Etapas: upload -> analisar -> etapa 2 -> detectar bordas -> zoom -> teclado -> continuar."""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3001"
SHOT = "/home/z/my-project/scripts/"
results = []


def check(name, ok, extra=""):
    results.append((name, ok, extra))
    print(f"{'PASS' if ok else 'FAIL'} - {name} {extra}")


def main_thread_ok(page):
    """Sonda barata da main thread (sem kwargs — evaluate não tem timeout em Python)."""
    try:
        return page.evaluate("1+1") == 2
    except Exception:
        return False


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    page.set_default_timeout(30000)

    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(2000)

    # etapa 1: produto + upload + analisar
    page.get_by_text("Panfleto / Encarte").click()
    page.wait_for_timeout(400)
    page.set_input_files("input[type=file]", "/home/z/my-project/scripts/teste-foto-pequena.png")
    page.wait_for_timeout(800)
    page.get_by_text("Analisar e preparar arte").click()
    page.wait_for_selector("text=Recortar a arte", timeout=30000)
    page.wait_for_timeout(1200)
    check("etapa 2 montou", main_thread_ok(page))

    readout = page.locator("p.text-lg").first  # leitura "400 × 300 px"
    zoom_pct = page.locator('[aria-live="polite"]').first
    check("leitura de zoom 100%", zoom_pct.inner_text().strip() == "100%", zoom_pct.inner_text())
    check("botão Detectar bordas visível", page.get_by_text("Detectar bordas").is_visible())
    antes_detect = readout.inner_text()
    page.screenshot(path=SHOT + "pw-1-crop-inicial.png")

    # Detectar bordas: quadro deve encolher da imagem inteira para a peça
    page.get_by_text("Detectar bordas").click()
    page.wait_for_timeout(1500)
    depois_detect = readout.inner_text()
    check(
        "detectar bordas encolheu o quadro para a peça",
        depois_detect != antes_detect,
        f"{antes_detect!r} -> {depois_detect!r}",
    )
    check(
        "sem aviso de falha na detecção",
        page.get_by_text("Não consegui identificar").count() == 0,
    )
    page.screenshot(path=SHOT + "pw-2-detectado.png")

    # zoom in 2× (botão +): 100 -> 150 -> 225
    page.get_by_label("Ampliar o zoom").click()
    page.wait_for_timeout(300)
    page.get_by_label("Ampliar o zoom").click()
    page.wait_for_timeout(500)
    check("zoom 225% após 2 cliques", zoom_pct.inner_text().strip() == "225%", zoom_pct.inner_text())
    check("dica de navegação no zoom", page.get_by_text("Arraste fora do quadro para navegar").is_visible())
    page.screenshot(path=SHOT + "pw-3-zoom225.png")

    # zoom out volta parcialmente; botão Ajustar reseta para 100%
    page.get_by_label("Ajustar a imagem inteira na tela").click()
    page.wait_for_timeout(400)
    check("Ajustar volta a 100%", zoom_pct.inner_text().strip() == "100%", zoom_pct.inner_text())

    # setas do teclado: 5× ArrowLeft move o quadro 5 px (a leitura w×h não muda;
    # a posição do quadro — style left/top — sim)
    frame = page.locator('[role="application"]')
    antes = frame.get_attribute("style")
    for _ in range(5):
        page.keyboard.press("ArrowLeft")
        page.wait_for_timeout(120)
    depois = frame.get_attribute("style")
    check("setas movem o quadro", antes != depois, f"{antes!r} -> {depois!r}")

    # mãozinha liga/desliga
    page.get_by_label("Modo navegar pela imagem").click()
    page.wait_for_timeout(250)
    check(
        "modo mãozinha ativa",
        page.get_by_label("Modo navegar pela imagem").get_attribute("aria-pressed") == "true",
    )
    page.get_by_label("Modo navegar pela imagem").click()
    page.wait_for_timeout(250)
    page.screenshot(path=SHOT + "pw-4-pos-interacoes.png")

    # continuar: aplicar recorte -> tratamento monta (pipeline intacto)
    page.get_by_text("Aplicar recorte e continuar").click()
    page.wait_for_timeout(2500)
    check("saiu da etapa 2 (recorte aplicado)", not page.get_by_text("Detectar bordas").is_visible())
    check("main thread viva após aplicar", main_thread_ok(page))
    page.screenshot(path=SHOT + "pw-5-tratamento.png", full_page=True)

    browser.close()

fails = [r for r in results if not r[1]]
print(f"\n{len(results)-len(fails)}/{len(results)} verificações OK")
sys.exit(1 if fails else 0)
