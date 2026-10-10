"use client";

import { Spinner } from "@/components/ui/spinner";

/**
 * Covers the whole page while something with global effect is in flight: signing out,
 * switching workspace, deleting an account or a workspace. Blurs what is behind it and
 * swallows clicks, so nothing else can be started halfway through.
 */
export function BusyOverlay({ show, label }: { show: boolean; label: string }) {
  if (!show) return null;
  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed inset-0 z-100 flex items-center justify-center bg-background/70 backdrop-blur-sm"
    >
      <div className="flex items-center gap-3 rounded-lg border bg-background px-5 py-4 text-sm shadow-lg">
        <Spinner aria-hidden />
        {label}
      </div>
    </div>
  );
}
