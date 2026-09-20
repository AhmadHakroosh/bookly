import { PgBoss } from "pg-boss";
import { loadEnv } from "@bookly/config";

type SendOptions = NonNullable<Parameters<PgBoss["send"]>[2]>;

/**
 * Background jobs on Postgres via pg-boss — no Redis needed for self-hosters.
 * Queues are typed here; handlers are registered by the worker (apps/web
 * instrumentation in single-process mode, or a dedicated worker later).
 */
export type Jobs = {
  "email.send": { to: string; subject: string; text: string; html?: string };
  "booking.reminders": Record<string, never>;
  "calendar.sync": { workspaceId: string; connectionId?: string };
};

export type JobName = keyof Jobs;

const globalForBoss = globalThis as unknown as {
  __booklyBoss?: PgBoss;
  __booklyBossStarted?: Promise<PgBoss>;
};

const queueDefaults: Record<JobName, undefined> = {
  "email.send": undefined,
  "booking.reminders": undefined,
  "calendar.sync": undefined,
};

export async function getBoss(): Promise<PgBoss> {
  if (globalForBoss.__booklyBossStarted) return globalForBoss.__booklyBossStarted;
  const boss = new PgBoss({ connectionString: loadEnv().DATABASE_URL, schema: "pgboss" });
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
