"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { sendAttendeeRecapAction } from "../../scheduling-actions";

type Item = { title: string; owner: "me" | "them"; dueInDays: number | null };

/** The client-facing recap: editable, with the action items to include chosen by checkbox. */
export function AttendeeRecap({
  bookingId,
  attendeeName,
  hostName,
  draft,
  actions,
  sentAt,
}: {
  bookingId: string;
  attendeeName: string;
  hostName: string;
  draft: { subject: string; body: string } | null;
  actions: Item[];
  sentAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(draft?.subject ?? "Recap of our call");
  const [included, setIncluded] = useState<boolean[]>(actions.map(() => true));
  const [body, setBody] = useState(draft?.body ?? "");
  const compose = (inc: boolean[]) => {
    const items = actions.filter((_, i) => inc[i]);
    const list = items.length
      ? `\n\nWho does what:\n${items
          .map(
            (a) =>
              `- ${a.owner === "them" ? attendeeName : hostName}: ${a.title}${a.dueInDays !== null ? ` (within ${a.dueInDays} day${a.dueInDays === 1 ? "" : "s"})` : ""}`,
          )
          .join("\n")}`
      : "";
    return `${(draft?.body ?? "").replace(/\n\nWho does what:[\s\S]*$/, "").trim()}${list}`;
  };
  const field = "w-full rounded-lg border bg-background px-3 py-2 text-sm";
  return (
    <section className="rounded-xl border p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">Recap for {attendeeName}</h2>
        {sentAt ? (
          <span className="text-xs text-muted-foreground">
            Sent {new Date(sentAt).toLocaleString()}
          </span>
        ) : (
          <Button type="button" variant="outline" onClick={() => setOpen((v) => !v)}>
            {open ? "Close" : "Prepare"}
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        A neutral summary with decisions and who does what, drafted by the assistant from the
        transcript. Read it before sending: it goes out under your name. Untick items you would
        rather keep internal.
      </p>
      {open && !sentAt && (
        <form action={sendAttendeeRecapAction.bind(null, bookingId)} className="mt-3 space-y-2">
          {actions.length > 0 && (
            <ul className="space-y-1">
              {actions.map((a, i) => (
                <li key={i}>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={included[i]}
                      onChange={(e) => {
                        const next = included.map((v, j) => (j === i ? e.target.checked : v));
                        setIncluded(next);
                        setBody(compose(next));
                      }}
                    />
                    {a.owner === "them" ? attendeeName : hostName}: {a.title}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <input
            name="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={`${field} h-9`}
            placeholder="Subject"
          />
          <textarea
            name="body"
            value={body || compose(included)}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className={field}
          />
          <Button type="submit" disabled={!subject.trim()}>
            Send recap to {attendeeName}
          </Button>
        </form>
      )}
    </section>
  );
}
