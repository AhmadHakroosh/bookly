/** Minimal RFC 5545 generator — enough for calendar invites with a method and organizer. */
export type IcsEvent = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  organizer?: { name: string; email: string };
  attendees?: { name: string; email: string }[];
  method?: "REQUEST" | "CANCEL";
  sequence?: number;
  status?: "CONFIRMED" | "CANCELLED";
};

const fmt = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
const esc = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = (line: string) => {
  const out: string[] = [];
  let l = line;
  while (l.length > 73) {
    out.push(l.slice(0, 73));
    l = " " + l.slice(73);
  }
  out.push(l);
  return out.join("\r\n");
};

export function buildIcs(ev: IcsEvent): string {
  return buildIcsCalendar([ev], ev.method ?? "REQUEST");
}

/** One calendar holding several events (a recurring series ships every occurrence explicitly). */
export function buildIcsCalendar(events: IcsEvent[], method: "REQUEST" | "CANCEL"): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bookly//Scheduling//EN",
    `METHOD:${method}`,
  ];
  for (const ev of events) lines.push(...eventLines(ev));
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

function eventLines(ev: IcsEvent): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(ev.start)}`,
    `DTEND:${fmt(ev.end)}`,
    `SEQUENCE:${ev.sequence ?? 0}`,
    `STATUS:${ev.status ?? "CONFIRMED"}`,
    `SUMMARY:${esc(ev.summary)}`,
  ];
  if (ev.description) lines.push(`DESCRIPTION:${esc(ev.description)}`);
  if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`);
  if (ev.url) lines.push(`URL:${ev.url}`);
  if (ev.organizer)
    lines.push(`ORGANIZER;CN=${esc(ev.organizer.name)}:mailto:${ev.organizer.email}`);
  for (const a of ev.attendees ?? [])
    lines.push(`ATTENDEE;CN=${esc(a.name)};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${a.email}`);
  lines.push("END:VEVENT");
  return lines;
}
