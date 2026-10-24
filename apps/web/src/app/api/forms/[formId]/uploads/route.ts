import { z } from "zod";
import { startFormUpload, uploadErrorResponse } from "@/server/form-uploads";

const body = z.object({
  fieldId: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  mime: z.string().trim().min(3).max(100),
  size: z.number().int().positive(),
  /** Editing a submitted application: its status token, so the upload's draft belongs to it. */
  statusToken: z.string().min(1).max(100).optional(),
});

/**
 * Step one of a file answer on a public form (ADR 0004): announce the file, get back where to
 * PUT it and the draft's token (send it as `x-form-token` from then on, and with the form).
 */
export async function POST(req: Request, ctx: RouteContext<"/api/forms/[formId]/uploads">) {
  const { formId } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  try {
    return Response.json(await startFormUpload(req, formId, parsed.data));
  } catch (e) {
    return uploadErrorResponse(e);
  }
}
