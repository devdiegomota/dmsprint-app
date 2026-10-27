"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Crop,
  Hand,
  Loader2,
  Maximize2,
  RefreshCcw,
  RotateCcw,
  RotateCw,
  ScanLine,
  Scissors,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fmtMm, type ProductSpec } from "@/lib/print/constants";
import {
  cropCanvas,
  detectArtworkBounds,
  effectiveDpi,
  isFullRect,
  rotateCanvas90,
  rotateRect,
  type CropRect,
  type CropSession,
} from "@/lib/print/crop";

const MIN_CROP_PX = 32; // recorte mínimo (px da imagem) para não sumir com o quadro
/** Zoom máximo em relação à imagem ajustada à tela (100% = arte inteira visível). */
const MAX_ZOOM = 6;

type DragMode = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Etapa 2 — "Recortar a arte": recorte manual com quadro arrastável + rotação de 90°
 * (retrato ↔ paisagem), para artes com fundo em volta da peça ou na direção errada.
 *
 * Visualização fit-to-view: a imagem inteira fica sempre visível (max-w/max-h),
 * resolvendo o problema do quadro antigo em que só se via metade da peça.
 */
export function CropPanel({
  source,
  spec,
  session,
  onSessionChange,
  onApply,
}: {
  source: HTMLCanvasElement;
  spec: ProductSpec;
  /** Rascunho da sessão de recorte (persistido no page.tsx entre navegações). */
  session: CropSession | null;
  onSessionChange: (s: CropSession | null) => void;
  /** Continuar: result = null quando não há recorte/rotação a aplicar. */
  onApply: (result: HTMLCanvasElement | null, session: CropSession | null) => void;
}) {
  // Estado do editor — inicializa do rascunho (volta de etapas mantém o recorte).
  const [rotation, setRotation] = useState(session?.rotation ?? 0);
  const [rect, setRect] = useState<CropRect>(
    session?.rect ?? { x: 0, y: 0, w: source.width, h: source.height },
  );

  // Imagem de trabalho = fonte girada pelo ângulo acumulado.
  const work = useMemo(() => {
    const steps = ((((rotation % 360) + 360) % 360) / 90) | 0;
    let c = source;
    for (let i = 0; i < steps; i++) c = rotateCanvas90(c, "cw");
    return c;
  }, [source, rotation]);

  const viewRef = useRef<HTMLCanvasElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  /** Espelho do último retângulo — atualizado nos handlers (nunca no render). */
  const rectRef = useRef<CropRect>(rect);

  // Zoom e navegação da imagem ampliada (transplantado do recorte antigo em diálogo).
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hand, setHand] = useState(false);
  const [panning, setPanning] = useState(false);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const panRef = useRef<{ startX: number; startY: number; basePan: { x: number; y: number } } | null>(null);
  // Detecção automática de bordas da peça contra o fundo.
  const [detecting, setDetecting] = useState(false);
  const [detectHint, setDetectHint] = useState<string | null>(null);

  // Redesenha a imagem de trabalho no canvas exibido.
  useEffect(() => {
    const v = viewRef.current;
    if (!v) return;
    v.width = work.width;
    v.height = work.height;
    const ctx = v.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(work, 0, 0);
  }, [work]);

  const notify = useCallback(
    (r: CropRect, rot: number) => onSessionChange({ rotation: rot, rect: r }),
    [onSessionChange],
  );

  // Mede a área visível (stage) para calcular a escala "ajustada" e o zoom.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- Rotação: a imagem gira e o quadro de recorte acompanha o conteúdo ----
  const doRotate = (dir: "cw" | "ccw") => {
    const nextRot = (((rotation + (dir === "cw" ? 90 : 270)) % 360) + 360) % 360;
    const nextRect = rotateRect(rect, work.width, work.height, dir);
    rectRef.current = nextRect;
    setRotation(nextRot);
    setRect(nextRect);
    notify(nextRect, nextRot);
    // A vista reinicia: a imagem muda de dimensões ao girar.
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDetectHint(null);
  };

  const doReset = () => {
    setRotation(0);
    const full: CropRect = { x: 0, y: 0, w: source.width, h: source.height };
    rectRef.current = full;
    setRect(full);
    onSessionChange(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDetectHint(null);
  };

  // ---- Detecção automática da borda da peça contra o fundo ----
  const handleDetect = () => {
    if (detecting) return;
    setDetecting(true);
    setDetectHint(null);
    // Pequeno atraso para o spinner pintar antes do cálculo síncrono.
    setTimeout(() => {
      try {
        const found = detectArtworkBounds(work);
        if (found) {
          rectRef.current = found;
          setRect(found);
          notify(found, rotation);
        } else {
          setDetectHint(
            "Não consegui identificar a borda com confiança (fundo não uniforme ou peça sem folga) — arraste as alças até a borda da peça.",
          );
        }
      } finally {
        setDetecting(false);
      }
    }, 40);
  };

  // ---- Interação: mover/redimensionar o quadro (listeners na janela = funciona
  //      com mouse, toque e eventos sintéticos; sem depender de pointer capture) ----
  const beginDrag = (e: React.PointerEvent, mode: DragMode) => {
    const stack = stackRef.current;
    if (!stack) return;
    e.preventDefault();
    const bounds = stack.getBoundingClientRect();
    const scale = bounds.width / work.width;
    const start = { mode, x: e.clientX, y: e.clientY, orig: rect, scale, W: work.width, H: work.height, rot: rotation };

    const applyDrag = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / start.scale;
      const dy = (ev.clientY - start.y) / start.scale;
      const o = start.orig;
      const W = start.W;
      const H = start.H;
      let r: CropRect;
      switch (start.mode) {
        case "move":
          r = { ...o, x: clamp(o.x + dx, 0, W - o.w), y: clamp(o.y + dy, 0, H - o.h) };
          break;
        case "n": {
          const y2 = o.y + o.h;
          const ny = clamp(o.y + dy, 0, y2 - MIN_CROP_PX);
          r = { ...o, y: ny, h: y2 - ny };
          break;
        }
        case "s":
          r = { ...o, h: clamp(o.h + dy, MIN_CROP_PX, H - o.y) };
          break;
        case "w": {
          const x2 = o.x + o.w;
          const nx = clamp(o.x + dx, 0, x2 - MIN_CROP_PX);
          r = { ...o, x: nx, w: x2 - nx };
          break;
        }
        case "e":
          r = { ...o, w: clamp(o.w + dx, MIN_CROP_PX, W - o.x) };
          break;
        case "nw": {
          const x2 = o.x + o.w;
          const y2 = o.y + o.h;
          const nx = clamp(o.x + dx, 0, x2 - MIN_CROP_PX);
          const ny = clamp(o.y + dy, 0, y2 - MIN_CROP_PX);
          r = { x: nx, y: ny, w: x2 - nx, h: y2 - ny };
          break;
        }
        case "ne": {
          const y2 = o.y + o.h;
          const ny = clamp(o.y + dy, 0, y2 - MIN_CROP_PX);
          r = { x: o.x, y: ny, w: clamp(o.w + dx, MIN_CROP_PX, W - o.x), h: y2 - ny };
          break;
        }
        case "sw": {
          const x2 = o.x + o.w;
          const nx = clamp(o.x + dx, 0, x2 - MIN_CROP_PX);
          r = { x: nx, y: o.y, w: x2 - nx, h: clamp(o.h + dy, MIN_CROP_PX, H - o.y) };
          break;
        }
        case "se":
          r = {
            x: o.x,
            y: o.y,
            w: clamp(o.w + dx, MIN_CROP_PX, W - o.x),
            h: clamp(o.h + dy, MIN_CROP_PX, H - o.y),
          };
          break;
      }
      setRect(r);
      rectRef.current = r;
      notify(r, start.rot);
    };
    const endDrag = () => {
      window.removeEventListener("pointermove", applyDrag);
      window.removeEventListener("pointerup", endDrag);
      const snapped = {
        x: Math.round(rectRef.current.x),
        y: Math.round(rectRef.current.y),
        w: Math.round(rectRef.current.w),
        h: Math.round(rectRef.current.h),
      };
      setRect(snapped);
      notify(snapped, start.rot);
    };
    window.addEventListener("pointermove", applyDrag);
    window.addEventListener("pointerup", endDrag);
  };

  // ---- Zoom e navegação (transplantado do recorte antigo) ----
  const fitScale =
    stage.w > 8 && stage.h > 8
      ? Math.min((stage.w - 24) / work.width, (stage.h - 24) / work.height)
      : 0;
  const dispW = fitScale > 0 ? work.width * fitScale * zoom : 0;
  const dispH = fitScale > 0 ? work.height * fitScale * zoom : 0;
  const atFit = zoom === 1 && pan.x === 0 && pan.y === 0;

  const clampPan = useCallback(
    (p: { x: number; y: number }, z: number) => {
      // Limita o deslocamento para a imagem nunca sair totalmente da área visível.
      const mx = Math.max(0, (work.width * fitScale * z - stage.w) / 2);
      const my = Math.max(0, (work.height * fitScale * z - stage.h) / 2);
      return { x: clamp(p.x, -mx, mx), y: clamp(p.y, -my, my) };
    },
    [work.width, work.height, fitScale, stage.w, stage.h],
  );

  const applyZoom = useCallback(
    (target: number, anchor?: { cx: number; cy: number }) => {
      const next = clamp(target, 1, MAX_ZOOM);
      if (!Number.isFinite(next) || next === zoom || fitScale === 0) return;
      if (anchor) {
        // Zoom centrado no ponto ancora (cursor): o conteúdo sob o cursor fica parado.
        const k = next / zoom;
        setPan((p) =>
          clampPan(
            { x: anchor.cx - (anchor.cx - p.x) * k, y: anchor.cy - (anchor.cy - p.y) * k },
            next,
          ),
        );
      } else {
        setPan((p) => clampPan(p, next));
      }
      setZoom(next);
    },
    [zoom, fitScale, clampPan],
  );

  const startPan = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    panRef.current = { startX: e.clientX, startY: e.clientY, basePan: pan };
    setPanning(true);
    const onMove = (ev: PointerEvent) => {
      const d = panRef.current;
      if (!d) return;
      setPan(
        clampPan(
          { x: d.basePan.x + (ev.clientX - d.startX), y: d.basePan.y + (ev.clientY - d.startY) },
          zoom,
        ),
      );
    };
    const onUp = () => {
      panRef.current = null;
      setPanning(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // Clique na imagem: dentro do quadro (ou zoom 100%) move o quadro;
  // fora do quadro com zoom, ou no modo mãozinha, navega pela imagem.
  const onImagePointerDown = (e: React.PointerEvent) => {
    const stack = stackRef.current;
    if (!stack) return;
    const bounds = stack.getBoundingClientRect();
    const ix = bounds.width > 0 ? ((e.clientX - bounds.left) / bounds.width) * work.width : 0;
    const iy = bounds.height > 0 ? ((e.clientY - bounds.top) / bounds.height) * work.height : 0;
    const inside =
      ix >= rect.x && ix <= rect.x + rect.w && iy >= rect.y && iy <= rect.y + rect.h;
    if (hand || (zoom > 1 && !inside)) {
      startPan(e);
    } else {
      beginDrag(e, "move");
    }
  };

  // Ctrl + roda do mouse (ou pinça no trackpad): zoom centrado no cursor.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || fitScale === 0) return;
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
  }, [zoom, fitScale, applyZoom]);

  // Setas do teclado: movem o quadro em 1 px (Shift = 10 px) — precisão no zoom.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      )
        return;
      const step = e.shiftKey ? 10 : 1;
      const d =
        e.key === "ArrowLeft"
          ? [-step, 0]
          : e.key === "ArrowRight"
            ? [step, 0]
            : e.key === "ArrowUp"
              ? [0, -step]
              : e.key === "ArrowDown"
                ? [0, step]
                : null;
      if (!d) return;
      e.preventDefault();
      const r = rectRef.current;
      const next: CropRect = {
        ...r,
        x: clamp(r.x + d[0], 0, work.width - r.w),
        y: clamp(r.y + d[1], 0, work.height - r.h),
      };
      rectRef.current = next;
      setRect(next);
      notify(next, rotation);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [work.width, work.height, rotation, notify]);

  // ---- Feedback ao vivo ----
  const rw = Math.max(1, Math.round(rect.w));
  const rh = Math.max(1, Math.round(rect.h));
  const dpi = Math.min(effectiveDpi(rw, spec.widthMm), effectiveDpi(rh, spec.heightMm));
  const dpiLevel = dpi >= 300 ? "good" : dpi >= 200 ? "warn" : "bad";
  const targetRatio = spec.widthMm / spec.heightMm;
  const ratioDiff = Math.abs(rw / rh - targetRatio) / targetRatio;

  const hasCrop = rotation % 360 !== 0 || !isFullRect(rect, work.width, work.height);
  const orientation = work.width > work.height ? "Paisagem" : "Retrato";

  const handleContinue = () => {
    if (!hasCrop) {
      onApply(null, null);
      return;
    }
    onApply(cropCanvas(work, rect), { rotation, rect: { ...rect } });
  };

  // Posição do quadro em % — acompanha o dimensionamento CSS automaticamente.
  const pct = {
    left: `${(rect.x / work.width) * 100}%`,
    top: `${(rect.y / work.height) * 100}%`,
    width: `${(rect.w / work.width) * 100}%`,
    height: `${(rect.h / work.height) * 100}%`,
  };

  const HANDLES: { mode: DragMode; className: string }[] = [
    { mode: "nw", className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize" },
    { mode: "n", className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize" },
    { mode: "ne", className: "left-full top-0 -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize" },
    { mode: "e", className: "left-full top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize" },
    { mode: "se", className: "left-full top-full -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize" },
    { mode: "s", className: "left-1/2 top-full -translate-x-1/2 -translate-y-1/2 cursor-ns-resize" },
    { mode: "sw", className: "left-0 top-full -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize" },
    { mode: "w", className: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize" },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
      {/* Coluna esquerda: imagem + quadro de recorte */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crop className="h-5 w-5 text-amber-600" aria-hidden />
            Recortar a arte
          </CardTitle>
          <CardDescription>
            A arte inteira fica visível — arraste o quadro e as alças para isolar o cartão ou panfleto (útil quando a
            arte vem com fundo em volta, tipo foto em ambiente). Opcional: sem ajuste, a arte é usada como está.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => doRotate("ccw")}>
                <RotateCcw className="h-4 w-4" aria-hidden />
                90° à esquerda
              </Button>
              <Button variant="outline" size="sm" onClick={() => doRotate("cw")}>
                <RotateCw className="h-4 w-4" aria-hidden />
                90° à direita
              </Button>
              <Button variant="ghost" size="sm" onClick={doReset} disabled={rotation % 360 === 0 && isFullRect(rect, work.width, work.height)}>
                <Undo2 className="h-4 w-4" aria-hidden />
                Resetar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDetect}
                disabled={detecting}
                title="Detecta automaticamente a borda da peça contra um fundo uniforme"
              >
                {detecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <ScanLine className="h-4 w-4" aria-hidden />
                )}
                {detecting ? "Detectando…" : "Detectar bordas"}
              </Button>
            </div>
            <Badge variant="secondary">
              {orientation} · {work.width} × {work.height} px
            </Badge>
          </div>

          {detectHint && (
            <p className="rounded-lg border border-amber-600/40 bg-amber-600/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
              {detectHint}
            </p>
          )}

          {/* Área de edição — imagem inteira em 100% (fit-to-view), zoom até 6× para conferir a borda da peça */}
          <div className="rounded-xl border bg-muted/30 p-3">
            <div
              ref={stageRef}
              className="relative flex h-[62vh] min-h-[280px] items-center justify-center overflow-hidden rounded-lg"
            >
              <div
                ref={stackRef}
                className={cn(
                  "relative shrink-0 select-none",
                  panning ? "cursor-grabbing" : hand ? "cursor-grab" : "cursor-move",
                )}
                style={{
                  width: dispW > 0 ? dispW : undefined,
                  height: dispH > 0 ? dispH : undefined,
                  transform: `translate(${pan.x}px, ${pan.y}px)`,
                  touchAction: "none",
                  lineHeight: 0,
                }}
                onPointerDown={onImagePointerDown}
              >
                <canvas
                  ref={viewRef}
                  aria-label="Imagem com quadro de recorte editável"
                  className="block h-full w-full"
                />
                {/* Escurece o que fica fora do quadro (box-shadow gigante recortado pelo overflow-hidden) */}
                <div
                  role="application"
                  aria-label="Quadro de recorte — arraste para mover, use as alças para redimensionar"
                  className="absolute cursor-move border-2 border-amber-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
                  style={pct}
                  onPointerDown={(e) => {
                    // Impede que o pointerdown borbulhe para o stage (que iniciaria
                    // um pan da imagem em vez de mover o quadro).
                    e.stopPropagation();
                    beginDrag(e, "move");
                  }}
                >
                  {HANDLES.map((h) => (
                    <div
                      key={h.mode}
                      onPointerDown={(e) => {
                        // Impede que o pointerdown borbulhe para o quadro (que iniciaria
                        // um segundo drag "move" e cancelaria o redimensionamento).
                        e.stopPropagation();
                        beginDrag(e, h.mode);
                      }}
                      aria-label={`Alça ${h.mode}`}
                      className={cn(
                        "absolute h-5 w-5 rounded-full border-2 border-amber-500 bg-white shadow-md",
                        h.className,
                      )}
                    />
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
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Dica: use o zoom (Ctrl + roda do mouse ou os botões) para conferir a borda da peça de perto. As setas do
            teclado movem o quadro em 1 px (Shift + seta = 10 px). Para girar a arte inteira (cartão em pé → deitado, ou
            panfleto deitado → em pé), use os botões de 90° — o recorte acompanha a rotação.
          </p>
        </CardContent>
      </Card>

      {/* Coluna direita: diagnóstico do recorte + continuar */}
      <div className="flex flex-col gap-6">
        <Card className="flex-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5 text-amber-600" aria-hidden />
              Recorte selecionado
            </CardTitle>
            <CardDescription>
              Destino: {spec.name} — corte {fmtMm(spec.widthMm)} × {fmtMm(spec.heightMm)} mm @ 300 DPI.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-lg border p-3.5">
              <RefreshCcw className="mt-0.5 h-5 w-5 text-amber-600" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Área do recorte</p>
                  <Badge variant="secondary">
                    {rotation % 360 === 0 ? "Sem rotação" : `Girada ${rotation}°`}
                  </Badge>
                </div>
                <p className="mt-0.5 text-lg font-semibold leading-tight">
                  {rw} × {rh} px
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {hasCrop ? "Esta área é que será enviada ao tratamento." : "Arte completa — nada recortado ainda."}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border p-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Qualidade do recorte</p>
                  <Badge
                    variant="secondary"
                    className={cn(
                      dpiLevel === "good" && "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400",
                      dpiLevel === "warn" && "bg-amber-600/15 text-amber-700 dark:text-amber-400",
                      dpiLevel === "bad" && "bg-red-600/15 text-red-700 dark:text-red-400",
                    )}
                  >
                    {dpiLevel === "good" ? "OK" : dpiLevel === "warn" ? "Atenção" : "Crítico"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-lg font-semibold leading-tight">≈{dpi} DPI efetivos</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {dpi >= 300
                    ? "Resolução suficiente para impressão sem perda."
                    : dpi >= 200
                      ? "Aceitável, mas o ideal é recortar mais justa (menos px perdidos) ou usar a arte em maior resolução."
                      : "Abaixo do recomendado — o recorte vai ficar com pouca resolução na impressão."}
                </p>
              </div>
            </div>

            {ratioDiff > 0.02 && (
              <p className="rounded-lg border border-amber-600/40 bg-amber-600/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                A proporção do recorte ({(rw / rh).toFixed(2)}:1) difere do corte ({targetRatio.toFixed(2)}:1). Sem
                problema: na próxima etapa o modo &quot;Preencher&quot; recorta as sobras (centralizado) ou o
                &quot;Conter&quot; adiciona bordas brancas.
              </p>
            )}
          </CardContent>
        </Card>

        <Button size="lg" onClick={handleContinue} className="bg-amber-600 text-white hover:bg-amber-700">
          {hasCrop ? (
            <>
              <Scissors className="h-5 w-5" aria-hidden />
              Aplicar recorte e continuar
            </>
          ) : (
            <>
              Continuar sem recortar
              <ArrowRight className="h-5 w-5" aria-hidden />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
