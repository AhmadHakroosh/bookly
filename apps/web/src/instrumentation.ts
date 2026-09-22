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
  if (process.env.SKIP_ENV_VALIDATION || process.env.JOBS_WORKER === "false") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const { schedule, work } = await import("@bookly/jobs");
    const { sendDueReminders } = await import("@/server/reminders");
    await work("booking.reminders", async () => {
      await sendDueReminders();
    });
    await schedule("booking.reminders", "*/10 * * * *", {});
    const { retryDueDeliveries } = await import("@/server/webhooks");
    await work("webhooks.retry", async () => {
      await retryDueDeliveries();
    });
    await schedule("webhooks.retry", "*/5 * * * *", {});
    const { renewCalendarWatches } = await import("@/server/integrations");
    await work("calendar.sync", async () => {
      await renewCalendarWatches();
    });
    await schedule("calendar.sync", "17 */6 * * *", { workspaceId: "*" });
    console.log("[jobs] worker started");
  } catch (err) {
    console.error("[jobs] failed to start worker", err);
  }
}
