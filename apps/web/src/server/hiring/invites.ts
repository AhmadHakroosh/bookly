import "server-only";
import { and, eq, gt, inArray, isNull, schema } from "@bookly/db";
import type { Opportunity, OpportunityRole, Workspace } from "@bookly/db/schema";
import { loadEnv } from "@bookly/config";
import { sendEmail } from "@bookly/email";
import { db } from "@/lib/db";
import { assertOnOpportunity, HiringAccessError, type Actor } from "../access";
import { audit } from "../audit";
import { assertWithinLimit } from "../limits";
import { notify } from "../notifications";
import { adminBaseUrl } from "../urls";
import { setTeamRole } from "./team";
import { ROLE_LABELS } from "./setup-text";

/*
 * Inviting people to an opportunity's team (S7). Workspace members are added at once; someone
 * from outside joins as a collaborator (ADR 0005, X3): the opportunity keeps the invite, the
 * workspace invitation goes out when it is published (or at once on a live one), and accepting
 * it turns the invite into a team role. Only owners and admins invite people into the
 * workspace, as on the Team page.
 */

/** Invitations last as long as Better Auth's own (48 hours). */
const INVITATION_TTL_MS = 48 * 3600_000;

const verb: Record<Exclude<OpportunityRole, "coordinator">, string> = {
  reviewer: "review applications for",
  interviewer: "interview applicants for",
  viewer: "follow applications for",
};

export type InviteResult = { added: "member" | "invited" } | { error: string };

/** Adds an email to the team: a member at once, anyone else as a pending collaborator. */
export async function inviteToTeam(
  actor: Actor,
  ws: Workspace,
  opp: Pick<Opportunity, "id" | "title" | "status">,
  rawEmail: string,
  role: OpportunityRole,
): Promise<InviteResult> {
  assertOnOpportunity(actor, opp.id, "opportunity.manage_team");
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email." };
  const [member] = await db()
    .select({ userId: schema.users.id })
    .from(schema.users)
    .innerJoin(schema.members, eq(schema.members.userId, schema.users.id))
    .where(
      and(eq(schema.users.email, email), eq(schema.members.organizationId, ws.organizationId)),
    );
  if (member) {
    try {
      await setTeamRole(actor, opp.id, member.userId, role);
    } catch (e) {
      if (e instanceof HiringAccessError) return { error: e.message };
      throw e;
    }
    if (opp.status === "open")
      await announceTeam(ws, opp, [{ userId: member.userId, role }], actor.userId);
    return { added: "member" };
  }
  if (role === "coordinator")
    return {
      error: "Coordinators need a member seat. Invite them to the workspace from Team first.",
    };
  if (actor.workspaceRole !== "owner" && actor.workspaceRole !== "admin")
    return { error: "Ask a workspace owner or admin to invite people from outside the workspace." };
  try {
    await assertWithinLimit(ws, "collaborators");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Your plan has no collaborator seats left." };
  }
  await db()
    .insert(schema.opportunityInvites)
    .values({ workspaceId: ws.id, opportunityId: opp.id, email, role, invitedBy: actor.userId })
    .onConflictDoUpdate({
      target: [schema.opportunityInvites.opportunityId, schema.opportunityInvites.email],
      set: { role },
    });
  await audit({
    workspace: ws.id,
    action: "opportunity_member.invited",
    target: { type: "opportunity", id: opp.id, label: opp.title },
    changes: { email: { to: email }, role: { to: role } },
  });
  if (opp.status === "open") await sendPendingInvites(ws, opp, actor.userId);
  return { added: "invited" };
}

/** Withdraws an invite that has not been accepted. */
export async function removeInvite(actor: Actor, opportunityId: string, inviteId: string) {
  assertOnOpportunity(actor, opportunityId, "opportunity.manage_team");
  const [row] = await db()
    .delete(schema.opportunityInvites)
    .where(
      and(
        eq(schema.opportunityInvites.id, inviteId),
        eq(schema.opportunityInvites.opportunityId, opportunityId),
        eq(schema.opportunityInvites.workspaceId, actor.workspaceId),
      ),
    )
    .returning();
  if (row)
    await audit({
      workspace: actor.workspaceId,
      action: "opportunity_member.invite_withdrawn",
      target: { type: "opportunity", id: opportunityId },
      changes: { email: { from: row.email } },
    });
}

/**
 * Sends the workspace invitations (as collaborators) for an opportunity's invites not sent yet.
 * An invitation still pending for the same address is reused, so nobody gets two.
 */
export async function sendPendingInvites(
  ws: Pick<Workspace, "id" | "name" | "organizationId">,
  opp: Pick<Opportunity, "id" | "title">,
  byUserId: string,
): Promise<number> {
  const pending = await db()
    .select()
    .from(schema.opportunityInvites)
    .where(
      and(
        eq(schema.opportunityInvites.opportunityId, opp.id),
        isNull(schema.opportunityInvites.sentAt),
      ),
    );
  if (!pending.length) return 0;
  const now = new Date();
  const inviterIds = [...new Set(pending.map((p) => p.invitedBy ?? byUserId))];
  const [inviters, open] = await Promise.all([
    db()
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .where(inArray(schema.users.id, inviterIds)),
    db()
      .select({ id: schema.invitations.id, email: schema.invitations.email })
      .from(schema.invitations)
      .where(
        and(
          eq(schema.invitations.organizationId, ws.organizationId),
          eq(schema.invitations.status, "pending"),
          gt(schema.invitations.expiresAt, now),
          inArray(
            schema.invitations.email,
            pending.map((p) => p.email),
          ),
        ),
      ),
  ]);
  const env = loadEnv();
  let sent = 0;
  for (const p of pending) {
    const inviterId = p.invitedBy ?? byUserId;
    let invitationId = open.find((i) => i.email.toLowerCase() === p.email)?.id;
    if (!invitationId) {
      invitationId = crypto.randomUUID();
      await db()
        .insert(schema.invitations)
        .values({
          id: invitationId,
          organizationId: ws.organizationId,
          email: p.email,
          role: "collaborator",
          status: "pending",
          expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
          inviterId,
        });
    }
    const name = inviters.find((u) => u.id === inviterId)?.name ?? "A coordinator";
    const { accountMail } = await import("@/emails/account");
    await sendEmail({
      to: p.email,
      ...(await accountMail({
        subject: `${name} invited you to ${verb[p.role]} ${opp.title}`,
        title: `Join the ${opp.title} team`,
        body: `${name} invited you to ${verb[p.role]} ${opp.title} in ${ws.name} on Bookly. You'll join as a collaborator: you ${p.role === "viewer" ? "see the pipeline" : `${p.role === "reviewer" ? "review" : "interview"} the applications assigned to you`}, and you don't host bookings or own pipelines.`,
        cta: {
          href: `${env.APP_URL}/accept-invitation/${invitationId}`,
          label: "Accept the invitation",
        },
      })),
    });
    await db()
      .update(schema.opportunityInvites)
      .set({ sentAt: now, invitationId })
      .where(eq(schema.opportunityInvites.id, p.id));
    sent++;
  }
  await audit({
    workspace: ws.id,
    action: "opportunity_member.invitations_sent",
    target: { type: "opportunity", id: opp.id, label: opp.title },
    changes: { count: { to: sent } },
  });
  return sent;
}

/**
 * Someone accepted a workspace invitation: the opportunity invites for their address become team
 * roles in every workspace of that organization.
 */
export async function applyOpportunityInvites(
  organizationId: string,
  userId: string,
  rawEmail: string,
): Promise<number> {
  const email = rawEmail.trim().toLowerCase();
  const rows = await db()
    .select({ invite: schema.opportunityInvites })
    .from(schema.opportunityInvites)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.opportunityInvites.workspaceId))
    .where(
      and(
        eq(schema.workspaces.organizationId, organizationId),
        eq(schema.opportunityInvites.email, email),
      ),
    );
  if (!rows.length) return 0;
  await db().transaction(async (tx) => {
    await tx
      .insert(schema.opportunityMembers)
      .values(
        rows.map(({ invite: i }) => ({
          workspaceId: i.workspaceId,
          opportunityId: i.opportunityId,
          userId,
          role: i.role,
          addedBy: i.invitedBy,
        })),
      )
      .onConflictDoNothing();
    await tx.delete(schema.opportunityInvites).where(
      inArray(
        schema.opportunityInvites.id,
        rows.map((r) => r.invite.id),
      ),
    );
  });
  for (const { invite: i } of rows)
    await audit({
      workspace: i.workspaceId,
      action: "opportunity_member.added",
      target: { type: "opportunity", id: i.opportunityId },
      changes: { userId: { to: userId }, role: { to: i.role } },
      actor: { type: "user", id: userId, label: email },
    });
  return rows.length;
}

/** Tells team members (other than the one acting) that they are on a live opportunity's team. */
export async function announceTeam(
  ws: Pick<Workspace, "id" | "slug" | "settings">,
  opp: Pick<Opportunity, "id" | "title">,
  team: { userId: string; role: OpportunityRole }[],
  byUserId: string,
) {
  const link = `/admin/hiring/opportunities/${opp.id}`;
  await Promise.all(
    team
      .filter((m) => m.userId !== byUserId)
      .map((m) =>
        notify(ws, m.userId, {
          kind: "hiring.team",
          title: `You're on the ${opp.title} team`,
          body: `${ROLE_LABELS[m.role]}. Applications open now.`,
          link,
          dedupeKey: `hiring.team:${opp.id}:${m.userId}`,
          email: {
            subject: `You're on the ${opp.title} team`,
            text: `You're a ${ROLE_LABELS[m.role].toLowerCase()} on ${opp.title}, which is now open for applications.\n\n${adminBaseUrl(ws)}${link}`,
          },
        }),
      ),
  );
}
