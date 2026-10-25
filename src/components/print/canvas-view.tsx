"use client";

import { useEffect, useRef } from "react";

/**
 * Renderiza um HTMLCanvasElement (fora da árvore React) dentro do layout.
 * Uma cópia é desenhada em um novo elemento, evitando mutar a referência
 * original e permitindo que o mesmo canvas apareça em vários lugares.
 * A cópia é esticada para 100% da largura do container (altura proporcional).
 */
export function CanvasView({
  canvas,
  className,
  ariaLabel,
}: {
  canvas: HTMLCanvasElement;
  className?: string;
  ariaLabel?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext("2d")!.drawImage(canvas, 0, 0);
    copy.style.display = "block";
    copy.style.width = "100%";
    copy.style.height = "auto";
    copy.setAttribute("role", "img");
    if (ariaLabel) copy.setAttribute("aria-label", ariaLabel);
    host.replaceChildren(copy);
    return () => {
      copy.remove();
    };
  }, [canvas, ariaLabel]);

  return <div ref={hostRef} className={className} />;
}
