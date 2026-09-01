"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Arms scroll-reveal animations after hydration. Content is fully visible by
 * default (html lacks .reveal-armed), so no-JS clients, crawlers and slow
 * connections always see the page; elements already in the viewport are marked
 * visible synchronously before arming, so nothing on screen ever flashes.
 */
export function ScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal], [data-reveal-scale]"));

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      nodes.forEach((node) => node.classList.add("is-visible"));
      document.documentElement.classList.add("reveal-armed");
      return;
    }

    const viewportHeight = window.innerHeight;
    const pending: HTMLElement[] = [];
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (rect.top < viewportHeight * 0.95 && rect.bottom > 0) node.classList.add("is-visible");
      else pending.push(node);
    }
    document.documentElement.classList.add("reveal-armed");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    pending.forEach((node) => observer.observe(node));

    // Elements rendered after mount (client-side loading states, dialogs)
    // must still reveal: watch for late arrivals.
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        for (const added of record.addedNodes) {
          if (!(added instanceof HTMLElement)) continue;
          const late = added.matches("[data-reveal], [data-reveal-scale]")
            ? [added]
            : Array.from(added.querySelectorAll<HTMLElement>("[data-reveal], [data-reveal-scale]"));
          for (const node of late) {
            const rect = node.getBoundingClientRect();
            if (rect.top < window.innerHeight * 0.95 && rect.bottom > 0) node.classList.add("is-visible");
            else observer.observe(node);
          }
        }
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => { observer.disconnect(); mutations.disconnect(); };
  }, [pathname]);

  return null;
}
