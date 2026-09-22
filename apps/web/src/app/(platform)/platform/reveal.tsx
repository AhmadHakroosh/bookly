"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Fades `[data-reveal]` elements in as they scroll into view. The hidden state comes from CSS
 * (`.js-reveal [data-reveal]`, globals.css) and the reveal is a Web Animation, so nothing here
 * writes attributes or classes that React owns: a refresh mid-page hydrates the streamed
 * sections after this effect has already run, and any attribute we set would show up as a
 * hydration mismatch. Re-arms on client-side navigation and on late-streamed content.
 */
export function Reveal() {
  const pathname = usePathname();
  useEffect(() => {
    // Under reduced motion the stylesheet keeps everything visible; nothing to animate.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const shown = new WeakSet<Element>();
    const show = (el: HTMLElement) => {
      shown.add(el);
      const delay = parseFloat(getComputedStyle(el).getPropertyValue("--reveal-delay")) || 0;
      el.animate(
        [
          { opacity: 0, translate: "0 18px" },
          { opacity: 1, translate: "0 0" },
        ],
        { duration: 700, delay, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", fill: "forwards" },
      );
    };
    const io =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => {
              for (const e of entries)
                if (e.isIntersecting) {
                  show(e.target as HTMLElement);
                  io?.unobserve(e.target);
                }
            },
            { rootMargin: "0px 0px -10% 0px" },
          )
        : null;
    const arm = () => {
      document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
        if (shown.has(el)) return;
        if (io) io.observe(el);
        else show(el);
      });
    };
    document.documentElement.classList.add("js-reveal");
    arm();
    const mo = new MutationObserver(arm);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.documentElement.classList.remove("js-reveal");
      mo.disconnect();
      io?.disconnect();
    };
  }, [pathname]);
  return null;
}
