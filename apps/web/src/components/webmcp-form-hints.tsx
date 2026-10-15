"use client";

import { useEffect } from "react";

/*
 * Forms that post to a server action carry hidden inputs React adds for progressive
 * enhancement (`$ACTION_REF_…`, `$ACTION_KEY`). A WebMCP declarative tool reduces every named
 * control to a parameter, and a parameter without a description costs the schema audit; this
 * labels those inputs as internal so agents leave them alone. Runs once and on later changes.
 */
export function WebMcpFormHints() {
  useEffect(() => {
    const mark = () => {
      const inputs = document.querySelectorAll<HTMLInputElement>(
        'form[toolname] input[type="hidden"]:not([toolparamdescription])',
      );
      for (const input of inputs)
        input.setAttribute("toolparamdescription", "Internal to the page; leave exactly as it is.");
    };
    mark();
    const observer = new MutationObserver(mark);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
