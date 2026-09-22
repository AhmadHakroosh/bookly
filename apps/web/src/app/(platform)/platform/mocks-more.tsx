import {
  CheckIcon,
  ClockIcon,
  MailIcon,
  MicIcon,
  SendIcon,
  SplitIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const card =
  "force-light rounded-xl border border-black/10 bg-background p-4 text-sm text-foreground shadow-xl shadow-black/15";

/** The in-call transcript panel, lines arriving as they are spoken. */
export function LiveTranscriptMock() {
  const lines: [string, string, string][] = [
    ["12:04", "Omar", "We need this live before the December rush."],
    ["12:19", "Dana", "Understood. Three clinics, one booking flow, reminders on each."],
    ["12:31", "Dana", "I'll send two options by Wednesday."],
    ["12:47", "Omar", "Insurance integration is a later phase, not now."],
    ["13:02", "Omar", "Our front desk will send the patient list."],
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-black/10 bg-neutral-950 text-white shadow-xl shadow-black/25">
      <div className="flex items-center justify-between px-4 py-2 text-xs">
        <span className="inline-flex items-center gap-2 font-medium">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-red-500" />
          </span>
          Recording with consent
        </span>
        <span className="inline-flex items-center gap-1 text-white/60">
          <MicIcon className="size-3" aria-hidden /> Live transcript
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 px-3">
        {["Dana Weiss", "Omar Haddad"].map((n) => (
          <div
            key={n}
            className="flex aspect-video items-end rounded-lg bg-linear-to-br from-white/15 to-white/5 p-2 text-[11px]"
          >
            {n}
          </div>
        ))}
      </div>
      <ol className="space-y-1.5 px-4 py-3 font-mono text-[11px] text-white/80">
        {lines.map(([t, who, text], i) => (
          <li
            key={t}
            className="transcript-line"
            style={{ "--line-delay": `${i * 900}ms` } as never}
          >
            <span className="text-white/40">[{t}]</span>{" "}
            <span className={who === "Dana" ? "text-sky-300" : "text-amber-300"}>{who}:</span>{" "}
            {text}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A routing form the visitor sees before choosing a time. */
export function RoutingMock() {
  return (
    <div className={card}>
      <div className="flex items-center justify-between">
        <h4 className="text-base font-semibold tracking-tight">How can we help?</h4>
        <Badge variant="outline">
          <SplitIcon className="mr-1 size-3" aria-hidden />
          routing
        </Badge>
      </div>
      <div className="mt-3 space-y-3">
        <div>
          <p className="text-xs font-medium">What are you looking for?</p>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-xs">
            {["New project", "Ongoing support", "Advice call", "Something else"].map((o, i) => (
              <span
                key={o}
                className={`rounded-lg border px-2.5 py-1.5 ${i === 0 ? "border-foreground bg-muted font-medium" : "text-muted-foreground"}`}
              >
                {o}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium">Team size</p>
          <div className="mt-1.5 flex gap-1.5 text-xs">
            {["1–10", "11–50", "50+"].map((o, i) => (
              <span
                key={o}
                className={`rounded-lg border px-2.5 py-1.5 ${i === 2 ? "border-foreground bg-muted font-medium" : "text-muted-foreground"}`}
              >
                {o}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-lg bg-muted/60 p-2.5 text-xs">
          <span className="text-muted-foreground">Sends to:</span>{" "}
          <span className="font-medium">Discovery call · 45 min</span>
          <span className="block text-muted-foreground">
            50+ and “new project” → the 45-minute call, not the 15-minute intro.
          </span>
        </div>
      </div>
    </div>
  );
}

/** Group session with seats and a waitlist, from the host's side. */
export function SeatsMock() {
  const people = ["Acme Ltd · Noa", "Acme Ltd · Tom", "Acme Ltd · Priya"];
  return (
    <div className={card}>
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-base font-semibold tracking-tight">Working session · Tue 14:30</h4>
          <p className="text-xs text-muted-foreground">Session 2 of 6 · 60 min · built-in video</p>
        </div>
        <Badge>
          <UsersIcon className="mr-1 size-3" aria-hidden />3 / 3 seats
        </Badge>
      </div>
      <ul className="mt-3 divide-y rounded-lg border text-xs">
        {people.map((p) => (
          <li key={p} className="flex items-center justify-between p-2">
            <span>{p}</span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <CheckIcon className="size-3" aria-hidden /> confirmed
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between rounded-lg border border-dashed p-2 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <ClockIcon className="size-3 text-muted-foreground" aria-hidden />
          Waitlist: 2 people
        </span>
        <span className="text-muted-foreground">first in line is offered the seat on cancel</span>
      </div>
    </div>
  );
}

/** The follow-up email Bookly drafts after a call. */
export function FollowUpMock() {
  return (
    <div className={card}>
      <div className="flex items-center justify-between">
        <h4 className="inline-flex items-center gap-1.5 text-base font-semibold tracking-tight">
          <MailIcon className="size-4 text-muted-foreground" aria-hidden />
          Follow-up
        </h4>
        <Badge variant="outline">draft</Badge>
      </div>
      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        <p>
          <span className="inline-block w-10">To</span> omar@haddad-dental.example
        </p>
        <p>
          <span className="inline-block w-10">Subject</span>
          <span className="text-foreground">Booking flow for Haddad Dental: next steps</span>
        </p>
      </div>
      <div className="mt-3 space-y-2 rounded-lg bg-muted/50 p-3 leading-relaxed">
        <p>Hi Omar, thanks for today. Here is what we agreed:</p>
        <ul className="list-disc space-y-0.5 pl-4">
          <li>I send two proposal options by Wednesday.</li>
          <li>Your front desk shares the patient list next week.</li>
          <li>Insurance integration is a later phase.</li>
        </ul>
        <p>Let me know if I missed anything.</p>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="pointer-events-none">
          <SendIcon data-icon="inline-start" />
          Send
        </Button>
        <Button size="sm" variant="outline" className="pointer-events-none">
          Edit
        </Button>
      </div>
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border p-4">
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
