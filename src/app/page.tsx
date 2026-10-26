"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Printer, RefreshCcw, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { StepNav } from "@/components/print/step-nav";
import { UploadPanel } from "@/components/print/upload-panel";
import { EnhancePanel } from "@/components/print/enhance-panel";
import { PreviewPanel } from "@/components/print/preview-panel";
import { ExportPanel } from "@/components/print/export-panel";
import {
  PRODUCTS,
  type ProductId,
} from "@/lib/print/constants";
import {
  analyzeArtwork,
  makeCanvas,
  type ImageAnalysis,
} from "@/lib/print/analysis";
import {
  preparePrintCanvas,
  applyEnhancements,
  recommendSettings,
  type EnhanceSettings,
  type FitMode,
} from "@/lib/print/enhance";
import {
  renderImposedSheet,
  computeLayout,
  DEFAULT_BOTTOM_GUARD_MM,
  type ImpositionLayout,
} from "@/lib/print/imposition";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Decodifica o arquivo enviado em um canvas no tamanho natural. */
async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Falha ao decodificar a imagem."));
      img.src = url;
    });
    const canvas = makeCanvas(img.naturalWidth, img.naturalHeight);
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Alternar tema claro/escuro"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="hidden h-5 w-5 dark:block" />
      <Moon className="h-5 w-5 dark:hidden" />
    </Button>
  );
}

export default function Home() {
  const [step, setStep] = useState(1);
  const [maxReached, setMaxReached] = useState(1);

  // Entrada
  const [product, setProduct] = useState<ProductId | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Pipeline
  const [analysis, setAnalysis] = useState<ImageAnalysis | null>(null);
  const [preparedCanvas, setPreparedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [settings, setSettings] = useState<EnhanceSettings | null>(null);
  const [enhancedCanvas, setEnhancedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [sheetCanvas, setSheetCanvas] = useState<HTMLCanvasElement | null>(null);
  /** Modo de enquadramento (cover/contain/stretch) — reamostra a partir do fonte. */
  const [fitMode, setFitMode] = useState<FitMode>("cover");
  /** Guarda de base (mm) para a margem não imprimível da impressora — propriedade da
   *  impressora, NÃO é resetada junto com a arte. */
  const [bottomGuardMm, setBottomGuardMm] = useState(DEFAULT_BOTTOM_GUARD_MM);

  const enhanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Canvas decodificado no tamanho natural — mantido para re-enquadrar sem re-decodificar. */
  const sourceRef = useRef<HTMLCanvasElement | null>(null);

  const spec = product ? PRODUCTS[product] : null;

  const resetDerived = useCallback(() => {
    setAnalysis(null);
    setPreparedCanvas(null);
    setSettings(null);
    setEnhancedCanvas(null);
    setSheetCanvas(null);
    setMaxReached(1);
    setStep(1);
    sourceRef.current = null;
  }, []);

  const handleProductChange = useCallback(
    (p: ProductId) => {
      setProduct(p);
      if (preparedCanvas) resetDerived();
    },
    [preparedCanvas, resetDerived],
  );

  const handleFileChange = useCallback(
    (f: File | null) => {
      setFile(f);
      if (preparedCanvas) resetDerived();
    },
    [preparedCanvas, resetDerived],
  );

  // ---- Etapa 1 → 2: decodifica, analisa e reamostra para 300 DPI ----
  const handleAnalyze = useCallback(async () => {
    if (!file || !spec) return;
    setAnalyzing(true);
    try {
      await tick();
      const source = await fileToCanvas(file);
      const result = analyzeArtwork(source, spec);
      const prepared = preparePrintCanvas(source, spec, fitMode);
      sourceRef.current = source;
      setAnalysis(result);
      setPreparedCanvas(prepared);
      setSettings(recommendSettings(result));
      setMaxReached(2);
      setStep(2);
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  }, [file, spec, fitMode]);

  // ---- Troca de enquadramento: re-prepara a geometria (o efeito com debounce re-trata os pixels) ----
  const handleFitModeChange = useCallback(
    (fit: FitMode) => {
      setFitMode(fit);
      if (settings) setSettings({ ...settings, fitMode: fit });
      if (sourceRef.current && spec) {
        setPreparedCanvas(preparePrintCanvas(sourceRef.current, spec, fit));
      }
    },
    [spec, settings],
  );

  // ---- Etapa 2: recalcula tratamento (com debounce para os sliders) ----
  useEffect(() => {
    if (!preparedCanvas || !analysis || !settings) return;
    if (enhanceTimer.current) clearTimeout(enhanceTimer.current);
    setEnhancing(true);
    enhanceTimer.current = setTimeout(async () => {
      await tick();
      try {
        const result = applyEnhancements(preparedCanvas, settings, analysis);
        setEnhancedCanvas(result.canvas);
      } catch (err) {
        console.error(err);
      } finally {
        setEnhancing(false);
      }
    }, 140);
    return () => {
      if (enhanceTimer.current) clearTimeout(enhanceTimer.current);
    };
  }, [preparedCanvas, analysis, settings]);

  // ---- Etapa 2 → 3: monta a folha imposta sempre que a arte tratada ou a guarda muda ----
  useEffect(() => {
    if (!enhancedCanvas || !spec) return;
    const { canvas } = renderImposedSheet(enhancedCanvas, spec, { bottomGuardMm });
    setSheetCanvas(canvas);
    setMaxReached((m) => Math.max(m, 4));
  }, [enhancedCanvas, spec, bottomGuardMm]);

  const layout: ImpositionLayout | null = useMemo(
    () => (spec ? computeLayout(spec, { bottomGuardMm }) : null),
    [spec, bottomGuardMm],
  );

  const goTo = useCallback((s: number) => {
    setStep(s);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 text-white shadow-sm">
              <Printer className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">ImpressA4</h1>
              <p className="text-xs text-muted-foreground">
                Tratamento de arte &amp; imposição A4 300 DPI para gráfica rápida
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <div className="mb-6">
          <StepNav current={step} maxReached={maxReached} onGo={goTo} />
        </div>

        <section aria-label="Conteúdo da etapa atual">
          {step === 1 && (
            <UploadPanel
              product={product}
              onProductChange={handleProductChange}
              file={file}
              onFileChange={handleFileChange}
              onAnalyze={handleAnalyze}
              processing={analyzing}
            />
          )}

          {step === 2 && spec && analysis && settings && preparedCanvas && (
            <EnhancePanel
              spec={spec}
              analysis={analysis}
              settings={settings}
              onSettingsChange={setSettings}
              fitMode={fitMode}
              onFitModeChange={handleFitModeChange}
              preparedCanvas={preparedCanvas}
              enhancedCanvas={enhancedCanvas}
              processing={enhancing}
              onContinue={() => goTo(3)}
              onResetSettings={() => analysis && setSettings(recommendSettings(analysis))}
            />
          )}

          {step === 3 && spec && layout && (
            <PreviewPanel
              spec={spec}
              layout={layout}
              sheetCanvas={sheetCanvas}
              onContinue={() => goTo(4)}
            />
          )}

          {step === 4 && spec && (
            <ExportPanel
              spec={spec}
              sheetCanvas={sheetCanvas}
              units={spec.unitsPerSheet}
              bottomGuardMm={bottomGuardMm}
              onBottomGuardChange={setBottomGuardMm}
            />
          )}
        </section>

        {step > 1 && (
          <div className="mt-6 flex justify-start">
            <Button variant="outline" onClick={() => goTo(step - 1)}>
              <RefreshCcw className="h-4 w-4" aria-hidden />
              Voltar
            </Button>
          </div>
        )}
      </main>

      {/* Footer fixo no fim da página */}
      <footer className="mt-auto border-t bg-background">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 text-center text-xs leading-relaxed text-muted-foreground">
          Processamento 100% local no navegador (Canvas + jsPDF + pdf-lib) · Folha A4 210 × 297 mm · 2480 × 3508 px @
          300 DPI · Imprima sempre em escala 100%
        </div>
      </footer>
    </div>
  );
}
