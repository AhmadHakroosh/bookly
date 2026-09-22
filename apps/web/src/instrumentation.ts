import * as Sentry from "@sentry/nextjs";

/** Server-side render and route errors go to Sentry when configured. */
export const onRequestError = Sentry.captureRequestError;

/**
 * Starts the in-process job worker (pg-boss) when the Node server boots.
 * Reminder and calendar-sync handlers are registered in later phases.
 */
export async function register() {
  // Error tracking (server and edge), on only when SENTRY_DSN is set.
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      tracesSampleRate: 0.05,
      sendDefaultPii: false,
    });
  }
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SKIP_ENV_VALIDATION) return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const { jobDriver, runJob, ensureSchedules, SCHEDULES } = await import("@/server/jobs");
    if (jobDriver() === "qstash") {
      const n = await ensureSchedules();
      console.log(`[jobs] QStash driver, ${n} schedules ensured`);
      return;
    }
    if (jobDriver() === "inline") return;
    const { JOB_NAMES, schedule, work } = await import("@bookly/jobs");
    for (const name of JOB_NAMES) await work(name, (data) => runJob(name, data as never));
    for (const s of SCHEDULES) await schedule(s.name, s.cron, {} as never);
    console.log("[jobs] worker started");
  } catch (err) {
    console.error("[jobs] failed to start worker", err);
  }
}
