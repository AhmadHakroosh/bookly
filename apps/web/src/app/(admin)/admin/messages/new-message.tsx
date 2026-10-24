"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { PenSquareIcon, XIcon } from "lucide-react";
import { MentionTextarea, type MentionPerson } from "@/components/mention-textarea";
import { openPane } from "@/components/pane";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  createTeamThreadAction,
  findContactsAction,
  openGuestThreadAction,
  type MessageResult,
} from "./actions";

type ContactHit = { id: string; name: string; email: string };

/** Contacts matching what is typed (debounced), for picking one. */
function useContactSearch(q: string, on: boolean) {
  const [hits, setHits] = useState<ContactHit[]>([]);
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => void findContactsAction(q).then(setHits), 200);
    return () => clearTimeout(t);
  }, [q, on]);
  return hits;
}

/** "New message": open a client's conversation, or start a team thread (Team). */
export function NewMessageButton({
  canGuest,
  canTeam,
  teamPlan,
  people,
  defaultOpen = false,
}: {
  canGuest: boolean;
  canTeam: boolean;
  teamPlan: string;
  people: MentionPerson[];
  /** Opened by `?new=1` (Create on Home). */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const onOpenChange = (o: boolean) => {
    setOpen(o);
    // Closing forgets ?new=1, so a reload does not open the form again.
    if (!o && new URL(location.href).searchParams.has("new")) {
      const u = new URL(location.href);
      u.searchParams.delete("new");
      history.replaceState(null, "", u.pathname + u.search);
    }
  };
  const [tab, setTab] = useState<"guest" | "team">(canGuest ? "guest" : "team");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button />}>
        <PenSquareIcon data-icon="inline-start" />
        New message
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
        </DialogHeader>
        <div
          role="tablist"
          aria-label="Who to"
          className="inline-flex w-fit rounded-lg border p-0.5 text-sm"
        >
          {(
            [
              ["guest", "A client"],
              ["team", "Team thread"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                "rounded-md px-3 py-1",
                tab === k ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "guest" ? (
          canGuest ? (
            <PickClient onDone={() => setOpen(false)} />
          ) : (
            <p className="text-sm text-muted-foreground">Messages with clients come with Pro.</p>
          )
        ) : canTeam ? (
          <TeamThreadForm people={people} onDone={() => setOpen(false)} />
        ) : (
          <p className="text-sm text-muted-foreground">Team threads come with {teamPlan}.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PickClient({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const hits = useContactSearch(q, true);
  const pick = (c: ContactHit) =>
    start(async () => {
      const r = await openGuestThreadAction(c.id);
      if (r.error || !r.threadId) return void toast.error(r.error ?? "Could not open it.");
      onDone();
      openPane(`/admin/messages?thread=${r.threadId}`, router.refresh);
    });
  return (
    <div className="space-y-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search contacts"
        aria-label="Search contacts"
        autoFocus
      />
      <ul
        className="max-h-64 divide-y overflow-y-auto rounded-lg border"
        aria-label="Contacts"
        aria-busy={pending}
      >
        {hits.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              disabled={pending}
              className="w-full px-3 py-2 text-left text-sm hover:bg-muted/50"
              onClick={() => pick(c)}
            >
              <span className="block">{c.name}</span>
              <span className="text-xs text-muted-foreground">{c.email}</span>
            </button>
          </li>
        ))}
        {hits.length === 0 && (
          <li className="p-3 text-sm text-muted-foreground">No contacts match.</li>
        )}
      </ul>
    </div>
  );
}

function TeamThreadForm({ people, onDone }: { people: MentionPerson[]; onDone: () => void }) {
  const router = useRouter();
  const [state, action] = useActionState(createTeamThreadAction, {} as MessageResult);
  const [body, setBody] = useState("");
  const [about, setAbout] = useState<ContactHit | null>(null);
  const [q, setQ] = useState("");
  const hits = useContactSearch(q, !about && q.length > 0);
  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state.ok && state.threadId) {
      onDone();
      openPane(`/admin/messages?thread=${state.threadId}`, router.refresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per result
  }, [state]);
  return (
    <form action={action} className="space-y-3">
      <Input name="subject" maxLength={200} aria-label="Subject" placeholder="Subject" required />
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">People</legend>
        {people.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Invite teammates first; you can still keep a thread for yourself.
          </p>
        ) : (
          <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-1.5 overflow-y-auto">
            {people.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="participant"
                  value={p.id}
                  className="size-4 accent-primary"
                />
                {p.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">About a contact (optional)</p>
        {about ? (
          <p className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pr-1 pl-2 text-xs">
            {about.name}
            <input type="hidden" name="contactId" value={about.id} />
            <button
              type="button"
              className="rounded-full p-0.5 hover:bg-muted"
              aria-label={`Not about ${about.name}`}
              onClick={() => setAbout(null)}
            >
              <XIcon className="size-3" />
            </button>
          </p>
        ) : (
          <>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search contacts"
              aria-label="About a contact"
            />
            {q && hits.length > 0 && (
              <ul
                className="max-h-40 divide-y overflow-y-auto rounded-lg border"
                aria-label="Contacts"
              >
                {hits.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted/50"
                      onClick={() => {
                        setAbout(c);
                        setQ("");
                      }}
                    >
                      {c.name} <span className="text-xs text-muted-foreground">{c.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <MentionTextarea
        id="new-thread"
        name="body"
        value={body}
        onValueChange={setBody}
        people={people}
        rows={4}
        maxLength={8000}
        ariaLabel="Message"
        placeholder="First message. Type @ to bring a teammate in."
      />
      <SubmitButton className="w-full" pendingText="Starting…" disabled={!body.trim()}>
        Start thread
      </SubmitButton>
    </form>
  );
}
