"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CONTACT_STAGES, type ContactStage } from "@bookly/db/schema";
import { getContact, logContactEvent, setStage, updateContact } from "@/server/contacts";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

async function ctx() {
  const [{ session }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) throw new Error("No workspace");
  return { session, ws };
}

const detailsSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().max(120).default(""),
  company: z.string().trim().max(120).default(""),
  phone: z.string().trim().max(40).default(""),
  tags: z.string().max(500).default(""),
  notes: z.string().max(10000).default(""),
  nextFollowUpAt: z.string().max(30).default(""),
});

export type ContactState = { ok?: boolean; error?: string };

export async function saveContact(_prev: ContactState, formData: FormData): Promise<ContactState> {
  const { ws } = await ctx();
  const parsed = detailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const d = parsed.data;
  if (!(await getContact(ws.id, d.id))) return { error: "Contact not found" };
  const next = d.nextFollowUpAt ? new Date(d.nextFollowUpAt) : null;
  await updateContact(ws.id, d.id, {
    name: d.name,
    company: d.company || null,
    phone: d.phone || null,
    tags: [
      ...new Set(
        d.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ].slice(0, 20),
    notes: d.notes || null,
    nextFollowUpAt: next && !Number.isNaN(next.getTime()) ? next : null,
  });
  revalidatePath(`/admin/contacts/${d.id}`);
  return { ok: true };
}

export async function changeStage(id: string, formData: FormData) {
  const { ws, session } = await ctx();
  const stage = String(formData.get("stage") ?? "");
  if (!(CONTACT_STAGES as readonly string[]).includes(stage)) return;
  await setStage(ws.id, id, stage as ContactStage, session.user.id);
  revalidatePath(`/admin/contacts/${id}`);
}

export async function addNote(id: string, formData: FormData) {
  const { ws } = await ctx();
  const text = String(formData.get("text") ?? "")
    .trim()
    .slice(0, 2000);
  if (!text || !(await getContact(ws.id, id))) return;
  await logContactEvent(ws.id, id, "note", text);
  revalidatePath(`/admin/contacts/${id}`);
}
