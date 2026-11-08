#!/usr/bin/env python3
"""Self-check visual da Task 35: cores separadas (meses / números / gerais) no
formato A4 — screenshot do bloco de campos e da prévia com cores de teste."""
import glob
import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3100"
ARTES = sorted(glob.glob("/tmp/cal-artes/*.jpg"))

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_context(viewport={"width": 1440, "height": 1000}).new_page()
    page.goto(f"{BASE}/calendario", wait_until="networkidle")
    page.locator("input[type=file][multiple]").set_input_files(ARTES[:1])
    page.wait_for_timeout(2000)
    for sel, hexv in [("#month-color", "#ff0000"), ("#day-color", "#0000ff")]:
        page.locator(sel).evaluate(
            "(el, v) => {"
            " const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;"
            " set.call(el, v);"
            " el.dispatchEvent(new Event('input', { bubbles: true }));"
            " el.dispatchEvent(new Event('change', { bubbles: true })); }",
            hexv,
        )
    page.wait_for_timeout(900)
    page.locator("[data-testid='text-colors']").scroll_into_view_if_needed()
    page.locator("main").screenshot(path="/tmp/render/cal-cores-estilo.png")
    page.locator("img[alt^='Prévia']").screenshot(path="/tmp/render/cal-cores-previa.png")
    b.close()
print("ok")
