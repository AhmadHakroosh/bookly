"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Adds `data-reveal="in"` to elements as they scroll into view (see globals.css). Re-arms on
 * client-side navigation and on late-streamed content so nothing stays hidden.
 */
export function Reveal() {
  const pathname = usePathname();
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io =
      "IntersectionObserver" in window && !reduce
        ? new IntersectionObserver(
            (entries) => {
              for (const e of entries)
                if (e.isIntersecting) {
                  (e.target as HTMLElement).dataset.reveal = "in";
                  io?.unobserve(e.target);
                }
            },
            { rootMargin: "0px 0px -10% 0px" },
          )
        : null;
    const arm = () => {
      document
        .querySelectorAll<HTMLElement>("[data-reveal]:not([data-reveal='in'])")
        .forEach((el) => (io ? io.observe(el) : (el.dataset.reveal = "in")));
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
