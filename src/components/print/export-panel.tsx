"use client";

import { useState } from "react";
import { FileDown, Loader2, CheckCircle2, Printer, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { A4, fmtMm, pxToMm, type ProductSpec } from "@/lib/print/constants";
import { computeLayout, MAX_BOTTOM_GUARD_MM } from "@/lib/print/imposition";
import { fmtBytes, exportSheetPdf, type PdfImageFormat } from "@/lib/print/pdf";
import { useToast } from "@/hooks/use-toast";

export function ExportPanel({
  spec,
  sheetCanvas,
  units,
  bottomGuardMm,
  onBottomGuardChange,
  cutLine,
  onCutLineChange,
}: {
  spec: ProductSpec;
  sheetCanvas: HTMLCanvasElement | null;
  units: number;
  /** Guarda de base atual (mm) — controlada no page.tsx, compartilhada com o preview. */
  bottomGuardMm: number;
  onBottomGuardChange: (mm: number) => void;
  /** Linha de corte fina — controlada no page.tsx, compartilhada com o preview. */
  cutLine: boolean;
  onCutLineChange: (on: boolean) => void;
}) {
  const { toast } = useToast();
  const [format, setFormat] = useState<PdfImageFormat>("jpeg");
  const [quality, setQuality] = useState(95);
  const [filename, setFilename] = useState(`impressa4-${spec.id}`);
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  // Linhas de corte e folgas derivadas do layout (fonte única da matemática).
  const twoCut = spec.gapMode === "two-cut" ? computeLayout(spec, { bottomGuardMm }) : null;
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
                    borda) — e mesmo assim a base da folha costuma ter de 1 a 3 mm não imprimíveis (varia por modelo). O
                    layout já reserva branco extra na base para proteger o rodapé dos panfletos de baixo; se ainda
                    morder a arte, aumente o <strong className="text-foreground">ajuste para a sua impressora</strong> no
                    bloco abaixo e gere o PDF novamente.
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
              {cutLine && (
                <li className="flex gap-2">
                  <Scissors className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                  <span>
                    <strong className="text-foreground">Linha de corte fina</strong> impressa na borda de cada peça (fio
                    cinza-claro de ≈0,17 mm):{" "}
                    {spec.gapMode === "glued"
                      ? `corte exatamente sobre a linha — cada cartão sai com ${fmtMm(spec.widthMm)} × ${fmtMm(spec.heightMm)} mm e as linhas também marcam o limite do bloco para aparar as bordas externas.`
                      : "siga cortando no meio da faixa branca como de costume — as linhas cinza marcam a borda exata da arte de cada peça."}
                  </span>
                </li>
              )}
            </ul>

            {spec.gapMode === "two-cut" && (
              <div className="mt-4 rounded-lg border bg-muted/40 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="bottom-guard" className="text-sm font-semibold">
                    Ajuste para a sua impressora
                  </Label>
                  <span className="font-mono text-sm text-foreground">
                    {bottomGuardMm.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mm de
                    branco na base
                  </span>
                </div>
                <Slider
                  id="bottom-guard"
                  aria-label="Branco extra na base da folha para compensar a margem não imprimível da impressora"
                  value={[bottomGuardMm]}
                  min={0}
                  max={MAX_BOTTOM_GUARD_MM}
                  step={0.25}
                  onValueChange={([v]) => onBottomGuardChange(v)}
                  className="mt-3"
                />
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Cada impressora tem uma zona não imprimível diferente na base. Se, mesmo com &quot;Sem margens&quot; e
                  escala 100%, a arte ainda for mordida embaixo, suba este valor em passos de 0,5 mm e gere o PDF de
                  novo — o conteúdo sobe na folha e o branco da base engorda (o topo mantém no mínimo 0,5 mm). As duas
                  linhas de corte da guilhotina acompanham o ajuste automaticamente.
                </p>
              </div>
            )}

            <div className="mt-4 rounded-lg border bg-muted/40 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor="cut-line" className="text-sm font-semibold">
                    Linha de corte para fundos claros
                  </Label>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    Desenha um fio cinza-claro quase invisível (≈0,17 mm) exatamente na borda de cada{" "}
                    {spec.gapMode === "glued" ? "cartão" : "peça"} — resolve o corte de artes com fundo branco/claro, em
                    que não se enxerga onde a guilhotina deve passar. O fio é impresso dentro da medida: o tamanho de
                    corte continua exato.
                  </p>
                </div>
                <Switch
                  id="cut-line"
                  checked={cutLine}
                  onCheckedChange={onCutLineChange}
                  className="mt-0.5"
                  aria-label="Ativar linha de corte para fundos claros"
                />
              </div>
            </div>
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
