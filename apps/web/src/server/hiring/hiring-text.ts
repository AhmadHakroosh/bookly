import type { OpportunitySettings, OpportunityType } from "@bookly/db/schema";

/*
 * Hiring rules without the database (ADR 0003): how long applications are kept, how long a late
 * draft may still be sent. Canon X4: people not admitted are deleted after the cycle, sooner for
 * programs than for jobs (US employers keep hiring records a year, 29 CFR 1602.14).
 */

/** Days after the cohort's last final decision before applications not admitted are deleted. */
export const RETENTION = { min: 30, max: 730 } as const;
/** Jobs and internships are employment records; programs, cohorts and the rest are not. */
const EMPLOYMENT: ReadonlySet<OpportunityType> = new Set(["job", "internship"]);

/** The type's default retention: 365 days for jobs and internships, 183 otherwise. */
export const defaultRetentionDays = (type: OpportunityType) => (EMPLOYMENT.has(type) ? 365 : 183);

/** The retention an opportunity uses: its setting within 30–730 days, else the type's default. */
export function retentionDays(type: OpportunityType, settings: OpportunitySettings): number {
  const d = settings.retentionDays;
  if (d === undefined || !Number.isFinite(d)) return defaultRetentionDays(type);
  return Math.min(RETENTION.max, Math.max(RETENTION.min, Math.round(d)));
}

/** The editor's warning for a retention shorter than employment law usually asks, or null. */
export function retentionWarning(type: OpportunityType, days: number): string | null {
  return EMPLOYMENT.has(type) && days < 365
    ? "Employers in the US usually have to keep hiring records for a year. Check before going shorter."
    : null;
}

/** Minutes after the deadline during which drafts started before it can still be sent. */
export function closeGraceMinutes(settings: OpportunitySettings): number {
  const m = settings.closeGraceMinutes;
  if (m === undefined || !Number.isFinite(m)) return 120;
  return Math.min(1440, Math.max(0, Math.round(m)));
}

/** When an application not admitted may be deleted: the last final decision + the retention. */
export function deleteAfter(lastDecisionAt: Date, days: number): Date {
  return new Date(lastDecisionAt.getTime() + days * 86_400_000);
}
