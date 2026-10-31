"use client";

import { useCallback, useRef, useState } from "react";
import { CreditCard, FileImage, Scan, Loader2, ImageIcon, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PRODUCTS, type ProductId, A4, productPixelSize, fmtMm } from "@/lib/print/constants";

/** Mini-diagrama da imposição (grade) para o produto — derivado das medidas do spec. */
function LayoutDiagram({ product }: { product: ProductId }) {
  const spec = PRODUCTS[product];
  const cells = Array.from({ length: spec.unitsPerSheet });
  // Células proporcionais à folha (fator 0,88 compensa padding + gaps do flex para a
  // grade caber sempre no quadro, em qualquer produto).
  const cellWidth = `${((spec.widthMm / A4.widthMm) * 100 * 0.88).toFixed(1)}%`;
  const cellHeight = `${((spec.heightMm / A4.heightMm) * 100 * 0.88).toFixed(1)}%`;
  return (
    <div className="relative mx-auto w-20 aspect-[210/297] border border-dashed border-muted-foreground/50 bg-white/90">
      <div className="absolute inset-0 flex flex-wrap content-center items-center justify-center gap-[2px] p-[3px]">
        {cells.map((_, i) => (
          <div key={i} className="bg-amber-600/70" style={{ width: cellWidth, height: cellHeight }} />
        ))}
      </div>
    </div>
  );
}

export function UploadPanel({
  product,
  onProductChange,
  file,
  onFileChange,
  onAnalyze,
  processing,
}: {
  product: ProductId | null;
  onProductChange: (p: ProductId) => void;
  file: File | null;
  onFileChange: (f: File | null) => void;
  onAnalyze: () => void;
  processing: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptFile = useCallback(
    (f: File | undefined | null) => {
      setError(null);
      if (!f) return;
      const okType = ["image/png", "image/jpeg"].includes(f.type);
      if (!okType) {
        setError("Formato inválido. Envie um arquivo PNG ou JPG.");
        return;
      }
      if (f.size > 40 * 1024 * 1024) {
        setError("Arquivo muito grande (máx. 40 MB).");
        return;
      }
      onFileChange(f);
    },
    [onFileChange],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      acceptFile(e.dataTransfer.files?.[0]);
    },
    [acceptFile],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Seleção do produto */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scan className="h-5 w-5 text-amber-600" aria-hidden />
            1. Tipo de produto
          </CardTitle>
          <CardDescription>
            Define as dimensões de corte e a grade de imposição na folha A4 ({A4.widthMm} × {A4.heightMm} mm).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(PRODUCTS) as ProductId[]).map((id) => {
            const spec = PRODUCTS[id];
            const selected = product === id;
            const px = productPixelSize(spec);
            return (
              <button
                key={id}
                type="button"
                onClick={() => onProductChange(id)}
                aria-pressed={selected}
                className={cn(
                  "flex flex-col items-center gap-3 rounded-xl border p-4 text-center transition-all",
                  selected
                    ? "border-amber-600 bg-amber-600/10 shadow-sm ring-1 ring-amber-600"
                    : "border-border bg-card hover:border-amber-600/50 hover:bg-muted/60",
                )}
              >
                <LayoutDiagram product={id} />
                <div>
                  <p className="flex items-center justify-center gap-1.5 font-semibold">
                    {id === "cartao-visita" ? (
                      <CreditCard className="h-4 w-4 text-amber-600" aria-hidden />
                    ) : id === "panfleto-quadrado" ? (
                      <Square className="h-4 w-4 text-amber-600" aria-hidden />
                    ) : (
                      <FileImage className="h-4 w-4 text-amber-600" aria-hidden />
                    )}
                    {spec.name}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {fmtMm(spec.widthMm)} × {fmtMm(spec.heightMm)} mm
                  </p>
                  <Badge variant="secondary" className="mt-2">
                    {spec.unitsPerSheet} por folha · {spec.cols}×{spec.rows}
                  </Badge>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {px.widthPx} × {px.heightPx} px @ 300 DPI
                  </p>
                </div>
              </button>
            );
          })}
          <p className="sm:col-span-2 mt-1 rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
            {product ? PRODUCTS[product].spacingNote : "Selecione um produto para ver a política de espaçamento da imposição."}
          </p>
        </CardContent>
      </Card>

      {/* Upload da arte */}
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-amber-600" aria-hidden />
            2. Arte do cliente
          </CardTitle>
          <CardDescription>PNG ou JPG. A arte será reamostrada para 300 DPI e otimizada para impressão.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          <div
            role="button"
            tabIndex={0}
            aria-label="Enviar arquivo de arte"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={cn(
              "flex flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors min-h-44",
              dragging
                ? "border-amber-600 bg-amber-600/10"
                : "border-border bg-muted/30 hover:border-amber-600/50 hover:bg-muted/50",
            )}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-600/15">
              <ImageIcon className="h-6 w-6 text-amber-600" aria-hidden />
            </div>
            {file ? (
              <div className="min-w-0">
                <p className="truncate font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            ) : (
              <div>
                <p className="font-medium">Arraste a arte aqui ou clique para selecionar</p>
                <p className="text-sm text-muted-foreground">PNG · JPG — até 40 MB</p>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              onChange={(e) => acceptFile(e.target.files?.[0])}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button
            size="lg"
            disabled={!file || !product || processing}
            onClick={onAnalyze}
            className="w-full bg-amber-600 text-white hover:bg-amber-700"
          >
            {processing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                Analisando arte…
              </>
            ) : (
              <>
                <Scan className="h-5 w-5" aria-hidden />
                Analisar e preparar arte
              </>
            )}
          </Button>
          {!product && <p className="text-center text-xs text-muted-foreground">Escolha o tipo de produto para habilitar a análise.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
