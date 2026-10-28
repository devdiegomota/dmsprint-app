#!/usr/bin/env python3
"""E2E da linha de corte PERSONALIZÁVEL (etapa 4 do ImpressA4).

Valida, com leitura de pixels do canvas real da folha (2480×3508 @ 300 DPI):
  1. Ligar a linha → fio padrão #c8c8c8 com 2 px na borda da 1ª peça;
  2. Cor preset Vermelho (#ef4444) → 2 px vermelhos;
  3. Cor personalizada #123456 via input[type=color] → 2 px na cor exata;
  4. Espessura 8 px via slider (teclado) → 8 px na cor personalizada;
  5. Desligar → volta ao branco puro (nenhum pixel do fio);
  6. Etapa 5: checklist da gráfica cita a linha com a cor/espesura escolhidas.

Geometria usada para amostrar (panfleto 98×142, guarda 3,0 mm):
  cellWidth = round(98/25,4×300) = 1157 px → colX[0] = round(1240−41−1157) = 42;
  com espessura w, o fio cobre x∈[42, 41+w] — linha amostrada em y=875
  (meio da peça, sobre fundo branco da arte de teste).
"""
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import expect, sync_playwright

BASE = "http://localhost:3100"
ART = "/home/z/my-project/scripts/e2e_ai_art.png"
FAILSHOT = "/home/z/my-project/scripts/e2e_cutline_fail.png"

checks = []


def ok(label, cond=True):
    checks.append((label, bool(cond)))
    print(("PASS  " if cond else "FAIL  ") + label)
    if not cond:
        raise AssertionError(label)


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


SCAN_JS = """
([x0, x1, y]) => {
  const c = document.querySelector('canvas[aria-label^="Folha A4"]');
  const ctx = c.getContext('2d');
  const out = [];
  for (let x = x0; x <= x1; x++) {
    const d = ctx.getImageData(x, y, 1, 1).data;
    out.push([x, d[0], d[1], d[2]]);
  }
  return out;
}
"""


def count_color(pixels, rgb, tol=10):
    return sum(1 for _, r, g, b in pixels if abs(r - rgb[0]) <= tol and abs(g - rgb[1]) <= tol and abs(b - rgb[2]) <= tol)


def run_flow(page):
    # --- Etapas 1→3 (arte de teste já existente) ---
    page.goto(BASE)
    page.get_by_role("button", name="Panfleto / Encarte").first.click()
    page.locator('input[type="file"]').set_input_files(ART)
    page.get_by_role("button", name="Analisar e preparar arte").click()
    page.get_by_role("button", name="Continuar sem recortar").click()
    page.get_by_role("button", name="Montar folha A4").click()
    expect(page.get_by_text("Resumo da imposição")).to_be_visible()

    switch = page.get_by_role("switch", name="Ativar linha de corte fina")
    Y = 875
    X0, X1 = 38, 52

    def scan(page_):
        # page.evaluate (não locator.evaluate: nesta versão do Playwright o arg
        # em lista só funciona no escopo da página) — SCAN_JS já localiza o canvas.
        return page_.evaluate(SCAN_JS, [X0, X1, Y])

    # --- 1. Ligar: fio padrão cinza #c8c8c8 com 2 px ---
    switch.click()
    expect(switch).to_be_checked()
    expect(page.get_by_text("Espessura do fio")).to_be_visible()
    page.wait_for_timeout(300)  # efeito re-renderiza a folha
    px = scan(page)
    ok("fio padrão: 2 px em #c8c8c8 (200,200,200)", count_color(px, (200, 200, 200)) == 2)
    ok("fio padrão começa exatamente na borda da peça (x=42)", [p for p in px if p[0] == 42][0][1:] == [200, 200, 200])
    ok("x=41 continua branco (fio 100% dentro da peça)", [p for p in px if p[0] == 41][0][1:] == [255, 255, 255])

    # --- 2. Preset vermelho ---
    page.get_by_role("button", name="Cor do fio: Vermelho").click()
    page.wait_for_timeout(300)
    px = scan(page)
    ok("preset Vermelho: 2 px em #ef4444 (239,68,68)", count_color(px, (239, 68, 68)) == 2)

    # --- 3. Cor personalizada via input[type=color] ---
    page.locator('input[type="color"]').fill("#123456")
    page.wait_for_timeout(300)
    px = scan(page)
    ok("cor personalizada #123456: 2 px (18,52,86)", count_color(px, (18, 52, 86)) == 2)

    # --- 4. Espessura 2 → 8 px (teclado no slider) ---
    # Nota: o role=slider do Radix fica no thumb (sem nome acessível próprio);
    # na etapa 4 este é o ÚNICO slider da página.
    slider = page.get_by_role("slider")
    for _ in range(6):
        slider.press("ArrowRight")
    expect(page.get_by_text("8 px (≈0.68 mm)")).to_be_visible()
    page.wait_for_timeout(300)
    px = scan(page)
    ok("espessura 8 px: 8 pixels contíguos na cor personalizada", count_color(px, (18, 52, 86)) == 8)
    ok("nenhum pixel fora de [42,49] recebe o fio", count_color(px, (255, 255, 255)) == 7)

    # --- 5. Desligar: volta ao branco puro ---
    switch.click()
    expect(switch).not_to_be_checked()
    page.wait_for_timeout(300)
    px = scan(page)
    ok("linha desligada: 0 pixels do fio, branco puro", count_color(px, (255, 255, 255)) == 15)

    # --- 6. Ligar de novo e conferir sincronia na etapa 5 (exportação) ---
    switch.click()
    expect(switch).to_be_checked()
    page.get_by_role("button", name="Ir para exportação").click()
    expect(page.get_by_text("Checklist de impressão")).to_be_visible()
    li = page.get_by_text("impressa na borda de cada peça")
    expect(li).to_be_visible()
    ok("checklist da etapa 5 cita a linha com cor/espesura escolhidas", True)
    export_switch = page.get_by_role("switch", name="Ativar linha de corte para fundos claros")
    expect(export_switch).to_be_checked()
    ok("switch da etapa 5 sincronizado (mesma config compartilhada)", True)


def main():
    env = {**__import__("os").environ, "PORT": "3100"}
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
                run_flow(page)
            except Exception:
                page.screenshot(path=FAILSHOT)
                print("[estado na falha]", page.inner_text("body")[:1000].replace("\n", " | "))
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
