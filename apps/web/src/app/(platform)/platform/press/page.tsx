import type { Metadata } from "next";
import Image from "next/image";
import { DownloadIcon } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { breadcrumbLd, JsonLd } from "../json-ld";
import { pageMetadata, SITE } from "../site";

export const metadata: Metadata = pageMetadata({
  title: "Press and brand",
  description:
    "The Bookly press kit: logos in SVG and PNG, colours, type, product images, the story of the mark and boilerplate copy for writing about Bookly.",
  path: "/press",
});

const KIT = "/press/bookly-press-kit.zip";

/** Lockups from brand/ (rendered by brand/source/render.mjs into public/press). */
const LOGOS = [
  {
    file: "bookly-logo",
    name: "Logo",
    use: "The default. Orange mark, ink wordmark, on light backgrounds.",
    tile: "#FAF8F4",
  },
  {
    file: "bookly-logo-on-ink",
    name: "Logo on ink",
    use: "On dark panels: the mark keeps its colour, the wordmark turns white.",
    tile: "#1C1C1C",
  },
  {
    file: "bookly-logo-reversed",
    name: "Reversed",
    use: "All white, for photos and colour backgrounds.",
    tile: "#B93E10",
  },
  {
    file: "bookly-logo-stacked",
    name: "Stacked",
    use: "Mark above the wordmark, for square spaces.",
    tile: "#FAF8F4",
  },
  {
    file: "bookly-mark",
    name: "Mark",
    use: "The mark alone, when the name is nearby.",
    tile: "#FFFFFF",
  },
  {
    file: "bookly-icon",
    name: "App icon",
    use: "Avatars, app stores, favicons. Use it at 16 px and below.",
    tile: "#FFFFFF",
  },
] as const;

/** The palette from the v1.0 product design (bookly-design-system/references/tokens.md). */
const COLOURS = [
  {
    name: "Bookly Orange",
    hex: "#E85D2C",
    ink: "#FFFFFF",
    role: "The mark, highlights, large type",
  },
  { name: "Ember", hex: "#B93E10", ink: "#FFFFFF", role: "Orange text and buttons" },
  { name: "Peach", hex: "#FBE9DF", ink: "#1C1C1C", role: "Selected and active surfaces" },
  { name: "Ink", hex: "#1C1C1C", ink: "#FFFFFF", role: "Text and dark surfaces" },
  { name: "Paper", hex: "#FAF8F4", ink: "#1C1C1C", role: "Backgrounds" },
  { name: "Reply", hex: "#F5B6A0", ink: "#1C1C1C", role: "The second bubble, illustration" },
] as const;

const SCREENS = [
  {
    file: "home",
    title: "Home",
    caption: "What needs you today: meetings, follow-ups, next steps.",
  },
  {
    file: "workspace",
    title: "Client workspace",
    caption: "Bookings, contacts, messages, tasks and files around each person.",
  },
  {
    file: "scheduling",
    title: "Scheduling",
    caption: "Booking page, event types, availability, the call and its recap.",
  },
  {
    file: "hiring",
    title: "Hiring",
    caption: "Opportunities with a pipeline, independent reviews and interviews.",
  },
  { file: "website", title: "Website", caption: "A booking starts it. Bookly keeps it moving." },
  {
    file: "website-pages",
    title: "Website pages",
    caption: "Product, solutions, pricing, trust, resources.",
  },
] as const;

function Section({
  id,
  title,
  lede,
  children,
}: {
  id: string;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t py-14">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      {lede && <p className="mt-2 max-w-2xl text-muted-foreground">{lede}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}

function DownloadLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      download
      className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
    >
      <DownloadIcon className="size-3.5" aria-hidden />
      {label}
    </a>
  );
}

export default function PressPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">
      <JsonLd data={breadcrumbLd([["Press", "/press"]])} />
      <header className="max-w-3xl">
        <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
          Press and brand
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">
          People. Conversations. <span className="text-brand">Progress.</span>
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Everything you need to write about Bookly or show it: the logo, colours and type, images
          of the product, and a few words about who we are.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button size="lg" nativeButton={false} render={<a href={KIT} download />}>
            <DownloadIcon data-icon="inline-start" />
            Download the press kit
          </Button>
          <span className="text-sm text-muted-foreground">SVG and PNG, 0.3 MB</span>
        </div>
        <nav aria-label="On this page" className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {[
            ["#about", "About"],
            ["#logo", "Logo"],
            ["#usage", "Usage"],
            ["#colour", "Colour"],
            ["#type", "Type"],
            ["#product", "Product"],
            ["#story", "The mark"],
            ["#contact", "Contact"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="text-muted-foreground hover:text-foreground">
              {label}
            </a>
          ))}
        </nav>
      </header>

      <Section id="about" title="About Bookly">
        <div className="grid gap-10 md:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold">In one sentence</h3>
              <p className="mt-2 text-muted-foreground">
                Bookly is a scheduling and meeting workspace for people who work with people: it
                books the meeting, briefs you before it, captures it with consent and turns it into
                follow-ups, decisions and paid work.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold">In a paragraph</h3>
              <p className="mt-2 text-muted-foreground">
                Most scheduling tools stop at the calendar invite. Bookly starts there. It takes
                bookings like any scheduling tool, then keeps one record per person, prepares a
                briefing before each call, transcribes and recaps the call with everyone&apos;s
                consent, and turns the recap into tasks, follow-up emails and payment requests.
                Consultants, coaches, agencies and small teams use it to run their client work.
                Bookly 1.0, in development, adds hiring: cohorts, fellowships, programs and jobs,
                with stages each team defines. The core is open source and can be self-hosted; the
                hosted service runs at bookly-app.io.
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 self-start rounded-xl border bg-card p-6 text-sm">
            <dt className="text-muted-foreground">Product</dt>
            <dd>{SITE.name}</dd>
            <dt className="text-muted-foreground">Company</dt>
            <dd>{SITE.operator}</dd>
            <dt className="text-muted-foreground">Founder</dt>
            <dd>{SITE.maker}</dd>
            <dt className="text-muted-foreground">First release</dt>
            <dd>September 2026</dd>
            <dt className="text-muted-foreground">License</dt>
            <dd>AGPL-3.0 core, hosted cloud</dd>
            <dt className="text-muted-foreground">Source</dt>
            <dd>
              <a
                href={SITE.github}
                target="_blank"
                rel="noreferrer"
                className="underline-offset-4 hover:underline"
              >
                GitHub
              </a>
            </dd>
            <dt className="text-muted-foreground">Name</dt>
            <dd>&ldquo;Bookly&rdquo;, capital B in text; the logo is lowercase.</dd>
          </dl>
        </div>
      </Section>

      <Section
        id="logo"
        title="Logo"
        lede="Use the files as they are. Every lockup comes as SVG (preferred) and as a high-resolution PNG."
      >
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {LOGOS.map((l) => (
            <li key={l.file} className="overflow-hidden rounded-xl border bg-card">
              <div
                className="flex h-44 items-center justify-center p-8"
                style={{ backgroundColor: l.tile }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- SVG files shown as-is */}
                <img
                  src={`/press/${l.file}.svg`}
                  alt={`Bookly ${l.name.toLowerCase()}`}
                  className="max-h-full max-w-full"
                  loading="lazy"
                />
              </div>
              <div className="space-y-2 border-t p-4">
                <p className="font-medium">{l.name}</p>
                <p className="text-sm text-muted-foreground">{l.use}</p>
                <div className="flex gap-4 pt-1">
                  <DownloadLink href={`/press/${l.file}.svg`} label="SVG" />
                  <DownloadLink href={`/press/${l.file}.png`} label="PNG" />
                </div>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">
          Also in the kit: a one-colour mark for print, a white mark, and a square icon for
          platforms that round corners themselves.
        </p>
      </Section>

      <Section id="usage" title="Usage">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <h3 className="font-medium">Clear space</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Leave space around the logo at least as wide as the stem of the b. Nothing else goes
              inside it.
            </p>
          </div>
          <div>
            <h3 className="font-medium">Minimum size</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Logo: 96 px wide on screen, 25 mm in print. Mark: 16 px; below that, use the app icon.
            </p>
          </div>
          <div>
            <h3 className="font-medium">Please don&apos;t</h3>
            <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-muted-foreground">
              <li>recolour, stretch, rotate or mirror it</li>
              <li>separate the two bubbles of the mark</li>
              <li>retype the wordmark or change its font</li>
              <li>add shadows, outlines or gradients</li>
              <li>put the orange mark on orange or busy photos</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section
        id="colour"
        title="Colour"
        lede="Warm paper, near-black ink and one orange. Bookly Orange is for the mark, highlights and large type; Ember carries orange text and buttons, where the brighter orange would be hard to read."
      >
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {COLOURS.map((c) => (
            <li key={c.hex} className="overflow-hidden rounded-xl border bg-card">
              <div
                className="flex h-24 items-end p-3 text-xs font-medium"
                style={{ backgroundColor: c.hex, color: c.ink }}
              >
                {c.hex}
              </div>
              <div className="p-3">
                <p className="text-sm font-medium">{c.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{c.role}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="type"
        title="Type"
        lede="Geist for everything: the product, the website and the wordmark, which is Geist Extra Bold drawn as outlines. Geist is free under the SIL Open Font License."
      >
        <div className="rounded-xl border bg-card p-8">
          <p className="text-5xl font-extrabold tracking-tight">Aa</p>
          <p className="mt-4 text-3xl font-bold tracking-tight">A booking starts it.</p>
          <p className="mt-2 text-lg">The call ends. The context stays.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Headlines bold with tight tracking; body text regular; never more than two weights in
            one block.
          </p>
          <a
            href="https://vercel.com/font"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block text-sm font-medium underline-offset-4 hover:underline"
          >
            Get Geist
          </a>
        </div>
      </Section>

      <Section
        id="product"
        title="Product"
        lede="Design previews for Bookly 1.0. The final screens may differ; ask us for current screenshots."
      >
        <ul className="grid gap-8 md:grid-cols-2">
          {SCREENS.map((s) => (
            <li key={s.file}>
              <a
                href={`/press/ui/${s.file}.webp`}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-xl border bg-card"
              >
                <Image
                  src={`/press/ui/${s.file}.webp`}
                  alt={`Bookly ${s.title.toLowerCase()} design preview`}
                  width={1600}
                  height={900}
                  sizes="(min-width: 768px) 560px, 100vw"
                  className="h-auto w-full"
                />
              </a>
              <p className="mt-3 font-medium">{s.title}</p>
              <p className="text-sm text-muted-foreground">{s.caption}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="story" title="The mark">
        <div className="grid items-center gap-10 md:grid-cols-[1fr_2fr]">
          <div className="flex items-center justify-center rounded-xl border bg-card p-10">
            <LogoMark className="size-40" />
          </div>
          <div className="space-y-4 text-muted-foreground">
            <p>
              The mark is a lowercase b drawn as a speech bubble, with a second bubble answering it.
              Two sides in conversation: the person who books and the person who is booked, the team
              and the candidate, the coach and the client.
            </p>
            <p>
              The name comes from the Arabic بُكلة, a buckle. A buckle fastens two sides together,
              and so does a good meeting. The first Bookly logo drew the buckle; this one draws what
              it holds together.
            </p>
          </div>
        </div>
      </Section>

      <Section id="contact" title="Contact">
        <p className="max-w-2xl text-muted-foreground">
          Writing about Bookly, need a screenshot, a quote or an interview? Email{" "}
          <a
            href={`mailto:${SITE.supportEmail}?subject=Press`}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {SITE.supportEmail}
          </a>{" "}
          with &ldquo;Press&rdquo; in the subject.
        </p>
      </Section>
    </div>
  );
}
