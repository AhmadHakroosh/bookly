/** Types the browser shows safely in the file viewer (no SVG: it can run script). */
export const PREVIEWABLE = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "application/pdf",
]);

const BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  pdf: "application/pdf",
};

/**
 * How the viewer shows a file: as an image, as a PDF, or not at all (download only). Goes by
 * the stored type, or by the name's extension when the type is not known on this screen.
 */
export function previewKind(file: { name: string; mime?: string | null }): "image" | "pdf" | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = file.mime || BY_EXTENSION[ext] || "";
  if (!PREVIEWABLE.has(mime)) return null;
  return mime === "application/pdf" ? "pdf" : "image";
}
