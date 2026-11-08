"use client";

/**
 * Editor de posicionamento da arte na faixa da tenda (Task 30).
 *
 * Arrastar posiciona, roda do mouse / slider dão zoom, "Preencher" cobre a
 * faixa recortando e "Enquadrar" mostra a arte inteira com fundo branco. Usa
 * EXATAMENTE a mesma matemática do PDF (computeArtRect / panPlacement), então
 * o enquadramento ajustado aqui sai idêntico no impresso.
 */

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  PLACEMENT_ZOOM_MAX,
  PLACEMENT_ZOOM_MIN,
  clampZoom,
  computeArtRect,
  panPlacement,
  type ArtPlacement,
} from "@/lib/calendar/compose-tenda-a4";

interface ArtPlacementEditorProps {
  art: HTMLCanvasElement;
  /** Dimensões da faixa em px de impressão (300 DPI) — define a proporção. */
  bandW: number;
  bandH: number;
  placement: ArtPlacement;
  onChange: (placement: ArtPlacement) => void;
}

export function ArtPlacementEditor({
  art,
  bandW,
  bandH,
  placement,
  onChange,
}: ArtPlacementEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);

  // Redesenha a faixa com o posicionamento atual — mesma matemática do PDF.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = bandW;
    canvas.height = bandH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, bandW, bandH);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, bandW, bandH);
    ctx.clip();
    if (placement.fitMode === "contain") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, bandW, bandH);
    }
    const rect = computeArtRect(
      { width: art.width, height: art.height },
      { width: bandW, height: bandH },
      placement,
    );
    ctx.drawImage(art, rect.dx, rect.dy, rect.dw, rect.dh);
    ctx.restore();
  }, [art, bandW, bandH, placement]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    const scale = bandW / (e.currentTarget.clientWidth || bandW); // CSS px → px da faixa
    const ddx = (e.clientX - drag.x) * scale;
    const ddy = (e.clientY - drag.y) * scale;
    dragRef.current = { id: drag.id, x: e.clientX, y: e.clientY };
    onChange(
      panPlacement(
        { width: art.width, height: art.height },
        { width: bandW, height: bandH },
        placement,
        ddx,
        ddy,
      ),
    );
  };

  const onPointerEnd = () => {
    dragRef.current = null;
  };

  // Roda do mouse = zoom (listener não-passivo para poder travar o scroll).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      onChange({ ...placement, zoom: clampZoom(placement.zoom * Math.pow(1.0018, -e.deltaY)) });
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [placement, onChange]);

  return (
    <div className="grid gap-3">
      <canvas
        ref={canvasRef}
        data-testid="art-band-editor"
        className="mx-auto block w-full max-w-[230px] cursor-grab touch-none rounded-md border shadow-sm active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        aria-label="Faixa da arte — arraste para posicionar"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={placement.fitMode === "cover" ? "default" : "outline"}
          onClick={() => onChange({ ...placement, fitMode: "cover", zoom: 1 })}
        >
          Preencher
        </Button>
        <Button
          type="button"
          size="sm"
          variant={placement.fitMode === "contain" ? "default" : "outline"}
          onClick={() => onChange({ ...placement, fitMode: "contain", zoom: 1 })}
        >
          Enquadrar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...placement, zoom: 1, fx: 0.5, fy: 0.5 })}
        >
          Centralizar
        </Button>
        <input
          data-testid="art-zoom"
          aria-label="Zoom da arte"
          type="range"
          min={PLACEMENT_ZOOM_MIN}
          max={PLACEMENT_ZOOM_MAX}
          step={0.02}
          value={placement.zoom}
          onChange={(e) => onChange({ ...placement, zoom: Number(e.target.value) })}
          className="h-2 min-w-32 flex-1 accent-primary"
        />
        <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
          {Math.round(placement.zoom * 100)}%
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Arraste a arte para posicionar · roda do mouse ou slider para zoom · o recorte daqui é o
        mesmo que sai no PDF. &quot;Enquadrar&quot; mostra a arte inteira (fundo branco);
        &quot;Preencher&quot; cobre a faixa recortando.
      </p>
    </div>
  );
}
