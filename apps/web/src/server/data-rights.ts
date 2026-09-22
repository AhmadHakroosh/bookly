import "server-only";
import { eq, inArray, schema } from "@bookly/db";
import type { Workspace } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { refreshWorkspace } from "./cache";
import { isCloud } from "./platform";
import { paymentsConfigured, stripe } from "./payments";
import { invalidateHostCache } from "./tenancy";

const omit = <T extends object, K extends keyof T>(row: T, keys: K[]): Omit<T, K> => {
  const copy = { ...row };
  for (const k of keys) delete copy[k];
  return copy;
};

/**
 * Everything a workspace holds, as plain JSON, minus secrets (OAuth tokens, webhook secrets,
 * API key hashes, CRM keys, Stripe ids). What the privacy policy calls "export your data".
 */
export async function exportWorkspace(ws: Workspace) {
  const q = db().query;
  const byWs = <T extends { workspaceId: unknown }>(t: T) => eq(t.workspaceId as never, ws.id);
  const [
    members,
    invitations,
    profiles,
    schedules,
    eventTypes,
    bookings,
    contacts,
    contactEvents,
    tasks,
    routingForms,
    transcripts,
    recaps,
    waitlist,
    integrations,
    webhooks,
    apiKeys,
    domains,
  ] = await Promise.all([
    db()
      .select({
        role: schema.members.role,
        name: schema.users.name,
        email: schema.users.email,
        joinedAt: schema.members.createdAt,
      })
      .from(schema.members)
      .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
      .where(eq(schema.members.organizationId, ws.organizationId)),
    q.invitations.findMany({ where: eq(schema.invitations.organizationId, ws.organizationId) }),
    q.profiles.findMany({ where: byWs(schema.profiles) }),
    q.schedules.findMany({ where: byWs(schema.schedules) }),
    q.eventTypes.findMany({ where: byWs(schema.eventTypes) }),
    q.bookings.findMany({ where: byWs(schema.bookings) }),
    q.contacts.findMany({ where: byWs(schema.contacts) }),
    q.contactEvents.findMany({ where: byWs(schema.contactEvents) }),
    q.tasks.findMany({ where: byWs(schema.tasks) }),
    q.routingForms.findMany({ where: byWs(schema.routingForms) }),
    q.meetingTranscripts.findMany({ where: byWs(schema.meetingTranscripts) }),
    q.meetingRecaps.findMany({ where: byWs(schema.meetingRecaps) }),
    q.waitlistEntries.findMany({ where: byWs(schema.waitlistEntries) }),
    q.integrations.findMany({
      where: byWs(schema.integrations),
      columns: { id: true, userId: true, provider: true, accountLabel: true, createdAt: true },
    }),
    q.webhooks.findMany({
      where: byWs(schema.webhooks),
      columns: { id: true, url: true, events: true, active: true, description: true },
    }),
    q.apiKeys.findMany({
      where: byWs(schema.apiKeys),
      columns: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    }),
    q.workspaceDomains.findMany({ where: byWs(schema.workspaceDomains) }),
  ]);
  const scheduleIds = schedules.map((s) => s.id);
  const [rules, overrides] = scheduleIds.length
    ? await Promise.all([
        q.scheduleRules.findMany({ where: inArray(schema.scheduleRules.scheduleId, scheduleIds) }),
        q.scheduleOverrides.findMany({
          where: inArray(schema.scheduleOverrides.scheduleId, scheduleIds),
        }),
      ])
    : [[], []];
  const { crm: _crm, ...settings } = ws.settings;
  return {
    format: "bookly-export/1",
    exportedAt: new Date().toISOString(),
    workspace: {
      ...omit(ws, ["stripeCustomerId", "stripeSubscriptionId", "organizationId"]),
      settings: { ...settings, crm: _crm ? { provider: _crm.provider } : null },
    },
    members,
    invitations,
    profiles,
    schedules: schedules.map((s) => ({
      ...s,
      rules: rules.filter((r) => r.scheduleId === s.id),
      overrides: overrides.filter((o) => o.scheduleId === s.id),
    })),
    eventTypes,
    bookings,
    contacts,
    contactEvents,
    tasks,
    routingForms,
    transcripts,
    recaps,
    waitlist,
    integrations,
    webhooks,
    apiKeys,
    domains,
  };
}

/**
 * Permanently delete a workspace: cancels the cloud subscription, then removes the owning
 * organization, which cascades to members, invitations and every workspace table. Uploaded
 * files referenced by URL are not fetched back; backups age out on their own schedule.
 */
export async function deleteWorkspace(ws: Workspace) {
  if (isCloud() && ws.stripeSubscriptionId && paymentsConfigured()) {
    try {
      await stripe().subscriptions.cancel(ws.stripeSubscriptionId, { prorate: true });
    } catch (e) {
      console.error("[data-rights] subscription cancel failed", e);
    }
  }
  await db().delete(schema.organizations).where(eq(schema.organizations.id, ws.organizationId));
  refreshWorkspace(ws.id);
  invalidateHostCache();
  console.log(`[data-rights] workspace deleted: ${ws.slug} (${ws.id})`);
}

/** Workspaces the user owns; they must be deleted or handed over before the account can go. */
export async function ownerOf(userId: string) {
  const owned = await db().query.members.findMany({
    where: eq(schema.members.userId, userId),
    columns: { organizationId: true, role: true },
  });
  const orgs = owned.filter((m) => m.role === "owner").map((m) => m.organizationId);
  if (!orgs.length) return [];
  return db().query.workspaces.findMany({
    where: inArray(schema.workspaces.organizationId, orgs),
    columns: { id: true, name: true, slug: true },
  });
}

/**
 * Delete a user account. Refused while the user still owns a workspace (delete it first, or
 * transfer ownership); memberships elsewhere are removed by cascade along with sessions.
 */
export async function deleteAccount(userId: string): Promise<{ ok: true } | { error: string }> {
  const owned = await ownerOf(userId);
  if (owned.length)
    return {
      error: `You still own ${owned.map((w) => w.name).join(", ")}. Delete it or transfer ownership first.`,
    };
  await db().delete(schema.users).where(eq(schema.users.id, userId));
  console.log(`[data-rights] account deleted: ${userId}`);
  return { ok: true };
}
