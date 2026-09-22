import { PgBoss } from "pg-boss";
import { loadEnv } from "@bookly/config";

type SendOptions = NonNullable<Parameters<PgBoss["send"]>[2]>;

/**
 * Background jobs on Postgres via pg-boss — no Redis needed for self-hosters.
 * Queues are typed here; handlers are registered by the worker (apps/web
 * instrumentation in single-process mode, or a dedicated worker later).
 */
export type Jobs = {
  /** Scheduled: reminders and follow-ups that are due, plus housekeeping. */
  "booking.reminders": Record<string, never>;
  /** Scheduled: webhook deliveries whose backoff has elapsed. */
  "webhooks.retry": Record<string, never>;
  /** Scheduled: renew Google / Microsoft push channels. */
  "calendar.sync": { workspaceId: string; connectionId?: string };
  /** Precise: one booking's reminder or follow-up at its exact time. */
  "booking.remind": { bookingId: string };
  /** One webhook delivery attempt (first try or a retry after backoff). */
  "webhook.deliver": { deliveryId: string };
  /** Download a finished transcript and generate the recap. */
  "capture.process": { workspaceId: string; bookingId: string; transcriptId: string | null };
  /** Mirror a contact to the workspace's CRM. */
  "crm.sync": { workspaceId: string; contactId: string };
  /** Attach a note to a contact in the CRM. */
  "crm.note": { workspaceId: string; contactId: string; text: string };
};

export const JOB_NAMES = [
  "booking.reminders",
  "webhooks.retry",
  "calendar.sync",
  "booking.remind",
  "webhook.deliver",
  "capture.process",
  "crm.sync",
  "crm.note",
] as const satisfies readonly (keyof Jobs)[];

export type JobName = keyof Jobs;

const globalForBoss = globalThis as unknown as {
  __booklyBoss?: PgBoss;
  __booklyBossStarted?: Promise<PgBoss>;
};

const queueDefaults = Object.fromEntries(JOB_NAMES.map((n) => [n, undefined])) as Record<
  JobName,
  undefined
>;

export async function getBoss(): Promise<PgBoss> {
  if (globalForBoss.__booklyBossStarted) return globalForBoss.__booklyBossStarted;
  // Same SSL-mode normalisation as packages/db (aliases of verify-full, spelled out for pg 9).
  const connectionString = loadEnv().DATABASE_URL?.replace(
    /([?&])sslmode=(prefer|require|verify-ca)(?=&|$)/,
    "$1sslmode=verify-full",
  );
  const boss = new PgBoss({ connectionString, schema: "pgboss" });
  boss.on("error", (err) => console.error("[jobs]", err));
  globalForBoss.__booklyBoss = boss;
  globalForBoss.__booklyBossStarted = boss.start().then(async () => {
    for (const q of Object.keys(queueDefaults) as JobName[])
      await boss.createQueue(q).catch(() => {});
    return boss;
  });
  return globalForBoss.__booklyBossStarted;
}

export async function enqueue<N extends JobName>(name: N, data: Jobs[N], opts?: SendOptions) {
  const boss = await getBoss();
  return boss.send(name, data, opts ?? {});
}

export async function work<N extends JobName>(name: N, handler: (data: Jobs[N]) => Promise<void>) {
  const boss = await getBoss();
  return boss.work<Jobs[N]>(name, async (jobs) => {
    for (const job of jobs) await handler(job.data);
  });
}

export async function schedule<N extends JobName>(name: N, cron: string, data: Jobs[N]) {
  const boss = await getBoss();
  return boss.schedule(name, cron, data);
}

export async function stopJobs() {
  await globalForBoss.__booklyBoss?.stop({ graceful: true });
  globalForBoss.__booklyBoss = undefined;
  globalForBoss.__booklyBossStarted = undefined;
}

export * from "./qstash";
