import { useId, type SVGProps } from "react";

/**
 * The Bookly mark (logo exploration 02, "Open Dialogue"): a lowercase b whose stem ends in a
 * speech-bubble tail, with a lighter reply bubble behind it. Two sides in conversation, as the
 * old buckle (بُكلة) fastened two sides. Paths come from brand/source/build.py; change them
 * there and regenerate, never here by hand.
 */
export const MARK = {
  b: "M6 0H22A6 6 0 0 1 28 6V28H43A23 23 0 0 1 66 51V58A23 23 0 0 1 43 81H22L2.4 98.2Q0 100.2 0 96.8V6A6 6 0 0 1 6 0Z",
  replyBody:
    "M55 40H75A22 22 0 0 1 97 62V65A22 22 0 0 1 75 87H55A22 22 0 0 1 33 65V62A22 22 0 0 1 55 40Z",
  replyTail: "M72 85L88.6 99.4Q90.8 101 90.4 98.3L88 79Z",
};
export const MARK_BOX = "-3.5 -1.5 104 104";
/** Knockout between the b and the reply, in mark units (half on each side). */
const GAP = 5;

/** "bookly" in Geist 800, tracking −2%, as outlines; the baseline is y = 81, like the mark's bowl. */
export const WORDMARK =
  "M44.61 82.37Q38.15 82.37 33.52 79.67Q28.89 76.96 26.26 72.06L25.92 81H6.94V0H26.56V28.43Q29.11 23.93 33.72 21.09Q38.33 18.25 44.61 18.25Q52.32 18.25 58 22.22Q63.68 26.19 66.78 33.4Q69.89 40.61 69.89 50.31Q69.89 60.01 66.78 67.22Q63.68 74.43 58 78.4Q52.32 82.37 44.61 82.37ZM38.47 67.86Q43.47 67.86 46.59 63.27Q49.72 58.69 49.72 50.31Q49.72 41.91 46.68 37.34Q43.65 32.77 38.51 32.77Q34.75 32.77 32.03 34.81Q29.32 36.85 27.94 40.77Q26.56 44.7 26.56 50.31Q26.56 55.79 27.94 59.72Q29.32 63.66 32.02 65.76Q34.73 67.86 38.47 67.86ZM107.65 82.37Q97.95 82.37 90.72 78.4Q83.49 74.43 79.47 67.21Q75.46 59.99 75.46 50.31Q75.46 40.61 79.47 33.45Q83.49 26.29 90.72 22.27Q97.95 18.25 107.65 18.25Q117.35 18.25 124.57 22.27Q131.79 26.29 135.81 33.45Q139.82 40.61 139.82 50.31Q139.82 59.99 135.81 67.21Q131.79 74.43 124.57 78.4Q117.35 82.37 107.65 82.37ZM107.65 67.86Q113.42 67.86 116.54 63.28Q119.65 58.71 119.65 50.31Q119.65 42.01 116.54 37.39Q113.42 32.77 107.65 32.77Q101.88 32.77 98.75 37.39Q95.63 42.01 95.63 50.31Q95.63 58.71 98.75 63.28Q101.88 67.86 107.65 67.86ZM177.58 82.37Q167.89 82.37 160.65 78.4Q153.42 74.43 149.41 67.21Q145.39 59.99 145.39 50.31Q145.39 40.61 149.41 33.45Q153.42 26.29 160.65 22.27Q167.89 18.25 177.58 18.25Q187.28 18.25 194.5 22.27Q201.72 26.29 205.74 33.45Q209.76 40.61 209.76 50.31Q209.76 59.99 205.74 67.21Q201.72 74.43 194.5 78.4Q187.28 82.37 177.58 82.37ZM177.58 67.86Q183.36 67.86 186.47 63.28Q189.59 58.71 189.59 50.31Q189.59 42.01 186.47 37.39Q183.36 32.77 177.58 32.77Q171.81 32.77 168.69 37.39Q165.56 42.01 165.56 50.31Q165.56 58.71 168.69 63.28Q171.81 67.86 177.58 67.86ZM218.33 81V0H237.96V42.19L258.45 19.62H281.63L257.88 44.65L282.2 81H261.07L245.26 55.45L237.96 63.25V81ZM309.37 81Q301.21 81 296.62 76.89Q292.03 72.79 292.03 63.57V0H311.66V61.4Q311.66 64.32 313.04 65.56Q314.42 66.81 316.97 66.81H320.67V81ZM333.08 98.11V83.92H341.59Q344.42 83.92 345.78 83.09Q347.14 82.26 347.93 80.09L349.01 77.3H343.87L322.56 19.62H342.37L355.01 58.91L366.85 19.62H386.66L363.5 86.18Q361.24 92.64 357.22 95.37Q353.21 98.11 345.97 98.11Z";
export const WORDMARK_WIDTH = 389.03;
export const WORDMARK_BOTTOM = 98.11;
/** Space between the mark and the wordmark in the horizontal lockup, in mark units. */
const LOCKUP_GAP = 26;

/**
 * The mark alone. `accent` colours the b (Bookly Orange by default; workspace pages pass their
 * own accent); the reply is the same colour mixed toward white. The gap between the bubbles is
 * a mask, so it shows whatever is behind the mark.
 */
export function LogoMark({
  className,
  accent = "var(--brand)",
  ...props
}: SVGProps<SVGSVGElement> & { accent?: string }) {
  const mask = `bookly-mark-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      viewBox={MARK_BOX}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
      {...props}
    >
      <ReplyAndB mask={mask} b={accent} reply={`color-mix(in oklab, ${accent} 45%, white)`} />
    </svg>
  );
}

function ReplyAndB({ mask, b, reply }: { mask: string; b: string; reply: string }) {
  return (
    <>
      <mask id={mask} maskUnits="userSpaceOnUse" x="-10" y="-10" width="130" height="130">
        <rect x="-10" y="-10" width="130" height="130" fill="#fff" />
        <path d={MARK.b} fill="#000" stroke="#000" strokeWidth={GAP} strokeLinejoin="round" />
      </mask>
      <g mask={`url(#${mask})`} style={{ fill: reply }}>
        <path d={MARK.replyBody} />
        <path d={MARK.replyTail} />
      </g>
      <path d={MARK.b} style={{ fill: b }} />
    </>
  );
}

/** The wordmark alone, in the current text colour. */
export function Wordmark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox={`0 0 ${WORDMARK_WIDTH} ${WORDMARK_BOTTOM}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
      {...props}
    >
      <path d={WORDMARK} fill="currentColor" />
    </svg>
  );
}

/**
 * Mark + wordmark, the horizontal lockup. `size` is the height in pixels; the wordmark takes
 * the text colour (Ink, or white on dark), the mark stays Bookly Orange.
 */
export function Logo({ className = "", size = 26 }: { className?: string; size?: number }) {
  const mask = `bookly-logo-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const width = 512.03;
  const height = 101;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Bookly"
      className={`inline-block shrink-0 ${className}`}
      style={{ height: size, width: (size * width) / height }}
    >
      <ReplyAndB
        mask={mask}
        b="var(--brand)"
        reply="color-mix(in oklab, var(--brand) 45%, white)"
      />
      <path transform={`translate(${97 + LOCKUP_GAP} 0)`} d={WORDMARK} fill="currentColor" />
    </svg>
  );
}

/** Lucide dropped brand icons; GitHub's mark inline (simple-icons path, CC0). */
export function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}
