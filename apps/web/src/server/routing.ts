import "server-only";
import { and, asc, eq, schema } from "@bookly/db";
import type { RoutingForm } from "@bookly/db/schema";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { workspaceTag } from "./cache";

export async function listRoutingForms(workspaceId: string): Promise<RoutingForm[]> {
  return db()
    .select()
    .from(schema.routingForms)
    .where(eq(schema.routingForms.workspaceId, workspaceId))
    .orderBy(asc(schema.routingForms.name));
}

export async function getRoutingFormById(workspaceId: string, id: string) {
  return (
    (await db().query.routingForms.findFirst({
      where: and(eq(schema.routingForms.workspaceId, workspaceId), eq(schema.routingForms.id, id)),
    })) ?? null
  );
}

export async function getRoutingForm(
  workspaceId: string,
  slug: string,
): Promise<RoutingForm | null> {
  "use cache";
  cacheTag(workspaceTag(workspaceId));
  cacheLife("hours");
  return (
    (await db().query.routingForms.findFirst({
      where: and(
        eq(schema.routingForms.workspaceId, workspaceId),
        eq(schema.routingForms.slug, slug),
        eq(schema.routingForms.active, true),
      ),
    })) ?? null
  );
}
