#!/usr/bin/env python3
"""Self-check visual da Task 38: rodapé da arte (título/ano) ocultável —
screenshots com os textos ligados (padrão) e com ambos desligados (arte do
cliente sai limpa)."""
import glob

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3100"

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_context(viewport={"width": 1440, "height": 1000}).new_page()
    page.goto(f"{BASE}/calendario", wait_until="networkidle")
    page.locator("input[type=file][multiple]").set_input_files(sorted(glob.glob("/tmp/cal-artes/*.jpg"))[:1])
    page.wait_for_timeout(2500)
    page.locator("#scrim-range").scroll_into_view_if_needed()
    page.locator("main").screenshot(path="/tmp/render/cal-rodape-on.png")
    page.locator("[data-testid='show-year-switch']").click()
    page.locator("[data-testid='show-title-switch']").click()
    page.wait_for_timeout(1200)
    page.locator("main").screenshot(path="/tmp/render/cal-rodape-off.png")
    b.close()
print("ok")
