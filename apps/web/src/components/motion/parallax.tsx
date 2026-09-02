"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function Parallax({ children, speed = 0.12, className = "" }: { children: ReactNode; speed?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let visible = false;

    function tick() {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const offset = (rect.top - window.innerHeight / 2) * speed;
      el.style.setProperty("--py", `${offset.toFixed(1)}px`);
      frame = visible ? requestAnimationFrame(tick) : 0;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !frame) frame = requestAnimationFrame(tick);
      },
      { threshold: 0 }
    );

    observer.observe(el);
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [speed]);

  return <div ref={ref} className={`parallax ${className}`}>{children}</div>;
}
