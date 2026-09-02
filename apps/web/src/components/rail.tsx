"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Horizontal snap carousel with desktop arrow controls (hidden on touch). */
export function Rail({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      setAtStart(el.scrollLeft < 10);
      setAtEnd(el.scrollLeft > el.scrollWidth - el.clientWidth - 10);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { el.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);

  const scroll = (direction: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const card = el.firstElementChild?.getBoundingClientRect().width ?? 340;
    el.scrollBy({ left: direction * (card + 22) * 2, behavior: "smooth" });
  };

  return <div className="rail-wrap">
    <button className="rail-nav rail-prev" onClick={() => scroll(-1)} disabled={atStart} aria-label={`Scroll ${label} back`}><ArrowLeft/></button>
    <div className="dest-rail" ref={ref} role="region" aria-label={label}>{children}</div>
    <button className="rail-nav rail-next" onClick={() => scroll(1)} disabled={atEnd} aria-label={`Scroll ${label} forward`}><ArrowRight/></button>
  </div>;
}
