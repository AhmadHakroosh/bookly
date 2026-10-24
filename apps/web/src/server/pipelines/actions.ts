import "server-only";
import { and, eq, inArray, schema } from "@bookly/db";
import type {
  Contact,
  PipelineStage,
  RuleAction,
  StageRule,
  StageRuleRun,
  Workspace,
} from "@bookly/db/schema";
import { evaluate, type ConditionGroup } from "@bookly/forms";
import { db } from "@/lib/db";
import { publicBaseUrl } from "../urls";
import { MAX_DEPTH, contactFacts, fillPlaceholders } from "./rules-text";
import type { StageModuleConfigs } from "./modules";

/*
 * What each rule action does for a contact (ADR 0002), each a small function over services that
 * already exist: Messages, tasks, payment requests, notifications, the pipeline. An executor
 * returns `done` or `skipped:<reason>` (something it may not or need not do) and throws to fail
 * (the run retries); `RuleStop` fails the run for good (a loop). Effects are audited by the
 * services they call, as the rule (`SYSTEM_ACTOR("rule:<id>")`).
 */

export class RuleStop extends Error {}

export type RunContext = {
  ws: Workspace;
  rule: StageRule;
  run: StageRuleRun;
  contact: Contact;
  stage: PipelineStage;
  modules: StageModuleConfigs;
};

/** Who an automation speaks as: its author while they are on the team, else the first owner. */
async function sender(ctx: RunContext): Promise<string | null> {
  const members = await db()
    .select({ userId: schema.members.userId, role: schema.members.role })
    .from(schema.members)
    .where(eq(schema.members.organizationId, ctx.ws.organizationId));
  if (ctx.rule.createdBy && members.some((m) => m.userId === ctx.rule.createdBy))
    return ctx.rule.createdBy;
  return members.find((m) => m.role === "owner")?.userId ?? members[0]?.userId ?? null;
}

async function managers(ws: Workspace) {
  const rows = await db()
    .select({ userId: schema.members.userId })
    .from(schema.members)
    .where(
      and(
        eq(schema.members.organizationId, ws.organizationId),
        inArray(schema.members.role, ["owner", "admin"]),
      ),
    );
  return rows.map((r) => r.userId);
}

async function placeholders(ctx: RunContext): Promise<Record<string, string>> {
  return {
    name: ctx.contact.name || "there",
    company: ctx.contact.company ?? "",
    stage: ctx.stage.name,
    host: ctx.ws.name,
    bookingUrl: await publicBaseUrl(ctx.ws),
  };
}

export async function runAction(ctx: RunContext, action: RuleAction, index: number) {
  const { ws, contact, modules } = ctx;
  switch (action.type) {
    case "send_message": {
      const t = modules.messages?.templates.find((x) => x.id === action.templateId);
      if (!t || modules.messages?.enabled === false) return "skipped:no_template";
      if (t.channel !== "email") return "skipped:sms_not_available";
      if (contact.emailOptOut && !t.transactional) return "skipped:opted_out";
      const from = await sender(ctx);
      if (!from) return "skipped:no_sender";
      const values = await placeholders(ctx);
      const { sendGuestEmail } = await import("../outreach");
      const r = await sendGuestEmail(ws, contact, from, {
        subject: fillPlaceholders(t.subject || `A message from ${ws.name}`, values),
        text: fillPlaceholders(t.body, values),
        transactional: t.transactional,
      });
      if ("error" in r) throw new Error(r.error);
      return "done";
    }
    case "send_booking_link": {
      const s = modules.scheduling?.sessions[action.sessionIndex];
      if (!s || modules.scheduling?.enabled === false) return "skipped:no_session";
      const et = await db().query.eventTypes.findFirst({
        where: and(
          eq(schema.eventTypes.id, s.eventTypeId),
          eq(schema.eventTypes.workspaceId, ws.id),
        ),
      });
      if (!et || !et.active) return "skipped:event_type_gone";
      if (contact.emailOptOut) return "skipped:opted_out";
      const { getProfileByUser } = await import("../scheduling");
      const [host, from] = await Promise.all([getProfileByUser(ws.id, et.userId), sender(ctx)]);
      if (!host || !from) return "skipped:no_host";
      const q = new URLSearchParams({ name: contact.name ?? "", email: contact.email });
      const url = `${await publicBaseUrl(ws)}/${host.username}/${et.slug}?${q}`;
      const { sendGuestEmail } = await import("../outreach");
      const r = await sendGuestEmail(ws, contact, from, {
        subject: `Book your ${et.title}`,
        text: `Hi ${contact.name || "there"},\n\nPick a time that suits you for ${et.title}:\n${url}`,
      });
      if ("error" in r) throw new Error(r.error);
      return "done";
    }
    case "request_form": {
      // Forms people can open on their own are routing forms for now; applications bring more.
      const rf = await db().query.routingForms.findFirst({
        where: and(
          eq(schema.routingForms.workspaceId, ws.id),
          eq(schema.routingForms.formId, action.formId),
          eq(schema.routingForms.active, true),
        ),
      });
      if (!rf) return "skipped:no_public_form";
      if (contact.emailOptOut) return "skipped:opted_out";
      const from = await sender(ctx);
      if (!from) return "skipped:no_sender";
      const url = `${await publicBaseUrl(ws)}/r/${rf.slug}`;
      const { sendGuestEmail } = await import("../outreach");
      const r = await sendGuestEmail(ws, contact, from, {
        subject: rf.name,
        text: `Hi ${contact.name || "there"},\n\nPlease fill in ${rf.name}:\n${url}`,
      });
      if ("error" in r) throw new Error(r.error);
      return "done";
    }
    case "create_tasks": {
      const list = modules.tasks?.checklist ?? [];
      if (!list.length || modules.tasks?.enabled === false) return "skipped:no_checklist";
      const from = await sender(ctx);
      if (!from) return "skipped:no_sender";
      const { addTask } = await import("../capture");
      const team = new Set(
        (
          await db()
            .select({ userId: schema.members.userId })
            .from(schema.members)
            .where(eq(schema.members.organizationId, ws.organizationId))
        ).map((m) => m.userId),
      );
      for (const item of list) {
        // "coordinator" and "stage_owner" are the automation's author on a client pipeline.
        const assignee = team.has(item.assignee) ? item.assignee : from;
        await addTask(ws.id, {
          userId: assignee,
          title: item.title,
          contactId: contact.id,
          dueAt: item.dueDays === null ? null : new Date(Date.now() + item.dueDays * 86_400_000),
          assignedBy: from,
          description: `From the automation "${ctx.rule.name}".`,
        });
      }
      return "done";
    }
    case "request_payment": {
      const p = modules.payments;
      if (!p || p.enabled === false) return "skipped:no_amount";
      if (contact.emailOptOut) return "skipped:opted_out";
      const from = await sender(ctx);
      if (!from) return "skipped:no_sender";
      const { paymentLink, sendOutreach, templatesFor } = await import("../outreach");
      const description = p.description || `${ws.name}: ${ctx.stage.name}`;
      const link = await paymentLink(ws, contact, p.amountCents, p.currency, description, from);
      if (!link) return "skipped:payments_not_set_up";
      const t = templatesFor(ws).paymentRequest;
      const { formatPrice } = await import("../payments");
      const values = {
        ...(await placeholders(ctx)),
        amount: formatPrice(p.amountCents, p.currency),
        payLink: link,
      };
      await sendOutreach(ws, contact, from, "paymentRequest", {
        subject: fillPlaceholders(t.subject, values),
        body: fillPlaceholders(t.body, values),
        amountCents: p.amountCents,
        currency: p.currency,
        payLink: link,
      });
      return "done";
    }
    case "create_folder":
      // Every contact already has a folder of their own in the drive.
      return "skipped:contact_folder_exists";
    case "assign_reviewers":
      return "skipped:hiring_only";
    case "route": {
      const rules = modules.routing?.rules ?? [];
      if (!rules.length || modules.routing?.enabled === false) return "skipped:no_routing";
      const facts = contactFacts({ ...contact, stageKey: ctx.stage.key });
      const hit = rules.find((r) => evaluate(r as ConditionGroup, facts));
      if (!hit) return "skipped:no_match";
      if ("tag" in hit.to) return addTag(ctx, hit.to.tag);
      if ("stage" in hit.to) return moveTo(ctx, hit.to.stage);
      return "skipped:hiring_only";
    }
    case "move_to_stage":
      return moveTo(ctx, action.stageKey);
    case "add_tag":
      return addTag(ctx, action.tag);
    case "notify_team": {
      const { notify } = await import("../notifications");
      for (const userId of await managers(ws))
        await notify(ws, userId, {
          kind: "automation",
          title: fillPlaceholders(action.text, await placeholders(ctx)).slice(0, 200),
          body: `${contact.name || contact.email} · ${ctx.stage.name}`,
          link: `/admin/contacts/${contact.id}`,
          dedupeKey: `rule:${ctx.run.id}:${index}:${userId}`,
        });
      return "done";
    }
  }
}

async function addTag(ctx: RunContext, raw: string) {
  const tag = raw.trim().toLowerCase().slice(0, 40);
  if (!tag) return "skipped:empty_tag";
  if (ctx.contact.tags.includes(tag)) return "done";
  const { updateContact } = await import("../contacts");
  await updateContact(ctx.ws.id, ctx.contact.id, { tags: [...ctx.contact.tags, tag].slice(0, 20) });
  return "done";
}

async function moveTo(ctx: RunContext, stageKey: string) {
  if (ctx.run.depth + 1 >= MAX_DEPTH)
    throw new RuleStop("Automations moved this contact too many times in a row (loop).");
  const { clientStageByKey, moveToStage } = await import("../pipelines");
  const to = await clientStageByKey(ctx.ws.id, stageKey);
  if (!to) return "skipped:unknown_stage";
  if (to.id === ctx.stage.id) return "skipped:same_stage";
  await moveToStage({
    workspaceId: ctx.ws.id,
    contactId: ctx.contact.id,
    toStageId: to.id,
    by: `rule:${ctx.rule.id}`,
    depth: ctx.run.depth + 1,
  });
  return "done";
}
