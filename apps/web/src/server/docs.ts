import "server-only";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

/**
 * The repository's `docs/*.md` served in-app at /docs, so every install ships its own manual.
 * Files are read from the repo root in development and from the image's `docs/` in Docker.
 */
export type DocPage = { slug: string; title: string; description: string };
export type Heading = { id: string; text: string; level: 2 | 3 };

const ORDER = [
  "self-hosting",
  "scheduling",
  "contacts",
  "integrations",
  "payments",
  "notifications",
  "teams",
  "routing",
  "embeds",
  "domains",
  "api",
  "cloud",
];

export const DOCS_REPO_URL = "https://github.com/AhmadHakroosh/bookly/blob/main/docs";

async function docsDir(): Promise<string | null> {
  for (const c of [path.join(process.cwd(), "docs"), path.join(process.cwd(), "../../docs")]) {
    try {
      if ((await stat(c)).isDirectory()) return c;
    } catch {
      /* try next */
    }
  }
  return null;
}

const titleOf = (md: string, slug: string) => md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? slug;
/** First paragraph after the title, for the index cards. */
const descriptionOf = (md: string) =>
  md
    .replace(/^#\s+.+$/m, "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith("#") && !p.startsWith("-") && !p.startsWith("`"))
    ?.replace(/[`*_\[\]]/g, "")
    .slice(0, 160) ?? "";

export const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export async function listDocs(): Promise<DocPage[]> {
  const dir = await docsDir();
  if (!dir) return [];
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
  const pages = await Promise.all(
    files.map(async (f) => {
      const slug = f.replace(/\.md$/, "");
      const md = await readFile(path.join(dir, f), "utf8");
      return { slug, title: titleOf(md, slug), description: descriptionOf(md) };
    }),
  );
  const rank = (s: string) => (ORDER.includes(s) ? ORDER.indexOf(s) : ORDER.length);
  return pages.sort((a, b) => rank(a.slug) - rank(b.slug) || a.slug.localeCompare(b.slug));
}

/** Adds stable ids + anchor links to h2/h3 and collects them for the table of contents. */
export function decorateHeadings(html: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const seen = new Map<string, number>();
  const out = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_, lvl: string, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, "").trim();
    let id = slugify(text) || `section-${headings.length + 1}`;
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    if (n) id = `${id}-${n + 1}`;
    headings.push({ id, text, level: Number(lvl) as 2 | 3 });
    return `<h${lvl} id="${id}">${inner}<a href="#${id}" class="heading-anchor" aria-label="Link to this section">#</a></h${lvl}>`;
  });
  return { html: out, headings };
}

export async function renderDoc(
  slug: string,
): Promise<{
  title: string;
  html: string;
  headings: Heading[];
  prev: DocPage | null;
  next: DocPage | null;
} | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const dir = await docsDir();
  if (!dir) return null;
  let md: string;
  try {
    md = await readFile(path.join(dir, `${slug}.md`), "utf8");
  } catch {
    return null;
  }
  // Links between docs point at .md files in the repo; in-app they are routes.
  const linked = md.replace(
    /\]\((?:\.\/)?(?:docs\/)?([a-z0-9-]+)\.md(#[^)]*)?\)/g,
    "](/docs/$1$2)",
  );
  const raw = await marked.parse(linked, { gfm: true });
  const { html, headings } = decorateHeadings(raw);
  const pages = await listDocs();
  const i = pages.findIndex((p) => p.slug === slug);
  return {
    title: titleOf(md, slug),
    html,
    headings,
    prev: i > 0 ? pages[i - 1]! : null,
    next: i >= 0 && i < pages.length - 1 ? pages[i + 1]! : null,
  };
}
