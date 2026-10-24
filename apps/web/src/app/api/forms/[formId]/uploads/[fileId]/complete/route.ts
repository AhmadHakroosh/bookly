import { completeFormUpload, uploadErrorResponse } from "@/server/form-uploads";

/** Step two: the bytes are in place; checked against their type, the file becomes ready. */
export async function POST(
  req: Request,
  ctx: RouteContext<"/api/forms/[formId]/uploads/[fileId]/complete">,
) {
  const { formId, fileId } = await ctx.params;
  try {
    return Response.json(await completeFormUpload(req, formId, fileId));
  } catch (e) {
    return uploadErrorResponse(e);
  }
}
