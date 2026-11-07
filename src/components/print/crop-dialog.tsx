"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hand, Loader2, Maximize2, RotateCcw, RotateCw, ScanLine, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { fmtMm, type ProductSpec } from "@/lib/print/constants";
import {
  clampRect,
  cropEffectiveDpi,
  cropPresets,
  detectArtworkBounds,
  fitRectWithRatio,
  moveRect,
  resizeRect,
  rotateCanvas,
  rotateRect,
  type CropHandle,
  type CropRect,
} from "@/lib/print/crop";

/** Zoom máximo em relação à imagem ajustada à tela (100% = arte inteira visível). */
const MAX_ZOOM = 6;

const clampNum = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Limita o deslocamento para a imagem nunca sair totalmente da área visível. */
function clampPan(
  p: { x: number; y: number },
  dispW: number,
  dispH: number,
  stageW: number,
  stageH: number,
) {
  const mx = Math.max(0, (dispW - stageW) / 2);
  const my = Math.max(0, (dispH - stageH) / 2);
  return { x: clampNum(p.x, -mx, mx), y: clampNum(p.y, -my, my) };
}

/** Posição das 8 alças sobre o quadro de recorte. */
const HANDLE_POS: Record<Exclude<CropHandle, "move">, React.CSSProperties> = {
  nw: { left: "0%", top: "0%" },
  n: { left: "50%", top: "0%" },
  ne: { left: "100%", top: "0%" },
  e: { left: "100%", top: "50%" },
  se: { left: "100%", top: "100%" },
  s: { left: "50%", top: "100%" },
  sw: { left: "0%", top: "100%" },
  w: { left: "0%", top: "50%" },
};

const HANDLE_CURSOR: Record<Exclude<CropHandle, "move">, string> = {
  nw: "cursor-nwse-resize",
  se: "cursor-nwse-resize",
  ne: "cursor-nesw-resize",
  sw: "cursor-nesw-resize",
  n: "cursor-ns-resize",
  s: "cursor-ns-resize",
  e: "cursor-ew-resize",
  w: "cursor-ew-resize",
};

const HANDLES = Object.keys(HANDLE_POS) as Exclude<CropHandle, "move">[];

interface DragState {
  handle: CropHandle;
  startRect: CropRect;
  startX: number;
  startY: number;
}

/**
 * Diálogo de recorte interativo: quadro arrastável com 8 alças sobre a arte,
 * trava de proporção, detecção automática de bordas e leitura ao vivo de
 * px / DPI efetivos no tamanho de corte do produto.
 * A imagem ocupa todo o espaço disponível (sempre inteira em 100%) e pode ser
 * ampliada até 6× para conferir a borda da peça com precisão.
 * Inclui GIRO de 90° (sentido horário/anti-horário) para corrigir artes enviadas
 * na direção errada (cartão em pé, panfleto deitado) — o giro é aplicado junto
 * com o recorte ao confirmar; "Cancelar" descarta tudo.
 */
export function CropDialog({
  open,
  onOpenChange,
  spec,
  sourceCanvas,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  spec: ProductSpec;
  sourceCanvas: HTMLCanvasElement | null;
  onApply: (rect: CropRect, rotationQuarters: number) => void;
}) {
  const [rect, setRect] = useState<CropRect | null>(null);
  const [ratioId, setRatioId] = useState("product");
  const [detecting, setDetecting] = useState(false);
  const [detectHint, setDetectHint] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Giro aplicado à arte dentro do diálogo, em quartos de volta horários (0–3). */
  const [rot, setRot] = useState(0);

  // Zoom e navegação da imagem
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hand, setHand] = useState(false);
  const [panning, setPanning] = useState(false);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  const stageRef = useRef<HTMLDivElement | null>(null);
  const stageRoRef = useRef<ResizeObserver | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<{ startX: number; startY: number; basePan: { x: number; y: number } } | null>(
    null,
  );

  const presets = useMemo(() => cropPresets(spec), [spec]);
  const ratio = presets.find((p) => p.id === ratioId)?.ratio ?? null;

  // Canvas de trabalho = fonte já girada pelos quartos de volta escolhidos.
  // Todo o diálogo (preview, detecção, quadro) opera sobre ESTE canvas; o giro
  // só vira parte do pipeline quando o usuário confirma "Aplicar".
  const working = useMemo(
    () => (sourceCanvas && rot !== 0 ? rotateCanvas(sourceCanvas, rot) : sourceCanvas),
    [sourceCanvas, rot],
  );

  const W = working?.width ?? 0;
  const H = working?.height ?? 0;

  // Preview em JPEG leve (a fonte pode ter vários megapixels).
  useEffect(() => {
    if (!open || !working) {
      setDataUrl(null);
      return;
    }
    try {
      setDataUrl(working.toDataURL("image/jpeg", 0.9));
    } catch {
      setDataUrl(null);
    }
  }, [open, working]);

  // Ao abrir: trava no produto, quadro centralizado e visualização redefinida.
  // Roda UMA VEZ por abertura (transição fechado→aberto) — NÃO depende de W/H,
  // senão um giro dentro do diálogo reencaixaria o quadro por conta própria e
  // desfaria a transformação feita por setRotation.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current && sourceCanvas) {
      wasOpenRef.current = true;
      setRot(0);
      setRatioId("product");
      setRect(
        fitRectWithRatio(
          sourceCanvas.width,
          sourceCanvas.height,
          spec.widthMm / spec.heightMm,
        ),
      );
      setDetectHint(null);
      setDetecting(false);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setHand(false);
    }
    if (!open) wasOpenRef.current = false;
  }, [open, sourceCanvas, spec]);

  // Mede a área da imagem via CALLBACK REF — o conteúdo do diálogo (portal Radix)
  // monta depois do primeiro passe de efeitos, então um useEffect [open] via cedo
  // e nunca re-tenta. O callback ref roda exatamente na montagem do elemento.
  const attachStage = useCallback((el: HTMLDivElement | null) => {
    stageRef.current = el;
    stageRoRef.current?.disconnect();
    stageRoRef.current = null;
    if (el) {
      const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      stageRoRef.current = ro;
    }
  }, []);

  // Escala "ajustada" (imagem inteira visível) e tamanho exibido com o zoom atual.
  const fitScale =
    stage.w > 48 && stage.h > 48 && W > 0 && H > 0
      ? Math.min((stage.w - 32) / W, (stage.h - 32) / H)
      : 0;
  const dispW = fitScale > 0 ? W * fitScale * zoom : 0;
  const dispH = fitScale > 0 ? H * fitScale * zoom : 0;

  const panClamped = useCallback(
    (p: { x: number; y: number }, z: number) =>
      clampPan(p, W * fitScale * z, H * fitScale * z, stage.w, stage.h),
    [W, H, fitScale, stage],
  );

  const applyZoom = useCallback(
    (target: number, anchor?: { cx: number; cy: number }) => {
      const next = clampNum(target, 1, MAX_ZOOM);
      if (!Number.isFinite(next) || next === zoom || fitScale === 0) return;
      if (anchor) {
        const k = next / zoom;
        setPan(
          panClamped(
            { x: anchor.cx - (anchor.cx - pan.x) * k, y: anchor.cy - (anchor.cy - pan.y) * k },
            next,
          ),
        );
      } else {
        setPan((p) => panClamped(p, next));
      }
      setZoom(next);
    },
    [zoom, pan, fitScale, panClamped],
  );

  /**
   * Aplica `next` quartos de volta (horários) à vista. O quadro acompanha:
   * com trava de proporção, reencaixa na proporção travada na nova direção;
   * em modo livre, a MESMA região selecionada é transformada junto com a imagem.
   */
  const setRotation = (next: number) => {
    if (!rect || W === 0 || H === 0) return;
    const delta = (((next - rot) % 4) + 4) % 4;
    if (delta === 0) return;
    const nw = delta % 2 === 1 ? H : W;
    const nh = delta % 2 === 1 ? W : H;
    if (ratio) {
      setRect(fitRectWithRatio(nw, nh, ratio));
    } else {
      setRect(clampRect(rotateRect(rect, delta, W, H), nw, nh));
    }
    setRot(((next % 4) + 4) % 4);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDetectHint(null);
  };

  const handleRatioChange = (id: string) => {
    setRatioId(id);
    const r = presets.find((p) => p.id === id)?.ratio ?? null;
    if (r && W > 0 && H > 0) setRect(fitRectWithRatio(W, H, r));
  };

  const handleDetect = () => {
    if (!working || detecting) return;
    setDetecting(true);
    setDetectHint(null);
    // Pequeno atraso para o spinner pintar antes do cálculo síncrono.
    setTimeout(() => {
      try {
        const found = detectArtworkBounds(working);
        if (found) {
          setRect(found);
          setRatioId("free"); // a detecção reflete a proporção real da peça
          setDetectHint(null);
        } else {
          setDetectHint(
            "Não consegui identificar a borda com confiança — arraste as alças até a borda da peça.",
          );
        }
      } finally {
        setDetecting(false);
      }
    }, 40);
  };

  // Converte coordenadas de tela para pixels da imagem (funciona com zoom e pan:
  // getBoundingClientRect reflete a posição/tamanho visuais do quadro).
  const toImage = (clientX: number, clientY: number) => {
    const el = wrapRef.current;
    if (!el || W === 0 || H === 0) return null;
    const r = el.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H };
  };

  const startDrag = (handle: CropHandle) => (e: React.PointerEvent) => {
    if (!rect) return;
    e.preventDefault();
    e.stopPropagation();
    const p = toImage(e.clientX, e.clientY);
    if (!p) return;
    dragRef.current = { handle, startRect: rect, startX: p.x, startY: p.y };
    setDragging(true);
  };

  const startPan = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    panRef.current = { startX: e.clientX, startY: e.clientY, basePan: pan };
    setPanning(true);
  };

  // Clique na imagem: dentro do quadro (ou zoom 100%) move o quadro;
  // fora do quadro com zoom, ou no modo mãozinha, navega pela imagem.
  const onImagePointerDown = (e: React.PointerEvent) => {
    if (!rect) return;
    const p = toImage(e.clientX, e.clientY);
    const inside =
      p && p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
    if (hand || (!inside && zoom > 1)) {
      startPan(e);
    } else {
      startDrag("move")(e);
    }
  };

  // Loop de arrasto do quadro em nível de janela (sobrevive a sair da imagem).
  useEffect(() => {
    if (!dragging) return;
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const p = toImage(ev.clientX, ev.clientY);
      if (!p) return;
      if (d.handle === "move") {
        setRect(moveRect(d.startRect, p.x - d.startX, p.y - d.startY, W, H));
      } else {
        setRect(resizeRect(d.startRect, d.handle, p.x, p.y, ratio, W, H));
      }
    };
    const onUp = () => {
      dragRef.current = null;
      setDragging(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, ratio, W, H]);

  // Loop de arrasto do pan (navegação da imagem ampliada).
  useEffect(() => {
    if (!panning) return;
    const onMove = (ev: PointerEvent) => {
      const d = panRef.current;
      if (!d) return;
      setPan(panClamped({ x: d.basePan.x + (ev.clientX - d.startX), y: d.basePan.y + (ev.clientY - d.startY) }, zoom));
    };
    const onUp = () => {
      panRef.current = null;
      setPanning(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [panning, zoom, panClamped]);

  // Ctrl + roda do mouse (ou pinça no trackpad): zoom centrado no cursor.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !open || fitScale === 0) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      applyZoom(zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2), {
        cx: e.clientX - (r.left + r.width / 2),
        cy: e.clientY - (r.top + r.height / 2),
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, fitScale, zoom, applyZoom]);

  // Mantém o pan válido quando a área/zoom muda (ex.: redimensionar a janela).
  useEffect(() => {
    setPan((p) => panClamped(p, zoom));
  }, [stage, fitScale, zoom, panClamped]);

  // Setas do teclado: move o quadro em 1 px (Shift = 10 px).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[role="listbox"], [role="option"], [role="menu"]')) return;
      const step = e.shiftKey ? 10 : 1;
      const delta =
        e.key === "ArrowLeft"
          ? [-step, 0]
          : e.key === "ArrowRight"
            ? [step, 0]
            : e.key === "ArrowUp"
              ? [0, -step]
              : e.key === "ArrowDown"
                ? [0, step]
                : null;
      if (!delta) return;
      e.preventDefault();
      setRect((r) => (r ? moveRect(r, delta[0], delta[1], W, H) : r));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, W, H]);

  const handleApply = () => {
    if (!rect || W === 0 || H === 0) return;
    onApply(clampRect(rect, W, H), rot);
    onOpenChange(false);
  };

  const dpi = rect ? cropEffectiveDpi(rect, spec) : null;
  const dpiColor =
    dpi === null ? "" : dpi >= 300 ? "text-emerald-600 dark:text-emerald-400" : dpi >= 200 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  const ratioDisplay = rect ? (rect.width / Math.max(1, rect.height)).toFixed(2) : null;
  const atFit = zoom === 1 && pan.x === 0 && pan.y === 0;
  /** Quadro cobrindo a imagem inteira — recorte vira só a rotação. */
  const isFullFrame =
    !!rect && rect.x <= 0 && rect.y <= 0 && rect.width >= W && rect.height >= H;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[94vh] w-full sm:max-w-6xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Recortar a arte</DialogTitle>
          <DialogDescription>
            Arraste as alças até a borda exata do cartão/panfleto (arraste dentro do quadro para
            mover). Tudo que ficar fora do quadro é descartado — inclusive o fundo do ambiente. Arte
            de pé ou deitada? Use os botões <strong className="font-semibold">Girar</strong> para
            corrigir a direção antes de recortar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {/* Barra de ferramentas */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <Button variant="outline" size="sm" onClick={handleDetect} disabled={detecting || !working}>
              {detecting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ScanLine className="h-4 w-4" aria-hidden />
              )}
              {detecting ? "Detectando…" : "Detectar bordas"}
            </Button>
            <div
              className="flex items-center gap-0.5 rounded-lg border bg-background p-0.5"
              role="group"
              aria-label="Girar a arte"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Girar 90 graus à esquerda (anti-horário)"
                title="Girar 90° à esquerda (anti-horário)"
                onClick={() => setRotation(rot + 3)}
                disabled={!working}
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
              </Button>
              <span
                className="w-9 text-center font-mono text-xs tabular-nums text-muted-foreground"
                aria-live="polite"
              >
                {rot * 90}°
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Girar 90 graus à direita (sentido horário)"
                title="Girar 90° à direita (sentido horário)"
                onClick={() => setRotation(rot + 1)}
                disabled={!working}
              >
                <RotateCw className="h-4 w-4" aria-hidden />
              </Button>
              {rot !== 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-amber-600 hover:text-amber-700"
                  aria-label="Desfazer o giro (voltar à direção original)"
                  title="Voltar à direção original"
                  onClick={() => setRotation(0)}
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Label className="shrink-0 text-xs text-muted-foreground">Proporção</Label>
              <Select value={ratioId} onValueChange={handleRatioChange}>
                <SelectTrigger aria-label="Trava de proporção do recorte" className="h-9 w-[240px] text-xs sm:w-[280px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto text-right">
              {rect && (
                <>
                  <p className="font-mono text-sm font-semibold leading-tight">
                    {rect.width} × {rect.height} px · {ratioDisplay}:1
                  </p>
                  <p className={cn("text-xs leading-tight", dpiColor)}>
                    ≈ {dpi} DPI no corte {fmtMm(spec.widthMm)} × {fmtMm(spec.heightMm)} mm
                  </p>
                </>
              )}
            </div>
          </div>

          {detectHint && (
            <p className="rounded-lg border border-amber-600/40 bg-amber-600/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
              {detectHint}
            </p>
          )}

          {/* Área da imagem — usa todo o espaço restante; em 100% a arte aparece INTEIRA */}
          <div
            ref={attachStage}
            className="relative flex min-h-[260px] flex-1 items-center justify-center overflow-hidden rounded-lg border bg-muted/40"
          >
            {dataUrl && rect && W > 0 && H > 0 && fitScale > 0 ? (
              <>
                <div
                  ref={wrapRef}
                  className={cn(
                    "relative shrink-0 select-none",
                    dragging ? "cursor-move" : panning ? "cursor-grabbing" : hand ? "cursor-grab" : "cursor-move",
                  )}
                  style={{
                    width: dispW,
                    height: dispH,
                    transform: `translate(${pan.x}px, ${pan.y}px)`,
                    touchAction: "none",
                  }}
                  onPointerDown={onImagePointerDown}
                >
                  <img
                    src={dataUrl}
                    alt="Arte carregada para recorte"
                    draggable={false}
                    className="pointer-events-none block h-full w-full"
                  />

                  {/* Quadro de recorte — a sombra escurece tudo fora dele */}
                  <div
                    className="absolute cursor-move shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] ring-2 ring-amber-500"
                    style={{
                      left: `${(rect.x / W) * 100}%`,
                      top: `${(rect.y / H) * 100}%`,
                      width: `${(rect.width / W) * 100}%`,
                      height: `${(rect.height / H) * 100}%`,
                    }}
                  >
                    {/* Guias de terços */}
                    <div className="pointer-events-none absolute inset-0" aria-hidden>
                      <div className="absolute inset-y-0 left-1/3 w-px bg-white/30" />
                      <div className="absolute inset-y-0 left-2/3 w-px bg-white/30" />
                      <div className="absolute inset-x-0 top-1/3 h-px bg-white/30" />
                      <div className="absolute inset-x-0 top-2/3 h-px bg-white/30" />
                    </div>

                    {HANDLES.map((h) => (
                      <div
                        key={h}
                        role="slider"
                        aria-label={`Alça ${h.toUpperCase()}`}
                        aria-valuenow={Math.round(rect.width)}
                        onPointerDown={startDrag(h)}
                        className={cn(
                          "absolute z-10 flex h-9 w-9 items-center justify-center",
                          HANDLE_CURSOR[h],
                        )}
                        style={HANDLE_POS[h]}
                      >
                        <div className="h-3 w-3 rounded-[3px] border-2 border-amber-600 bg-white shadow-sm" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Controles de zoom flutuantes */}
                <div className="absolute bottom-3 right-3 z-10 flex items-center gap-0.5 rounded-full border bg-background/95 p-1 shadow-sm backdrop-blur">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Reduzir o zoom"
                    onClick={() => applyZoom(zoom / 1.5)}
                    disabled={zoom <= 1}
                  >
                    <ZoomOut className="h-4 w-4" aria-hidden />
                  </Button>
                  <span className="w-11 text-center font-mono text-xs tabular-nums" aria-live="polite">
                    {Math.round(zoom * 100)}%
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Ampliar o zoom"
                    onClick={() => applyZoom(zoom * 1.5)}
                    disabled={zoom >= MAX_ZOOM}
                  >
                    <ZoomIn className="h-4 w-4" aria-hidden />
                  </Button>
                  <div className="mx-0.5 h-4 w-px bg-border" aria-hidden />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Ajustar a imagem inteira na tela"
                    title="Ajustar (ver a arte inteira)"
                    onClick={() => {
                      setZoom(1);
                      setPan({ x: 0, y: 0 });
                    }}
                    disabled={atFit}
                  >
                    <Maximize2 className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant={hand ? "default" : "ghost"}
                    size="icon"
                    className={cn("h-7 w-7", hand && "bg-amber-600 text-white hover:bg-amber-700")}
                    aria-label="Modo navegar pela imagem"
                    aria-pressed={hand}
                    title="Navegar pela imagem ampliada"
                    onClick={() => setHand((v) => !v)}
                  >
                    <Hand className="h-4 w-4" aria-hidden />
                  </Button>
                </div>

                {zoom > 1 && !hand && (
                  <p className="absolute bottom-3 left-3 z-10 rounded-full bg-background/85 px-3 py-1 text-[11px] leading-none text-muted-foreground shadow-sm">
                    Arraste fora do quadro para navegar pela imagem
                  </p>
                )}
              </>
            ) : (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                Preparando a imagem…
              </div>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Dica: use o zoom (Ctrl + roda do mouse ou os botões) para conferir a borda da peça de
            perto. As setas do teclado movem o quadro em 1 px (Shift + seta = 10 px). A trava
            &ldquo;{spec.name}&rdquo; mantém a proporção exata do tamanho de corte.
          </p>
        </div>

        <DialogFooter className="gap-2 border-t pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleApply}
            disabled={!rect}
            className="bg-amber-600 text-white hover:bg-amber-700"
          >
            {rot === 0
              ? "Aplicar recorte"
              : isFullFrame
                ? "Aplicar rotação"
                : "Aplicar rotação e recorte"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
