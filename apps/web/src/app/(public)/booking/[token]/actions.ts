"use server";

import { revalidatePath } from "next/cache";
import { cancelBooking } from "@/server/booking-flow";
import { getBookingByToken } from "@/server/scheduling";
import { getCurrentWorkspace } from "@/server/workspace";

export async function cancelByAttendee(token: string, formData: FormData) {
  const ws = await getCurrentWorkspace();
  const b = await getBookingByToken(token);
  if (!ws || !b || b.workspaceId !== ws.id) return;
  await cancelBooking(ws, b.id, "attendee", String(formData.get("reason") ?? ""));
  revalidatePath(`/booking/${token}`);
}
