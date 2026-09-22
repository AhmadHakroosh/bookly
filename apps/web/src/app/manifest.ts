import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bookly",
    short_name: "Bookly",
    description:
      "Open-source scheduling that briefs you before the call, transcribes it with consent, and turns every meeting into tasks and follow-ups.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/logo-mark.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
