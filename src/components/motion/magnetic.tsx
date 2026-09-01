"use client";

import { useRef, type MouseEvent, type ReactNode } from "react";

export function Magnetic({ children, strength = 16 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  function handleMove(event: MouseEvent<HTMLSpanElement>) {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = el.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    el.style.transform = `translate(${(x / rect.width) * strength}px, ${(y / rect.height) * strength}px)`;
  }

  function reset() {
    if (ref.current) ref.current.style.transform = "translate(0,0)";
  }

  return <span ref={ref} className="magnetic" onMouseMove={handleMove} onMouseLeave={reset}>{children}</span>;
}
