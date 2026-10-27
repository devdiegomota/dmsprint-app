"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crop, RotateCcw, RotateCw, ArrowRight, Undo2, Scissors, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fmtMm, type ProductSpec } from "@/lib/print/constants";
import {
  cropCanvas,
  effectiveDpi,
  isFullRect,
  rotateCanvas90,
  rotateRect,
  type CropRect,
  type CropSession,
} from "@/lib/print/crop";

const MIN_CROP_PX = 32; // recorte mínimo (px da imagem) para não sumir com o quadro

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
  /** Espelho do último retângulo — atualizado nos handlers (nunca no render). */
  const rectRef = useRef<CropRect>(rect);

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

  const notify = (r: CropRect, rot: number) => onSessionChange({ rotation: rot, rect: r });

  // ---- Rotação: a imagem gira e o quadro de recorte acompanha o conteúdo ----
  const doRotate = (dir: "cw" | "ccw") => {
    const nextRot = (((rotation + (dir === "cw" ? 90 : 270)) % 360) + 360) % 360;
    const nextRect = rotateRect(rect, work.width, work.height, dir);
    rectRef.current = nextRect;
    setRotation(nextRot);
    setRect(nextRect);
    notify(nextRect, nextRot);
  };

  const doReset = () => {
    setRotation(0);
    const full: CropRect = { x: 0, y: 0, w: source.width, h: source.height };
    rectRef.current = full;
    setRect(full);
    onSessionChange(null);
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
            </div>
            <Badge variant="secondary">
              {orientation} · {work.width} × {work.height} px
            </Badge>
          </div>

          {/* Área de edição — a imagem fica inteira na tela (fit-to-view) */}
          <div className="rounded-xl border bg-muted/30 p-3">
            <div className="flex justify-center">
              <div
                ref={stackRef}
                className="relative select-none overflow-hidden rounded-lg"
                style={{ touchAction: "none", lineHeight: 0 }}
              >
                <canvas
                  ref={viewRef}
                  aria-label="Imagem com quadro de recorte editável"
                  className="block h-auto max-h-[62vh] w-auto max-w-full"
                />
                {/* Escurece o que fica fora do quadro (box-shadow gigante recortado pelo overflow-hidden) */}
                <div
                  role="application"
                  aria-label="Quadro de recorte — arraste para mover, use as alças para redimensionar"
                  className="absolute cursor-move border-2 border-amber-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
                  style={pct}
                  onPointerDown={(e) => beginDrag(e, "move")}
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
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Dica: para girar a arte inteira (cartão em pé → deitado, ou panfleto deitado → em pé), use os botões de 90°
            — o recorte acompanha a rotação.
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
