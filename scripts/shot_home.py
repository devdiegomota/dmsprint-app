#!/usr/bin/env python3
"""Screenshot da home (etapa 1, grade 'Tipo de produto') para o self-check visual."""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3100"
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 1100})
    pg.goto(BASE, wait_until="domcontentloaded", timeout=90000)
    pg.wait_for_timeout(1200)
    pg.screenshot(path="/tmp/render/home-tile.png", full_page=False)
    b.close()
print("ok")
