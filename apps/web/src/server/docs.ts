import "server-only";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

/**
 * The repository's `docs/*.md` served in-app at /docs, so every install ships its own manual.
 * Files are read from the repo root in development and from the image's `docs/` in Docker.
 */
export type DocPage = { slug: string; title: string };

const ORDER = [
  "self-hosting",
  "scheduling",
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

export async function listDocs(): Promise<DocPage[]> {
  const dir = await docsDir();
  if (!dir) return [];
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
  const pages = await Promise.all(
    files.map(async (f) => {
      const slug = f.replace(/\.md$/, "");
      return { slug, title: titleOf(await readFile(path.join(dir, f), "utf8"), slug) };
    }),
  );
  const rank = (s: string) => (ORDER.includes(s) ? ORDER.indexOf(s) : ORDER.length);
  return pages.sort((a, b) => rank(a.slug) - rank(b.slug) || a.slug.localeCompare(b.slug));
}

export async function renderDoc(slug: string): Promise<{ title: string; html: string } | null> {
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
  return { title: titleOf(md, slug), html: await marked.parse(linked, { gfm: true }) };
}
