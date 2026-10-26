# Worklog

---
Task ID: 1
Agent: main (Z.ai)
Task: Build "ImpressA4" — print-shop web app (React/Next.js 16 + Tailwind + Canvas + jsPDF) that enhances customer artwork and imposes A4 sheets at 300 DPI.

Work Log:
- Initialized fullstack environment via init script (Next.js 16, shadcn/ui, Tailwind 4).
- Installed jspdf and pdf-lib (required for high-res PDF export, user-specified libraries).
- Implemented modular client-side libs under src/lib/print:
  - constants.ts: product specs (card 90×54mm, flyer 100×144mm), A4 2480×3508px @300DPI, mm↔px math.
  - analysis.ts: effective DPI, Laplacian-variance sharpness score, thin-text heuristic (gradient attenuation after 1px blur), mean luminance; pure-JS separable box blur (no ctx.filter dependency).
  - enhance.ts: preparePrintCanvas (resample to exact cut size, white bg), unsharpMaskInPlace (amount/radius/threshold), reinforceThinTextInPlace (separable 3×3 min/max morphology + edge mask blend, dark-on-light vs light-on-dark), recommendSettings.
  - imposition.ts: integer-position grid (Bresenham-style gap distribution), cards 2×5 glued centered; flyer 2×2 with computed max white border (≈3.3mm lat × 3mm vert), renderImposedSheet, describeLayout.
  - pdf.ts: JPEG path via jsPDF (DCTDecode), PNG path via pdf-lib (FlateDecode, truly lossless — jsPDF v4 re-encodes PNG to JPEG), A4 exact 595.28×841.89pt, metadata, blob download.
- UI: 4-step flow (UploadPanel, EnhancePanel, PreviewPanel, ExportPanel) + StepNav + CanvasView (copies canvas to avoid prop mutation), page.tsx orchestrator with debounced re-enhancement, layout.tsx pt-BR metadata + next-themes dark mode. Amber accent, no blue/indigo, sticky footer, responsive.
- Fixed lint errors (react-hooks/set-state-in-effect, react-hooks/immutability) and a className={false} console warning.
- E2E verified with agent-browser + generated test art (blurry, low-res, thin text):
  - Analysis correctly reported 14/100 sharpness, 198 DPI effective, background light.
  - Card PDF: page 210.0×297.0mm, image 2480×3508 (exactly 300 DPI), 10 glued cards 2×5 centered (visual render check).
  - Flyer PDF: gutters measured pixel-exact: 3.39mm lateral / 3.05mm vertical white borders, cut size 100.0×143.9mm per piece.
  - PNG export verified as FlateDecode (lossless).
  - Mobile 390px + dark mode + sticky footer verified; console clean after fixes.

Stage Summary:
- App fully functional and verified end-to-end. Deliverable: Next.js app in /home/z/my-project (src/lib/print + src/components/print + src/app/page.tsx). All processing client-side; no database needed.

---
Task ID: 2
Agent: main (Z.ai)
Task: Alterar a dimensão do Cartão de Visita de 90×54 mm para 95×56 mm, a pedido do usuário.

Work Log:
- Editado src/lib/print/constants.ts: cartao-visita widthMm 90→95, heightMm 54→56 (fonte única da matemática do app).
- Editado src/components/print/export-panel.tsx: instrução de guilhotina agora dinâmica via fmtMm(spec.heightMm) em vez de "54 mm" fixo.
- Novo layout derivado automaticamente: célula 1122×661 px @300DPI, grade 2×5 colada centralizada, margem externa 118px (10,0 mm lat.) × 102px (8,6 mm vert.).
- E2E verificado com agent-browser + arte de teste 1122×661 px (scripts/make_test_card.py): UI exibe 95×56 mm, diagnóstico "300 DPI efetivos", preview 10 unidades com margens corretas, checklist "corte cada tira a cada 56 mm".
- PDF exportado e validado (scripts/verify_pdf.py): página 210,00×297,00 mm exata, imagem 2480×3508 px = 300,0×300,0 DPI, DCTDecode (JPEG q95), 924 KB. Lint limpo, console sem erros.

Stage Summary:
- Cartão de Visita agora 9,5 × 5,6 cm, 10 por folha A4 (2×5, coladas). Panfleto inalterado (100×144 mm). Nenhuma outra parte do pipeline exigiu ajuste — arquitetura centralizada em constants.ts funcionou como projetado.

---
Task ID: 3
Agent: main (Z.ai)
Task: Responder dúvida do usuário sobre distorção ao dimensionar para cartão/panfleto e corrigir o comportamento.

Work Log:
- Diagnóstico: preparePrintCanvas usava drawImage(source, 0, 0, w, h) — esticava artes com proporção diferente do produto.
- enhance.ts: adicionado FitMode (cover/contain/stretch), framingInfo() comparando proporção da arte vs produto, preparePrintCanvas com recorte central (cover) ou margens brancas (contain) — ambos sem distorção; stretch mantido como legado explícito.
- page.tsx: sourceRef com canvas-fonte, estado fitMode (default cover), handleFitModeChange re-prepara geometria (efeito com debounce re-trata pixels e remonta a folha).
- enhance-panel.tsx: métrica "Proporção da arte" (1.00:1 vs 1.70:1, nível Crítico/Atenção/OK), RadioGroup de enquadramento com 3 opções e aviso contextual dinâmico (recorte ≈X% da altura/largura; bordas brancas; vermelho + role=alert no stretch).
- Bug interno corrigido durante E2E: eixos do cover em framingInfo estavam invertidos (arte quadrada no cartão recorta altura, não largura) — validado contra a matemática real do drawImage e contra o preview.
- E2E com arte quadrada 800×800 (scripts/make_test_square.py): diagnóstico correto, avisos por modo corretos (cover 41% altura, contain barras laterais, stretch ≈70% com alerta vermelho), círculos perfeitamente redondos no preview (prova anti-distorção), PDF exportado e validado (A4 exato, 2480×3508 px, 300.0 DPI). Lint limpo, console sem erros.

Stage Summary:
- Resposta à dúvida: arte na proporção correta nunca distorceu; proporção diferente distorcia (stretch legado) — agora o padrão é cover (recorte central sem distorção), com contain e stretch opcionais e avisos quantificados na UI.

---
Task ID: 4
Agent: main (Z.ai)
Task: Layout do panfleto exato para 2 cortes de guilhotina (1 vertical + 1 horizontal no centro do A4), mantendo 3,5 mm de borda branca por peça na linha de corte.

Work Log:
- Geometria: 3,5 mm em TODOS os lados das 4 peças exigiria 214×302 mm (não cabe no A4). Solução: folga crítica garantida nas linhas de corte (centro da folha: 105 × 148,5 mm); folga restante nas bordas externas (sem lâmina): 1,5 mm lat / 1,0 mm vert.
- constants.ts: gapMode ganhou "two-cut"; panfleto atualizado com spacingNote explicando o fluxo de 2 cortes.
- imposition.ts: CUT_CLEARANCE_PX = mmToPx(3.5); twoCutPositions() posiciona cada peça a 3,5 mm do centro do eixo; computeLayout com branch two-cut (glued e auto-border mantidos); gapX/gapY agora = vão total entre peças; describeLayout com texto de 2 cortes.
- preview-panel.tsx: texto de espaçamento do two-cut (corte no centro + branco por peça); export-panel.tsx: instrução de corte "apenas 2 cortes... 105 mm e 148,5 mm das bordas".
- E2E: panfleto com arte de teste — UI correta; medição pixel-exata via eval no canvas 2480×3508: vão lateral [101.44→108.47 mm] centrado em 104.96 (≈3.5 mm/lado), vão vertical centrado em 148.5 mm exato (3.47 mm/lado), margens externas 1.0–1.6 mm. PDF do panfleto validado (A4 exato, 2480×3508 px, 300.0 DPI, 405 KB). Lint limpo, console sem erros.

Stage Summary:
- Panfleto agora sai pronto para o fluxo de 2 cortes na guilhotina com 3,5 mm de borda por peça na linha de corte. Cartão (colado 2×5) inalterado.
