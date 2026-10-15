"use client";

import { useEffect } from "react";

/*
 * WebMCP imperative tools for the marketing site (https://webmachinelearning.github.io/webmcp/).
 * When the visitor's browser exposes `navigator.modelContext`, an agent driving it can ask the
 * page directly for the plans and the documentation instead of scraping. Each tool answers from
 * data the page already has; nothing is written. Browsers without the API ignore all of this.
 */

export type WebMcpPlan = {
  id: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  minSeats: number;
  highlights: string[];
};
export type WebMcpDoc = { title: string; url: string; description: string };

type ToolResult = { content: { type: "text"; text: string }[] };
type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<ToolResult> | ToolResult;
};
type ModelContext = {
  registerTool: (tool: ToolDefinition, options?: { signal?: AbortSignal }) => Promise<void> | void;
};

const text = (value: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
});

export function WebMcpTools({
  plans,
  docs,
  base,
}: {
  plans: WebMcpPlan[];
  docs: WebMcpDoc[];
  base: string;
}) {
  useEffect(() => {
    const nav = navigator as Navigator & { modelContext?: ModelContext };
    const doc = document as Document & { modelContext?: ModelContext };
    const mc = nav.modelContext ?? doc.modelContext;
    if (!mc || typeof mc.registerTool !== "function") return;
    const controller = new AbortController();
    const tools: ToolDefinition[] = [
      {
        name: "get_pricing_plans",
        description:
          "List Bookly's hosted plans (Free, Pro, Team) with monthly and yearly prices in US dollars, the seat minimum and what each plan includes.",
        inputSchema: {
          type: "object",
          properties: {
            plan: {
              type: "string",
              enum: plans.map((p) => p.id),
              description: "Return only this plan; omit for all plans.",
            },
          },
        },
        execute: ({ plan }) =>
          text(
            (typeof plan === "string" ? plans.filter((p) => p.id === plan) : plans).map((p) => ({
              ...p,
              pricingPage: `${base}/pricing`,
            })),
          ),
      },
      {
        name: "search_documentation",
        description:
          "Find pages of the Bookly documentation (self-hosting, scheduling, integrations, API, payments, teams) by keyword and get their URLs and summaries.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "Words to look for in page titles and summaries; omit for the full index.",
            },
          },
        },
        execute: ({ query }) => {
          const q = typeof query === "string" ? query.trim().toLowerCase() : "";
          const hits = q
            ? docs.filter((d) => `${d.title} ${d.description}`.toLowerCase().includes(q))
            : docs;
          return text({ query: q, results: hits, llmsTxt: `${base}/llms.txt` });
        },
      },
    ];
    for (const tool of tools) {
      try {
        void mc.registerTool(tool, { signal: controller.signal });
      } catch {
        /* an older or restricted implementation: nothing to do */
      }
    }
    return () => controller.abort();
  }, [plans, docs, base]);
  return null;
}
