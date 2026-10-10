import "server-only";
import { headers } from "next/headers";
import { eq, schema } from "@bookly/db";
import { db } from "@/lib/db";

/**
 * `session.signed_in` in every workspace the user belongs to, written from the auth hook.
 * Kept apart from audit.ts because that module reads the session, which needs the auth
 * instance this hook is part of.
 */
export async function recordSignIn(userId: string) {
  try {
    const [user, rows] = await Promise.all([
      db().query.users.findFirst({ where: eq(schema.users.id, userId), columns: { email: true } }),
      db()
        .select({ id: schema.workspaces.id })
        .from(schema.members)
        .innerJoin(
          schema.workspaces,
          eq(schema.workspaces.organizationId, schema.members.organizationId),
        )
        .where(eq(schema.members.userId, userId)),
    ]);
    if (!user || !rows.length) return;
    let ip: string | null = null;
    let userAgent: string | null = null;
    let requestId: string | null = null;
    try {
      const h = await headers();
      ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
      userAgent = h.get("user-agent")?.slice(0, 300) ?? null;
      requestId = h.get("x-vercel-id") ?? h.get("x-request-id");
    } catch {
      /* no request scope */
    }
    await db()
      .insert(schema.auditLog)
      .values(
        rows.map((w) => ({
          workspaceId: w.id,
          actorType: "user" as const,
          actorId: userId,
          actorLabel: user.email,
          action: "session.signed_in",
          targetType: "user",
          targetId: userId,
          targetLabel: user.email,
          ip,
          userAgent,
          requestId,
        })),
      );
  } catch (e) {
    console.error("[audit] sign-in", e);
  }
}
