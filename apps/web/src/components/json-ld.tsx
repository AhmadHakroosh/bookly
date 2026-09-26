/**
 * Inline JSON-LD for public pages. `<` is escaped so user-entered text (names, bios) can never
 * close the script tag; everything else is JSON.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
