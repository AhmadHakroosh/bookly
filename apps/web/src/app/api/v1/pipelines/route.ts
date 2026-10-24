import { apiContext, json, options } from "@/server/api";
import { clientStages, ensureClientPipeline } from "@/server/pipelines";

export const OPTIONS = options;

/**
 * GET /api/v1/pipelines (scope bookings:read): the workspace's client pipeline and its stages in
 * order. A contact's `stageId` points at one of them; `key` is stable across renames.
 */
export async function GET(req: Request) {
  const ctx = await apiContext(req, "bookings:read");
  if (ctx instanceof Response) return ctx;
  const { pipeline } = await ensureClientPipeline(ctx.workspace.id);
  const stages = await clientStages(ctx.workspace.id);
  return json([
    {
      id: pipeline.id,
      kind: pipeline.kind,
      name: pipeline.name,
      stages: stages.map((s) => ({
        id: s.id,
        key: s.key,
        name: s.name,
        category: s.category,
        color: s.color,
        isEntry: s.isEntry,
        priorityScheduling: !!s.settings.priorityScheduling,
      })),
    },
  ]);
}
