"use server";

import { redirect } from "next/navigation";
import { and, eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { refreshWorkspace } from "@/server/cache";
import { hasFlag } from "@/server/flags";
import {
  discardFormDraft,
  formForBuilder,
  mayEditForm,
  publishForm,
  saveFormDraft,
  syncInlineForm,
} from "@/server/forms";
import { getEventTypeById } from "@/server/scheduling";
import { isManager, requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

async function ctx(formId: string) {
  const [{ session, role }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws || !(await hasFlag(ws, "forms_v2"))) throw new Error("Forms are not enabled here.");
  const data = await formForBuilder(ws.id, formId);
  if (!data || !mayEditForm(data.owner, { id: session.user.id, manager: isManager(role) }))
    throw new Error("Form not found.");
  return { ws, session, data };
}

export type BuilderState = {
  problems?: string[];
  done?: "saved" | "published" | "discarded";
  version?: number;
  /** When it happened, so the same outcome twice still re-renders the status. */
  at?: number;
};

/** Saves the working copy, publishes it as a new version, or drops it (`intent`). */
export async function saveFormAction(
  formId: string,
  _prev: BuilderState,
  formData: FormData,
): Promise<BuilderState> {
  const { ws, session, data } = await ctx(formId);
  const target = { type: "form", id: formId, label: data.form.name };
  const intent = String(formData.get("intent") ?? "draft");
  if (intent === "discard") {
    await discardFormDraft(ws.id, formId);
    await audit({ action: "form.draft_discarded", target, workspace: ws.id });
    return { done: "discarded", at: Date.now() };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("schema") ?? ""));
  } catch {
    return { problems: ["The form could not be read. Reload the page and try again."] };
  }
  if (intent === "publish") {
    const r = await publishForm(ws.id, formId, raw, session.user.id);
    if (r.problems.length) return { problems: r.problems };
    await audit({
      action: "form.published",
      target,
      workspace: ws.id,
      changes: { version: { from: data.version, to: r.version } },
    });
    refreshWorkspace(ws.id);
    return { done: "published", version: r.version, at: Date.now() };
  }
  const r = await saveFormDraft(ws.id, formId, raw);
  if (r.problems.length) return { problems: r.problems };
  await audit({ action: "form.draft_saved", target, workspace: ws.id });
  return { done: "saved", at: Date.now() };
}

/** Opens the builder for an event type's or routing form's questions, creating the form once. */
export async function openFormBuilder(type: "event_type" | "routing_form", id: string) {
  const [{ session, role }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws || !(await hasFlag(ws, "forms_v2"))) redirect("/admin");
  let formId: string | null;
  let label: string;
  let created = false;
  if (type === "event_type") {
    const et = await getEventTypeById(ws.id, id);
    if (!et || (!isManager(role) && et.userId !== session.user.id)) redirect("/admin/event-types");
    label = et.title;
    created = !et.formId;
    formId =
      et.formId ??
      (await syncInlineForm({
        workspaceId: ws.id,
        purpose: "booking",
        name: et.title,
        owner: { table: "event_types", id: et.id, formId: null },
        questions: et.questions,
        userId: session.user.id,
        always: true,
      }));
  } else {
    const rf = await db().query.routingForms.findFirst({
      where: and(eq(schema.routingForms.id, id), eq(schema.routingForms.workspaceId, ws.id)),
    });
    if (!rf) redirect("/admin/routing");
    label = rf.name;
    created = !rf.formId;
    formId =
      rf.formId ??
      (await syncInlineForm({
        workspaceId: ws.id,
        purpose: "routing",
        name: rf.name,
        owner: { table: "routing_forms", id: rf.id, formId: null },
        questions: rf.questions,
        userId: session.user.id,
      }));
  }
  if (!formId) redirect("/admin");
  if (created)
    await audit({
      action: "form.created",
      target: { type: "form", id: formId, label },
      workspace: ws.id,
    });
  redirect(`/admin/forms/${formId}`);
}
