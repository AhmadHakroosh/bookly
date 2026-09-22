import "server-only";
import { after } from "next/server";
import { loadEnv } from "@bookly/config";
import {
  JOB_NAMES,
  dlqCount,
  enqueue as bossEnqueue,
  listSchedules,
  publish,
  upsertSchedule,
  type JobName,
  type Jobs,
} from "@bookly/jobs";

/**
 * One place to run background work. Three drivers, chosen by env:
 * - qstash:  QSTASH_TOKEN set → publish to /api/jobs/<name>; QStash handles delay, retries,
 *            schedules and a dead-letter queue. The serverless choice.
 * - pgboss:  the in-process worker (self-host default).
 * - inline:  JOBS_WORKER=false without QStash → run now, after the response, no retries.
 * Handlers are idempotent: every job re-checks state, so retries and the safety-net tick can
 * overlap without double effects.
 */
export type Driver = "qstash" | "pgboss" | "inline";

export function jobDriver(): Driver {
  const env = loadEnv();
  if (env.QSTASH_TOKEN) return "qstash";
  if (process.env.JOBS_WORKER === "false") return "inline";
  return "pgboss";
}

const qstashCfg = () => {
  const env = loadEnv();
  return { url: env.QSTASH_URL, token: env.QSTASH_TOKEN! };
};
const destination = (name: JobName) => `${loadEnv().APP_URL.replace(/\/$/, "")}/api/jobs/${name}`;

/* ---------------- Handlers ---------------- */

type Handler<N extends JobName> = (data: Jobs[N]) => Promise<void>;

async function handlers(): Promise<{ [N in JobName]: Handler<N> }> {
  // Lazy so this module can be imported from the proxy-free edge of the app without pulling
  // every server module in.
  const [reminders, webhooks, integrations, transcripts, crm, contacts] = await Promise.all([
    import("./reminders"),
    import("./webhooks"),
    import("./integrations"),
    import("./transcripts"),
    import("./crm"),
    import("./contacts"),
  ]);
  return {
    "booking.reminders": async () => {
      await reminders.sendDueReminders();
    },
    "webhooks.retry": async () => {
      await webhooks.retryDueDeliveries();
    },
    "calendar.sync": async () => {
      await integrations.renewCalendarWatches();
    },
    "booking.remind": async ({ bookingId }) => {
      await reminders.sendDueReminders(new Date(), { bookingId });
    },
    "webhook.deliver": async ({ deliveryId }) => {
      await webhooks.attemptDelivery(deliveryId);
    },
    "capture.process": async ({ workspaceId, bookingId, transcriptId }) => {
      await transcripts.processCapture(workspaceId, bookingId, transcriptId);
    },
    "crm.sync": async ({ workspaceId, contactId }) => {
      const c = await contacts.getContact(workspaceId, contactId);
      const ws = await contacts.workspaceOf(workspaceId);
      if (c && ws) await crm.syncContact(ws, c);
    },
    "crm.note": async ({ workspaceId, contactId, text }) => {
      const c = await contacts.getContact(workspaceId, contactId);
      const ws = await contacts.workspaceOf(workspaceId);
      if (c && ws) await crm.pushNote(ws, c, text);
    },
  };
}

export function isJobName(name: string): name is JobName {
  return (JOB_NAMES as readonly string[]).includes(name);
}

/** Run a job now (used by the QStash route, the pg-boss worker and the inline driver). */
export async function runJob<N extends JobName>(name: N, data: Jobs[N]): Promise<void> {
  const h = (await handlers())[name] as Handler<N>;
  await h(data);
}

/* ---------------- Enqueue ---------------- */

export type EnqueueOptions = { delaySeconds?: number; dedupeId?: string };

export async function enqueue<N extends JobName>(
  name: N,
  data: Jobs[N],
  opts: EnqueueOptions = {},
): Promise<void> {
  const driver = jobDriver();
  if (driver === "qstash") {
    await publish(qstashCfg(), destination(name), data, opts);
    return;
  }
  if (driver === "pgboss") {
    await bossEnqueue(name, data, {
      ...(opts.delaySeconds ? { startAfter: Math.ceil(opts.delaySeconds) } : {}),
      ...(opts.dedupeId ? { singletonKey: opts.dedupeId } : {}),
    });
    return;
  }
  // Inline: precise future jobs are left to the tick; immediate work runs after the response.
  if (opts.delaySeconds && opts.delaySeconds > 30) return;
  const run = () => runJob(name, data).catch((e) => console.error(`[jobs] ${name} failed`, e));
  try {
    after(run);
  } catch {
    void run();
  }
}

/* ---------------- Schedules ---------------- */

export const SCHEDULES: { name: JobName; cron: string }[] = [
  { name: "booking.reminders", cron: "*/5 * * * *" },
  { name: "webhooks.retry", cron: "*/5 * * * *" },
  { name: "calendar.sync", cron: "17 */6 * * *" },
];

const scheduleId = (name: JobName) => `bookly-${name.replace(".", "-")}`;

/** Idempotent: QStash keeps one schedule per id. Returns the number upserted. */
export async function ensureSchedules(): Promise<number> {
  if (jobDriver() !== "qstash") return 0;
  const cfg = qstashCfg();
  for (const s of SCHEDULES)
    await upsertSchedule(cfg, {
      scheduleId: scheduleId(s.name),
      cron: s.cron,
      destination: destination(s.name),
    });
  return SCHEDULES.length;
}

/** For the console health page. */
export async function jobsHealth(): Promise<{ ok: boolean; detail: string }> {
  const driver = jobDriver();
  if (driver !== "qstash")
    return {
      ok: true,
      detail:
        driver === "pgboss"
          ? "in-process worker (pg-boss)"
          : "inline: no retries, precise reminders rely on the tick",
    };
  try {
    const cfg = qstashCfg();
    const [schedules, dlq] = await Promise.all([listSchedules(cfg), dlqCount(cfg)]);
    const mine = schedules.filter((s) => s.scheduleId.startsWith("bookly-"));
    const missing = SCHEDULES.filter((s) => !mine.some((m) => m.scheduleId === scheduleId(s.name)));
    const ok = missing.length === 0 && dlq === 0;
    return {
      ok,
      detail: `QStash: ${mine.length}/${SCHEDULES.length} schedules${missing.length ? ` (missing ${missing.map((m) => m.name).join(", ")})` : ""}, ${dlq} in dead-letter queue`,
    };
  } catch (e) {
    return { ok: false, detail: `QStash unreachable: ${e instanceof Error ? e.message : e}` };
  }
}

/* ---------------- Precise scheduling helpers ---------------- */

/**
 * Schedule a booking's reminders and follow-up at their exact times. Dedupe ids include the
 * start time, so a reschedule creates new messages and the old ones become no-ops (the handler
 * re-checks what is due). The 5-minute tick remains as the safety net.
 */
export async function scheduleBookingJobs(b: {
  id: string;
  startAt: Date;
  endAt: Date;
  reminders: number[];
  followUpDelayMin: number | null;
}) {
  if (jobDriver() === "inline") return;
  const now = Date.now();
  const at = (t: number) => Math.max(1, Math.ceil((t - now) / 1000));
  const jobs: EnqueueOptions[] = b.reminders.map((m) => ({
    delaySeconds: at(b.startAt.getTime() - m * 60_000),
    dedupeId: `remind:${b.id}:${b.startAt.getTime()}:${m}`,
  }));
  if (b.followUpDelayMin !== null)
    jobs.push({
      delaySeconds: at(b.endAt.getTime() + b.followUpDelayMin * 60_000),
      dedupeId: `followup:${b.id}:${b.endAt.getTime()}`,
    });
  for (const j of jobs)
    if (j.delaySeconds! > 0)
      await enqueue("booking.remind", { bookingId: b.id }, j).catch((e) =>
        console.error("[jobs] schedule reminder failed", e),
      );
}
