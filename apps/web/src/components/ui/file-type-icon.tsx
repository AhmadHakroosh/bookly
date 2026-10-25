import { cn } from "cn";

export type FileKind =
  "pdf" | "doc" | "sheet" | "slides" | "archive" | "image" | "video" | "audio" | "text" | "other";

/** The file's kind from its name or MIME type. */
function kindOf(nameOrMime: string): FileKind {
  const s = nameOrMime.toLowerCase();
  if (/pdf$/.test(s)) return "pdf";
  if (/(xlsx?|csv|ods|numbers|spreadsheet|ms-excel)$/.test(s)) return "sheet";
  if (/(pptx?|key|odp|presentation|ms-powerpoint)$/.test(s)) return "slides";
  if (/(docx?|odt|pages|rtf|wordprocessing|msword)$/.test(s)) return "doc";
  if (/(txt|md|text\/plain|text\/markdown)$/.test(s)) return "text";
  if (/(png|jpe?g|gif|webp|avif|heic|svg|image\/.*)$/.test(s)) return "image";
  if (/(mp4|mov|webm|mkv|avi|video\/.*)$/.test(s)) return "video";
  if (/(mp3|m4a|wav|ogg|flac|audio\/.*)$/.test(s)) return "audio";
  if (/(zip|rar|7z|tar|gz|x-zip-compressed)$/.test(s)) return "archive";
  return "other";
}

const LABEL: Record<FileKind, string> = {
  pdf: "PDF",
  doc: "DOC",
  sheet: "XLS",
  slides: "PPT",
  archive: "ZIP",
  image: "IMG",
  video: "MP4",
  audio: "MP3",
  text: "TXT",
  other: "",
};

const FILL: Record<FileKind, string> = {
  pdf: "fill-file-pdf",
  doc: "fill-file-doc",
  sheet: "fill-file-sheet",
  slides: "fill-file-slides",
  archive: "fill-file-archive",
  image: "fill-file-image",
  video: "fill-file-video",
  audio: "fill-file-audio",
  text: "fill-file-text",
  other: "fill-file-other",
};

/**
 * A file as the concepts draw one (`ui mocks.png` 06): a filled page with a folded corner in its
 * kind's colour (PDF red, DOC blue, XLS green, ZIP yellow…). Sizes: 16 in links and chips, 20 in
 * file rows (the default), 32 in a pane header, 48 as a preview fallback; from 32 px the page
 * carries its kind (`PDF`) in white.
 */
function FileTypeIcon({
  name,
  size = 20,
  className,
}: {
  /** The file's name or MIME type. */
  name: string;
  size?: 16 | 20 | 32 | 48;
  className?: string;
}) {
  const kind = kindOf(name);
  const label = size >= 32 ? LABEL[kind] : "";
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      data-slot="file-type-icon"
      data-kind={kind}
      className={cn("shrink-0", FILL[kind], className)}
    >
      {/* The page, its corner cut. */}
      <path d="M6 2h8.5L20 7.5V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
      {/* The fold: the same colour, darker. */}
      <path d="M14.5 2 20 7.5h-3.5a2 2 0 0 1-2-2V2Z" className="fill-black/30" />
      {label && (
        <text
          x="12"
          y="17.2"
          textAnchor="middle"
          className="fill-white font-semibold"
          style={{ fontSize: 6.2, letterSpacing: "0.02em" }}
        >
          {label}
        </text>
      )}
    </svg>
  );
}

export { FileTypeIcon, kindOf };
