import Link from "next/link";
import { ArrowUpRightIcon, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

/**
 * The marketing site's building blocks, drawn from the website concepts (`marketing ui*.png`):
 * the two-line headline (Ink, then Bookly Orange), the handwritten annotation with its arrow,
 * eyebrows, sections, the Ink CTA band and the "Straight answers" FAQ.
 */

export function Section({
  id,
  children,
  className = "",
  labelledBy,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`scroll-mt-20 py-14 md:py-20 ${className}`}
    >
      <div className="mx-auto max-w-6xl px-4">{children}</div>
    </section>
  );
}

/** Small spaced capitals above a headline ("YOUR CLIENT WORK, CONNECTED"). */
export function Eyebrow({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase ${className}`}
    >
      {children}
    </p>
  );
}

/**
 * The concepts' headline: the first sentence in Ink, the second in Bookly Orange (large type,
 * so it passes contrast). `as` is h1 on a page's hero, h2 in a section.
 */
export function Headline({
  first,
  second,
  as: H = "h1",
  id,
  size = "hero",
  className = "",
}: {
  first: string;
  second: string;
  as?: "h1" | "h2";
  id?: string;
  /** hero: a page's opening; split: a hero that shares its row with a picture. */
  size?: "hero" | "split" | "section";
  className?: string;
}) {
  const scale = {
    hero: "text-[2.6rem] leading-[1.02] sm:text-6xl md:text-[4.25rem]",
    split: "text-[2.6rem] leading-[1.02] sm:text-6xl lg:text-[3.5rem] xl:text-[3.75rem]",
    section: "text-3xl leading-[1.05] md:text-5xl",
  }[size];
  return (
    <H id={id} className={`font-bold tracking-[-0.035em] text-balance ${scale} ${className}`}>
      <span className="block">{first}</span>
      <span className="block text-(--brand)">{second}</span>
    </H>
  );
}

/**
 * The handwritten note with a curled arrow the concepts put beside a headline ("Less admin.
 * More progress."). Decorative: the same words are never the only place a fact is stated.
 */
export function Annotation({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`pointer-events-none hidden items-end gap-1 text-muted-foreground select-none md:flex ${className}`}
      aria-hidden
    >
      <svg viewBox="0 0 48 48" className="size-10 shrink-0 -scale-x-100" fill="none">
        <path
          d="M6 6c14 2 26 12 28 30"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M27 31l7 6 5-8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="mb-6 max-w-[12rem] -rotate-3 font-[family-name:var(--font-caveat),cursive] text-xl leading-tight">
        {children}
      </p>
    </div>
  );
}

/** A page's opening: eyebrow, two-line headline, lead and optional actions, with an annotation. */
export function PageHero({
  eyebrow,
  first,
  second,
  lead,
  note,
  children,
  aside,
}: {
  eyebrow?: string;
  first: string;
  second: string;
  lead: React.ReactNode;
  note?: string;
  children?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 pb-6 md:pt-20">
      <div className={aside ? "grid items-center gap-10 lg:grid-cols-[1.45fr_1fr]" : ""}>
        <div className="relative min-w-0">
          {eyebrow && <Eyebrow className="mb-4">{eyebrow}</Eyebrow>}
          <Headline first={first} second={second} size={aside ? "split" : "hero"} />
          <div className="mt-5 max-w-xl text-lg text-pretty text-muted-foreground">{lead}</div>
          {children}
          {note && !aside && <Annotation className="absolute top-0 right-0">{note}</Annotation>}
        </div>
        {aside && (
          <div className="relative min-w-0">
            {note && <Annotation className="absolute -top-14 right-4">{note}</Annotation>}
            {aside}
          </div>
        )}
      </div>
    </div>
  );
}

/** The primary call to action pair: Start free (Ink) and one outline action. */
export function StartFree({
  secondary,
  className = "",
}: {
  secondary?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex flex-wrap gap-3">
        <Button size="lg" variant="ink" nativeButton={false} render={<Link href="/signup" />}>
          Start free
          <ArrowUpRightIcon data-icon="inline-end" />
        </Button>
        {secondary && (
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<Link href={secondary.href} />}
          >
            {secondary.label}
          </Button>
        )}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">Free plan. No card required.</p>
    </div>
  );
}

/** The dark Ink band that closes every page ("Your next booking could be the start of something."). */
export function CtaBand({
  title = "Your next booking could be the start of something.",
  body = "More than a calendar. A connected workspace for the client work you care about.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <section aria-labelledby="cta-band" className="px-4 pb-16">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 rounded-2xl bg-ink px-6 py-8 text-ink-foreground md:flex-row md:items-center md:gap-10 md:px-10">
        <Logo size={24} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 id="cta-band" className="text-2xl font-bold tracking-tight text-balance">
            {title}
          </h2>
          <p className="mt-1 text-ink-foreground/75">{body}</p>
        </div>
        <div className="shrink-0 md:text-right">
          <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>
            Start free
            <ArrowUpRightIcon data-icon="inline-end" />
          </Button>
          <p className="mt-2 text-sm text-ink-foreground/75">Free plan. No card required.</p>
        </div>
      </div>
    </section>
  );
}

/**
 * "Straight answers": the FAQ before the closing CTA (from the Sam site). Native
 * details/summary, so it works without JavaScript; the page adds FAQPage JSON-LD.
 */
export function StraightAnswers({
  items,
  title = "Straight answers.",
  intro,
}: {
  items: [string, string][];
  title?: string;
  intro?: React.ReactNode;
}) {
  return (
    <Section id="straight-answers" labelledBy="straight-answers-title">
      <div className="grid gap-8 md:grid-cols-[1fr_2fr] md:gap-12">
        <div>
          <Eyebrow>FAQ</Eyebrow>
          <h2
            id="straight-answers-title"
            className="mt-3 text-3xl font-bold tracking-[-0.03em] md:text-4xl"
          >
            {title}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {intro ?? (
              <>
                Something we missed?{" "}
                <Link
                  href="/contact"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Ask us
                </Link>
                .
              </>
            )}
          </p>
        </div>
        <div className="divide-y rounded-2xl border bg-card">
          {items.map(([q, a]) => (
            <details key={q} className="group px-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDownIcon
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden
                />
              </summary>
              <div className="pb-5 text-sm leading-relaxed text-muted-foreground">{a}</div>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}

/** A white card with a hairline border, the concepts' basic surface. */
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`rounded-2xl border bg-card p-6 ${className}`}>{children}</div>;
}
