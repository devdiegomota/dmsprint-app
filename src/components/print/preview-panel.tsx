"use client";

import { Ruler, Grid3x3, Scissors, ArrowRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CanvasView } from "./canvas-view";
import { A4, fmtMm, pxToMm, type ProductSpec } from "@/lib/print/constants";
import type { ImpositionLayout } from "@/lib/print/imposition";

export function PreviewPanel({
  spec,
  layout,
  sheetCanvas,
  onContinue,
}: {
  spec: ProductSpec;
  layout: ImpositionLayout;
  sheetCanvas: HTMLCanvasElement | null;
  onContinue: () => void;
}) {
  // Linhas de corte = meio da faixa branca central de cada eixo (fonte única: layout).
  const cutXMm = pxToMm((layout.colX[0] + layout.cellWidthPx + layout.colX[1]) / 2);
  const cutYMm = pxToMm((layout.rowY[0] + layout.cellHeightPx + layout.rowY[1]) / 2);
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
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Borda branca calculada de <strong>≈{fmtMm(pxToMm(layout.gapXPx))} mm</strong> (lateral) ×{" "}
                    <strong>≈{fmtMm(pxToMm(layout.gapYPx))} mm</strong> (vertical) ao redor de cada panfleto — o máximo
                    possível dentro do A4 mantendo o tamanho de corte exato.
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Margem externa: {fmtMm(pxToMm(layout.outerLeftPx))} mm (lat.) × {fmtMm(pxToMm(layout.outerTopPx))} mm
                  (topo) / {fmtMm(pxToMm(layout.outerBottomPx))} mm (base) — a base leva branco extra porque é ali que a
                  margem não imprimível da impressora morde, mesmo no modo &quot;sem margens&quot;.
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
