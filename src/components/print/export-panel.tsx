"use client";

import { useState } from "react";
import { FileDown, Loader2, CheckCircle2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { A4, fmtMm, pxToMm, type ProductSpec } from "@/lib/print/constants";
import { computeLayout } from "@/lib/print/imposition";
import { fmtBytes, exportSheetPdf, type PdfImageFormat } from "@/lib/print/pdf";
import { useToast } from "@/hooks/use-toast";

export function ExportPanel({
  spec,
  sheetCanvas,
  units,
}: {
  spec: ProductSpec;
  sheetCanvas: HTMLCanvasElement | null;
  units: number;
}) {
  const { toast } = useToast();
  const [format, setFormat] = useState<PdfImageFormat>("jpeg");
  const [quality, setQuality] = useState(95);
  const [filename, setFilename] = useState(`impressa4-${spec.id}`);
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  // Linhas de corte e folgas derivadas do layout (fonte única da matemática).
  const twoCut = spec.gapMode === "two-cut" ? computeLayout(spec) : null;
  const cutXMm = twoCut ? pxToMm((twoCut.colX[0] + twoCut.cellWidthPx + twoCut.colX[1]) / 2) : 0;
  const cutYMm = twoCut ? pxToMm((twoCut.rowY[0] + twoCut.cellHeightPx + twoCut.rowY[1]) / 2) : 0;
  const cutWhiteLatMm = twoCut ? pxToMm(twoCut.gapXPx / 2) : 0;
  const cutWhiteVertMm = twoCut ? pxToMm(twoCut.gapYPx / 2) : 0;

  const handleExport = async () => {
    if (!sheetCanvas || exporting) return;
    setExporting(true);
    setDone(null);
    try {
      // Deixa o browser pintar o estado de "gerando" antes do trabalho pesado
      await new Promise((r) => setTimeout(r, 50));
      const result = await exportSheetPdf(sheetCanvas, {
        filename: filename.trim() || "impressa4-folha",
        format,
        quality: quality / 100,
      });
      setDone(`${result.filename} (${fmtBytes(result.bytes)})`);
      toast({
        title: "PDF gerado com sucesso",
        description: `${result.filename} — pronto para levar à gráfica.`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Erro ao gerar o PDF",
        description: "Tente novamente ou reduza a resolução/formato da exportação.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Opções do arquivo</CardTitle>
          <CardDescription>PDF A4 com imagem embutida em 300 DPI ({A4.widthPx} × {A4.heightPx} px).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid gap-1.5">
            <Label htmlFor="fname">Nome do arquivo</Label>
            <Input id="fname" value={filename} onChange={(e) => setFilename(e.target.value)} placeholder="impressa4-folha" />
          </div>

          <div className="grid gap-2">
            <Label>Formato da imagem embutida</Label>
            <RadioGroup value={format} onValueChange={(v) => setFormat(v as PdfImageFormat)} className="grid gap-3 sm:grid-cols-2">
              <label
                htmlFor="fmt-jpeg"
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors has-[[data-state=checked]]:border-amber-600 has-[[data-state=checked]]:bg-amber-600/10"
              >
                <RadioGroupItem id="fmt-jpeg" value="jpeg" className="mt-0.5" />
                <span>
                  <span className="block text-sm font-semibold">JPEG (recomendado)</span>
                  <span className="block text-xs text-muted-foreground">Arquivo menor, ideal para artes com fotos. Qualidade {quality}%.</span>
                </span>
              </label>
              <label
                htmlFor="fmt-png"
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors has-[[data-state=checked]]:border-amber-600 has-[[data-state=checked]]:bg-amber-600/10"
              >
                <RadioGroupItem id="fmt-png" value="png" className="mt-0.5" />
                <span>
                  <span className="block text-sm font-semibold">PNG (sem perdas)</span>
                  <span className="block text-xs text-muted-foreground">Máxima fidelidade para textos e chapados. Arquivo maior.</span>
                </span>
              </label>
            </RadioGroup>
          </div>

          <div className={format !== "jpeg" ? "pointer-events-none opacity-50" : undefined}>
            <div className="mb-2 flex justify-between text-xs text-muted-foreground">
              <span>Qualidade JPEG</span>
              <span className="font-mono">{quality}%</span>
            </div>
            <Slider
              aria-label="Qualidade JPEG"
              value={[quality]}
              min={80}
              max={100}
              step={1}
              onValueChange={([v]) => setQuality(v)}
              disabled={format !== "jpeg"}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6">
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Checklist de impressão</CardTitle>
            <CardDescription>Instruções para a gráfica</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <Printer className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                Imprimir em <strong className="text-foreground">escala 100%</strong> (tamanho real), desativando
                &quot;ajustar à área imprimível&quot;.
              </li>
              {spec.gapMode === "two-cut" && (
                <li className="flex gap-2">
                  <Printer className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                  <span>
                    Impressora doméstica: ative <strong className="text-foreground">&quot;Sem margens&quot;</strong> (borda a
                    borda) — e mesmo assim a base da folha costuma ter ~2 mm não imprimíveis. O layout já reserva branco
                    extra na base para proteger o rodapé dos panfletos de baixo; mantenha a escala em 100%.
                  </span>
                </li>
              )}
              <li className="flex gap-2">
                <Printer className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                Papel A4 (210 × 297 mm), melhor qualidade de impressora, sem escalonamento do driver.
              </li>
              <li className="flex gap-2">
                <Printer className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                {spec.gapMode === "glued"
                  ? `Corte na guilhotina: separe tiras de 2 cartões (corte no meio do bloco) e depois corte cada tira a cada ${fmtMm(spec.heightMm)} mm.`
                  : spec.gapMode === "two-cut"
                    ? `Apenas 2 cortes na guilhotina: 1 vertical a ${fmtMm(cutXMm)} mm da lateral e 1 horizontal a ${fmtMm(cutYMm)} mm do topo — passe a lâmina no meio da faixa branca central. Cada peça sai com ≈${fmtMm(cutWhiteLatMm)} mm (lat.) × ≈${fmtMm(cutWhiteVertMm)} mm (vert.) de borda branca na linha de corte.`
                    : "Corte seguindo a borda branca ao redor de cada panfleto (guia de ≈3 mm a partir da borda da folha)."}
              </li>
              <li className="flex gap-2">
                <Printer className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                Cada folha contém <strong className="text-foreground">{units} unidades</strong> da arte (frente única).
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <Button size="lg" onClick={handleExport} disabled={!sheetCanvas || exporting} className="h-14 bg-amber-600 text-base font-semibold text-white hover:bg-amber-700">
              {exporting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Gerando PDF 300 DPI…
                </>
              ) : (
                <>
                  <FileDown className="h-5 w-5" aria-hidden />
                  Gerar e baixar PDF (300 DPI)
                </>
              )}
            </Button>
            {done && (
              <p className="flex items-center gap-2 rounded-lg border border-emerald-600/40 bg-emerald-600/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                Baixado: {done}
              </p>
            )}
            <p className="text-center text-xs text-muted-foreground">
              A geração acontece 100% no seu navegador — a arte do cliente não é enviada a nenhum servidor.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
