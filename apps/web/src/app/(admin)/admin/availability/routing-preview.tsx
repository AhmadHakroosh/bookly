"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLinkIcon, MessageSquareTextIcon, SplitIcon } from "lucide-react";
import { Dropdown } from "@/components/dropdown";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsOf } from "@/components/ui/avatar-stack";
import { cn } from "cn";

/** Where one answer sends people, worked out on the server with the form's own rules. */
export type PreviewDestination =
  | { kind: "event"; title: string; host: string; avatarUrl: string | null }
  | { kind: "url"; host: string }
  | { kind: "message"; text: string }
  | null;

export type PreviewForm = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  /** The form's first choice question, with where each option leads. */
  question: { label: string; options: { value: string; to: PreviewDestination }[] } | null;
};

/**
 * "Routing form preview" beside the weekly hours (`mocks.png` 03): the first question of a
 * routing form as a visitor sees it, and, for the option picked, who the booking goes to.
 */
export function RoutingPreview({ forms }: { forms: PreviewForm[] }) {
  const [formId, setFormId] = useState(forms[0]?.id ?? "");
  const form = forms.find((f) => f.id === formId) ?? forms[0];
  const [picked, setPicked] = useState(0);
  if (!form) return null;
  const options = form.question?.options ?? [];
  const to = options[picked]?.to ?? null;
  return (
    <section
      aria-labelledby="routing-preview-title"
      className="space-y-4 rounded-xl border bg-card p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="routing-preview-title" className="text-sm font-semibold">
          Routing form preview
        </h2>
        <Link
          href={`/admin/routing/${form.id}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          Edit
        </Link>
      </div>
      {forms.length > 1 && (
        <Dropdown
          ariaLabel="Routing form"
          size="sm"
          value={form.id}
          onValueChange={(v) => {
            setFormId(v);
            setPicked(0);
          }}
          options={forms.map((f) => ({ value: f.id, label: f.name }))}
          className="w-full"
        />
      )}
      {form.question && options.length ? (
        <>
          <div>
            <p className="font-semibold">{form.question.label}</p>
            <p className="text-sm text-muted-foreground">
              Pick an answer to see who the booking goes to.
            </p>
          </div>
          <div role="radiogroup" aria-label={form.question.label} className="space-y-1">
            {options.map((o, i) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={picked === i}
                onClick={() => setPicked(i)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border",
                    picked === i && "border-primary",
                  )}
                >
                  {picked === i && <span className="size-2 rounded-full bg-primary" />}
                </span>
                {o.value}
              </button>
            ))}
          </div>
          <div className="rounded-lg border bg-background p-3" aria-live="polite">
            <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <SplitIcon className="size-3.5" aria-hidden />
              Route to
            </p>
            <Destination to={to} />
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {form.name} has no choice question yet. Add one with options to see where each answer
          leads.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {form.active ? (
          <a
            href={`/r/${form.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
          >
            /r/{form.slug}
            <ExternalLinkIcon className="size-3" aria-hidden />
          </a>
        ) : (
          "This form is off; visitors can't open it."
        )}
      </p>
    </section>
  );
}

function Destination({ to }: { to: PreviewDestination }) {
  if (!to) return <p className="text-sm text-muted-foreground">No rule matches this answer.</p>;
  if (to.kind === "event")
    return (
      <div className="flex items-center gap-3">
        <Avatar className="size-9">
          {to.avatarUrl && <AvatarImage src={to.avatarUrl} alt="" />}
          <AvatarFallback>{initialsOf(to.host)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium">{to.host}</p>
          <p className="truncate text-muted-foreground">{to.title}</p>
        </div>
      </div>
    );
  if (to.kind === "url")
    return (
      <p className="flex items-center gap-2 text-sm">
        <ExternalLinkIcon className="size-4 text-muted-foreground" aria-hidden />
        Opens {to.host}
      </p>
    );
  return (
    <p className="flex items-start gap-2 text-sm">
      <MessageSquareTextIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="line-clamp-3">{to.text}</span>
    </p>
  );
}
