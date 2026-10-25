"""Valida o PDF exportado: tamanho da página, imagem embutida e DPI efetivo."""
import zlib, re, sys

PDF = "/home/z/Downloads/impressa4-cartao-visita.pdf"
data = open(PDF, "rb").read()

# MediaBox
mb = re.search(rb"/MediaBox\s*\[([^\]]+)\]", data)
vals = [float(x) for x in mb.group(1).split()]
w_pt, h_pt = vals[2] - vals[0], vals[3] - vals[1]
w_mm, h_mm = w_pt * 25.4 / 72, h_pt * 25.4 / 72
print(f"Pagina: {w_pt:.2f} x {h_pt:.2f} pt = {w_mm:.2f} x {h_mm:.2f} mm")

# Dimensoes da imagem embutida
imgs = re.findall(rb"/Width\s+(\d+).*?/Height\s+(\d+)", data, re.S)
for w, h in imgs:
    dpi_x, dpi_y = int(w) / (w_mm / 25.4), int(h) / (h_mm / 25.4)
    print(f"Imagem embutida: {int(w)} x {int(h)} px -> {dpi_x:.1f} x {dpi_y:.1f} DPI efetivos")

# Filtro da imagem
filtros = set(re.findall(rb"/Filter\s*/(\w+)", data))
print("Filtros:", [f.decode() for f in filtros])
print("Paginas:", data.count(b"/Type /Page") or data.count(b"/Type/Page"))
print("Tamanho arquivo:", len(data) // 1024, "KB")

ok = abs(w_mm - 210) < 0.5 and abs(h_mm - 297) < 0.5
print("A4 exato:", "OK" if ok else "FALHOU")
