/**
 * Starts the in-process job worker (pg-boss) when the Node server boots.
 * Reminder and calendar-sync handlers are registered in later phases.
 */
export async function register() {
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
    console.log("[jobs] worker started");
  } catch (err) {
    console.error("[jobs] failed to start worker", err);
  }
}
