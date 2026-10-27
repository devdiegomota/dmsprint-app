"use client";

import { Check, Upload, Crop, Wand2, LayoutGrid, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const STEPS = [
  { id: 1, label: "Upload & Produto", icon: Upload },
  { id: 2, label: "Recorte & Rotação", icon: Crop },
  { id: 3, label: "Tratamento", icon: Wand2 },
  { id: 4, label: "Pré-visualização", icon: LayoutGrid },
  { id: 5, label: "Exportar PDF", icon: FileDown },
] as const;

export function StepNav({
  current,
  maxReached,
  onGo,
}: {
  current: number;
  maxReached: number;
  onGo: (step: number) => void;
}) {
  return (
    <nav aria-label="Etapas do fluxo" className="w-full">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {STEPS.map((step) => {
          const Icon = step.icon;
          const done = step.id < current;
          const active = step.id === current;
          const reachable = step.id <= maxReached;
          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onGo(step.id)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                  active
                    ? "border-amber-600 bg-amber-600 text-white shadow-sm"
                    : done
                      ? "border-amber-600/40 bg-amber-600/10 text-foreground hover:bg-amber-600/20"
                      : reachable
                        ? "border-border bg-card text-foreground hover:bg-muted"
                        : "border-border/60 bg-muted/40 text-muted-foreground opacity-60",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    active
                      ? "border-white/60 bg-white/20 text-white"
                      : done
                        ? "border-amber-600 bg-amber-600 text-white"
                        : "border-border bg-background text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-medium uppercase tracking-wide opacity-75">
                    Etapa {step.id}
                  </span>
                  <span className="block truncate font-medium">{step.label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
