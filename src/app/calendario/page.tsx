"use client";

/**
 * Calendário de Mesa Tenda 2027 (Task 28) — fluxo próprio, fora da imposição A4.
 *
 * 13 painéis (capa + 12 meses): arte do cliente + grade gerada automaticamente
 * (feriados nacionais BR, domingos destacados), cor dos textos ajustável — com
 * extração da cor dominante da arte — e PDF final com 13 folhas tenda: frente
 * embaixo + verso (mês seguinte) de cabeça para baixo em cima. Dobra no meio,
 * sem corte, sem frente-e-verso.
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
  extractDominantColor,
  luminance,
  panelLabel,
  type CalendarStyle,
} from "@/lib/calendar/compose";
import { exportCalendarPdf } from "@/lib/calendar/pdf";
import { CALENDAR_YEAR } from "@/lib/calendar/dates";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

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

/** DPI efetivo da arte na largura da face (210 mm) — aviso de qualidade. */
function qualityNote(art: HTMLCanvasElement | null): Quality | null {
  if (!art) return null;
  const dpi = Math.round(art.width / (210 / 25.4));
  if (dpi < 100) return { level: "bad", text: `≈${dpi} DPI — ficará granulado no impresso. Prefira uma imagem maior.` };
  if (dpi < 150) return { level: "warn", text: `≈${dpi} DPI — aceitável, mas o ideal é 150 DPI ou mais.` };
  return { level: "ok", text: `≈${dpi} DPI — boa para impressão.` };
}

export default function CalendarioPage() {
  const { toast } = useToast();
  const { code } = useDeviceCode();

  /** Artes decodificadas por slot — ref para não irar re-render a cada upload. */
  const artsRef = useRef<(HTMLCanvasElement | null)[]>(Array(PANEL_COUNT).fill(null));
  const [thumbs, setThumbs] = useState<(string | null)[]>(Array(PANEL_COUNT).fill(null));
  const [selected, setSelected] = useState(0);
  const [version, setVersion] = useState(0);

  const [style, setStyle] = useState<CalendarStyle>(DEFAULT_STYLE);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const singleInputRef = useRef<HTMLInputElement>(null);
  const multiInputRef = useRef<HTMLInputElement>(null);

  const filled = thumbs.filter(Boolean).length;
  const allFilled = filled === PANEL_COUNT;
  const note = qualityNote(artsRef.current[selected]);

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
          setSelected(replaceSlot);
          setVersion((v) => v + 1);
          return;
        }
        let slot = 0;
        let count = 0;
        for (const file of list) {
          while (slot < PANEL_COUNT && artsRef.current[slot]) slot++;
          if (slot >= PANEL_COUNT) break;
          const art = await fileToCanvas(file);
          artsRef.current[slot] = art;
          const idx = slot;
          setThumbs((prev) => {
            const next = [...prev];
            next[idx] = art.toDataURL("image/jpeg", 0.55);
            return next;
          });
          slot++;
          count++;
        }
        setVersion((v) => v + 1);
        toast({
          title: `${count} arte${count > 1 ? "s" : ""} importada${count > 1 ? "s" : ""}`,
          description:
            count < list.length
              ? `Só havia espaço para ${count} — os painéis restantes já tinham arte.`
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
    [toast],
  );

  // Prévia da face selecionada — recomposta ao trocar arte, painel ou estilo.
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      try {
        const face = composeFace(selected, artsRef.current[selected], style);
        const url = face.toDataURL("image/jpeg", 0.9);
        if (alive) {
          setPreview(url);
          setPreviewError(null);
        }
      } catch (err) {
        if (alive) setPreviewError(err instanceof Error ? err.message : String(err));
      }
    }, 120);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [selected, style, version]);

  const handleExtractColor = () => {
    const art = artsRef.current[selected] ?? artsRef.current.find(Boolean) ?? null;
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
    setExporting(true);
    setExportProgress(0);
    try {
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
        {
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
              Calendário de Mesa Tenda {CALENDAR_YEAR}
            </h1>
          </div>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Tenda A5 · 1 por folha A4 · dobra no meio
          </p>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-6 lg:grid-cols-[330px_1fr]">
        {/* ---- Coluna esquerda: painéis ---- */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Painéis ({filled}/{PANEL_COUNT})</CardTitle>
              <CardDescription>
                Capa + 12 meses. &quot;Enviar várias&quot; preenche em ordem alfabética dos arquivos.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: PANEL_COUNT }, (_, i) => {
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
                      aria-label={`Painel ${panelLabel(i)}${thumb ? " — preenchido" : " — vazio"}`}
                    >
                      {thumb ? (
                        <img src={thumb} alt="" className="aspect-[210/148.5] w-full object-cover" />
                      ) : (
                        <span className="flex aspect-[210/148.5] w-full items-center justify-center border-dashed bg-muted/50 text-muted-foreground">
                          <Upload className="h-4 w-4" />
                        </span>
                      )}
                      <span className="block truncate bg-background/85 px-1 py-0.5 text-center text-[10px] font-medium">
                        {panelLabel(i)}
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

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Como imprimir</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>1. Imprima em escala 100% (sem ajustar à página), só a frente do papel.</p>
              <p>
                2. A metade de cima do PDF sai <strong>de cabeça para baixo</strong> — é o verso
                da tenda (mês seguinte). É assim mesmo.
              </p>
              <p>3. Dobre no meio (a 148,5 mm da borda) com vinco — em 250–300 g o vinco evita rachadura.</p>
              <p>4. Dobre UMA folha de teste antes de rodar a tiragem.</p>
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
                <Label htmlFor="cover-title">Título da capa</Label>
                <Input
                  id="cover-title"
                  value={style.coverTitle}
                  onChange={(e) => setStyle((s) => ({ ...s, coverTitle: e.target.value }))}
                  maxLength={40}
                />
              </div>
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
              </div>
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
                <p className="text-xs text-muted-foreground">
                  Casando com a foto/logo — a faixa da grade se adapta (clara ou escura) para o
                  texto sempre ficar legível.
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
                Prévia — {panelLabel(selected)}
              </CardTitle>
              <CardDescription>
                {selected === 0
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
                  src={preview}
                  alt={`Prévia do painel ${panelLabel(selected)}`}
                  className="w-full rounded-md border shadow-sm"
                />
              ) : (
                <div className="flex aspect-[210/148.5] w-full items-center justify-center rounded-md border bg-muted/50">
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
                13 folhas A4 (300 DPI): capa + 12 meses, cada uma com o mês seguinte no verso.
                {!allFilled && ` Faltam ${PANEL_COUNT - filled} artes.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={handleExport} disabled={exporting || !allFilled}>
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
