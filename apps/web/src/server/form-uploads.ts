import "server-only";
import { and, eq, isNull, schema } from "@bookly/db";
import type { Workspace } from "@bookly/db/schema";
import { getStorage } from "@bookly/storage";
import { fileAccepted, PUBLIC_FILE_MB, type Field } from "@bookly/forms";
import { db } from "@/lib/db";
import { bytesMatchMime, FILE_RULES, MB } from "@/lib/files";
import { completeUpload, createUpload, getFile, receiveUpload, removeFile } from "./files";
import { hasFlag } from "./flags";
import { draftResponse, publishedSchema, startDraftResponse, touchDraft } from "./forms";
import { rateLimit } from "./ratelimit";
import { clientIp } from "./request";
import { getCurrentWorkspace } from "./workspace";

/*
 * File questions on public forms (ADR 0004): anyone with the form can upload, so every step
 * checks the form, the question and the draft the token opens. Files are private, outside the
 * drive, capped at 10 MB, limited per IP and per form, counted against the workspace's storage,
 * and must be what their first bytes say. The draft's token travels in `x-form-token`.
 */

export class FormUploadError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Uploads per visitor per ten minutes, and per form per hour. */
export const FORM_UPLOAD_LIMIT = { perIp: 20, perForm: 300 } as const;

const TOKEN = "x-form-token";

/** The workspace, the published form and (when the token opens one) the draft. */
async function context(req: Request, formId: string) {
  const ws = await getCurrentWorkspace();
  if (!ws || !(await hasFlag(ws, "forms_v2"))) throw new FormUploadError("Not found.", 404);
  const published = await publishedSchema(ws.id, formId);
  if (!published) throw new FormUploadError("Not found.", 404);
  const draft = await draftResponse(ws.id, formId, req.headers.get(TOKEN));
  return { ws, published, draft };
}

/** A draft's file, on this form, or an error that says nothing about other people's files. */
async function ownFile(ws: Workspace, draft: { id: string } | null, fileId: string) {
  const file = draft ? await getFile(ws, fileId) : null;
  if (!file || file.ownerType !== "form_response" || file.ownerId !== draft!.id)
    throw new FormUploadError("Unknown upload.", 404);
  return file;
}

const fileField = (fields: Field[], fieldId: string) => {
  const f = fields.find((x) => x.id === fieldId && x.type === "file");
  if (!f) throw new FormUploadError("This question does not take files.");
  return f;
};

/** The size cap for a question on a public form, in bytes. */
export const maxBytesFor = (f: Pick<Field, "file">) =>
  Math.min(f.file?.maxMb ?? PUBLIC_FILE_MB, PUBLIC_FILE_MB) * MB;

/** Why a file cannot go into a question, or null when it can. Pure, for tests. */
export function uploadProblem(
  f: Pick<Field, "file" | "label">,
  file: { mime: string; size: number },
  already: number,
): string | null {
  if (!Number.isFinite(file.size) || file.size <= 0) return "The file is empty.";
  if (file.size > maxBytesFor(f))
    return `Files can be up to ${Math.round(maxBytesFor(f) / MB)} MB.`;
  if (!FILE_RULES.attachment.mimes.includes(file.mime.toLowerCase()) || !fileAccepted(f, file.mime))
    return "That type of file is not accepted here.";
  if (already >= (f.file?.maxFiles ?? 1))
    return (f.file?.maxFiles ?? 1) === 1
      ? "Remove the file first to send another."
      : `Up to ${f.file?.maxFiles} files.`;
  return null;
}

/** Step one: announce a file; returns where to send it and the draft's token. */
export async function startFormUpload(
  req: Request,
  formId: string,
  body: { fieldId: string; name: string; mime: string; size: number },
) {
  const { ws, published, draft: existing } = await context(req, formId);
  const ip = await clientIp();
  const [byIp, byForm] = await Promise.all([
    rateLimit(`form-upload:${ip}`, FORM_UPLOAD_LIMIT.perIp, 10 * 60_000),
    rateLimit(`form-upload-form:${formId}`, FORM_UPLOAD_LIMIT.perForm, 3600_000),
  ]);
  if (!byIp.ok || !byForm.ok)
    throw new FormUploadError("Too many uploads. Please wait a few minutes.", 429);
  const field = fileField(published.schema.fields, body.fieldId);
  const already = existing
    ? await db().$count(
        schema.files,
        and(
          eq(schema.files.ownerType, "form_response"),
          eq(schema.files.ownerId, existing.id),
          eq(schema.files.sourceId, field.id),
          isNull(schema.files.deletedAt),
        ),
      )
    : 0;
  // Refused files never start a draft.
  const problem = uploadProblem(field, body, already);
  if (problem) throw new FormUploadError(problem);
  const draft = existing ?? (await startDraftResponse(ws.id, formId));
  if (!draft) throw new FormUploadError("Not found.", 404);
  const token = "token" in draft ? draft.token : req.headers.get(TOKEN)!;
  const ticket = await createUpload({
    ws,
    kind: "attachment",
    name: body.name,
    mime: body.mime.toLowerCase(),
    size: body.size,
    userId: null,
    owner: { type: "form_response", id: draft.id },
    visibility: "private",
    origin: { source: "form", sourceId: field.id },
    local: {
      url: (id) => `/api/forms/${formId}/uploads/${id}`,
      headers: { [TOKEN]: token },
    },
  });
  await touchDraft(draft.id);
  return { id: ticket.file.id, token, upload: ticket.upload };
}

/** The local driver's half: the body is the file, exactly the announced size. */
export async function receiveFormUpload(req: Request, formId: string, fileId: string) {
  const { ws, draft } = await context(req, formId);
  const file = await ownFile(ws, draft, fileId);
  if (Number(req.headers.get("content-length") ?? 0) > file.size)
    throw new FormUploadError("The upload is not the size that was announced.");
  await receiveUpload(ws, file.id, Buffer.from(await req.arrayBuffer()));
}

/** Step two: the bytes are in place; they must be what the file claims, then it is ready. */
export async function completeFormUpload(req: Request, formId: string, fileId: string) {
  const { ws, draft } = await context(req, formId);
  const file = await ownFile(ws, draft, fileId);
  if (file.status !== "ready") {
    const bytes = await getStorage()
      .get(file.key)
      .catch(() => null);
    if (!bytes) throw new FormUploadError("The file has not arrived yet.");
    if (!bytesMatchMime(file.mime, bytes.subarray(0, 4096))) {
      await removeFile(file, { silent: true });
      throw new FormUploadError("That file is not what its type says. Please choose another.");
    }
  }
  const ready = await completeUpload(ws, file.id);
  await touchDraft(draft!.id);
  return { id: ready.id, name: ready.name, size: ready.size, mime: ready.mime };
}

/** Takes a file back before the form is sent. */
export async function removeFormUpload(req: Request, formId: string, fileId: string) {
  const { ws, draft } = await context(req, formId);
  await removeFile(await ownFile(ws, draft, fileId), { silent: true });
}

/** A route's error as JSON, with the status the error carries. */
export function uploadErrorResponse(e: unknown) {
  if (e instanceof FormUploadError)
    return Response.json({ error: e.message }, { status: e.status });
  const message = (e as Error).message;
  // Storage quota and other refusals from createUpload are the uploader's to read.
  return Response.json({ error: message || "Upload failed." }, { status: 400 });
}
