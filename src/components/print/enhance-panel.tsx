"use client";

import { Gauge, ScanLine, Type, Contrast, Loader2, RotateCcw, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CanvasView } from "./canvas-view";
import { cn } from "@/lib/utils";
import { fmtMm, type ProductSpec } from "@/lib/print/constants";
import type { ImageAnalysis } from "@/lib/print/analysis";
import type { EnhanceSettings } from "@/lib/print/enhance";

function MetricBadge({ level }: { level: "good" | "warn" | "bad" }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        level === "good" && "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400",
        level === "warn" && "bg-amber-600/15 text-amber-700 dark:text-amber-400",
        level === "bad" && "bg-red-600/15 text-red-700 dark:text-red-400",
      )}
    >
      {level === "good" ? "OK" : level === "warn" ? "Atenção" : "Crítico"}
    </Badge>
  );
}

function MetricCard({
  icon,
  title,
  value,
  detail,
  level,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  detail: string;
  level: "good" | "warn" | "bad";
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-3.5">
      <div className="mt-0.5 text-amber-600">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{title}</p>
          <MetricBadge level={level} />
        </div>
        <p className="mt-0.5 text-lg font-semibold leading-tight">{value}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

export function EnhancePanel({
  spec,
  analysis,
  settings,
  onSettingsChange,
  preparedCanvas,
  enhancedCanvas,
  processing,
  onContinue,
  onResetSettings,
}: {
  spec: ProductSpec;
  analysis: ImageAnalysis;
  settings: EnhanceSettings;
  onSettingsChange: (s: EnhanceSettings) => void;
  preparedCanvas: HTMLCanvasElement;
  enhancedCanvas: HTMLCanvasElement | null;
  processing: boolean;
  onContinue: () => void;
  onResetSettings: () => void;
}) {
  const update = (patch: Partial<EnhanceSettings>) => onSettingsChange({ ...settings, ...patch });

  const sharpLevel = analysis.sharpnessScore < 45 ? "bad" : analysis.sharpnessScore < 65 ? "warn" : "good";
  const resLevel = analysis.effectiveDpi >= 300 ? "good" : analysis.effectiveDpi >= 200 ? "warn" : "bad";
  const textLevel = analysis.thinTextScore >= 70 ? "bad" : analysis.thinTextScore >= 45 ? "warn" : "good";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
      {/* Coluna esquerda: análise + controles */}
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Diagnóstico da arte</CardTitle>
            <CardDescription>
              {spec.name} · destino {fmtMm(spec.widthMm)} × {fmtMm(spec.heightMm)} mm @ 300 DPI — fonte:{" "}
              {analysis.naturalWidth} × {analysis.naturalHeight} px ({analysis.effectiveDpi} DPI efetivos)
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <MetricCard
              icon={<Gauge className="h-5 w-5" aria-hidden />}
              title="Nitidez"
              value={`${analysis.sharpnessScore}/100`}
              detail={
                analysis.isBlurry
                  ? "Imagem com baixa nitidez — máscara de contraste aplicada automaticamente."
                  : "Nitidez adequada; foi aplicado um realce leve padrão de impressão."
              }
              level={sharpLevel}
            />
            <MetricCard
              icon={<ScanLine className="h-5 w-5" aria-hidden />}
              title="Resolução efetiva"
              value={`${analysis.effectiveDpi} DPI`}
              detail={
                analysis.isLowRes
                  ? "Menor que 300 DPI — a arte foi reamostrada e realçada para o tamanho de corte."
                  : "Resolução suficiente para impressão offset/digital sem perda."
              }
              level={resLevel}
            />
            <MetricCard
              icon={<Type className="h-5 w-5" aria-hidden />}
              title="Texto fino detectado"
              value={`${analysis.thinTextScore}%`}
              detail={
                analysis.likelyThinText
                  ? "Traços finos prováveis — reforço morfológico recomendado para não sumirem na impressão."
                  : "Sem indícios fortes de texto fino; reforço leve aplicado como segurança."
              }
              level={textLevel}
            />
            <MetricCard
              icon={<Contrast className="h-5 w-5" aria-hidden />}
              title="Fundo predominante"
              value={analysis.lightBackground ? "Claro" : "Escuro"}
              detail={
                analysis.lightBackground
                  ? "Reforço usará dilação do escuro (engrossa texto preto/escuro)."
                  : "Reforço usará dilação do claro (engrossa texto branco/claro)."
              }
              level="good"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>Tratamento aplicado</CardTitle>
              <CardDescription>Ajuste fino em tempo real — a pré-visualização ao lado atualiza automaticamente.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={onResetSettings}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              Automático
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {/* Nitidez */}
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="sw-sharpen" className="text-sm font-semibold">
                  Máscara de contraste (unsharp mask)
                </Label>
                <Switch
                  id="sw-sharpen"
                  checked={settings.sharpenEnabled}
                  onCheckedChange={(v) => update({ sharpenEnabled: v })}
                />
              </div>
              <div className={cn("mt-4 grid gap-5", !settings.sharpenEnabled && "pointer-events-none opacity-50")}>
                <div>
                  <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                    <span>Intensidade</span>
                    <span className="font-mono">{settings.sharpenAmount.toFixed(2)}</span>
                  </div>
                  <Slider
                    aria-label="Intensidade da nitidez"
                    value={[settings.sharpenAmount]}
                    min={0}
                    max={1.5}
                    step={0.05}
                    onValueChange={([v]) => update({ sharpenAmount: v })}
                  />
                </div>
                <div>
                  <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                    <span>Raio (px @300 DPI)</span>
                    <span className="font-mono">{settings.sharpenRadius}px</span>
                  </div>
                  <Slider
                    aria-label="Raio da nitidez"
                    value={[settings.sharpenRadius]}
                    min={1}
                    max={4}
                    step={1}
                    onValueChange={([v]) => update({ sharpenRadius: v })}
                  />
                </div>
              </div>
            </div>

            {/* Reforço de texto */}
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="sw-text" className="text-sm font-semibold">
                  Reforço de textos finos (dilação morfológica)
                </Label>
                <Switch
                  id="sw-text"
                  checked={settings.textReinforceEnabled}
                  onCheckedChange={(v) => update({ textReinforceEnabled: v })}
                />
              </div>
              <div className={cn("mt-4 grid gap-5", !settings.textReinforceEnabled && "pointer-events-none opacity-50")}>
                <div>
                  <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                    <span>Força do engrossamento</span>
                    <span className="font-mono">{Math.round(settings.textStrength * 100)}%</span>
                  </div>
                  <Slider
                    aria-label="Força do reforço de texto"
                    value={[settings.textStrength]}
                    min={0}
                    max={1}
                    step={0.05}
                    onValueChange={([v]) => update({ textStrength: v })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Direção do reforço</Label>
                  <Select value={settings.textMode} onValueChange={(v) => update({ textMode: v as EnhanceSettings["textMode"] })}>
                    <SelectTrigger aria-label="Direção do reforço">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Automático (detecta pelo fundo)</SelectItem>
                      <SelectItem value="dark-on-light">Texto escuro em fundo claro</SelectItem>
                      <SelectItem value="light-on-dark">Texto claro em fundo escuro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Coluna direita: antes/depois */}
      <div className="flex flex-col gap-6">
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Antes × Depois</CardTitle>
            <CardDescription>
              Comparação no tamanho final de impressão ({preparedCanvas.width} × {preparedCanvas.height} px @ 300 DPI).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <figure className="relative">
              <figcaption className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Original (reamostrado)</figcaption>
              <div className="overflow-hidden rounded-lg border bg-[repeating-conic-gradient(#f4f4f5_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px]">
                <CanvasView canvas={preparedCanvas} ariaLabel="Arte original reamostrada" />
              </div>
            </figure>
            <figure className="relative">
              <figcaption className="mb-1.5 text-xs font-medium uppercase tracking-wide text-amber-600">
                Tratada para impressão
              </figcaption>
              <div className="relative overflow-hidden rounded-lg border bg-[repeating-conic-gradient(#f4f4f5_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px]">
                {enhancedCanvas ? (
                  <CanvasView canvas={enhancedCanvas} ariaLabel="Arte tratada" />
                ) : (
                  <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Processando…</div>
                )}
                {processing && (
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/60 text-sm font-medium backdrop-blur-[2px]">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Processando…
                  </div>
                )}
              </div>
            </figure>
          </CardContent>
        </Card>
        <Button size="lg" onClick={onContinue} disabled={!enhancedCanvas || processing} className="bg-amber-600 text-white hover:bg-amber-700">
          Montar folha A4
          <ArrowRight className="h-5 w-5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
