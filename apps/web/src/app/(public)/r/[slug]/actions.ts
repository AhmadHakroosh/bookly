"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { throttlePublicForm } from "@/server/request";
import { getRoutingForm } from "@/server/routing";
import { routeAnswers } from "@/server/routing-rules";
import { getProfileByUser } from "@/server/scheduling";
import { getCurrentWorkspace } from "@/server/workspace";

const input = z.object({
  slug: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  email: z.email(),
  website: z.string().max(0).optional(),
});

export type RoutingState = { error?: string };

/** Evaluates the rules and sends the visitor on: a booking page (prefilled), a URL or a message. */
export async function submitRouting(
  _prev: RoutingState,
  formData: FormData,
): Promise<RoutingState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { error: "Please check your name and email." };
  const d = parsed.data;
  if (d.website) redirect("/");
  const ws = await getCurrentWorkspace();
  const form = ws ? await getRoutingForm(ws.id, d.slug) : null;
  if (!ws || !form) return { error: "This form no longer exists." };
  if (!(await throttlePublicForm(ws.id, "routing")))
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  const answers: Record<string, string> = {};
  for (const q of form.questions) {
    const v = (raw[`q_${q.id}`] ?? "").slice(0, 2000);
    if (q.required && !v.trim()) return { error: `Please answer: ${q.label}` };
    answers[q.id] = v;
  }
  const dest = routeAnswers(form, answers);
  if (!dest) return { error: "Sorry, we could not find a matching option. Please email us." };
  if (dest.type === "url") redirect(dest.url);
  if (dest.type === "message") redirect(`/r/${form.slug}?message=${encodeURIComponent(dest.text)}`);
  const et = await db().query.eventTypes.findFirst({
    where: eq(schema.eventTypes.id, dest.eventTypeId),
  });
  const host = et ? await getProfileByUser(ws.id, et.userId) : null;
  if (!et || !host || !et.active)
    return { error: "That booking option is not available right now." };
  const q = new URLSearchParams({ name: d.name, email: d.email });
  redirect(`/${host.username}/${et.slug}?${q}`);
}
