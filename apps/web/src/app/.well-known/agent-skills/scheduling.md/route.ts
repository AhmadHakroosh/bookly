import { connection } from "next/server";
import { onPlatformHostOrNull, schedulingSkill, SKILL_HEADERS } from "@/server/ard";

/** The Agent Skill the ARD manifest points at: how to book with Bookly. */
export async function GET() {
  await connection();
  const base = await onPlatformHostOrNull();
  if (!base) return new Response("Not found", { status: 404 });
  return new Response(schedulingSkill(base), { headers: SKILL_HEADERS });
}
