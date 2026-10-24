import "server-only";
import { and, eq, schema } from "@bookly/db";
import type { StoredFile } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { bookingsVisibleTo, filesVisibleToHiring } from "../access/hiring";

/**
 * Whether hiring access hides a file from this user (ADR 0005): tied to an application they may
 * not see, or to a person who exists only as a candidate outside their team.
 */
export async function hiddenByHiring(file: Pick<StoredFile, "id">, userId: string) {
  const [row] = await db()
    .select({ id: schema.files.id })
    .from(schema.files)
    .where(and(eq(schema.files.id, file.id), filesVisibleToHiring(userId)))
    .limit(1);
  return !row;
}

/**
 * Whether an API key may act on a booking: interviews are hiring data, out of the API until its
 * hiring scopes exist (ADR 0005). Unknown ids read as not allowed.
 */
export async function apiMayTouchBooking(workspaceId: string, bookingId: string) {
  const [row] = await db()
    .select({ id: schema.bookings.id, status: schema.bookings.status })
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.id, bookingId),
        eq(schema.bookings.workspaceId, workspaceId),
        bookingsVisibleTo(null),
      ),
    )
    .limit(1);
  return row ?? null;
}
