/**
 * Starts the in-process job worker (pg-boss) when the Node server boots.
 * Reminder and calendar-sync handlers are registered in later phases.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SKIP_ENV_VALIDATION || process.env.JOBS_WORKER === "false") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const { getBoss } = await import("@bookly/jobs");
    await getBoss();
    console.log("[jobs] worker started");
  } catch (err) {
    console.error("[jobs] failed to start worker", err);
  }
}
