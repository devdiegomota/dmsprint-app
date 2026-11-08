"use client";

/**
 * Editor de posicionamento da arte na faixa da tenda (Task 30) + conta-gotas
 * (Task 32).
 *
 * Arrastar posiciona, roda do mouse / slider dão zoom, "Preencher" cobre a
 * faixa recortando e "Enquadrar" mostra a arte inteira com fundo branco. Usa
 * EXATAMENTE a mesma matemática do PDF (computeArtRect / panPlacement), então
 * o enquadramento ajustado aqui sai idêntico no impresso. O conta-gotas amostra
 * o pixel clicado DA PRÓPRIA faixa composta — a cor vista é a cor impressa.
 */

import { useEffect, useRef, useState } from "react";
import { Pipette } from "lucide-react";
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
  /** Conta-gotas: cor do pixel clicado na arte (já composta, como sai no PDF). */
  onPickColor?: (hex: string) => void;
}

export function ArtPlacementEditor({
  art,
  bandW,
  bandH,
  placement,
  onChange,
  onPickColor,
}: ArtPlacementEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [picking, setPicking] = useState(false);

  /** Cor do pixel da faixa sob o ponteiro (converte CSS px → px da faixa). */
  const sampleAt = (e: React.PointerEvent<HTMLCanvasElement>): string | null => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * canvas.height);
    const px = Math.max(0, Math.min(canvas.width - 1, x));
    const py = Math.max(0, Math.min(canvas.height - 1, y));
    const d = ctx.getImageData(px, py, 1, 1).data;
    const toHex = (v: number) => v.toString(16).padStart(2, "0");
    return `#${toHex(d[0])}${toHex(d[1])}${toHex(d[2])}`;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (picking) {
      const hex = sampleAt(e);
      if (hex) onPickColor?.(hex);
      setPicking(false);
      return;
    }
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

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
        className={`mx-auto block w-full max-w-[230px] touch-none rounded-md border shadow-sm ${
          picking ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
        }`}
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
        {onPickColor && (
          <Button
            type="button"
            size="sm"
            variant={picking ? "default" : "outline"}
            onClick={() => setPicking((p) => !p)}
            data-testid="eyedropper"
          >
            <Pipette className="h-4 w-4" /> Conta-gotas
          </Button>
        )}
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
        {picking ? (
          <>Clique na arte para amostrar a cor daquele ponto — ela vira a cor dos textos.</>
        ) : (
          <>
            Arraste a arte para posicionar · roda do mouse ou slider para zoom · o recorte daqui é
            o mesmo que sai no PDF. &quot;Enquadrar&quot; mostra a arte inteira (fundo branco);
            &quot;Preencher&quot; cobre a faixa recortando.
          </>
        )}
      </p>
    </div>
  );
}
