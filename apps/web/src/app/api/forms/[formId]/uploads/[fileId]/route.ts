import { receiveFormUpload, removeFormUpload, uploadErrorResponse } from "@/server/form-uploads";

type Ctx = RouteContext<"/api/forms/[formId]/uploads/[fileId]">;

/** The local driver's upload target for a form's file (S3 installs PUT to the bucket). */
export async function PUT(req: Request, ctx: Ctx) {
  const { formId, fileId } = await ctx.params;
  try {
    await receiveFormUpload(req, formId, fileId);
    return Response.json({ id: fileId });
  } catch (e) {
    return uploadErrorResponse(e);
  }
}

/** Takes a file back before the form is sent. */
export async function DELETE(req: Request, ctx: Ctx) {
  const { formId, fileId } = await ctx.params;
  try {
    await removeFormUpload(req, formId, fileId);
    return new Response(null, { status: 204 });
  } catch (e) {
    return uploadErrorResponse(e);
  }
}
