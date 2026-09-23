/** Locales offered in workspace settings: the tags the app formats dates and prices with. */
export const LOCALE_TAGS = [
  "en",
  "en-GB",
  "en-AU",
  "en-CA",
  "de",
  "fr",
  "es",
  "es-MX",
  "it",
  "nl",
  "pt",
  "pt-BR",
  "sv",
  "da",
  "nb",
  "fi",
  "pl",
  "cs",
  "tr",
  "el",
  "he",
  "ar",
  "ru",
  "uk",
  "ja",
  "ko",
  "zh",
  "zh-TW",
  "hi",
] as const;

/** "de" → "German (Deutsch)", "en-GB" → "English (United Kingdom)", named for the picker. */
export function localeLabel(tag: string): string {
  try {
    const english = new Intl.DisplayNames(["en"], { type: "language" }).of(tag) ?? tag;
    const native = new Intl.DisplayNames([tag], { type: "language" }).of(tag);
    return native && native !== english ? `${english} (${native})` : english;
  } catch {
    return tag;
  }
}

export function localeOptions(current?: string) {
  const tags: string[] = [...LOCALE_TAGS];
  if (current && !tags.includes(current)) tags.unshift(current);
  return tags.map((tag) => ({ value: tag, label: `${localeLabel(tag)} · ${tag}` }));
}
