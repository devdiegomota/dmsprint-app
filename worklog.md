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

---
Task ID: 5
Agent: main (Z.ai)
Task: Explicar por que a impressão caseira corta o rodapé da arte (observação do usuário sobre 214×302 mm) e avisar isso na UI.

Work Log:
- Diagnóstico confirmado com os números: quem apara o rodapé não é o app/guilhotina — é a margem não imprimível da impressora. PDF íntegro (arte completa 1:1 no arquivo). Layout antigo (auto-border) tinha ~3,0–3,4 mm de branco externo: absorvia margens laterais/superiores (3–5 mm) mas a base da impressora tem margem maior (5 mm+) e invadia a arte. Layout novo (two-cut): folga vertical total de 9 mm → 7 mm vão para a faixa central do corte (3,5+3,5 mm), sobrando só 1,0 mm externo topo/base (e 1,5 mm lateral) — sem "sem margens" na impressora, as bordas externas da arte podem ser aparadas.
- export-panel.tsx: novo item condicional (gapMode === "two-cut") no checklist: ativar "Sem margens" (borda a borda); sem ela a margem não imprimível (maior na base) apara as bordas externas — rodapé dos panfletos de baixo é o mais afetado; cortes centrais seguros com 3,5 mm garantidos.
- E2E agent-browser: fluxo completo panfleto (upload test-flyer.png → análise → folha → exportação); novo aviso visível no checklist; PDF exportado e validado (210,00×297,00 mm, 2480×3508 px = 300,0 DPI, DCTDecode, 496 KB); console sem erros. Lint limpo. Screenshot scripts/shot-12-printer-tip.png.

Stage Summary:
- Observação do usuário explicada e materializada na UI: o app não corta a arte; a margem não imprimível da impressora apara as bordas externas (base pior), e o checklist agora orienta ativar "Sem margens" + manter escala 100%.

---
Task ID: 6
Agent: main (Z.ai)
Task: Usuário imprimiu com escala 100% + borderless e ainda perdeu ~2 mm na base da folha; sugeriu reduzir a borda de corte de 3,5 para 3,4 mm. Responder com a matemática e corrigir de verdade.

Work Log:
- Matemática da proposta do usuário: reduzir a folga de corte de 3,5 para 3,4 mm libera só (9−6,8)/2 = 1,1 mm externo vertical (+0,1 mm) — não cobre a mordida de ~2 mm. A alavanca real é a DISTRIBUIÇÃO: a mordida é só na base, então a folga vertical deve se concentrar lá.
- imposition.ts: CUT_CLEARANCE_Y_PX = mmToPx(3) (35 px ≈ 3,0 mm, eixo Y) e PRINTER_BOTTOM_GUARD_PX = mmToPx(2) (24 px ≈ 2,0 mm de branco extra na base); nova twoCutRows() posiciona topo com folga normal e base com a guarda (fallback simétrico se não couber); CUT_CLEARANCE_PX (3,5 mm) mantido no eixo X; ImpositionLayout ganhou outerBottomPx; describeLayout atualizado (linhas de corte = meio da faixa branca).
- Layout resultante (px @300 DPI): x1=18, faixa X=82, x2=1281 | y1=12, faixa Y=70, y2=1783, base=24. Corte vertical a ~105 mm da lateral; horizontal a ~148 mm do topo (0,5 mm acima do centro; cortando no 148,5 ainda sobram 2,5 mm de branco). Eixo X inalterado (3,5 mm/peça) pois laterais comprovadamente ok.
- preview-panel.tsx: cortes exibidos a partir do layout (105 mm / 148 mm, meio da faixa); margem externa agora mostra topo E base com explicação da guarda. export-panel.tsx: instrução de 2 cortes derivada de computeLayout (fonte única) e aviso de impressora atualizado ("mesmo com Sem margens, a base tem ~2 mm não imprimíveis — o layout já reserva esse branco"). constants.ts: spacingNote atualizado.
- Novo script scripts/measure_two_cut.py: extrai as 4 artes do PDF renderizado a 300 DPI (cabeçalho laranja + faixa escura) e imprime todas as margens em mm.
- E2E agent-browser: fluxo completo panfleto; medição pixel-exata no canvas 2480×3508: esq/dir 1,52 · topo 1,02 · base 2,03 · faixaX 6,94 (3,47/peça) · faixaY 5,93 (2,96/peça) · peça 99,99×144,02 · cortes em 104,94/147,95 mm. PDF validado (A4 exato, 300,0 DPI, DCTDecode, 490 KB) e remedido do PDF renderizado: mesmos valores (±0,1 mm de arredondamento do rasterizador). Lint limpo, console sem erros. Screenshot scripts/shot-13-bottom-guard.png.

Stage Summary:
- Em vez de 3,4 mm (que daria só +0,1 mm), o layout agora concentra a folga vertical na base: 2,0 mm de branco absorvem a mordida da impressora mesmo em borderless, rodapé dos panfletos de baixo protegido; tolerância de corte vertical caiu de 3,5 para ~3,0 mm por peça (ainda ±3 mm para a lâmina). Knob ajustável: PRINTER_BOTTOM_GUARD_PX.

---
Task ID: 7
Agent: main (Z.ai)
Task: Usuário testou a guarda de 2,0 mm e ainda perdeu ~1 mm de arte na base ("mordeu só um pouquinho"); pediu continuar no caminho do ajuste. Tornar a compensação definitiva (ajustável na UI) em vez de iterative hardcode.

Work Log:
- Diagnóstico: com guarda de 2,0 mm a arte ainda foi mordida ~1 mm → zona não imprimível real da impressora do usuário na base ≈ 3 mm. Novo round de hardcode ia exigir outro ciclo de teste; cada impressora tem uma margem diferente — a solução certa é EXPOVER o ajuste.
- imposition.ts: duasCutRows agora é ADAPTATIVA (prioridades: 1. guarda escolhida, clampada à folga; 2. topo mínimo de 0,5 mm — mmToPx(0.5)=6 px; 3. resto vira folga de corte, máx. 3,5 mm/peça igual ao eixo X). Removidas CUT_CLEARANCE_Y_PX e PRINTER_BOTTOM_GUARD_PX; novas exportações DEFAULT_BOTTOM_GUARD_MM = 3 e MAX_BOTTOM_GUARD_MM = 5 (limite do slider). Nova interface ImpositionOptions { bottomGuardMm?: number }; computeLayout/renderImposedSheet/describeLayout recebem options. Cabeçalho do arquivo reescrito.
- page.tsx: estado bottomGuardMm (default 3) — persiste entre resets de arte (é propriedade da impressora); renderImposedSheet e computeLayout recebem { bottomGuardMm } (deps do efeito/memo atualizadas); ExportPanel recebe valor + setter.
- export-panel.tsx: props bottomGuardMm/onBottomGuardChange; computeLayout com a opção; NOVO bloco "Ajuste para a sua impressora" (só two-cut): slider 0–5 mm passo 0,25 com valor exibido ("3,00 mm de branco na base") e explicação (subir em passos de 0,5 mm se a arte ainda for mordida; topo mantém ≥0,5 mm; linhas de corte acompanham sozinhas); aviso borderless reescrito (base tem de 1 a 3 mm não imprimíveis, varia por modelo). constants.ts: spacingNote genérico (reserva ajustável).
- Distribuição resultante com default 3,0 mm (px @300 DPI): topo 7 (0,6 mm) · folga de corte Y 2×32 (2,7 mm/peça) · base 35 (3,0 mm). Eixo X inalterado (1,5/3,5/1,5). Corte horizontal fica a 147,3 mm do topo.
- E2E agent-browser: fluxo completo panfleto; slider testado via teclado (3,00→3,75→3,00), rótulo e checklist reagem em tempo real (com 3,75: corte a 146,9 mm, folga vert. 2,4 mm/peça); PDF re-exportado e validado (1 página — contagem "2" do verify_pdf.py é artefato do regex que casa /Pages também; A4 exato, 300,0 DPI, DCTDecode, 490 KB); console sem erros; lint limpo. Screenshots scripts/shot-13-guard-default.png, shot-14-guard-slider-375.png, shot-15-guard-final.png.

Stage Summary:
- Fim do ciclo teste-e-erro: o usuário agora ajusta a reserva da base (0–5 mm) na própria tela de exportação, com feedback instantâneo nas instruções de corte; default 3,0 mm já cobre a mordida de ~3 mm medida na impressora dele. Qualquer impressora futura é caso de slider, não de código.

---
Task ID: 8
Agent: main (Z.ai)
Task: Linha de corte fina (fio cinza-claro quase invisível) na borda de cada peça, para artes com fundo branco/claro em que o operador não enxerga onde cortar na guilhotina (cartões saíam com tamanhos aleatórios).

Work Log:
- imposition.ts: novas constantes exportadas CUT_LINE_WIDTH_PX = 2 (≈0,17 mm @ 300 DPI) e CUT_LINE_COLOR = "#c8c8c8"; ImpositionOptions ganhou cutLine?: boolean; renderImposedSheet desenha strokeRect alinhado a pixels inteiros 100% DENTRO de cada peça (tamanho de corte continua exato) — em peças coladas os traços vizinhos formam fio duplo de 4 px sobre a linha de vinco; describeLayout menciona a linha quando ativa.
- page.tsx: estado cutLine (default false, persiste entre artes como bottomGuardMm/fitMode); renderImposedSheet recebe { bottomGuardMm, cutLine } (dep adicionada); props cortadas para PreviewPanel e ExportPanel.
- preview-panel.tsx: novo bloco "Linha de corte fina" com Switch abaixo da folha + NOVA AMPLIAÇÃO 1:1 (canvas 400×250 do canto da primeira peça via useEffect/drawImage) porque o fio de 0,17 mm é invisível na folha reduzida — visível só quando o switch está ON.
- export-panel.tsx: bloco "Linha de corte para fundos claros" (Switch, todos os produtos) + item dinâmico no checklist: variante glued ("corte exatamente sobre a linha — cartão sai com 95 × 56 mm; linhas também marcam o limite do bloco para aparar bordas externas") e variante two-cut ("siga no meio da faixa branca — linhas marcam a borda exata da arte").
- E2E agent-browser com nova arte branca upload/test-card-branco.png (scripts/make_test_card_white.py, conteúdo no miolo, cantos brancos):
  - Switch OFF: 0 px cinza nas janelas sondadas (baseline limpa).
  - Switch ON (cartão): fio #c8c8c8 pixel-exato em x{118,119}, x{1238..1241} (fio duplo), y{102,103}, y{761..764}, base y{3405,3406}; interior da arte e margens externas 255 branco; ampliação 1:1 mostra o fio (px 30-31 = 200,200,200).
  - Sincronia: switch ON/OFF no export reflete no preview (estado único no page.tsx); OFF volta a 0 px cinza.
  - Panfleto two-cut: fio presente na borda direita da peça 1 (x 1197-1198) e topo (y 7-8) — layout não colado também suportado; checklist com texto da variante two-cut correto.
  - PDF exportado validado (scripts/verify_cutline_pdf.py): página 210,00 × 297,00 mm; render 300 DPI; fio presente nas 4 bordas das 10 peças (janela ±3 px, ≥2 px cinza cada), interiores/margens brancos, amostra (202,202,202) ≈ alvo.
  - Console sem erros; lint limpo. Screenshots scripts/shot-16-cutline-preview.png, shot-17-cutline-export.png.

Stage Summary:
- Novo recurso "Linha de corte fina": fio cinza-claro de ≈0,17 mm na borda de cada peça, ativável no preview e na exportação (estado compartilhado), com ampliação 1:1 para conferência. Resolve o corte aleatório de cartões de fundo branco na guilhotina; o tamanho de corte permanece exato (o fio é impresso dentro da medida) e some quase totalmente no produto final.
