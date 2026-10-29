"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import { RefreshCcw, Moon, Sun } from "lucide-react";
import logoLight from "@/assets/dms-print-logo.png";
import logoDark from "@/assets/dms-print-logo-dark.png";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { StepNav } from "@/components/print/step-nav";
import { UploadPanel } from "@/components/print/upload-panel";
import { CropPanel } from "@/components/print/crop-panel";
import { EnhancePanel } from "@/components/print/enhance-panel";
import { PreviewPanel } from "@/components/print/preview-panel";
import { ExportPanel } from "@/components/print/export-panel";
import {
  PRODUCTS,
  type ProductId,
} from "@/lib/print/constants";
import {
  renderImposedSheet,
  computeLayout,
  DEFAULT_BOTTOM_GUARD_MM,
  DEFAULT_CUT_LINE,
  type ImpositionLayout,
  type CutLineConfig,
} from "@/lib/print/imposition";
import {
  analyzeArtwork,
  makeCanvas,
  type ImageAnalysis,
} from "@/lib/print/analysis";
import type { CropSession } from "@/lib/print/crop";
import {
  preparePrintCanvas,
  applyEnhancements,
  recommendSettings,
  type EnhanceSettings,
  type FitMode,
} from "@/lib/print/enhance";

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
  /** Linha de corte fina na borda de cada peça (espessura e cor personalizáveis na
   *  etapa 4) — para artes com fundo branco/claro, em que o operador não enxerga
   *  onde cortar na guilhotina. */
  const [cutLine, setCutLine] = useState<CutLineConfig>(DEFAULT_CUT_LINE);

  const enhanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Canvas decodificado no tamanho natural — mantido para re-enquadrar sem re-decodificar.
   *  Após um recorte, passa a apontar para a arte recortada (o pipeline consome este). */
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  /** Canvas decodificado ORIGINAL do arquivo — base para re-recortar de novo (nunca mutado). */
  const rawSourceRef = useRef<HTMLCanvasElement | null>(null);
  /** Rascunho da sessão de recorte — sobrevive à navegação entre etapas. */
  const [cropSession, setCropSession] = useState<CropSession | null>(null);
  /** Sessão de recorte já consumida pelo pipeline (evita re-análise desnecessária). */
  const cropAppliedRef = useRef<{ session: CropSession; canvas: HTMLCanvasElement } | null>(null);
  /** Arte da fonte ANTES da restauração por IA — base do "Desfazer restauração". */
  const preAiSourceRef = useRef<HTMLCanvasElement | null>(null);
  /** true enquanto a fonte do pipeline é a arte restaurada pela IA. */
  const [aiActive, setAiActive] = useState(false);

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
    rawSourceRef.current = null;
    cropAppliedRef.current = null;
    preAiSourceRef.current = null;
    setAiActive(false);
    setCropSession(null);
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

  // ---- Etapa 1 → 2: decodifica, analisa e vai para o recorte (etapa 2) ----
  const handleAnalyze = useCallback(async () => {
    if (!file || !spec) return;
    setAnalyzing(true);
    try {
      await tick();
      const source = await fileToCanvas(file);
      const result = analyzeArtwork(source, spec);
      const prepared = preparePrintCanvas(source, spec, fitMode);
      rawSourceRef.current = source;
      sourceRef.current = source;
      cropAppliedRef.current = null;
      setCropSession(null);
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

  // ---- Etapa 3 → 4: monta a folha imposta sempre que a arte tratada, a guarda ou a linha de corte mudam ----
  useEffect(() => {
    if (!enhancedCanvas || !spec) return;
    const { canvas } = renderImposedSheet(enhancedCanvas, spec, { bottomGuardMm, cutLine });
    setSheetCanvas(canvas);
    setMaxReached((m) => Math.max(m, 5));
  }, [enhancedCanvas, spec, bottomGuardMm, cutLine]);

  const layout: ImpositionLayout | null = useMemo(
    () => (spec ? computeLayout(spec, { bottomGuardMm }) : null),
    [spec, bottomGuardMm],
  );

  const goTo = useCallback((s: number) => {
    setStep(s);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // ---- Etapa 2 → 3: aplica (ou não) o recorte/rotação e segue para o tratamento ----
  const handleCropApply = useCallback(
    (result: HTMLCanvasElement | null, session: CropSession | null) => {
      if (!spec) return;
      const applied = cropAppliedRef.current;
      if (!result || !session) {
        // Nada a aplicar — se havia recorte (ou restauração IA) no pipeline, reverte para a arte original.
        if (rawSourceRef.current && (applied || preAiSourceRef.current)) {
          const a = analyzeArtwork(rawSourceRef.current, spec);
          sourceRef.current = rawSourceRef.current;
          setAnalysis(a);
          setSettings(recommendSettings(a));
          setPreparedCanvas(preparePrintCanvas(rawSourceRef.current, spec, fitMode));
          cropAppliedRef.current = null;
        }
        preAiSourceRef.current = null;
        setAiActive(false);
        goTo(3);
        return;
      }
      const same =
        applied &&
        applied.session.rotation % 360 === session.rotation % 360 &&
        Math.abs(applied.session.rect.x - session.rect.x) <= 0.5 &&
        Math.abs(applied.session.rect.y - session.rect.y) <= 0.5 &&
        Math.abs(applied.session.rect.w - session.rect.w) <= 0.5 &&
        Math.abs(applied.session.rect.h - session.rect.h) <= 0.5;
      if (!same) {
        const a = analyzeArtwork(result, spec);
        sourceRef.current = result;
        setAnalysis(a);
        setSettings(recommendSettings(a));
        setPreparedCanvas(preparePrintCanvas(result, spec, fitMode));
        cropAppliedRef.current = { session, canvas: result };
        // Novo recorte parte da arte original — restaura a base da IA (invalida o resultado anterior).
        preAiSourceRef.current = null;
        setAiActive(false);
      }
      goTo(3);
    },
    [spec, fitMode, goTo],
  );

  // ---- Restauração por IA: troca a fonte do pipeline pela arte recriada (ou desfaz) ----
  // Mesmo padrão do recorte aplicado: nova análise → novas recomendações → re-enquadramento;
  // o efeito com debounce re-trata os pixels e a folha se remonta sozinha.
  const handleAiRestored = useCallback(
    (restored: HTMLCanvasElement) => {
      if (!spec) return;
      if (!preAiSourceRef.current) preAiSourceRef.current = sourceRef.current;
      const a = analyzeArtwork(restored, spec);
      sourceRef.current = restored;
      setAnalysis(a);
      setSettings(recommendSettings(a));
      setPreparedCanvas(preparePrintCanvas(restored, spec, fitMode));
      setAiActive(true);
    },
    [spec, fitMode],
  );

  const handleAiUndo = useCallback(() => {
    if (!spec || !preAiSourceRef.current) return;
    const src = preAiSourceRef.current;
    const a = analyzeArtwork(src, spec);
    sourceRef.current = src;
    setAnalysis(a);
    setSettings(recommendSettings(a));
    setPreparedCanvas(preparePrintCanvas(src, spec, fitMode));
    preAiSourceRef.current = null;
    setAiActive(false);
  }, [spec, fitMode]);

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <h1 className="flex items-center">
              <span className="sr-only">DMS Print</span>
              <NextImage
                src={logoLight}
                alt=""
                priority
                className="h-11 w-auto dark:hidden"
              />
              <NextImage
                src={logoDark}
                alt=""
                priority
                className="hidden h-11 w-auto dark:block"
              />
            </h1>
            <div className="hidden border-l pl-3 sm:block">
              <p className="text-xs leading-snug text-muted-foreground">
                Tratamento de arte &amp; imposição A4 300 DPI
                <br />
                para gráfica rápida
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

          {step === 2 && spec && rawSourceRef.current && (
            <CropPanel
              source={rawSourceRef.current}
              spec={spec}
              session={cropSession}
              onSessionChange={setCropSession}
              onApply={handleCropApply}
            />
          )}

          {step === 3 && spec && analysis && settings && preparedCanvas && sourceRef.current && (
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
              onContinue={() => goTo(4)}
              onResetSettings={() => analysis && setSettings(recommendSettings(analysis))}
              sourceCanvas={sourceRef.current}
              aiActive={aiActive}
              onAiRestored={handleAiRestored}
              onAiUndo={handleAiUndo}
            />
          )}

          {step === 4 && spec && layout && (
            <PreviewPanel
              spec={spec}
              layout={layout}
              sheetCanvas={sheetCanvas}
              cutLine={cutLine}
              onCutLineChange={setCutLine}
              onContinue={() => goTo(5)}
            />
          )}

          {step === 5 && spec && (
            <ExportPanel
              spec={spec}
              sheetCanvas={sheetCanvas}
              units={spec.unitsPerSheet}
              bottomGuardMm={bottomGuardMm}
              onBottomGuardChange={setBottomGuardMm}
              cutLine={cutLine}
              onCutLineChange={setCutLine}
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
