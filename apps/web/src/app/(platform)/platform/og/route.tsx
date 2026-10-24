import { ImageResponse } from "next/og";
import { MARK, MARK_BOX, WORDMARK, WORDMARK_BOTTOM, WORDMARK_WIDTH } from "@/components/brand/logo";

/**
 * Social card for the marketing host, served at /og (the segment-level opengraph-image file
 * convention would also attach to the console's dynamic routes and break prerendering).
 */
export const OG_SIZE = { width: 1200, height: 630 };

/** The client journey, as the website concepts draw it. */
const STEPS = ["Booked", "Prepared", "Met", "Followed up", "Paid"];

/** Light only: Paper, Ink, Bookly Orange for the mark and large type, muted warm grey. */
const BG = "#FAF8F4";
const INK = "#1C1C1C";
const ORANGE = "#E85D2C";
const MUTED = "#6B655D";
const LINE = "#E4DFD7";

/**
 * `?title=` puts a page's own title on the card (pricing, docs, legal pages) instead of the
 * home page headline, so shares of those pages say what they are.
 */
export function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("title")?.trim().slice(0, 90) ?? "";
  const title = raw.replace(/\s+[—-]\s+Bookly$/, "");
  const size = title.length > 48 ? 56 : 72;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: BG,
        color: INK,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        {/* The gap between the bubbles is the b's outline in the background colour. */}
        <svg width="64" height="64" viewBox={MARK_BOX}>
          <path d={MARK.replyBody} fill="#F5B6A0" />
          <path d={MARK.replyTail} fill="#F5B6A0" />
          <path d={MARK.b} fill={BG} stroke={BG} strokeWidth="5" strokeLinejoin="round" />
          <path d={MARK.b} fill={ORANGE} />
        </svg>
        <svg
          height="46"
          width={(46 * WORDMARK_WIDTH) / WORDMARK_BOTTOM}
          viewBox={`0 0 ${WORDMARK_WIDTH} ${WORDMARK_BOTTOM}`}
        >
          <path d={WORDMARK} fill={INK} />
        </svg>
        <div
          style={{
            marginLeft: "auto",
            fontSize: 22,
            color: MUTED,
            border: `2px solid ${LINE}`,
            borderRadius: 999,
            padding: "8px 20px",
          }}
        >
          Open-source core
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: size, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>
          {title || "The meeting is booked."}
        </div>
        <div
          style={{
            fontSize: title ? 40 : 72,
            fontWeight: 700,
            letterSpacing: title ? -1 : -2,
            lineHeight: 1.05,
            color: ORANGE,
          }}
        >
          {title ? "Bookly" : "Bookly handles the rest."}
        </div>
        <div style={{ fontSize: 28, color: MUTED, marginTop: 8 }}>
          Briefings before, transcripts during, tasks and follow-ups after.
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                border: `2px solid ${LINE}`,
                borderRadius: 999,
                padding: "10px 22px",
                fontSize: 24,
                background: "#FFFFFF",
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: 999, background: ORANGE }} />
              {s}
            </div>
            {i < STEPS.length - 1 && <div style={{ color: MUTED, fontSize: 24 }}>→</div>}
          </div>
        ))}
      </div>
    </div>,
    { ...OG_SIZE, headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } },
  );
}
