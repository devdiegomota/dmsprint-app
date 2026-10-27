"use client";

import { useMemo, useState } from "react";
import { Gauge, ScanLine, Type, Contrast, Crop, Frame, Scaling, Loader2, RotateCcw, ArrowRight, TriangleAlert, Sparkles, Undo2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CanvasView } from "./canvas-view";
import { cn } from "@/lib/utils";
import { fmtMm, MM_PER_INCH, type ProductSpec } from "@/lib/print/constants";
import type { ImageAnalysis } from "@/lib/print/analysis";
import { framingInfo, type EnhanceSettings, type FitMode } from "@/lib/print/enhance";
import {
  planAiPlacement,
  buildAiInput,
  cropAiResult,
  dataUrlToCanvas,
  restoreWithAI,
} from "@/lib/print/ai-restore";

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
  className,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  detail: string;
  level: "good" | "warn" | "bad";
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border bg-card p-3.5", className)}>
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

const FIT_OPTIONS: { value: FitMode; icon: React.ReactNode; label: string; desc: string }[] = [
  {
    value: "cover",
    icon: <Crop className="h-4 w-4" aria-hidden />,
    label: "Preencher o corte (recorta sobras)",
    desc: "Escala até cobrir todo o tamanho de corte, centralizada — nunca distorce. Padrão para artes prontas.",
  },
  {
    value: "contain",
    icon: <Frame className="h-4 w-4" aria-hidden />,
    label: "Conter (bordas brancas)",
    desc: "Arte inteira visível, sem distorção; o restante vira margem branca. Ideal para logos e quadros.",
  },
  {
    value: "stretch",
    icon: <Scaling className="h-4 w-4" aria-hidden />,
    label: "Esticar para o corte exato",
    desc: "Preenche esticando — use apenas se a arte já estiver na proporção exata do produto.",
  },
];

export function EnhancePanel({
  spec,
  analysis,
  settings,
  onSettingsChange,
  fitMode,
  onFitModeChange,
  preparedCanvas,
  enhancedCanvas,
  processing,
  onContinue,
  onResetSettings,
  sourceCanvas,
  aiActive,
  onAiRestored,
  onAiUndo,
}: {
  spec: ProductSpec;
  analysis: ImageAnalysis;
  settings: EnhanceSettings;
  onSettingsChange: (s: EnhanceSettings) => void;
  fitMode: FitMode;
  onFitModeChange: (f: FitMode) => void;
  preparedCanvas: HTMLCanvasElement;
  enhancedCanvas: HTMLCanvasElement | null;
  processing: boolean;
  onContinue: () => void;
  onResetSettings: () => void;
  /** Arte na resolução natural (pós-recorte) — fonte da restauração por IA. */
  sourceCanvas: HTMLCanvasElement;
  /** true enquanto a fonte do pipeline é a arte restaurada pela IA (habilita desfazer). */
  aiActive: boolean;
  onAiRestored: (canvas: HTMLCanvasElement) => void;
  onAiUndo: () => void;
}) {
  const update = (patch: Partial<EnhanceSettings>) => onSettingsChange({ ...settings, ...patch });

  // ---- Restauração com IA (opcional — para artes de baixa resolução) ----
  const [aiState, setAiState] = useState<"idle" | "working" | "error">("idle");
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiStats, setAiStats] = useState<{ before: number; after: number } | null>(null);

  // Ganho estimado: mesmo cálculo de DPI efetivo de analyzeArtwork, aplicado ao
  // canvas que a IA devolveria (arte contida no tamanho-alvo, sem letterbox).
  const aiPlan = useMemo(
    () => planAiPlacement(sourceCanvas.width, sourceCanvas.height),
    [sourceCanvas],
  );
  const cutWIn = spec.widthMm / MM_PER_INCH;
  const cutHIn = spec.heightMm / MM_PER_INCH;
  const aiDpi = Math.round(Math.min(aiPlan.drawW / cutWIn, aiPlan.drawH / cutHIn));
  const aiGain = aiDpi - analysis.effectiveDpi;
  const aiWorthIt = aiGain >= 5;

  // Visão do card: "working"/"error" vêm do estado local; "done" é derivado de
  // aiActive (sobrevive à navegação entre etapas sem estado extra).
  const aiView = aiState === "working" ? "working" : aiState === "error" ? "error" : aiActive ? "done" : "idle";

  async function handleAiRestore() {
    if (aiState === "working") return;
    setAiState("working");
    setAiError(null);
    try {
      await new Promise((r) => setTimeout(r, 30)); // deixa o spinner pintar antes do trabalho síncrono
      const input = buildAiInput(sourceCanvas, aiPlan);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 180_000);
      let dataUrl: string;
      try {
        dataUrl = await restoreWithAI(input, aiPlan.size, controller.signal);
      } finally {
        clearTimeout(timer);
      }
      const aiCanvas = await dataUrlToCanvas(dataUrl);
      const restored = cropAiResult(aiCanvas, aiPlan);
      const afterDpi = Math.round(Math.min(restored.width / cutWIn, restored.height / cutHIn));
      setAiStats({ before: analysis.effectiveDpi, after: afterDpi });
      onAiRestored(restored);
      setAiState("idle");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setAiError("Tempo esgotado (3 minutos). Verifique a conexão e tente novamente.");
      } else {
        setAiError(err instanceof Error ? err.message : "Falha inesperada na restauração.");
      }
      setAiState("error");
    }
  }

  const sharpLevel = analysis.sharpnessScore < 45 ? "bad" : analysis.sharpnessScore < 65 ? "warn" : "good";
  const resLevel = analysis.effectiveDpi >= 300 ? "good" : analysis.effectiveDpi >= 200 ? "warn" : "bad";
  const textLevel = analysis.thinTextScore >= 70 ? "bad" : analysis.thinTextScore >= 45 ? "warn" : "good";

  const framing = framingInfo(analysis.naturalWidth, analysis.naturalHeight, spec);
  const ratioLevel = framing.ratioMatches ? "good" : framing.ratioDiff <= 0.08 ? "warn" : "bad";
  const axisLabel = (axis: "x" | "y") => (axis === "x" ? "da largura" : "da altura");
  const framingWarning = framing.ratioMatches
    ? "Proporção da arte compatível com o produto — os três modos produzem o mesmo resultado."
    : fitMode === "cover"
      ? `A arte é proporcionalmente diferente do produto — no modo Preencher, ≈${framing.cropPct.toFixed(0)}% ${axisLabel(framing.cropAxis!)} serão recortados (corte central). Prefira "Conter" para mostrar a arte inteira.`
      : fitMode === "contain"
        ? `A arte é proporcionalmente diferente do produto — no modo Conter, surgem bordas brancas de ≈${framing.barPct.toFixed(0)}% ${axisLabel(framing.barAxis!)} em cada lado.`
        : `A arte será esticada ≈${framing.stretchPct.toFixed(0)}% ${axisLabel(framing.stretchAxis!)} — textos e logotipos podem ficar visivelmente deformados. Prefira "Preencher" ou "Conter".`;

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
            <MetricCard
              className="sm:col-span-2"
              icon={<Frame className="h-5 w-5" aria-hidden />}
              title="Proporção da arte"
              value={`${framing.srcRatio.toFixed(2)} : 1 · destino ${framing.targetRatio.toFixed(2)} : 1`}
              detail={
                framing.ratioMatches
                  ? "Compatível com o tamanho de corte — sem recorte nem margens extras."
                  : `Difere do corte ${fmtMm(spec.widthMm)} × ${fmtMm(spec.heightMm)} mm — escolha o enquadramento abaixo para evitar distorção.`
              }
              level={ratioLevel}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Restauração com IA</CardTitle>
            <CardDescription>
              Recria a arte em alta nitidez preservando composição, cores e textos — indicado para fotos de baixa
              resolução (ex.: foto de WhatsApp). Nesta etapa a arte é enviada para processamento em nuvem; todo o
              resto do fluxo segue 100% local no navegador.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {aiView === "working" ? (
              <div className="flex items-center gap-3 rounded-lg border border-amber-600/40 bg-amber-600/10 p-4 text-sm">
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-amber-600" aria-hidden />
                <div>
                  <p className="font-medium">Recriando a arte em alta nitidez…</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Pode levar até 1 minuto — não feche nem recarregue a página.
                  </p>
                </div>
              </div>
            ) : aiView === "done" ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3 rounded-lg border border-emerald-600/40 bg-emerald-600/10 p-4 text-sm">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                  <div>
                    <p className="font-medium text-emerald-700 dark:text-emerald-400">
                      Arte restaurada{aiStats ? `: ≈${aiStats.before} DPI → ≈${aiStats.after} DPI` : ""}.
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      Diagnóstico e tratamento atualizados automaticamente — compare as pré-visualizações ao lado.
                      Confira textos e números no resultado antes de imprimir.
                    </p>
                  </div>
                </div>
                <div>
                  <Button variant="outline" size="sm" onClick={onAiUndo}>
                    <Undo2 className="h-4 w-4" aria-hidden />
                    Desfazer restauração
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    onClick={handleAiRestore}
                    disabled={!aiWorthIt}
                    className="bg-amber-600 text-white hover:bg-amber-700"
                  >
                    <Sparkles className="h-4 w-4" aria-hidden />
                    Restaurar com IA
                  </Button>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {aiWorthIt
                      ? `Resolução estimada: ≈${analysis.effectiveDpi} DPI hoje → ≈${aiDpi} DPI após a restauração.`
                      : `Sem ganho estimado: a arte já está em ≈${analysis.effectiveDpi} DPI e a IA entrega no máximo ≈${aiDpi} DPI para o corte de ${fmtMm(spec.widthMm)} × ${fmtMm(spec.heightMm)} mm.`}
                  </p>
                </div>
                {aiView === "error" && (
                  <p
                    role="alert"
                    className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive"
                  >
                    <TriangleAlert className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
                    {aiError}
                  </p>
                )}
              </div>
            )}
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
            {/* Enquadramento (geometria — nunca distorce em cover/contain) */}
            <div className="rounded-lg border p-4">
              <Label className="text-sm font-semibold">Enquadramento no tamanho de corte</Label>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Define como a arte ocupa o corte de {fmtMm(spec.widthMm)} × {fmtMm(spec.heightMm)} mm. Os modos
                "Preencher" e "Conter" preservam a proporção original — a imagem nunca fica esticada.
              </p>
              <RadioGroup
                value={fitMode}
                onValueChange={(v) => onFitModeChange(v as FitMode)}
                className="mt-3 grid gap-2"
                aria-label="Modo de enquadramento"
              >
                {FIT_OPTIONS.map((opt) => (
                  <Label
                    key={opt.value}
                    htmlFor={`fit-${opt.value}`}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors font-normal",
                      fitMode === opt.value
                        ? "border-amber-600 bg-amber-600/10 ring-1 ring-amber-600"
                        : "hover:bg-muted/60",
                    )}
                  >
                    <RadioGroupItem id={`fit-${opt.value}`} value={opt.value} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        {opt.icon}
                        {opt.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{opt.desc}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
              <p
                role={framing.ratioMatches ? undefined : fitMode === "stretch" ? "alert" : "status"}
                className={cn(
                  "mt-3 rounded-lg border p-3 text-xs leading-relaxed",
                  framing.ratioMatches
                    ? "border-border bg-muted/60 text-muted-foreground"
                    : fitMode === "stretch"
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : "border-amber-600/40 bg-amber-600/10 text-amber-700 dark:text-amber-400",
                )}
              >
                {!framing.ratioMatches && <TriangleAlert className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />}
                {framingWarning}
              </p>
            </div>

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

      {/* Coluna direita: antes/depois — sticky: acompanha a rolagem enquanto os controles
          da esquerda são ajustados (a coluna esquerda é mais alta que esta) */}
      <div className="flex flex-col gap-6 self-start lg:sticky lg:top-20">
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
