"use client";

import { NotesPanel, useMeetingNotes } from "@/app/meet/[room]/notes";

/** "Your notes from the call" on the booking: the same notes as in the call, still editable. */
export function BookingNotes({ room }: { room: string }) {
  const notes = useMeetingNotes(room, true);
  return (
    <section
      className="flex flex-col overflow-hidden rounded-xl border text-sm"
      aria-label="Your notes from the call"
    >
      <NotesPanel notes={notes} inCall={false} />
    </section>
  );
}
