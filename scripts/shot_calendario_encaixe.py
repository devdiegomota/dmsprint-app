#!/usr/bin/env python3
"""Self-check visual da Task 36: ancoragem vertical no Enquadrar — screenshots
do editor + prévia com a arte colada na base e no topo da faixa."""
import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3100"

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_context(viewport={"width": 1440, "height": 1000}).new_page()
    page.goto(f"{BASE}/calendario", wait_until="networkidle")
    import glob
    page.locator("input[type=file][multiple]").set_input_files(sorted(glob.glob("/tmp/cal-artes/*.jpg"))[:1])
    page.wait_for_timeout(2000)
    page.get_by_role("button", name="Enquadrar").click()
    page.wait_for_timeout(700)
    page.locator("[data-testid='pin-base']").click()
    page.wait_for_timeout(900)
    page.locator("main").screenshot(path="/tmp/render/cal-encaixe-base.png")
    page.locator("[data-testid='pin-top']").click()
    page.wait_for_timeout(900)
    page.locator("main").screenshot(path="/tmp/render/cal-encaixe-topo.png")
    b.close()
print("ok")
