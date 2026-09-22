import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";
import { Prose } from "../prose";
import { pageMetadata, SITE } from "../site";

export const metadata: Metadata = pageMetadata({
  title: "Changelog",
  description: "Everything that has shipped in Bookly, release by release.",
  path: "/changelog",
});

/** Read once at build; Cache Components treats a plain fs read as uncached dynamic data. */
async function changelog(): Promise<string> {
  "use cache";
  cacheLife("max");
  try {
    return await readFile(path.join(process.cwd(), "CHANGELOG.md"), "utf8");
  } catch {
    /* monorepo root */
  }
  try {
    return await readFile(path.join(process.cwd(), "..", "..", "CHANGELOG.md"), "utf8");
  } catch {
    return "";
  }
}

export default async function ChangelogPage() {
  const md = await changelog();
  const body = md.replace(/^# Changelog\s*/m, "");
  const html = body ? await marked.parse(body) : "";
  return (
    <Prose
      title="Changelog"
      lede="What shipped, in the order it shipped. Versions follow SemVer; releases are tagged on GitHub."
    >
      {html ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p>
          The changelog lives in the repository:{" "}
          <a href={`${SITE.github}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer">
            CHANGELOG.md
          </a>
          .
        </p>
      )}
    </Prose>
  );
}
