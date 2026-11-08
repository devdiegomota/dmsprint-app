"use client";

/**
 * Calendário de Mesa Tenda (Tasks 28–31) — fluxo próprio, fora da imposição.
 *
 * Dois formatos no mesmo fluxo:
 *  - "Tenda A4 única" (padrão): UM calendário completo por folha A4 impressa
 *    FRENTE-E-VERSO (virar pela borda longa) — verso (Jul–Dez, de cabeça para
 *    baixo) + frente (Jan–Jun) + aba do pé, em 1 página. Dobra na cumeeira,
 *    dobra no pé, cola a aba por dentro → triângulo com pé firme na mesa.
 *    Pé ajustável (45–80 mm) e largura da faixa da arte ajustável (45–100 mm,
 *    Task 33). Sem marcas de dobra e sem página de instruções
 *    (a DMS entrega as tendas já dobradas).
 *  - "13 cartões": capa + 12 meses, 1 tenda por folha (mês seguinte no verso).
 *
 * Nos dois: arte do cliente + grade gerada automaticamente (feriados nacionais
 * BR, domingos destacados), cor dos textos ajustável — extraída da arte no
 * upload, com paleta de cores da arte e conta-gotas no editor —, prévia ao
 * vivo, PDF 300 DPI e envio à Nuvem DMS. No A4 único a arte de cada face tem
 * editor de posicionamento (arrastar/zoom/preencher/enquadrar) com a mesma
 * matemática do PDF.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CloudUpload,
  Loader2,
  Printer,
  Upload,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useDeviceCode } from "@/hooks/use-nuvem";
import { ensureDeviceCode } from "@/lib/nuvem/device-code";
import { friendlyFirebaseError, uploadNuvemPdf } from "@/lib/nuvem/store";
import {
  DEFAULT_STYLE,
  PANEL_COUNT,
  composeFace,
  extractArtPalette,
  extractDominantColor,
  luminance,
  panelLabel,
  type CalendarStyle,
} from "@/lib/calendar/compose";
import { exportCalendarPdf, exportTendaA4Pdf } from "@/lib/calendar/pdf";
import {
  A4_SLOT_LABELS,
  ART_W_DEFAULT_MM,
  ART_W_MAX_MM,
  ART_W_MIN_MM,
  DEFAULT_PLACEMENT,
  FOOT_DEFAULT_MM,
  FOOT_MAX_MM,
  FOOT_MIN_MM,
  a4Filename,
  artWidthPx,
  composeTendaA4Sheet,
  legHeightPx,
  type ArtPlacement,
} from "@/lib/calendar/compose-tenda-a4";
import { CALENDAR_YEAR } from "@/lib/calendar/dates";
import { ArtPlacementEditor } from "./art-placement-editor";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Anos disponíveis no seletor — a grade e os feriados são recalculados por ano. */
const YEARS = [2026, 2027, 2028, 2029, 2030];

/** Formata mm aceitando meios (108,5). */
const fmtMm = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ","));

/** Formatos do calendário: folha única completa ou 13 cartões (1 por mês). */
type CalFormat = "a4" | "cartoes";

/** Decodifica o arquivo enviado em um canvas no tamanho natural. */
async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Falha ao decodificar ${file.name}.`));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Quality = { level: "ok" | "warn" | "bad"; text: string };

/** DPI efetivo da arte na largura em que ela é impressa — aviso de qualidade. */
function qualityNote(art: HTMLCanvasElement | null, widthMm: number): Quality | null {
  if (!art) return null;
  const dpi = Math.round(art.width / (widthMm / 25.4));
  if (dpi < 100) return { level: "bad", text: `≈${dpi} DPI — ficará granulado no impresso. Prefira uma imagem maior.` };
  if (dpi < 150) return { level: "warn", text: `≈${dpi} DPI — aceitável, mas o ideal é 150 DPI ou mais.` };
  return { level: "ok", text: `≈${dpi} DPI — boa para impressão.` };
}

export default function CalendarioPage() {
  const { toast } = useToast();
  const { code } = useDeviceCode();

  /** Formato escolhido: folha A4 única completa (padrão) ou 13 cartões. */
  const [format, setFormat] = useState<CalFormat>("a4");

  /** Artes decodificadas por slot — ref para não irar re-render a cada upload. */
  const artsRef = useRef<(HTMLCanvasElement | null)[]>(Array(PANEL_COUNT).fill(null));
  const [thumbs, setThumbs] = useState<(string | null)[]>(Array(PANEL_COUNT).fill(null));
  const [selected, setSelected] = useState(0);
  const [version, setVersion] = useState(0);

  const [style, setStyle] = useState<CalendarStyle>(DEFAULT_STYLE);
  /** Paleta extraída da arte principal (frente/capa) — swatches do seletor rápido. */
  const [palette, setPalette] = useState<string[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  /** Ano do calendário (grade e feriados recalculados). */
  const [year, setYear] = useState(CALENDAR_YEAR);
  /** Pé da tenda (aba de colagem) em mm — o resto da altura vira as 2 faces. */
  const [footMm, setFootMm] = useState(FOOT_DEFAULT_MM);
  /** Largura da faixa de arte em mm — os mini-meses ocupam o que sobra na face. */
  const [artWidthMm, setArtWidthMm] = useState(ART_W_DEFAULT_MM);
  /** Posicionamento da arte por slot (editor arrastar/zoom). */
  const [placements, setPlacements] = useState<ArtPlacement[]>([
    DEFAULT_PLACEMENT,
    DEFAULT_PLACEMENT,
  ]);

  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const singleInputRef = useRef<HTMLInputElement>(null);
  const multiInputRef = useRef<HTMLInputElement>(null);

  const isA4 = format === "a4";
  const legH = legHeightPx(footMm).leg;
  const faceMm = (297 - footMm) / 2;
  /** Largura da faixa de arte em px de impressão — editor e PDF usam a mesma. */
  const artW = artWidthPx(artWidthMm);
  const slotCount = isA4 ? A4_SLOT_LABELS.length : PANEL_COUNT;
  const slotLabel = (i: number) => (isA4 ? A4_SLOT_LABELS[i] : panelLabel(i));
  const filled = thumbs.slice(0, slotCount).filter(Boolean).length;
  const allFilled = filled === slotCount;
  const note = qualityNote(artsRef.current[selected], isA4 ? artWidthMm : 210);
  /** No A4 único, só a arte da frente é obrigatória (a do verso repete a frente). */
  const canExport = isA4 ? Boolean(thumbs[0]) : allFilled;

  const switchFormat = (next: CalFormat) => {
    setFormat(next);
    setSelected(0);
  };

  /** Troca o ano; se o título ainda é o automático "Calendário AAAA", acompanha. */
  const changeYear = (next: number) => {
    setYear(next);
    setStyle((s) =>
      /^Calendário \d{4}$/.test(s.coverTitle) ? { ...s, coverTitle: `Calendário ${next}` } : s,
    );
  };

  /** No A4 único: copia a arte da frente para o verso (mesma arte nos dois lados). */
  const reuseArtBothSides = () => {
    const art = artsRef.current[0];
    if (!art) return;
    artsRef.current[1] = art;
    setThumbs((prev) => {
      const next = [...prev];
      next[1] = art.toDataURL("image/jpeg", 0.55);
      return next;
    });
    setPlacements((prev) => [prev[0], prev[0]]);
    setVersion((v) => v + 1);
  };

  /** Arte nova no slot principal (frente/capa): paleta e cor dos textos acompanham —
   * "arte nova, cor nova". O usuário ainda pode trocar pela paleta, conta-gotas ou input. */
  const applyArtColors = (art: HTMLCanvasElement) => {
    setPalette(extractArtPalette(art));
    setStyle((s) => ({ ...s, textColor: extractDominantColor(art) }));
  };

  const handleFiles = useCallback(
    async (files: FileList, replaceSlot: number | null) => {
      const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (list.length === 0) return;
      if (list.length > 1) list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      try {
        if (list.length === 1 && replaceSlot !== null) {
          const art = await fileToCanvas(list[0]);
          artsRef.current[replaceSlot] = art;
          setThumbs((prev) => {
            const next = [...prev];
            next[replaceSlot] = art.toDataURL("image/jpeg", 0.55);
            return next;
          });
          // Arte nova, enquadramento novo: zera o posicionamento deste slot.
          setPlacements((prev) =>
            prev.map((p, i) => (i === replaceSlot ? DEFAULT_PLACEMENT : p)),
          );
          if (replaceSlot === 0) applyArtColors(art);
          setSelected(replaceSlot);
          setVersion((v) => v + 1);
          return;
        }
        let slot = 0;
        let count = 0;
        for (const file of list) {
          while (slot < slotCount && artsRef.current[slot]) slot++;
          if (slot >= slotCount) break;
          const art = await fileToCanvas(file);
          artsRef.current[slot] = art;
          if (slot === 0) applyArtColors(art);
          const idx = slot;
          setThumbs((prev) => {
            const next = [...prev];
            next[idx] = art.toDataURL("image/jpeg", 0.55);
            return next;
          });
          slot++;
          count++;
        }
        setPlacements([DEFAULT_PLACEMENT, DEFAULT_PLACEMENT]);
        setVersion((v) => v + 1);
        toast({
          title: `${count} arte${count > 1 ? "s" : ""} importada${count > 1 ? "s" : ""}`,
          description:
            count < list.length
              ? `Só havia espaço para ${count} — os painéis restantes já tinham arte.`
              : isA4
                ? "Preenchidos em ordem: frente (Jan–Jun) e verso (Jul–Dez)."
                : "Preenchidos em ordem: capa, janeiro a dezembro (ordem alfabética dos arquivos).",
        });
      } catch (err) {
        toast({
          title: "Falha ao importar arte",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      }
    },
    [toast, isA4, slotCount],
  );

  // Prévia — recomposta ao trocar arte, painel, formato, estilo, ano, pé ou
  // posicionamento da arte. No A4 único gera a folha completa (1 página); nos
  // 13 cartões mostra a face selecionada.
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      try {
        if (isA4) {
          const sheet = composeTendaA4Sheet(
            artsRef.current[0],
            artsRef.current[1],
            style,
            {
              footMm,
              artWidthMm,
              year,
              placementFront: placements[0],
              placementBack: placements[1],
            },
          );
          const url = sheet.toDataURL("image/jpeg", 0.9);
          if (alive) {
            setPreview(url);
            setPreviewError(null);
          }
        } else {
          const face = composeFace(selected, artsRef.current[selected], style);
          const url = face.toDataURL("image/jpeg", 0.9);
          if (alive) {
            setPreview(url);
            setPreviewError(null);
          }
        }
      } catch (err) {
        if (alive) setPreviewError(err instanceof Error ? err.message : String(err));
      }
    }, 120);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [selected, style, version, isA4, footMm, artWidthMm, year, placements]);

  const handleExtractColor = () => {
    // No A4 único a referência é a arte da frente; nos 13 cartões, a do painel aberto.
    const art = isA4
      ? (artsRef.current[0] ?? artsRef.current[1] ?? null)
      : (artsRef.current[selected] ?? artsRef.current.find(Boolean) ?? null);
    if (!art) {
      toast({
        title: "Sem arte para analisar",
        description: "Envie a arte de um painel primeiro — a cor é extraída dela.",
        variant: "destructive",
      });
      return;
    }
    const color = extractDominantColor(art);
    setStyle((s) => ({ ...s, textColor: color }));
    toast({
      title: "Cor extraída da arte",
      description: `${color.toUpperCase()} aplicado aos textos. Ajuste no seletor se quiser variar.`,
    });
  };

  const handleExport = async () => {
    if (exporting) return;
    if (isA4) {
      if (!artsRef.current[0]) {
        toast({
          title: "Falta a arte da frente",
          description: "Envie a arte da frente (Jan–Jun). Se não enviar outra, o verso repete a mesma arte.",
          variant: "destructive",
        });
        return;
      }
    } else {
      const missing = artsRef.current.findIndex((a) => !a);
      if (missing >= 0) {
        setSelected(missing);
        toast({
          title: "Faltam artes",
          description: `Preencha os 13 painéis — o primeiro vazio é "${panelLabel(missing)}".`,
          variant: "destructive",
        });
        return;
      }
    }
    setExporting(true);
    setExportProgress(0);
    try {
      if (isA4) {
        const sheet = composeTendaA4Sheet(
          artsRef.current[0],
          artsRef.current[1],
          style,
          { footMm, artWidthMm, year, placementFront: placements[0], placementBack: placements[1] },
        );
        setExportProgress(60);
        await tick();
        const result = await exportTendaA4Pdf(sheet, {
          filename: a4Filename(year),
          quality: 0.95,
        });
        setPdfBlob(result.blob);
        setExportProgress(100);
        toast({
          title: "PDF gerado com sucesso",
          description:
            "1 página A4 (folha frente-e-verso) — o download começou. Imprima frente-e-verso (virar pela borda longa) e mande vincar nas medidas do card Como imprimir.",
        });
      } else {
        const faces: HTMLCanvasElement[] = [];
        for (let i = 0; i < PANEL_COUNT; i++) {
          faces.push(composeFace(i, artsRef.current[i], style));
          setExportProgress(Math.round(((i + 1) / PANEL_COUNT) * 85));
          await tick();
        }
        const result = await exportCalendarPdf(faces, {
          filename: "calendario-tenda-2027.pdf",
          quality: 0.95,
        });
        setPdfBlob(result.blob);
        setExportProgress(100);
        toast({
          title: "PDF gerado com sucesso",
          description: `${result.pages} folhas tenda — o download começou. Dobre UMA folha de teste antes de rodar tudo.`,
        });
      }
    } catch (err) {
      toast({
        title: "Falha ao gerar o PDF",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  };

  const handleNuvem = async () => {
    if (!pdfBlob || uploading) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const deviceCode = ensureDeviceCode();
      await uploadNuvemPdf(
        deviceCode,
        pdfBlob,
        isA4
          ? {
              name: a4Filename(year),
              product: "calendario-tenda-a4",
              productName: "Calendário Tenda A4 (com pé)",
            }
          : {
              name: "calendario-tenda-2027.pdf",
              product: "calendario-tenda",
              productName: "Calendário de Mesa Tenda",
            },
        setUploadProgress,
      );
      toast({
        title: "Enviado para a nuvem",
        description: "No PC, abra a Nuvem DMS (ícone de nuvem no topo) — o PDF já está na fila.",
      });
    } catch (err) {
      toast({
        title: "Falha ao enviar para a nuvem",
        description: friendlyFirebaseError(err),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const setFit = (fitMode: CalendarStyle["fitMode"]) => setStyle((s) => ({ ...s, fitMode }));

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/" aria-label="Voltar ao início">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="flex items-center gap-2 text-base font-semibold sm:text-lg">
              <CalendarDays className="h-5 w-5 text-primary" />
              Calendário de Mesa Tenda {year}
            </h1>
          </div>
          <p className="hidden text-xs text-muted-foreground sm:block">
            {isA4
              ? "1 folha A4 frente-e-verso · tenda com pé · 2 vincos"
              : "Tenda A5 · 1 por folha A4 · dobra no meio"}
          </p>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-6 lg:grid-cols-[330px_1fr]">
        {/* ---- Coluna esquerda: formato, artes e instruções ---- */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Formato</CardTitle>
              <CardDescription>Os dois saem do mesmo jeito: dobra no meio, sem corte.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <button
                type="button"
                onClick={() => switchFormat("a4")}
                aria-pressed={isA4}
                className={`rounded-md border-2 p-3 text-left transition ${
                  isA4 ? "border-primary bg-primary/5" : "border-border hover:border-ring"
                }`}
              >
                <span className="block text-sm font-semibold">Tenda A4 única</span>
                <span className="block text-xs text-muted-foreground">
                  1 folha com o calendário completo: frente com arte + Jan–Jun, verso com arte +
                  Jul–Dez. Imprima frente-e-verso, dobre a cumeeira e o pé e cole a aba — tenda
                  triangular firme na mesa.
                </span>
              </button>
              <button
                type="button"
                onClick={() => switchFormat("cartoes")}
                aria-pressed={!isA4}
                className={`rounded-md border-2 p-3 text-left transition ${
                  !isA4 ? "border-primary bg-primary/5" : "border-border hover:border-ring"
                }`}
              >
                <span className="block text-sm font-semibold">13 cartões</span>
                <span className="block text-xs text-muted-foreground">
                  Capa + 12 meses, 1 tenda por folha (o verso de cada cartão é o mês seguinte).
                </span>
              </button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Artes ({filled}/{slotCount})</CardTitle>
              <CardDescription>
                {isA4
                  ? "Frente e verso. Sem arte no verso, a frente é repetida automaticamente."
                  : "Capa + 12 meses. \u0022Enviar várias\u0022 preenche em ordem alfabética dos arquivos."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className={isA4 ? "grid grid-cols-2 gap-2" : "grid grid-cols-3 gap-2"}>
                {Array.from({ length: slotCount }, (_, i) => {
                  const thumb = thumbs[i];
                  const active = selected === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelected(i)}
                      className={`group relative overflow-hidden rounded-md border-2 transition ${
                        active ? "border-primary" : "border-transparent hover:border-border"
                      }`}
                      aria-label={`Painel ${slotLabel(i)}${thumb ? " — preenchido" : " — vazio"}`}
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt=""
                          className={isA4 ? "aspect-[3/4] w-full object-cover" : "aspect-[210/148.5] w-full object-cover"}
                        />
                      ) : (
                        <span
                          className={`flex ${
                            isA4 ? "aspect-[3/4]" : "aspect-[210/148.5]"
                          } w-full items-center justify-center border-dashed bg-muted/50 text-muted-foreground`}
                        >
                          <Upload className="h-4 w-4" />
                        </span>
                      )}
                      <span className="block truncate bg-background/85 px-1 py-0.5 text-center text-[10px] font-medium">
                        {slotLabel(i)}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => singleInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" /> Este painel
                </Button>
                <Button variant="outline" size="sm" onClick={() => multiInputRef.current?.click()}>
                  <Upload className="h-4 w-4" /> Enviar várias
                </Button>
              </div>
              {isA4 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={reuseArtBothSides}
                  disabled={!thumbs[0] || Boolean(thumbs[1])}
                >
                  Usar a mesma arte nos dois lados
                </Button>
              )}
              <input
                ref={singleInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) void handleFiles(e.target.files, selected);
                  e.target.value = "";
                }}
              />
              <input
                ref={multiInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) void handleFiles(e.target.files, null);
                  e.target.value = "";
                }}
              />
            </CardContent>
          </Card>

          {isA4 && thumbs[selected] && artsRef.current[selected] && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Ajuste da arte — {slotLabel(selected)}</CardTitle>
                <CardDescription>
                  Posicione, recorte e dê zoom na arte exatamente onde ela vai imprimir.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ArtPlacementEditor
                  art={artsRef.current[selected]}
                  bandW={artW}
                  bandH={legH}
                  placement={placements[selected] ?? DEFAULT_PLACEMENT}
                  onChange={(p) =>
                    setPlacements((prev) => prev.map((x, i) => (i === selected ? p : x)))
                  }
                  onPickColor={(hex) => setStyle((s) => ({ ...s, textColor: hex }))}
                />
              </CardContent>
            </Card>
          )}

          {isA4 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Pé da tenda (aba de colagem)</CardTitle>
                <CardDescription>
                  A aba dobra para dentro e cola na face de trás — vira o assoalho do triângulo.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                <input
                  id="foot-range"
                  type="range"
                  min={FOOT_MIN_MM}
                  max={FOOT_MAX_MM}
                  step={1}
                  value={footMm}
                  onChange={(e) => setFootMm(Number(e.target.value))}
                  className="w-full accent-primary"
                  aria-label="Largura do pé da tenda em milímetros"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{FOOT_MIN_MM} mm</span>
                  <span className="text-sm font-semibold text-foreground">{footMm} mm</span>
                  <span>{FOOT_MAX_MM} mm</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Faces com {fmtMm(faceMm)} mm de altura cada. Pé maior = tenda mais aberta e
                  estável; menor = tenda mais fechada. A folha fecha exata em 297 mm — mande
                  vincar nas posições indicadas no card "Como imprimir".
                </p>
              </CardContent>
            </Card>
          )}

          {isA4 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Largura da área da arte</CardTitle>
                <CardDescription>
                  A faixa vertical que leva a arte e o título nas duas faces — os 6 mini-meses de
                  cada lado ocupam o que sobra.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                <input
                  id="art-width-range"
                  type="range"
                  min={ART_W_MIN_MM}
                  max={ART_W_MAX_MM}
                  step={0.5}
                  value={artWidthMm}
                  onChange={(e) => setArtWidthMm(Number(e.target.value))}
                  className="w-full accent-primary"
                  aria-label="Largura da área da arte em milímetros"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{ART_W_MIN_MM} mm</span>
                  <span className="text-sm font-semibold text-foreground">
                    {fmtMm(artWidthMm)} mm
                  </span>
                  <span>{ART_W_MAX_MM} mm</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Padrão de {fmtMm(ART_W_DEFAULT_MM)} mm. Mais larga = mais arte e menos espaço
                  para os meses; mais estreita = o contrário. Vale para frente e verso, e o
                  recorte da arte se adapta ao novo formato da faixa.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Como imprimir</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {isA4 ? (
                <>
                  <p>
                    1. Imprima <strong>frente e verso</strong> (virar pela borda LONGA), escala
                    100%, em papel de 250–300 g.
                  </p>
                  <p>
                    2. A metade de cima sai <strong>de cabeça para baixo</strong> — é a traseira
                    da tenda (Jul–Dez). É assim mesmo.
                  </p>
                  <p>
                    3. Dobre na cumeeira (a {fmtMm(faceMm)} mm da borda) e no pé (a{" "}
                    {fmtMm(faceMm * 2)} mm); a aba de {footMm} mm cola por dentro.
                  </p>
                  <p>
                    4. Dobre UMA folha de teste antes da tiragem. Na tenda montada: frente com
                    Jan–Jun, traseira com Jul–Dez, pé firme na mesa.
                  </p>
                </>
              ) : (
                <>
                  <p>1. Imprima em escala 100% (sem ajustar à página), só a frente do papel.</p>
                  <p>
                    2. A metade de cima do PDF sai <strong>de cabeça para baixo</strong> — é o verso
                    da tenda (mês seguinte). É assim mesmo.
                  </p>
                  <p>3. Dobre no meio (a 148,5 mm da borda) com vinco — em 250–300 g o vinco evita rachadura.</p>
                  <p>4. Dobre UMA folha de teste antes de rodar a tiragem.</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ---- Coluna direita: estilo, prévia e exportação ---- */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Estilo</CardTitle>
              <CardDescription>
                A grade de dias, feriados e a capa são geradas pelo app — você só manda a arte.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="cover-title">{isA4 ? "Título (sobre a arte)" : "Título da capa"}</Label>
                <Input
                  id="cover-title"
                  value={style.coverTitle}
                  onChange={(e) => setStyle((s) => ({ ...s, coverTitle: e.target.value }))}
                  maxLength={40}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cal-year">Ano do calendário</Label>
                <select
                  id="cal-year"
                  data-testid="year-select"
                  value={year}
                  onChange={(e) => changeYear(Number(e.target.value))}
                  className="h-9 rounded-md border bg-background px-3 text-sm shadow-sm"
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  A grade e os feriados nacionais são recalculados para o ano escolhido.
                </p>
              </div>
              {!isA4 && (
                <div className="grid gap-2">
                  <Label>Enquadramento da arte</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={style.fitMode === "cover" ? "default" : "outline"}
                      onClick={() => setFit("cover")}
                    >
                      Preencher
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={style.fitMode === "contain" ? "default" : "outline"}
                      onClick={() => setFit("contain")}
                    >
                      Conter
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    No formato A4 único, o ajuste fino da arte fica em
                    &quot;Ajuste da arte&quot; (arrastar e zoom por face).
                  </p>
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="text-color">Cor dos textos</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="text-color"
                    type="color"
                    value={style.textColor}
                    onChange={(e) => setStyle((s) => ({ ...s, textColor: e.target.value }))}
                    className="h-9 w-14 cursor-pointer rounded-md border bg-background p-1"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={handleExtractColor}>
                    <Wand2 className="h-4 w-4" /> Extrair da arte
                  </Button>
                </div>
                {palette.length > 0 && (
                  <div className="grid gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5" data-testid="art-palette">
                      {palette.map((c) => (
                        <button
                          key={c}
                          type="button"
                          data-color={c}
                          aria-label={`Aplicar a cor ${c} aos textos`}
                          onClick={() => setStyle((s) => ({ ...s, textColor: c }))}
                          className={`h-6 w-6 rounded-full border shadow-sm transition ${
                            style.textColor.toLowerCase() === c.toLowerCase()
                              ? "ring-2 ring-primary ring-offset-2"
                              : "hover:scale-110"
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cores extraídas da arte principal (frente/capa) — clique para aplicar. Arte
                      nova, cores novas.
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Casando com a foto/logo — use a paleta ou o conta-gotas da arte; a faixa da grade
                  se adapta (clara ou escura) para o texto sempre ficar legível.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="accent-color">Cor de domingos e feriados</Label>
                <input
                  id="accent-color"
                  type="color"
                  value={style.accentColor}
                  onChange={(e) => setStyle((s) => ({ ...s, accentColor: e.target.value }))}
                  className="h-9 w-14 cursor-pointer rounded-md border bg-background p-1"
                />
                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    id="holiday-names"
                    checked={style.showHolidayNames}
                    onCheckedChange={(v) => setStyle((s) => ({ ...s, showHolidayNames: v }))}
                  />
                  <Label htmlFor="holiday-names" className="text-sm font-normal">
                    Legenda com nomes dos feriados
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {isA4 ? "Prévia — folha completa" : `Prévia — ${panelLabel(selected)}`}
            </CardTitle>
            <CardDescription>
              {isA4
                ? "A folha sai com a metade de cima de cabeça para baixo (o verso da tenda) — é assim mesmo, é impressa frente-e-verso."
                : selected === 0
                  ? `Capa com o título e o ano ${CALENDAR_YEAR}.`
                  : selected < PANEL_COUNT
                    ? `Verso deste cartão: ${panelLabel((selected + 1) % PANEL_COUNT)} (sai invertido no PDF).`
                    : ""}
            </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {previewError ? (
                <p className="text-sm text-destructive">{previewError}</p>
              ) : preview ? (
                <img
                  src={preview as string}
                  alt={`Prévia ${isA4 ? "da folha completa" : `do painel ${panelLabel(selected)}`}`}
                  className={
                    isA4
                      ? "mx-auto w-full max-w-sm rounded-md border shadow-sm"
                      : "w-full rounded-md border shadow-sm"
                  }
                />
              ) : (
                <div
                  className={`${
                    isA4 ? "aspect-[210/297] max-w-sm mx-auto" : "aspect-[210/148.5]"
                  } flex w-full items-center justify-center rounded-md border bg-muted/50`}
                >
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {note && (
                <p
                  className={`text-sm ${
                    note.level === "bad"
                      ? "text-destructive"
                      : note.level === "warn"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground"
                  }`}
                >
                  {note.text}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Gerar PDF</CardTitle>
              <CardDescription>
                {isA4
                  ? "1 página A4 (300 DPI): a folha completa — frente Jan–Jun, verso Jul–Dez de cabeça para baixo e aba do pé. Imprima frente-e-verso, virar pela borda longa."
                  : "13 folhas A4 (300 DPI): capa + 12 meses, cada uma com o mês seguinte no verso."}
                {!canExport && (isA4 ? " Falta a arte da frente." : ` Faltam ${slotCount - filled} artes.`)}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={handleExport} disabled={exporting || !canExport}>
                  {exporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Printer className="h-4 w-4" />
                  )}
                  {exporting ? "Gerando…" : "Gerar PDF e baixar"}
                </Button>
                {pdfBlob && !exporting && (
                  <span className="flex items-center gap-1 text-sm text-green-700 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4" /> PDF pronto para envio
                  </span>
                )}
              </div>
              {(exporting || uploading) && (
                <Progress value={exporting ? exportProgress : uploadProgress} />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={handleNuvem} disabled={!pdfBlob || uploading}>
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CloudUpload className="h-4 w-4" />
                  )}
                  Enviar para a nuvem{code ? ` (${code})` : ""}
                </Button>
                <p className="text-xs text-muted-foreground">
                  No PC da gráfica, abra a Nuvem DMS e baixe — o celular não precisa de cabo.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
