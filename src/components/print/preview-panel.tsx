"use client";

import { useEffect, useRef } from "react";
import { Ruler, Grid3x3, Scissors, ArrowRight, FileText, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { CanvasView } from "./canvas-view";
import { cn } from "@/lib/utils";
import { A4, fmtMm, pxToMm, type ProductSpec } from "@/lib/print/constants";
import {
  MAX_CUT_LINE_WIDTH_PX,
  MIN_CUT_LINE_WIDTH_PX,
  type CutLineConfig,
  type ImpositionLayout,
} from "@/lib/print/imposition";

/** Cores rápidas para o fio de corte — cobre os casos comuns da gráfica;
 *  qualquer outra cor fica disponível no seletor personalizado ao lado. */
const CUT_LINE_PRESETS: { color: string; name: string }[] = [
  { color: "#c8c8c8", name: "Cinza (padrão)" },
  { color: "#000000", name: "Preto" },
  { color: "#ffffff", name: "Branco" },
  { color: "#ef4444", name: "Vermelho" },
  { color: "#3b82f6", name: "Azul" },
  { color: "#facc15", name: "Amarelo" },
];

export function PreviewPanel({
  spec,
  layout,
  sheetCanvas,
  cutLine,
  onCutLineChange,
  onContinue,
}: {
  spec: ProductSpec;
  layout: ImpositionLayout;
  sheetCanvas: HTMLCanvasElement | null;
  /** Linha de corte fina — espessura e cor personalizáveis. */
  cutLine: CutLineConfig;
  onCutLineChange: (c: CutLineConfig) => void;
  onContinue: () => void;
}) {
  // Linhas de corte = meio da faixa branca central de cada eixo (fonte única: layout).
  const cutXMm = pxToMm((layout.colX[0] + layout.cellWidthPx + layout.colX[1]) / 2);
  const cutYMm = pxToMm((layout.rowY[0] + layout.cellHeightPx + layout.rowY[1]) / 2);
  // No modo multi-cut há (linhas − 1) cortes horizontais — posições de todos eles.
  const cutYMmList = layout.rowY
    .slice(0, -1)
    .map((y, i) => pxToMm((y + layout.cellHeightPx + layout.rowY[i + 1]) / 2));

  // Ampliação 1:1 do canto da primeira peça — o fio de ≈0,17 mm é pequeno demais
  // para enxergar na folha reduzida; aqui ele aparece em tamanho real.
  const detailRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = detailRef.current;
    if (!target || !sheetCanvas || !cutLine.enabled) return;
    const w = 400;
    const h = 250;
    const sx = Math.max(0, layout.colX[0] - 30);
    const sy = Math.max(0, layout.rowY[0] - 20);
    target.width = w;
    target.height = h;
    const ctx = target.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(sheetCanvas, sx, sy, w, h, 0, 0, w, h);
  }, [sheetCanvas, cutLine, layout]);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
      {/* Pré-visualização da folha */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-amber-600" aria-hidden />
            Folha A4 montada
          </CardTitle>
          <CardDescription>
            Pré-visualização em escala — a folha exportada tem {A4.widthPx} × {A4.heightPx} px (300 DPI reais).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mx-auto max-w-md">
            <div className="rounded-md border bg-white p-2 shadow-lg shadow-black/10 dark:shadow-black/40">
              {sheetCanvas ? (
                <CanvasView canvas={sheetCanvas} ariaLabel={`Folha A4 com ${spec.unitsPerSheet} ${spec.name}s`} />
              ) : (
                <div className="flex aspect-[210/297] items-center justify-center bg-muted text-sm text-muted-foreground">
                  Renderizando folha…
                </div>
              )}
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {A4.widthMm} × {A4.heightMm} mm — retrato
            </p>

            {/* Linha de corte fina (para artes de fundo branco/claro) — espessura e cor combinam com a arte */}
            <div className="mt-4 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <ScanLine className="h-4 w-4 text-amber-600" aria-hidden />
                    Linha de corte fina
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Fio na borda de cada peça — guia a guilhotina em artes com fundo branco/claro. Ajuste a espessura e
                    escolha a cor que melhor aparece sobre a sua arte (fica quase invisível no produto final).
                  </p>
                </div>
                <Switch
                  checked={cutLine.enabled}
                  onCheckedChange={(v) => onCutLineChange({ ...cutLine, enabled: v })}
                  aria-label="Ativar linha de corte fina"
                  className="mt-0.5"
                />
              </div>

              {cutLine.enabled && (
                <div className="mt-4 flex flex-col gap-4 border-t pt-4">
                  <div>
                    <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                      <span>Espessura do fio</span>
                      <span className="font-mono text-foreground">
                        {cutLine.widthPx} px (≈{pxToMm(cutLine.widthPx).toFixed(2)} mm)
                      </span>
                    </div>
                    <Slider
                      aria-label="Espessura da linha de corte"
                      value={[cutLine.widthPx]}
                      min={MIN_CUT_LINE_WIDTH_PX}
                      max={MAX_CUT_LINE_WIDTH_PX}
                      step={1}
                      onValueChange={([v]) => onCutLineChange({ ...cutLine, widthPx: v })}
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Fios finos (1–2 px) somem em muitas impressoras; prefira 2 px ou mais para o guia sair impresso.
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-xs text-muted-foreground">Cor do fio</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {CUT_LINE_PRESETS.map((p) => (
                        <button
                          key={p.color}
                          type="button"
                          aria-label={`Cor do fio: ${p.name}`}
                          title={p.name}
                          onClick={() => onCutLineChange({ ...cutLine, color: p.color })}
                          className={cn(
                            "h-7 w-7 rounded-full border border-black/10 transition-shadow",
                            cutLine.color.toUpperCase() === p.color.toUpperCase() &&
                              "ring-2 ring-amber-600 ring-offset-2 ring-offset-background",
                          )}
                          style={{ backgroundColor: p.color }}
                        />
                      ))}
                      <input
                        type="color"
                        value={cutLine.color}
                        onChange={(e) => onCutLineChange({ ...cutLine, color: e.target.value })}
                        aria-label="Cor personalizada da linha de corte"
                        title="Cor personalizada"
                        className="h-7 w-9 cursor-pointer rounded border bg-transparent p-0.5"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {cutLine.enabled && (
              <div className="mt-3">
                <canvas
                  ref={detailRef}
                  aria-label="Ampliação do canto da folha mostrando a linha de corte fina em tamanho real"
                  className="w-full rounded-md border bg-white"
                />
                <p className="mt-1.5 text-center text-xs text-muted-foreground">
                  Ampliação 1:1 do canto — o fio {cutLine.color.toUpperCase()} de {cutLine.widthPx} px marca a medida
                  exata de corte.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resumo técnico */}
      <div className="flex flex-col gap-6">
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Resumo da imposição</CardTitle>
            <CardDescription>{spec.name}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-lg border p-3.5">
              <Grid3x3 className="mt-0.5 h-5 w-5 text-amber-600" aria-hidden />
              <div>
                <p className="text-sm font-medium">Grade</p>
                <p className="text-sm text-muted-foreground">
                  {spec.cols} colunas × {spec.rows} linhas = <strong>{spec.unitsPerSheet} unidades</strong> por folha
                </p>
                <Badge variant="secondary" className="mt-2">
                  {layout.cellWidthPx} × {layout.cellHeightPx} px por peça
                </Badge>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border p-3.5">
              <Scissors className="mt-0.5 h-5 w-5 text-amber-600" aria-hidden />
              <div>
                <p className="text-sm font-medium">Espaçamento</p>
                {spec.gapMode === "glued" ? (
                  <p className="text-sm text-muted-foreground">
                    Peças <strong>coladas</strong> (0 mm entre si) — corte direto na guilhotina, bloco centralizado na
                    folha.
                  </p>
                ) : spec.gapMode === "two-cut" ? (
                  <p className="text-sm text-muted-foreground">
                    Layout de <strong>2 cortes</strong>: 1 vertical a <strong>{fmtMm(cutXMm)} mm</strong> da lateral e 1
                    horizontal a <strong>{fmtMm(cutYMm)} mm</strong> do topo — passe a lâmina no meio da faixa branca
                    central. Cada panfleto fica com{" "}
                    <strong>≈{fmtMm(pxToMm(layout.gapXPx / 2))} mm</strong> (lat.) ×{" "}
                    <strong>≈{fmtMm(pxToMm(layout.gapYPx / 2))} mm</strong> (vert.) de borda branca na linha de corte.
                  </p>
                ) : spec.gapMode === "multi-cut" ? (
                  <p className="text-sm text-muted-foreground">
                    Layout de <strong>{spec.rows} cortes</strong>: 1 vertical a <strong>{fmtMm(cutXMm)} mm</strong> da
                    lateral e {spec.rows - 1} horizontais a{" "}
                    <strong>{cutYMmList.map((v) => fmtMm(v)).join(" e ")} mm</strong> do topo — passe a lâmina no meio de
                    cada faixa branca. Cada panfleto fica com{" "}
                    <strong>≈{fmtMm(pxToMm(layout.gapXPx / 2))} mm</strong> (lat.) ×{" "}
                    <strong>≈{fmtMm(pxToMm(layout.gapYPx / 2))} mm</strong> (vert.) de borda branca na linha de corte.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Borda branca calculada de <strong>≈{fmtMm(pxToMm(layout.gapXPx))} mm</strong> (lateral) ×{" "}
                    <strong>≈{fmtMm(pxToMm(layout.gapYPx))} mm</strong> (vertical) ao redor de cada panfleto — o máximo
                    possível dentro do A4 mantendo o tamanho de corte exato.
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Margem externa: {fmtMm(pxToMm(layout.outerLeftPx))} mm (lat.) × {fmtMm(pxToMm(layout.outerTopPx))} mm
                  (topo) / {fmtMm(pxToMm(layout.outerBottomPx))} mm (base) — branco calculado para absorver a margem não
                  imprimível da impressora em todos os lados (validado em impressora real).
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border p-3.5">
              <Ruler className="mt-0.5 h-5 w-5 text-amber-600" aria-hidden />
              <div>
                <p className="text-sm font-medium">Precisão dimensional</p>
                <p className="text-sm text-muted-foreground">
                  Folha: {layout.pageWidthPx} × {layout.pageHeightPx} px = {A4.widthMm} × {A4.heightMm} mm exatos @ 300
                  DPI. Imprima em <strong>escala 100%</strong> (tamanho real), sem &quot;ajustar à página&quot;.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button size="lg" onClick={onContinue} className="bg-amber-600 text-white hover:bg-amber-700">
          Ir para exportação
          <ArrowRight className="h-5 w-5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
