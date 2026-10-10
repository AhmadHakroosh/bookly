import "server-only";
import { cache } from "react";
import { and, eq, gt, inArray, isNull, or, schema, sql } from "@bookly/db";
import type { FlagState, Workspace } from "@bookly/db/schema";
import { db } from "@/lib/db";

/*
 * Feature flags for closed betas. A flag is `off` (nobody), `beta` (cohorts and explicit
 * grants, unless the workspace opted out of betas) or `on` (everyone, unless explicitly
 * denied). `hasFlag(workspace, key)` resolves: explicit denial → `on` → beta opt-out →
 * explicit grant → cohort → nothing. Plan gates (`hasFeature` in limits.ts) are separate:
 * a flag says whether a feature exists yet, the plan says who may use it.
 */

/** Every flag the code knows about. The console shows these; unknown keys are never true. */
export const FLAGS = {
  home_dashboard: "Home dashboard with summary cards (0.13.0)",
  bookings_calendar: "Bookings as list and calendar with the side pane (0.14.0)",
  notifications: "In-app and desktop notifications (0.15.0)",
  task_board: "Task board with workspace-defined statuses (0.16.0)",
  timeline_v2: "Contact timeline v2 with inbound replies (0.17.0)",
  messages: "Team and guest conversations (0.18.0)",
  meeting_notes: "In-meeting host notes (0.19.0)",
  session_packs: "Session packs and balances (0.20.0)",
  guest_portal: "Guest portal (0.21.0)",
} as const;

export type FlagKey = keyof typeof FLAGS;
export const FLAG_KEYS = Object.keys(FLAGS) as FlagKey[];
export const isFlagKey = (k: string): k is FlagKey => k in FLAGS;

/** Makes sure every known key has a row, so the console can set its state. Idempotent. */
export async function ensureFlags() {
  await db()
    .insert(schema.featureFlags)
    .values(FLAG_KEYS.map((key) => ({ key, description: FLAGS[key] })))
    .onConflictDoUpdate({
      target: schema.featureFlags.key,
      set: { description: sql`excluded.description` },
    });
}

type Resolved = {
  states: Map<string, FlagState>;
  grants: Map<string, "grant" | "deny">;
  cohortFlags: Set<string>;
};

/** One round trip per workspace per request: states, this workspace's grants, its cohorts' flags. */
const resolve = cache(async (workspaceId: string): Promise<Resolved> => {
  const now = new Date();
  const [states, grants, cohortFlags] = await Promise.all([
    db()
      .select({ key: schema.featureFlags.key, state: schema.featureFlags.state })
      .from(schema.featureFlags),
    db()
      .select({ key: schema.workspaceFlags.flagKey, mode: schema.workspaceFlags.mode })
      .from(schema.workspaceFlags)
      .where(
        and(
          eq(schema.workspaceFlags.workspaceId, workspaceId),
          or(isNull(schema.workspaceFlags.expiresAt), gt(schema.workspaceFlags.expiresAt, now)),
        ),
      ),
    db()
      .select({ key: schema.flagCohorts.flagKey })
      .from(schema.flagCohorts)
      .innerJoin(
        schema.cohortWorkspaces,
        eq(schema.cohortWorkspaces.cohortId, schema.flagCohorts.cohortId),
      )
      .where(eq(schema.cohortWorkspaces.workspaceId, workspaceId)),
  ]);
  return {
    states: new Map(states.map((s) => [s.key, s.state])),
    grants: new Map(grants.map((g) => [g.key, g.mode])),
    cohortFlags: new Set(cohortFlags.map((c) => c.key)),
  };
});

/** Whether `key` is live for this workspace right now. Unknown keys are never live. */
export async function hasFlag(
  ws: Pick<Workspace, "id" | "settings">,
  key: FlagKey,
): Promise<boolean> {
  if (!isFlagKey(key)) return false;
  const r = await resolve(ws.id);
  if (r.grants.get(key) === "deny") return false;
  const state = r.states.get(key) ?? "off";
  if (state === "on") return true;
  if (state === "off") return false;
  if (ws.settings.betaOptOut) return false;
  return r.grants.get(key) === "grant" || r.cohortFlags.has(key);
}

/** Every flag with how it resolves for this workspace, for the Settings page and the console. */
export async function flagsFor(ws: Pick<Workspace, "id" | "settings">) {
  return Promise.all(
    FLAG_KEYS.map(async (key) => ({ key, description: FLAGS[key], on: await hasFlag(ws, key) })),
  );
}

/** Flags in beta that this workspace could see if it did not opt out (for the Settings copy). */
export async function betaFlagsFor(ws: Pick<Workspace, "id" | "settings">) {
  const r = await resolve(ws.id);
  return FLAG_KEYS.filter(
    (key) =>
      r.states.get(key) === "beta" &&
      r.grants.get(key) !== "deny" &&
      (r.grants.get(key) === "grant" || r.cohortFlags.has(key)),
  );
}

/* ---------------- Console (operator) ---------------- */

export async function listFlags() {
  await ensureFlags();
  const [flags, links, cohorts] = await Promise.all([
    db().select().from(schema.featureFlags).orderBy(schema.featureFlags.key),
    db().select().from(schema.flagCohorts),
    db().select().from(schema.betaCohorts).orderBy(schema.betaCohorts.name),
  ]);
  return flags
    .filter((f) => isFlagKey(f.key))
    .map((f) => ({
      ...f,
      cohortIds: links.filter((l) => l.flagKey === f.key).map((l) => l.cohortId),
      cohorts: cohorts.filter((c) => links.some((l) => l.flagKey === f.key && l.cohortId === c.id)),
    }));
}

export async function listCohorts() {
  const [cohorts, members] = await Promise.all([
    db().select().from(schema.betaCohorts).orderBy(schema.betaCohorts.name),
    db()
      .select({
        cohortId: schema.cohortWorkspaces.cohortId,
        workspaceId: schema.cohortWorkspaces.workspaceId,
        slug: schema.workspaces.slug,
        name: schema.workspaces.name,
      })
      .from(schema.cohortWorkspaces)
      .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.cohortWorkspaces.workspaceId)),
  ]);
  return cohorts.map((c) => ({
    ...c,
    workspaces: members.filter((m) => m.cohortId === c.id),
  }));
}

/** The workspace's grants, denials and cohorts, for its console page. */
export async function workspaceFlagState(workspaceId: string) {
  const [grants, cohorts] = await Promise.all([
    db()
      .select()
      .from(schema.workspaceFlags)
      .where(eq(schema.workspaceFlags.workspaceId, workspaceId)),
    db()
      .select({ id: schema.betaCohorts.id, name: schema.betaCohorts.name })
      .from(schema.cohortWorkspaces)
      .innerJoin(schema.betaCohorts, eq(schema.betaCohorts.id, schema.cohortWorkspaces.cohortId))
      .where(eq(schema.cohortWorkspaces.workspaceId, workspaceId)),
  ]);
  return { grants, cohorts };
}

export async function setFlagState(key: FlagKey, state: FlagState) {
  await ensureFlags();
  await db().update(schema.featureFlags).set({ state }).where(eq(schema.featureFlags.key, key));
}

export async function setFlagCohorts(key: FlagKey, cohortIds: string[]) {
  await db().delete(schema.flagCohorts).where(eq(schema.flagCohorts.flagKey, key));
  if (cohortIds.length)
    await db()
      .insert(schema.flagCohorts)
      .values(cohortIds.map((cohortId) => ({ flagKey: key, cohortId })));
}

export async function createCohort(name: string, description = "") {
  const [row] = await db().insert(schema.betaCohorts).values({ name, description }).returning();
  return row!;
}

export async function deleteCohort(id: string) {
  await db().delete(schema.betaCohorts).where(eq(schema.betaCohorts.id, id));
}

export async function setCohortMembership(cohortId: string, workspaceId: string, member: boolean) {
  if (member)
    await db()
      .insert(schema.cohortWorkspaces)
      .values({ cohortId, workspaceId })
      .onConflictDoNothing();
  else
    await db()
      .delete(schema.cohortWorkspaces)
      .where(
        and(
          eq(schema.cohortWorkspaces.cohortId, cohortId),
          eq(schema.cohortWorkspaces.workspaceId, workspaceId),
        ),
      );
}

export async function setWorkspaceFlag(
  workspaceId: string,
  key: FlagKey,
  mode: "grant" | "deny" | null,
  opts: { expiresAt?: Date | null; note?: string | null; by?: string | null } = {},
) {
  await ensureFlags();
  if (!mode) {
    await db()
      .delete(schema.workspaceFlags)
      .where(
        and(
          eq(schema.workspaceFlags.workspaceId, workspaceId),
          eq(schema.workspaceFlags.flagKey, key),
        ),
      );
    return;
  }
  await db()
    .insert(schema.workspaceFlags)
    .values({
      workspaceId,
      flagKey: key,
      mode,
      expiresAt: opts.expiresAt ?? null,
      note: opts.note ?? null,
      createdBy: opts.by ?? null,
    })
    .onConflictDoUpdate({
      target: [schema.workspaceFlags.workspaceId, schema.workspaceFlags.flagKey],
      set: {
        mode,
        expiresAt: opts.expiresAt ?? null,
        note: opts.note ?? null,
        createdBy: opts.by ?? null,
      },
    });
}

/** Workspaces by slug, for the cohort and grant forms. */
export async function findWorkspaces(slugs: string[]) {
  if (!slugs.length) return [];
  return db()
    .select({ id: schema.workspaces.id, slug: schema.workspaces.slug })
    .from(schema.workspaces)
    .where(inArray(schema.workspaces.slug, slugs));
}
