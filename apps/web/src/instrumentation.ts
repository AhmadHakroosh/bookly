import * as Sentry from "@sentry/nextjs";

/** Server-side render and route errors go to Sentry when configured. */
export const onRequestError = Sentry.captureRequestError;

/**
 * Boots background work when the Node server starts. The driver comes from the environment
 * (see `jobDriver` in `@/server/jobs`): QStash when `QSTASH_TOKEN` is set (serverless; jobs
 * call back into /api/jobs/<name>, so only the schedules are registered here), inline when
 * `JOBS_WORKER=false` without QStash (no worker at all), otherwise the in-process pg-boss
 * worker on Postgres (the self-host default).
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
      console.log(`[jobs] driver: qstash (QSTASH_TOKEN set); ${n} schedules ensured`);
      return;
    }
    if (jobDriver() === "inline") {
      console.log("[jobs] driver: inline (JOBS_WORKER=false, no QStash); no worker, no schedules");
      return;
    }
    const { JOB_NAMES, schedule, work } = await import("@bookly/jobs");
    for (const name of JOB_NAMES) await work(name, (data) => runJob(name, data as never));
    for (const s of SCHEDULES) await schedule(s.name, s.cron, {} as never);
    console.log(
      "[jobs] driver: pgboss (no QSTASH_TOKEN, JOBS_WORKER not false); in-process worker started on Postgres",
    );
  } catch (err) {
    console.error("[jobs] failed to start worker", err);
  }
}
