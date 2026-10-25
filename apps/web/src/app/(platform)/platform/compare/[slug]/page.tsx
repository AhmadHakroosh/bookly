import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CheckIcon } from "lucide-react";
import { breadcrumbLd, faqLd, JsonLd } from "../../json-ld";
import { pageMetadata, SITE } from "../../site";
import { CtaBand, Eyebrow, Section, StartFree, StraightAnswers } from "../../_site/ui";
import { COMPARISONS, comparison } from "../data";

export function generateStaticParams() {
  return COMPARISONS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/platform/compare/[slug]">): Promise<Metadata> {
  const c = comparison((await params).slug);
  if (!c) return {};
  return pageMetadata({
    title: `Bookly vs ${c.name}`,
    description: `${c.lead.split(". ").slice(0, 2).join(". ")}. Dated, sourced facts, and where ${c.name} is ahead.`,
    path: `/compare/${c.slug}`,
  });
}

const host = (url: string) => new URL(url).hostname.replace(/^www\./, "") + new URL(url).pathname;

/** The slug is URL data: it resolves inside Suspense, so every comparison shares the App Shell. */
export default function ComparisonPageBoundary({ params }: PageProps<"/platform/compare/[slug]">) {
  return (
    <Suspense fallback={null}>
      <ComparisonPage params={params} />
    </Suspense>
  );
}

async function ComparisonPage({ params }: Pick<PageProps<"/platform/compare/[slug]">, "params">) {
  const c = comparison((await params).slug);
  if (!c) notFound();
  return (
    <div>
      <JsonLd
        data={[
          breadcrumbLd([
            ["Compare", "/compare"],
            [`Bookly vs ${c.name}`, `/compare/${c.slug}`],
          ]),
          faqLd(c.faq),
        ]}
      />
      <div className="mx-auto max-w-6xl px-4 pt-12 pb-6 md:pt-20">
        <Eyebrow className="mb-4">
          <Link href="/compare" className="hover:text-foreground">
            Comparison
          </Link>
        </Eyebrow>
        <h1 className="max-w-4xl text-4xl leading-[1.04] font-bold tracking-[-0.035em] text-balance md:text-6xl">
          <span className="block">{c.first}</span>
          <span className="block text-(--brand)">{c.second}</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-pretty text-muted-foreground">{c.lead}</p>
        <StartFree className="mt-8" secondary={{ href: "/product", label: "See the product" }} />
        <p className="mt-6 text-xs text-muted-foreground">
          Last verified: <time dateTime={c.verified}>{c.verified}</time>. Corrections:{" "}
          <a
            href={`mailto:${SITE.supportEmail}`}
            className="underline underline-offset-2 hover:text-foreground"
          >
            {SITE.supportEmail}
          </a>
        </p>
      </div>

      <Section labelledBy="choose" className="pt-6 md:pt-8">
        <h2 id="choose" className="sr-only">
          Which one to choose
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              ["Bookly", c.booklyIs, c.chooseBookly, true],
              [c.name, c.themIs, c.chooseThem, false],
            ] as const
          ).map(([name, is, when, ours]) => (
            <div
              key={name}
              className={`rounded-2xl border p-6 ${ours ? "border-(--brand)/50 bg-accent" : "bg-card"}`}
            >
              <h3 className="text-xl font-bold tracking-tight">{name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{is}</p>
              <p className="mt-5 text-sm font-semibold">Choose {name} when</p>
              <ul className="mt-2 space-y-2 text-sm">
                {when.map((w) => (
                  <li key={w} className="flex gap-2">
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-(--brand)" aria-hidden />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section labelledBy="side-by-side" className="pt-4 md:pt-6">
        <Eyebrow>Side by side</Eyebrow>
        <h2 id="side-by-side" className="mt-3 text-3xl font-bold tracking-[-0.03em] md:text-4xl">
          Feature by feature, honestly.
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Where a Bookly capability is planned, the row says so. Claims about {c.name} link to the
          page they come from.
        </p>
        <div className="mt-6 overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[680px] text-left text-sm">
            <caption className="sr-only">Bookly compared with {c.name}</caption>
            <thead>
              <tr className="border-b bg-sidebar">
                <th scope="col" className="w-44 p-4 font-semibold">
                  Feature
                </th>
                <th scope="col" className="p-4 font-semibold">
                  Bookly
                </th>
                <th scope="col" className="p-4 font-semibold">
                  {c.name}
                </th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r) => (
                <tr key={r.feature} className="border-b align-top last:border-0">
                  <th scope="row" className="p-4 font-medium">
                    {r.feature}
                  </th>
                  <td className="p-4">{r.bookly}</td>
                  <td className="p-4 text-muted-foreground">
                    {r.them}
                    {r.source && (
                      <>
                        {" "}
                        <a
                          href={r.source}
                          target="_blank"
                          rel="noreferrer nofollow"
                          className="text-xs font-medium whitespace-nowrap text-primary underline underline-offset-2"
                          aria-label={`Source for ${r.feature}: ${host(r.source)}`}
                        >
                          source
                        </a>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section labelledBy="credit">
        <Eyebrow>Credit where due</Eyebrow>
        <h2 id="credit" className="mt-3 text-3xl font-bold tracking-[-0.03em] md:text-4xl">
          Where {c.name} is ahead today.
        </h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {c.ahead.map((a, i) => (
            <li key={a} className="rounded-2xl border bg-card p-6">
              <span className="text-sm font-bold text-primary" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="mt-2 text-sm">{a}</p>
            </li>
          ))}
        </ol>
      </Section>

      <StraightAnswers
        items={c.faq}
        title="Questions people ask us."
        intro={
          <>
            Sources read on {c.verified}:{" "}
            {c.sources.map((s, i) => (
              <span key={s}>
                {i > 0 && ", "}
                <a
                  href={s}
                  target="_blank"
                  rel="noreferrer nofollow"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  {host(s)}
                </a>
              </span>
            ))}
            .
          </>
        }
      />
      <p className="mx-auto -mt-8 mb-12 max-w-6xl px-4 text-xs text-muted-foreground">
        {c.name} is a trademark of its owner, used here only to name the product compared. Bookly is
        not affiliated with or endorsed by {c.name}.
      </p>
      <CtaBand />
    </div>
  );
}
