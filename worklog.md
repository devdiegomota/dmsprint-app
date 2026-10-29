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

---
Task ID: 9
Agent: main (Z.ai)
Task: Usuário reportou que a função de recorte ("Recortar a arte") sumiu após a atualização da linha de corte. Investigação: o código do recorte + rotação NÃO existia mais no repositório nem no histórico do git (só sobrou o ícone Crop no enhance-panel) — as mudanças da sessão anterior se perderam. Reconstrução completa da feature com todas as melhorias pedidas.

Work Log:
- Diagnóstico: grep por recortar/crop/girar/rotate em src/ só encontrou ícones lucide; git log (9 commits) não contém nenhuma alteração de recorte — a feature foi perdida entre sessões (nunca commitada). Reportado ao usuário como "ficou para trás" e reconstruída.
- NOVO src/lib/print/crop.ts: funções puras rotateCanvas90 (cw/ccw, sem interpolação), rotateRect (remapeia o quadro junto com a rotação), cropCanvas (cópia 1:1), isFullRect, sessionHasCrop, sessionsEqual, effectiveDpi; tipos CropRect/CropSession.
- NOVO src/components/print/crop-panel.tsx (Etapa 2 — "Recortar a arte"): visualização fit-to-view (max-w/max-h, a arte INTEIRA sempre visível — corrige o feedback antigo do quadro pequeno); quadro arrastável (mover) com 8 alças (cantos+bordas) posicionadas em % (acompanham o CSS); drag por listeners na window (mouse/toque/eventos sintéticos); botões 90° à esquerda/direita (a rotação remapeia o quadro para o mesmo conteúdo); Resetar; feedback ao vivo (área px, DPI efetivos min-axe com badge OK/Atenção/Crítico, aviso de proporção ≠ produto); botão contextual "Aplicar recorte e continuar" / "Continuar sem recortar".
- page.tsx: fluxo agora tem 5 ETAPAS (Upload → Recorte & Rotação → Tratamento → Pré-visualização → Exportar); rawSourceRef (arquivo original, imutável) separado de sourceRef (fonte do pipeline); cropSession (rascunho, persiste ao navegar) + cropAppliedRef (sessão já consumida); handleCropApply aplica/reverte/reusa o recorte com comparação exata (evita re-análise redundante); recorte reaplica analyzeArtwork+recommendSettings+preparePrintCanvas sobre a arte recortada.
- step-nav.tsx: 5 etapas (ícone Crop em "Recorte & Rotação"), grid lg:grid-cols-5.
- enhance-panel.tsx: coluna Antes × Depois restaurada como sticky (self-start lg:sticky lg:top-20) — acompanha a rolagem durante os ajustes (segundo feedback antigo que também havia se perdido).
- BUG REAL encontrado no E2E: pointerdown na alça borbulhava para o quadro, registrando um segundo drag "move" que sobrescrevia o redimensionamento (o quadro não mudava). Corrigido com stopPropagation no onPointerDown das alças.
- E2E agent-browser com upload/test-card-ambiente-pe.png (cartão em pé dentro de ambiente teal, scripts/make_test_ambiente.py): giro cw → 1400×1200 "Paisagem · Girada 90°"; drags sintéticos SE+NW posicionaram o quadro em (139, 270, 1122×661) — box em % pixel-exato (9,93/22,5/80,14/55,08) e área "1122 × 661 px"; aplicar → tratamento com 0 pixels teal e laranja #b45309 exatamente no lado previsto pela rotação; Voltar 2× → sessão de recorte persistida (mesmo quadro); concluir fluxo → PDF validado (scripts/verify_crop_pdf.py): A4 exato, 10 peças = cartão girado+recortado (laranja à direita + banda escura), 0 pixels de ambiente; regressão "Continuar sem recortar" OK (arte normal segue 1:1); sticky presente; console sem erros; lint limpo.

Stage Summary:
- A tela "Recortar a arte" foi reconstruída de zero como Etapa 2 do fluxo (agora 5 etapas): recorte manual com quadro/alças, rotação 90° (cartão em pé → deitado, panfleto deitado → em pé), preview fit-to-view da arte inteira, diagnóstico de DPI do recorte e persistência ao navegar. O tratamento/preview/exportação continuam idênticos e agora consomem a arte recortada/girada. Melhoria do Antes × Depois sticky também restaurada.

---
Task ID: 10
Agent: main (Z.ai)
Task: Vistoria completa do projeto a pedido do usuário (medo de novas perdas de função) + investigação específica da memória do usuário sobre "panfleto caber certinho na A4 mesmo que precisasse diminuir o panfleto". SEM mudanças de comportamento.

Work Log:
- Git: árvore limpa, tudo commitado (10 commits, sem stash, só main). Nenhuma função em risco imediato de perda não-versionada.
- Auditoria completa dos fontes: page.tsx (5 etapas, estados fitMode/bottomGuardMm/cutLine/cropSession), constants.ts (cartão 95×56 colado; panfleto 100×144 two-cut), imposition.ts (two-cut com guarda adaptativa, CUT_LINE 2px #c8c8c8), crop.ts, enhance.ts, analysis.ts, pdf.ts, todos os painéis, step-nav, canvas-view — TODOS íntegros e alinhados ao worklog das Tasks 1–9.
- Lint limpo (eslint .); dev server saudável (HTTP 200); E2E smoke test com agent-browser no fluxo do PANFLETO: upload → recorte (botões 90° presentes) → tratamento → folha 4 peças → exportação (checklist "2 cortes: vertical a 105 mm, horizontal a 147,3 mm; ≈3,5 mm lat × 2,7 mm vert"; slider da guarda; switch linha de corte). Console sem erros.
- ACHADO 1 (fóssil): src/components/print/crop-dialog.tsx (704 linhas) é código ÓRFÃO do recorte ANTIGO — ninguém importa; referencia 9 funções que não existem mais em crop.ts (cropPresets, detectArtworkBounds, fitRectWithRatio, moveRect, resizeRect, clampRect, rotateCanvas, cropEffectiveDpi, CropHandle) → 27 erros de tsc. NÃO quebra o app nem o build (next.config tem typescript.ignoreBuildErrors: true) — só polui o type-check. Documenta recursos do recorte antigo que se perderam: trava de proporção/presets, detecção automática de bordas da arte, zoom 6× com pan e roda do mouse.
- ACHADO 2 (IA pela metade): src/lib/print/ai-restore.ts + src/app/api/enhance-ai/route.ts + scripts/test_ai_restore.ts existem e estão completos (7 tamanhos fixos, letterbox, prompt anti-alucinação), mas NENHUM componente chama restoreWithAI — não há botão "Restaurar com IA" na UI. Backend pronto, integração ausente.
- INVESTIGAÇÃO PANFLETO×A4: varrido o histórico git completo de constants.ts e imposition.ts (rg em git log -p por reduzir/diminuir/escala/shrink/scale/caber) — NUNCA existiu lógica commitada de reduzir o panfleto para caber. O panfleto sempre foi 100×144 mm; começou com gapMode "auto-border" (bordas brancas ≈3,3 mm lat × 3,0 mm vert em volta de cada peça — Task 1, "cabia certinho") e mudou para "two-cut" na Task 4 (a pedido do próprio usuário, p/ 2 cortes). Números atuais (guarda 3,0 mm): margens externas 1,5 mm lat × 0,6 mm topo / 3,0 mm base; folga de corte 3,5 mm lat × 2,7 mm vert. Interpretação mais provável da memória do usuário: (a) as bordas confortáveis da era auto-border sumiram quando o two-cut apertou as bordas externas, e/ou (b) a escolha de 100×144 (vs. ¼ A4 = 105×148,5) já ERA o "diminuir o panfleto para caber". Matemática de referência para o retorno do "encaixe certinho": com 3 mm de margem externa em todos os lados + guarda 3 mm, a peça precisa cair para ≈98×141 mm (−2%), sobrando ≈4 mm de folga de corte por peça.
- Nenhuma alteração de código nesta task (vistoria read-only). Únicos arquivos novos: tool-results/* (artefatos de leitura).

Stage Summary:
- Projeto saudável: todas as funções das Tasks 1–9 confirmadas no código e em execução E2E; git 100% commitado. Pendências identificadas para os próximos passos: (1) reimplementar o "encaixe do panfleto na A4" (redução automática da peça p/ margens externas confortáveis, integrada ao two-cut sem tocar no resto do pipeline); (2) remover o fóssil crop-dialog.tsx; (3) ligar a restauração por IA à UI (botão no tratamento) — backend já pronto.

---
Task ID: 10
Agent: main (Z.ai)
Task: Teste de redução do panfleto para impressora que morde em TODOS os lados — gerar material de teste (calibração + tamanhos decrescentes) sem afetar o resto do app.

Work Log:
- Diagnóstico no imposition.ts: panfleto 100×144 mm em 2×2 (two-cut) deixa margens externas de 1,5 mm laterais / 0,6 mm topo / 3,0 mm base — qualquer impressora com zona não imprimível de 3–6 mm morde a arte (relato do usuário confirma).
- Decisão de método: em vez de vários ciclos de impressão, UM único PDF de 12 páginas: pág. 1 = régua de calibração (1–20 mm nas 4 bordas, fortes a cada 5 mm com etiqueta) que mede a mordida exata por lado; págs. 2–12 = testes A..K com 4 panfletos cada, 10,0×14,4 → 9,0×13,4 cm (passo 1 mm), layout simétrico (folga branca da folha cresce 1 mm/lado por página, de 1,5/1,0 mm até 11,5/11,0 mm), faixa de corte 3,5 mm/peça igual ao app, réguas internas de 10 mm nas peças.
- scripts/gen_printer_margin_test.py (ReportLab vetorial) → download/teste-margem-impressora-panfleto.pdf (12 págs A4 exato, metadados ImpressA4).
- scripts/verify_margin_test_pdf.py (pypdfium2 @300 DPI): 35 verificações OK — réguas a 1/20 mm nas 4 bordas, molduras nas posições exatas (A: 1,5/1,0 · C: 3,5/3,0 · K: 11,5/11,0 mm), margem branca externa, faixa central branca, preenchimento da arte, etiquetas. Bugs corrigidos no script: acesso px do PIL e conversão dupla mm→px; renderização pypdfium2 usa origem y=TOPO.
- Zero mudanças em src/ — nenhuma regressão possível no app nesta etapa.

Stage Summary:
- Entregue: download/teste-margem-impressora-panfleto.pdf. Instrução: imprimir tudo em escala 100% (sem "ajustar à página"); pág. 1 dá a mordida exata por lado; o MAIOR teste A..K com as 4 molduras inteiras é o tamanho-alvo.
- Tabela: A 10,0×14,4 (folga 1,5/1,0) · B 9,9×14,3 (2,5/2,0) · C 9,8×14,2 (3,5/3,0) · D 9,7×14,1 (4,5/4,0) · E 9,6×14,0 (5,5/5,0) · F 9,5×13,9 (6,5/6,0) · G 9,4×13,8 (7,5/7,0) · H 9,3×13,7 (8,5/8,0) · I 9,2×13,6 (9,5/9,0) · J 9,1×13,5 (10,5/10,0) · K 9,0×13,4 (11,5/11,0) — folga em mm (laterais / topo-base).
- Próximo passo (após resultado do usuário): implementar no app a redução do panfleto no modo two-cut com distribuição simétrica (margem da impressora nos 4 lados), travando o tamanho confirmado pelo teste; manter guarda de base e linha de corte intactas.

---
Task ID: 11
Agent: main (Z.ai)
Task: Travar o tamanho do panfleto no app com o resultado do teste de impressão (usuário validou o teste C = 9,8 × 14,2 cm "certinho") — sem afetar o resto do app.

Work Log:
- constants.ts: panfleto widthMm 100→98, heightMm 144→142 + comentário do motivo (teste C validado em impressora real: mordida ≤3,5 mm lat / ≤3,0 mm topo-base) + spacingNote atualizada.
- Matemática intacta: imposition.ts deriva tudo da spec; com 98×142 + guarda 3,0 mm, a distribuição existente reproduz o teste C: margens 3,55 lat / 3,13 topo / 2,96 base; folga de corte volta a 3,5 mm completos por peça nos dois eixos (antes 3,5 lat × 2,7 vert).
- Textos de UI: export-panel (dica agora diz para imprimir no modo NORMAL, sem precisar de "Sem margens"; nota da guarda explica que o branco extra sai do topo), preview-panel (nota de margem externa genérica validada), imposition.ts (header + comentário do MAX_BOTTOM_GUARD).
- Lint OK, build OK.
- E2E agent-browser (upload injetado via fetch+DataTransfer porque o upload nativo do daemon travava 3×; botões clicados via eval por texto): fluxo completo de 5 etapas; UI mostra "Panfleto / Encarte 98 × 142 mm · 4 por folha · 2×2"; recorte/rotação 90° presentes na etapa 2; canvas da folha medido por pixel: margens 3,56/3,56/3,13/2,96 mm, grade 202,86×290,91 mm.
- PDF exportado capturado no browser (monkey-patch URL.createObjectURL → blob → base64 em 4 blocos → scripts/exported.pdf, 294.746 bytes) e validado com pypdfium2 (scripts/verify_pdf_98x142.py, 14 checks OK): 1 página A4 exata, margens 3,56/3,56/3,05/2,96 mm, peças 97,93×141,96 mm (= 98×142 nominal), faixas brancas centrais em x=105/y=148,5 mm, 4 peças com arte.
- Nota técnica: raster do PDF usa JPEG (DCTDecode) — verificação pixel precisa threshold imune a ruído (conteúdo < 240; branco ≥ 246); com threshold estrito (>250) artefatos de ±6 níveis falsam o bounding box (causa dos primeiros 7 FAILs, todos falsos positivos).
- Limpeza: arte de teste removida de public/, daemon do browser fechado.

Stage Summary:
- Panfleto agora sai 98×142 mm com 3,5 mm (lat.) e ≈3,0 mm (topo/base) de branco nas bordas da folha — exatamente a geometria que o usuário imprimiu e aprovou. Impressão no modo normal (sem borderless) é segura; guarda de base padrão 3,0 mm mantida (slider continua para impressoras diferentes); recorte, rotação, tratamento, linha de corte e exportação intactos.
- Pendências herdadas da vistoria (Task 10): remover fóssil crop-dialog.tsx; ligar a restauração por IA à UI (backend pronto).

---
Task ID: 12
Agent: main (Z.ai)
Task: Auditoria geral do código (pós-validação do usuário: "deu certinho, saiu perfeito panfleto na A4 sem morder nada") — verificar estado atual do app.

Work Log:
- Validação de campo registrada: o usuário imprimiu o panfleto do app (geometria Task 11) e saiu perfeito na A4, sem mordida em nenhum lado — a geometria 98×142 mm com margens ≈3,5 lat / ≈3,0 topo-base está HOMOLOGADA na impressora real.
- Revisão de todos os módulos src/ (leitura completa): constants.ts (panfleto 98×142 + comentários), imposition.ts (two-cut/glued/guarda/cutLine íntegros), crop.ts (puro, rotação 90° + remapeamento de retângulo), pdf.ts (jsPDF DCTDecode + pdf-lib FlateDecode), ai-restore.ts (plan→letterbox→restore→recrop), page.tsx (orquestração, debounce 140 ms, sessão de recorte persistente), export-panel.tsx (slider guarda 0–5 mm passo 0,25, checklist "modo normal validado"), preview-panel.tsx (zoom 1:1 do fio de corte).
- Saúde: build Next.js 16.1.3 OK (13,1 s, rotas /, /api, /api/enhance-ai); ESLint 0 erros 0 warnings; zero TODO/FIXME; git limpo (apenas tool-results/ não trackeado).
- Grafo de dependências: nenhum arquivo importa crop-dialog.tsx (704 linhas — fóssil substituído pelo CropPanel); nenhum arquivo importa ai-restore.ts (backend completo + API /api/enhance-ai pronta, falta UI); db.ts (Prisma) e api/route.ts ("Hello world") são scaffolding do template, sem uso no fluxo.
- API /api/enhance-ai revisada: prompt anti-alucinação de texto, whitelist de 7 tamanhos, erros 400/502/500 tratados — pronta para produção.

Stage Summary:
- App 100% funcional e homologado em impressora real; Tasks 1–11 confirmadas no código. Dívida técnica mapeada: (1) remover crop-dialog.tsx (−704 linhas mortas); (2) ligar "Restaurar com IA" à UI da etapa 3 (backend 100% pronto, ~40 linhas de integração); (3) opcional: limpar scaffolding Prisma/api raiz. Nenhuma mudança de código nesta task (auditoria read-only).

---
Task ID: 13
Agent: main (Z.ai)
Task: Transplante das melhores ideias do fossil crop-dialog.tsx para o CropPanel atual (tela mantida) — zoom 6×, mãozinha, Ctrl+roda, "Detectar bordas" e setas do teclado; deletar o fossil; auditar e commitar.

Work Log:
- crop.ts: novo núcleo puro detectBoundsFromPixels (fundão estimado por MAIORIA de cantos ≥3 mutuamente próximos — tolera a peça ocupar um canto; máscara de conteúdo vs. cor de fundo com tolerância 30; supressão de ruído por contagem mínima por linha/coluna; salvaguardas: razão de conteúdo 0,4–97%, caixa ≥5% por eixo, caixa ≈folha → null) + detectArtworkBounds (wrapper com downsample ≤1000 px, folga de 1 px, coords no espaço do canvas de entrada — funciona sobre a arte girada).
- crop-panel.tsx (tela visual intacta): stage medido por ResizeObserver (h-62vh), wrapper com width/height = fit×zoom e translate(pan); zoom 1–6× (botões flutuantes +/−, %, Ctrl+roda centrado no cursor, "Ajustar", modo mãozinha com pan clampado); dica "arraste fora do quadro para navegar" quando zoom>1; botão "Detectar bordas" (spinner + aviso âmbar quando sem confiança); setas do teclado movem o quadro 1 px (Shift=10 px) ignorando inputs; frame stopPropagation para conviver com o pan do stage; zoom/pan resetados em girar/resetar.
- Fossil crop-dialog.tsx deletado (−704 linhas; importava funções que não existem mais no crop.ts — código morto e obsoleto).
- Auditoria: tsc --noEmit = 0 erros em src/ (erros restantes são pré-existentes em examples/, skills/ e enhance-ai/route.ts, fora do escopo); eslint 0/0; build OK; teste unitário do detector scripts/test_detect_bounds.ts = 9/9 (peça central, fundo vazio, 100% conteúdo, poeira isolada, poeira+peça, fundo cinza, fundo não uniforme, peça sem folga, peça em canto — este último motivou o fix da maioria de cantos).
- E2E Playwright (scripts/e2e_crop_zoom.py, produção :3001): 12/12 — etapa 2 monta, zoom 100→225% em 2 cliques, dica visível, "Ajustar" reseta, DETECÇÃO encolheu o quadro 400×300 → 294×214 px (peça real 290×210 + folga de 1 px×2 + ruído da foto), setas movem left 13,5%→12,25% (5 px exatos), mãozinha liga/desliga, "Aplicar recorte e continuar" segue ao tratamento com pipeline intacto. Screenshots pw-1..pw-5 em scripts/.
- Falso positivo de depuração: page.evaluate("1+1", timeout=...) NÃO existe em Playwright Python (2º posicional é arg) — o "travamento" era bug do probe; o app nunca travou (comprovado por screenshot e content()). Daemon agent-browser também oscilou (page_wedged espúrio); Playwright direto é o caminho estável para E2E neste ambiente.

Stage Summary:
- Recorte agora tem zoom 6× + detecção automática de bordas + navegação por teclado, mantendo exatamente a tela aprovada; fossil removido; pipeline (tratamento/imposição/exportação) intocado e revalidado E2E. Nota: guias de terços ficaram de fora (eram opcionais no pacote) — podem ser adicionadas depois se quiser.

---
Task ID: 14
Agent: main (Z.ai)
Task: Sugestão (b) — integrar "Restaurar com IA" à tela de tratamento (etapa 3), usando o backend 100% pronto (ai-restore.ts + /api/enhance-ai); auditar e commitar.

Work Log:
- enhance-panel.tsx (+146 linhas): novo card "Restauração com IA" entre "Diagnóstico da arte" e "Tratamento aplicado" — nada existente foi alterado. Ganho estimado ANTES de permitir: mesmo cálculo de DPI efetivo de analyzeArtwork aplicado ao canvas que a IA devolveria (planAiPlacement da arte atual); botão só habilita se o ganho for ≥ 5 DPI (evita REBAIXAR artes que já são boas — a IA entrega no máx. ≈206 DPI no panfleto 98×142). Estados: idle (botão + estimativa "≈X DPI hoje → ≈Y DPI" ou explicação de "sem ganho estimado"), working (spinner âmbar "não feche nem recarregue"), error (caixa vermelha + retry), done (caixa verde com os 2 DPIs + aviso de conferir textos + "Desfazer restauração"). Visão "done" é derivada da prop aiActive (sobrevive à navegação entre etapas sem estado extra, sem useEffect).
- ai-restore.ts: restoreWithAI ganha signal?: AbortSignal (aditivo) — cliente aborta em 180 s com mensagem própria de timeout.
- page.tsx (+50): preAiSourceRef (arte da fonte ANTES da IA, base do undo) + aiActive (state); handleAiRestored segue o MESMO padrão do recorte aplicado (nova análise → recommendSettings → preparePrintCanvas → debounce re-trata pixels → folha se remonta sozinha); handleAiUndo reverte. resetDerived limpa o estado da IA. handleCropApply invalida a IA quando o operador re-corta diferente ou remove o recorte (pipeline volta a derivar da arte original); re-aplicar o MESMO recorte preserva a arte restaurada. rawSourceRef continua NUNCA mutado (a IA cria canvas derivado, como o recorte).
- Divulgação honesta: descrição do card avisa que nesta etapa a arte é enviada para processamento em nuvem (resto do fluxo segue 100% local).
- Auditoria: tsc --noEmit = 0 erros nos 3 arquivos tocados (rg sem matches); npx eslint src --max-warnings=0 = 0/0; npm run build OK (13,3 s, rotas /, /api, /api/enhance-ai).
- E2E Playwright com /api/enhance-ai SIMULADA (scripts/e2e_ai_restore.py, prod :3100): 10/10 — card visível e botão habilitado só com ganho; texto exato "≈104 DPI hoje → ≈206 DPI" (arte 400×580 no panfleto); payload da requisição validado (data URL + size 864x1152); após restaurar, diagnóstico re-analisado para 206 DPI e done mostra "≈104 DPI → ≈206 DPI"; desfazer volta a 104 DPI; re-restaurar funciona; etapa 4 alcançada com a arte restaurada. Nota: sem recorte o botão da etapa 2 é "Continuar sem recortar" (não "Aplicar recorte e continuar", que só existe com ajuste ativo).
- Smoke da IA REAL (scripts/smoke_ai_api.py): POST 400×580 → 200 em 14,7 s, PNG 864×1152 válido — evidência em download/ai-restore-smoke.png. Cadeia completa (SDK + credenciais + rede) confirmada hoje.

Stage Summary:
- "Restaurar com IA" vivo na etapa 3: botão aparece com estimativa honesta de ganho, restaura a arte (pipeline re-analisa e re-trata automaticamente), permite desfazer e bloqueia uso inútil/prejudicial quando a arte já tem DPI suficiente. Dívida técnica da Task 12 encerrada (IA sem UI). Pendência restante (opcional): limpar scaffolding Prisma/api raiz.

---
Task ID: 15
Agent: main (Z.ai)
Task: (1) Limpeza opcional do scaffolding (Prisma + api raiz) aprovada pelo usuário; (2) linha de corte fina PERSONALIZÁVEL na etapa 4 (espessura + cor, para combinar com a arte). Auditar e commitar.

Work Log:
- LIMPEZA: removidos src/lib/db.ts (único importador de @prisma/client), src/app/api/route.ts ("Hello world"), prisma/schema.prisma; scripts db:* fora do package.json; dependências prisma e @prisma/client removidas via bun remove (bun.lock consistente); .env esvaziado (continha só DATABASE_URL). Build confirma: rota /api sumiu da lista (/, /_not-found, /api/enhance-ai apenas). Zero impacto no fluxo.
- LINHA DE CORTE (imposition.ts): novo tipo CutLineConfig {enabled, widthPx 1–8, color hex} + DEFAULT_CUT_LINE (false, 2 px, #c8c8c8 — comportamento original preservado) + normalizeCutLine (aceita boolean legado; clamp 1–8 px; valida hex, cai no padrão em entrada inválida). renderImposedSheet e describeLayout consomem a config normalizada.
- UI (preview-panel.tsx): bloco da linha ganhou, quando ligada, slider de espessura 1–8 px com equivalente em mm ("8 px (≈0.68 mm)"), 6 cores rápidas (cinza padrão, preto, branco, vermelho, azul, amarelo) com anel de seleção e input type=color para cor livre. Ampliação 1:1 do canto agora cita cor e espessura reais. Dica impressa: fios 1–2 px podem sumir em algumas impressoras.
- Sincronia: page.tsx guarda CutLineConfig único (setCutLine direto); ExportPanel usa cutLine.enabled no switch e no checklist (que agora cita "fio de ≈X mm na cor #HEX"); folha, ampliação, checklist e PDF saem sempre da mesma config (a linha vai embutida no sheetCanvas).
- Bônus de auditoria: eliminado o último erro de tsc em src/ (enhance-ai/route.ts: whitelist tipada SupportedSize + cast documentado para o payload do SDK — o tipo do SDK diz `image?: string` mas a API real consome `images[]` verbatim, formato validado em produção; zero mudança de comportamento). tsc src/ = 0 erros pela primeira vez (resta só skills/, fora do app).
- Auditoria: npx eslint src --max-warnings=0 = 0/0; npm run build OK.
- E2E linha de corte (scripts/e2e_cutline.py, prod :3100, leitura de PIXELS do canvas real 2480×3508): 10/10 — padrão #c8c8c8 com 2 px começando exatamente em x=42 (colX[0]; fio 100% dentro da peça, x=41 branco); preset Vermelho 2 px; cor livre #123456 2 px; espessura 8 px = 8 pixels contíguos e nada fora de [42,49]; desligar volta ao branco puro; etapa 5 cita cor/espesura no checklist e o switch sincronizado.
- E2E regressão da IA (scripts/e2e_ai_restore.py): 10/10 após as mudanças — nenhum efeito colateral no fluxo de restauração.
- Lições de ambiente: (1) processos bun órfãos sobrevivem ao terminate() do npm wrapper e servem build antigo → chunks 500/hidratação morta; matar com pkill -f standalone/server.js antes de cada E2E. (2) Nesta versão do Playwright Python, locator.evaluate com arg-lista falha ("object is not iterable") — usar page.evaluate (SCAN_JS já localiza o canvas). (3) Radix Slider: role=slider fica no thumb, sem o aria-label da raiz.

Stage Summary:
- App enxugado (scaffolding Prisma/api raiz eliminado, -50 linhas e 2 pacotes) e linha de corte agora combinável com a arte: espessura 1–8 px e cor livre (6 presets + seletor), com pré-visualização 1:1, checklist sincronizado e o tamanho de corte continuing exato (fio desenhado dentro da peça). Padrões preservados: sem ligar o switch, o PDF é idêntico ao homologado (98×142 validado). Fonte única de verdade em CutLineConfig; boolean legado aceito na API de imposição.

---
Task ID: 18
Agent: main (Z.ai)
Task: Etapa 3 — levar a "Restauração com IA" para a produção (Firebase): o SDK do sandbox não existe fora dele. Diagnóstico, substituição do backend da rota e limpeza de fósseis que um checkpoint ressuscitou. Auditar e commitar.

Work Log:
- DIAGNÓSTICO: /api/enhance-ai usava z-ai-web-dev-sdk, que lê .z-ai-config do sandbox (baseUrl https://internal-api.z.ai/v1 + chave interna da plataforma) — no Firebase App Hosting esse arquivo/credencial não existem, logo a IA quebraria em produção. Pesquisa: a API PÚBLICA da Z.ai (docs.z.ai) expõe apenas glm-image text-to-image (POST /paas/v4/images/generations) — não há edição com imagem de entrada documentada (nem na plataforma CN bigmodel.cn).
- ESCOLHA: Google Gemini (edição de imagem / "Nano Banana") — mesma casa do Firebase/Blaze (conta Google), chave única do AI Studio, fidelidade de texto de referência (crítico para arte impressa). Rota reescrita (fetch direto, zero SDK): POST models/{modelo}:generateContent com o RESTORE_PROMPT INALTERADO (já validado com artes reais) + inlineData; responseModalities TEXT+IMAGE; erros mapeados PT-BR (400/401/403/404/429/503/timeout 150 s com AbortController próprio e mensagem dedicada); sem chave → 503 honesto; blockReason da IA → 422. Modelo configurável via GEMINI_IMAGE_MODEL (padrão gemini-2.5-flash-image).
- CONTRATO com o cliente preservado ({image,size} → {image,mime,size}); ai-restore.ts apenas passou a respeitar o mime devolvido pela IA (mudança aditiva; PNG continua como fallback). enhance-panel/pipeline intocados.
- apphosting.yaml: secret GEMINI_API_KEY declarado (availability RUNTIME) + passo a passo no comentário (AI Studio → apphosting:secrets:set → rollout seguinte já nasce com a chave). .env.local (gitignored, regra .env* já existia) criado como receita local.
- Limpeza de fósseis ressuscitados por checkpoint da plataforma (zero importadores em src/, confirmado por rg): src/lib/db.ts (importava @prisma/client — dependência já removida na Task 15) e src/components/print/crop-dialog.tsx (modal antigo substituído pela Task 13; tipos quebrados há tempos — o build só passava pelo ignoreBuildErrors do template). scripts/test_ai_restore.ts reescrito para a MESMA chamada HTTP da rota — serve para testar local E produção (BASE_URL/4º argumento).
- Auditoria: npx eslint src --max-warnings=0 = 0/0; tsc --noEmit = restam só examples//skills/ (fora do app, pré-existentes); npm run build OK (rotas /, /_not-found, /api/enhance-ai). Smoke do 503 honesto via curl no dev server = mensagem PT-BR correta. Teste real de restauração pendente da chave AI Studio do usuário.

Stage Summary:
- A restauração por IA agora roda em qualquer servidor: a rota fala direto com o Gemini usando a chave em secret (GEMINI_API_KEY), degrada com mensagem clara quando não configurada e mantém o pipeline validado intocado. Fósseis mortos eliminados (db.ts, crop-dialog.tsx) e o smoke script passou a exercitar o backend real. Falta só a chave do usuário (AI Studio) para o teste ponta a ponta e o secret no Firebase para publicar.

---
Task ID: 19
Agent: main (Z.ai)
Task: Publicar a IA de restauração em produção com a chave do usuário: validar a chave nova, atualizar o secret no Firebase, disparar rollout e testar E2E contra https://dmsprint-app--dmsprintapp.us-east4.hosted.app.

Work Log:
- ESTADO HERDADO: o commit do Task 18 (62078ef) + checkpoint da plataforma com scripts/run_detached.py (2cfe4c3, mensagem UUID) já estavam no main do GitHub (verificado via git ls-remote) — o rollout automático já tinha publicado o código novo antes desta sessão.
- SONDA 1 (E2E produção, arte 883×239, size 1440x720): 502 "A chave da IA é inválida ou está sem permissão" = ramo 401/403 do mapeamento → a chave antiga no secret estava revogada/sem permissão. Usuário forneceu chave nova (formato novo do AI Studio, AQ.Ab8…).
- Validação da chave nova: models.list no sandbox → 400 FAILED_PRECONDITION "User location is not supported" (geo-bloco do sandbox, saída HK) — autenticação passou antes do bloqueio, chave válida (mesmo padrão da chave anterior; produção nos EUA não sofre o bloqueio).
- SECRET: firebase apphosting:secrets:set GEMINI_API_KEY --data-file=- --force (npx -y firebase-tools 15.34.2; binário "firebase" não existe no PATH) → versão 2 criada (projects/944897858113/secrets/GEMINI_API_KEY/versions/2); apphosting.yaml permaneceu intocado (git diff vazio).
- ROLLOUT MANUAL sem push: firebase apphosting:rollouts:create dmsprint-app -b main -f --project dmsprintapp → "Successfully created a new rollout"; sondas subsequentes passaram a devolver o fallback "HTTP 402" (texto que só existe no build novo), provando secret v2 + Task 18 ativos em produção.
- BLOQUEIO ATUAL: Gemini responde HTTP 402 Payment Required para gemini-2.5-flash-image — o free tier desse modelo tem limite 0 (js-genai issue #1322: "This model is not enabled for your tier… Enable billing"). A chave é válida; o projeto AI Studio dela está SEM COBRANÇA (billing). Ação do usuário: ativar billing no AI Studio (a mesma chave passa a funcionar sem nenhuma mudança de código) OU eu troco temporariamente para um modelo experimental gratuito via GEMINI_IMAGE_MODEL (qualidade inferior e marca d'água).
- Melhoria enquanto isso: geminiHttpMessage ganhou caso 402 dedicado com mensagem PT-BR amigável (antes caía no texto genérico).
- Auditoria: npx eslint src --max-warnings=0 = 0/0 (route.ts alterado só no switch de mensagens; zero mudança de comportamento nos demais status).

Stage Summary:
- Task 18 confirmado 100% em produção e a chave nova implantada (secret v2 + rollout manual concluídos sem precisar de push). Última milha do E2E depende só de billing no AI Studio (402). Rota agora explica o 402 em PT-BR para quem usa o app. Próximo passo: usuário ativa a cobrança → eu re-rodo o E2E (bun scripts/test_ai_restore.ts download/ai-restore-smoke.png <out> 1440x720 https://dmsprint-app--dmsprintapp.us-east4.hosted.app).
