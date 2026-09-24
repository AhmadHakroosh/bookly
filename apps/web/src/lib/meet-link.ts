/**
 * The link an attendee should use to join. On Bookly video it carries the booking's manage token,
 * which the meeting page turns into a Daily token that pre-fills their name; hosts open the same
 * room signed in and are recognised as the owner instead. Other providers' links are unchanged.
 */
export function attendeeJoinUrl(b: {
  meetingUrl: string | null;
  meetingProvider: string | null;
  manageToken: string;
}): string | null {
  if (!b.meetingUrl) return null;
  if (b.meetingProvider !== "daily") return b.meetingUrl;
  const u = new URL(b.meetingUrl);
  u.searchParams.set("t", b.manageToken);
  return u.toString();
}
