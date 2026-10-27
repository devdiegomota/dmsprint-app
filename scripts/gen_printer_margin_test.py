#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera o PDF de teste de margem da impressora (panfleto 2x2 no A4) - ImpressA4.

Página 1    : régua de calibração (1-20 mm em cada borda) + instruções.
Páginas 2-12: grades 2x2 de panfletos com tamanhos decrescentes
              (A = 10,0 x 14,4 cm até K = 9,0 x 13,4 cm, passo de 1 mm),
              layout simétrico: mesma folga branca nos 4 lados da folha e
              faixas brancas de 3,5 mm por peça nas linhas de corte (igual ao app).

Saída: /home/z/my-project/download/teste-margem-impressora-panfleto.pdf
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas as pdfcanvas

OUT = "/home/z/my-project/download/teste-margem-impressora-panfleto.pdf"

PW, PH = A4  # 595.27 x 841.89 pt = 210 x 297 mm

# Paleta
C_MINOR = HexColor("#8a8a8a")   # linhas finas da régua
C_MAJOR = HexColor("#111111")   # linhas fortes da régua (5 em 5 mm)
C_FRAME = HexColor("#3b5f8f")   # moldura da peça (linha de corte do teste)
C_FILL = HexColor("#e9eff8")    # preenchimento simulando a arte
C_TICK = HexColor("#7d93b8")    # réguas internas da peça
C_TXT = HexColor("#1f3f66")     # textos azuis das peças
C_TXT2 = HexColor("#333333")    # textos neutros
C_HINT = HexColor("#666666")

SW_MM, SH_MM = PW / 72 * 25.4, PH / 72 * 25.4  # 210 x 297 (float)

CUT_CLEAR = 3.5   # mm de faixa branca por peça na linha de corte (igual ao app)
SIZES = [(chr(65 + i), 100 - i, 144 - i) for i in range(11)]  # A..K


def margins(sw, sh):
    """Folga branca da folha até a peça, em cada lado (layout simétrico)."""
    m_lat = (SW_MM - 2 * sw - 2 * CUT_CLEAR) / 2
    m_vert = (SH_MM - 2 * sh - 2 * CUT_CLEAR) / 2
    return m_lat, m_vert


def mm(v):
    return v * 72 / 25.4


def box_label(c, x, y, text):
    """Etiqueta com caixa branca (mascara linhas que cruzam) centrada em (x,y)."""
    w, h = mm(5.6), mm(2.8)
    c.setFillColorRGB(1, 1, 1)
    c.setStrokeColor(C_MINOR)
    c.setLineWidth(0.3)
    c.rect(x - w / 2, y - h / 2, w, h, stroke=1, fill=1)
    c.setFillColor(C_MAJOR)
    c.setFont("Helvetica-Bold", 6.8)
    c.drawCentredString(x, y - mm(0.95), text)


def draw_ruler(c, side):
    """Régua de 1 a 20 mm a partir da borda `side` (top/bottom/left/right)."""
    for d in range(1, 21):
        major = d % 5 == 0
        c.setStrokeColor(C_MAJOR if major else C_MINOR)
        c.setLineWidth(0.9 if major else 0.35)
        if side in ("top", "bottom"):
            y = mm(SH_MM - d) if side == "top" else mm(d)
            c.line(mm(22), y, mm(188), y)
            if major:
                box_label(c, mm(190.8), y, str(d))
        else:
            x = mm(d) if side == "left" else mm(SW_MM - d)
            c.line(x, mm(24), x, mm(273))
            if major:
                box_label(c, x, mm(275.8), str(d))


def calibration_page(c):
    # Réguas nas 4 bordas
    for side in ("top", "bottom", "left", "right"):
        draw_ruler(c, side)

    # Título
    c.setFillColor(C_TXT2)
    c.setFont("Helvetica-Bold", 15)
    c.drawCentredString(mm(105), mm(228), "Folha de calibração da impressora")
    c.setFont("Helvetica", 9)
    c.setFillColor(C_HINT)
    c.drawCentredString(mm(105), mm(222), "Mede quantos milímetros a impressora morde em cada borda do papel")

    # Aviso de escala 100%
    c.setStrokeColor(C_TXT2)
    c.setLineWidth(0.8)
    c.rect(mm(30), mm(202), mm(150), mm(13), stroke=1, fill=0)
    c.setFillColor(C_TXT2)
    c.setFont("Helvetica-Bold", 10.5)
    c.drawCentredString(mm(105), mm(210), "IMPRIMA EM ESCALA 100% (TAMANHO REAL)")
    c.setFont("Helvetica", 8.5)
    c.drawCentredString(mm(105), mm(205), "Desative as opções \"Ajustar à página\" / \"Fit to page\" da impressora")

    # Instruções
    lines = [
        ("Como usar:", True),
        ("1. Imprima esta folha e olhe cada borda.", False),
        ("2. Encontre a MENOR linha que aparece inteira, sem falha, em cada borda.", False),
        ("3. O número dessa linha (em mm) é a mordida da impressora naquela borda.", False),
        ("    As linhas fortes têm número (5, 10, 15, 20); as finas marcam cada 1 mm.", False),
    ]
    y = 189
    for text, bold in lines:
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 9)
        c.setFillColor(C_TXT2)
        c.drawString(mm(32), mm(y), text)
        y -= 7.2

    # Registro manual
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(mm(32), mm(146), "Registre aqui o resultado da sua impressora:")
    c.setFont("Helvetica", 9.5)
    c.drawString(mm(38), mm(136), "Topo: _______ mm        Base: _______ mm")
    c.drawString(mm(38), mm(128), "Esquerda: _______ mm    Direita: _______ mm")

    # Explicação das páginas de teste
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(mm(32), mm(114), "Páginas seguintes (teste A a K):")
    expl = [
        "Cada folha traz os 4 panfletos em um tamanho, diminuindo 1 mm por folha:",
        "A = 10,0 x 14,4 cm  até  K = 9,0 x 13,4 cm (largura e altura).",
        "A folga branca da folha cresce 1 mm por lado a cada tamanho, começando",
        "em 1,5 mm (laterais) e 1,0 mm (topo/base) no teste A - o tamanho atual.",
        "Passe para o próximo tamanho na sua impressora até achar o MAIOR em que",
        "as bordas dos 4 panfletos aparecem inteiras, sem a impressora morder nada.",
    ]
    y = 106
    for text in expl:
        c.setFont("Helvetica", 8.8)
        c.drawString(mm(32), mm(y), text)
        y -= 6.4

    c.setFont("Helvetica", 6.5)
    c.setFillColor(C_HINT)
    c.drawString(mm(25), mm(22.5), "ImpressA4 - teste de margem de impressão - página 1 de 12 (calibração)")


def test_page(c, letter, sw, sh, page_idx, total):
    m_lat, m_vert = margins(sw, sh)
    cols = [m_lat, SW_MM - m_lat - sw]
    rows = [SH_MM - m_vert - sh, m_vert]  # topo, base (origem no rodapé)

    for cy in rows:
        for cx in cols:
            # Preenchimento simulando a arte (mostra exatamente onde a tinta começa)
            c.setFillColor(C_FILL)
            c.rect(mm(cx), mm(cy), mm(sw), mm(sh), stroke=0, fill=1)

            # Réguas internas: marquinhas a cada 10 mm junto às bordas (medem a mordida)
            c.setStrokeColor(C_TICK)
            c.setLineWidth(0.3)
            for k in range(10, int(sw) - 9, 10):
                c.line(mm(cx + k), mm(cy + sh), mm(cx + k), mm(cy + sh - 1.2))
                c.line(mm(cx + k), mm(cy), mm(cx + k), mm(cy + 1.2))
            for k in range(10, int(sh) - 9, 10):
                c.line(mm(cx), mm(cy + k), mm(cx + 1.2), mm(cy + k))
                c.line(mm(cx + sw), mm(cy + k), mm(cx + sw - 1.2), mm(cy + k))

            # Moldura da peça = linha de corte do teste (mais escura de propósito)
            c.setStrokeColor(C_FRAME)
            c.setLineWidth(0.7)
            c.rect(mm(cx), mm(cy), mm(sw), mm(sh), stroke=1, fill=0)

            # Texto central da peça
            c.setFillColor(C_TXT)
            c.setFont("Helvetica-Bold", 11)
            c.drawCentredString(mm(cx + sw / 2), mm(cy + sh / 2 + 1.2), "TESTE " + letter)
            c.setFont("Helvetica", 9)
            c.drawCentredString(
                mm(cx + sw / 2),
                mm(cy + sh / 2 - 3.2),
                ("%d,%d x %d,%d cm" % (sw // 10, sw % 10, sh // 10, sh % 10)),
            )

    # Etiqueta central (faixa branca horizontal entre as linhas de panfletos)
    c.setFillColor(C_TXT2)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawCentredString(
        mm(105),
        mm(149.4),
        "TESTE %s - panfleto %d,%d x %d,%d cm - folga branca da folha: %d,%d mm laterais / %d,%d mm topo e base"
        % (
            letter,
            sw // 10,
            sw % 10,
            sh // 10,
            sh % 10,
            int(m_lat),
            round(m_lat % 1 * 10),
            int(m_vert),
            round(m_vert % 1 * 10),
        ),
    )
    c.setFont("Helvetica", 6.5)
    c.setFillColor(C_HINT)
    c.drawCentredString(
        mm(105),
        mm(146.6),
        "Se as 4 molduras aparecerem inteiras, sem falha, este tamanho passa na sua impressora",
    )

    c.setFont("Helvetica", 6.5)
    c.setFillColor(C_HINT)
    c.drawString(mm(25), mm(22.5), "ImpressA4 - página %d de %d (teste %s)" % (page_idx, total, letter))


def main():
    c = pdfcanvas.Canvas(OUT, pagesize=A4)
    c.setTitle("Teste de margem da impressora - Panfleto 2x2 no A4")
    c.setAuthor("ImpressA4")
    c.setSubject("Calibracao da margem nao imprimivel e teste de tamanho do panfleto (10,0x14,4 ate 9,0x13,4 cm)")
    c.setCreator("ImpressA4")

    total = 1 + len(SIZES)
    calibration_page(c)
    c.showPage()
    for i, (letter, sw, sh) in enumerate(SIZES):
        test_page(c, letter, sw, sh, 2 + i, total)
        c.showPage()
    c.save()
    print("OK:", OUT)


if __name__ == "__main__":
    main()
