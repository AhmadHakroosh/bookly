/** Pure helpers for the update check, kept free of I/O so they can be unit-tested. */

/** Compare dotted versions: negative when a < b, positive when a > b, 0 when equal. */
export function compareVersions(a: string, b: string): number {
  const pa = a
    .replace(/^v/, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const pb = b
    .replace(/^v/, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export type UsageStats = {
  workspaces: number;
  hosts: number;
  eventTypes: number;
  bookings30d: number;
  contacts: number;
  integrations: string[];
  captureEnabled: boolean;
  paymentsEnabled: boolean;
};

export type TelemetryPing = {
  installId: string;
  version: string;
  tenancy: "single" | "multi";
  nodeVersion: string;
  /** Present only when the workspace opted in. Counts only, never people or content. */
  stats?: UsageStats;
};

export type TelemetryReply = { latest: string; url: string };

/** Whether the reply announces a newer version than the one running. */
export function updateAvailable(current: string, reply: TelemetryReply | null | undefined) {
  return !!reply && compareVersions(reply.latest, current) > 0;
}
