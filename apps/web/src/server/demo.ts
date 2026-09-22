import "server-only";
import { hashPassword } from "better-auth/crypto";
import { and, eq, schema } from "@bookly/db";
import { loadEnv } from "@bookly/config";
import { db } from "@/lib/db";
import { ensureDefaultSchedule } from "./scheduling";

export const DEMO_EMAIL = "demo@example.com";
export const DEMO_PASSWORD = "demo-password-1234";

const EVENTS = [
  {
    slug: "intro-call",
    title: "Intro call",
    durationMin: 30,
    description: "A free 30-minute conversation. Tell me what you are working on.",
    questions: [
      {
        id: "q1_topic",
        label: "What would you like to discuss?",
        type: "textarea" as const,
        required: true,
      },
    ],
  },
  {
    slug: "working-session",
    title: "Working session",
    durationMin: 60,
    description: "An hour on a concrete problem. Send context ahead of time.",
    requiresConfirmation: true,
  },
];

/**
 * Seeds a demo host with a booking page and two event types into the current workspace (or
 * creates a workspace when none exists). Idempotent.
 */
export async function seedDemo() {
  const env = loadEnv();
  let user = await db().query.users.findFirst({ where: eq(schema.users.email, DEMO_EMAIL) });
  if (!user) {
    const id = crypto.randomUUID();
    await db().insert(schema.users).values({
      id,
      name: "Demo Host",
      email: DEMO_EMAIL,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db()
      .insert(schema.accounts)
      .values({
        id: crypto.randomUUID(),
        accountId: id,
        providerId: "credential",
        userId: id,
        password: await hashPassword(DEMO_PASSWORD),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    user = (await db().query.users.findFirst({ where: eq(schema.users.id, id) }))!;
  }
  // In cloud mode the demo tenant is an ordinary Free workspace (Bookly branding and all);
  // elsewhere it is the install's own, unlimited workspace.
  const plan = env.TENANCY === "multi" ? "free" : "self-hosted";
  let ws =
    (await db().query.workspaces.findFirst({ where: eq(schema.workspaces.slug, "demo") })) ??
    (await db().query.workspaces.findFirst());
  if (ws && ws.plan !== plan && (ws.plan === "self-hosted" || ws.plan === "free")) {
    [ws] = await db()
      .update(schema.workspaces)
      .set({ plan })
      .where(eq(schema.workspaces.id, ws.id))
      .returning();
  }
  if (!ws) {
    const orgId = crypto.randomUUID();
    await db()
      .insert(schema.organizations)
      .values({ id: orgId, name: "Demo Workspace", slug: "demo", createdAt: new Date() });
    const [w] = await db()
      .insert(schema.workspaces)
      .values({ organizationId: orgId, slug: "demo", name: "Demo Workspace", plan })
      .returning();
    ws = w!;
    await db()
      .insert(schema.workspaceDomains)
      .values({
        workspaceId: ws.id,
        host: new URL(env.APP_URL).host.toLowerCase(),
        isPrimary: true,
        verifiedAt: new Date(),
      });
  }
  const member = await db().query.members.findFirst({
    where: and(
      eq(schema.members.organizationId, ws.organizationId),
      eq(schema.members.userId, user.id),
    ),
  });
  if (!member)
    await db().insert(schema.members).values({
      id: crypto.randomUUID(),
      organizationId: ws.organizationId,
      userId: user.id,
      role: "admin",
      createdAt: new Date(),
    });
  const profile = await db().query.profiles.findFirst({
    where: and(eq(schema.profiles.workspaceId, ws.id), eq(schema.profiles.userId, user.id)),
  });
  if (!profile)
    await db().insert(schema.profiles).values({
      workspaceId: ws.id,
      userId: user.id,
      username: "demo",
      displayName: "Demo Host",
      bio: "Seeded by pnpm demo.",
      timezone: "UTC",
    });
  const schedule = await ensureDefaultSchedule(ws.id, user.id, "UTC");
  let created = 0;
  for (const e of EVENTS) {
    const exists = await db().query.eventTypes.findFirst({
      where: and(eq(schema.eventTypes.userId, user.id), eq(schema.eventTypes.slug, e.slug)),
      columns: { id: true },
    });
    if (exists) continue;
    await db()
      .insert(schema.eventTypes)
      .values({
        workspaceId: ws.id,
        userId: user.id,
        scheduleId: schedule.id,
        slug: e.slug,
        title: e.title,
        description: e.description,
        durationMin: e.durationMin,
        questions: e.questions ?? [],
        requiresConfirmation: !!e.requiresConfirmation,
        location: { type: "custom", value: "Video call, link sent by email" },
        locations: [
          { type: "custom", value: "Video call, link sent by email" },
          { type: "phone", value: "We call you" },
        ],
      });
    created++;
  }
  return {
    workspace: ws.slug,
    user: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    page: `${env.APP_URL}/demo`,
    eventTypesCreated: created,
    signIn: `${env.APP_URL}/login`,
  };
}
