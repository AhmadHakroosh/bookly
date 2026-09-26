import { ImageResponse } from "next/og";

/**
 * Social card for the marketing host, served at /og (the segment-level opengraph-image file
 * convention would also attach to the console's dynamic routes and break prerendering).
 */
export const OG_SIZE = { width: 1200, height: 630 };

const STEPS = ["Booked", "Briefed", "Captured", "Recapped", "Followed up"];

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
        background: "linear-gradient(135deg, #0a0a0a 0%, #171412 100%)",
        color: "#fafafa",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <rect x="17" y="27" width="36" height="30" rx="12" stroke="#fafafa" strokeWidth="6" />
          <path d="M17 7v22" stroke="#fafafa" strokeWidth="6" strokeLinecap="round" />
          <circle cx="17" cy="42" r="5.5" fill="#e8965a" />
          <path d="M17 42h29" stroke="#e8965a" strokeWidth="6" strokeLinecap="round" />
        </svg>
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>Bookly</div>
        <div
          style={{
            marginLeft: "auto",
            fontSize: 22,
            color: "#a3a3a3",
            border: "2px solid #333",
            borderRadius: 999,
            padding: "8px 20px",
          }}
        >
          Open source
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
            color: "#e8965a",
          }}
        >
          {title ? "Bookly" : "Bookly handles the rest."}
        </div>
        <div style={{ fontSize: 28, color: "#a3a3a3", marginTop: 8 }}>
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
                border: "2px solid #333",
                borderRadius: 999,
                padding: "10px 22px",
                fontSize: 24,
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: 999, background: "#e8965a" }} />
              {s}
            </div>
            {i < STEPS.length - 1 && <div style={{ color: "#555", fontSize: 24 }}>→</div>}
          </div>
        ))}
      </div>
    </div>,
    { ...OG_SIZE, headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } },
  );
}
