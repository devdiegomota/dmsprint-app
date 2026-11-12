#!/usr/bin/env python3
"""Self-check visual da Task 37: altura da sombra na base da faixa — screenshots
com o padrão (27 mm) e com a sombra desligada (0 mm)."""
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
    page.locator("main").screenshot(path="/tmp/render/cal-sombra-27.png")
    page.locator("#scrim-range").focus()
    page.keyboard.press("Home")
    page.wait_for_timeout(1200)
    page.locator("main").screenshot(path="/tmp/render/cal-sombra-0.png")
    b.close()
print("ok")
