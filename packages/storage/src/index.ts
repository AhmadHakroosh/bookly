import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { loadEnv } from "@bookly/config";

/*
 * Where uploaded bytes live. Two drivers behind one interface: `local` writes to a directory
 * (single-server self-hosting, mounted as a volume), `s3` talks to any S3-compatible bucket
 * (Cloudflare R2 in the cloud, AWS S3, MinIO). Metadata, permissions and quotas are the app's
 * business (the `files` table); this package only moves bytes.
 *
 * Direct browser uploads: the S3 driver issues presigned PUT URLs so large files never pass
 * through the app. The local driver has no such thing, so it reports `presign: false` and the
 * app accepts the body itself.
 */

export type PutOptions = { contentType?: string; cacheControl?: string };
export type Head = { size: number; contentType: string | null };
export type PresignedPut = { url: string; headers: Record<string, string>; expiresAt: Date };

export interface StorageDriver {
  readonly name: "local" | "s3";
  /** Whether `presignPut` / `presignGet` work (S3 only). */
  readonly presign: boolean;
  put(key: string, body: Buffer | Uint8Array, opts?: PutOptions): Promise<void>;
  get(key: string): Promise<Buffer>;
  /** A readable stream of the object, for proxying without buffering. */
  stream(key: string): Promise<ReadableStream<Uint8Array>>;
  head(key: string): Promise<Head | null>;
  delete(key: string): Promise<void>;
  presignPut(
    key: string,
    opts: { contentType: string; contentLength: number; expiresIn?: number },
  ): Promise<PresignedPut>;
  presignGet(
    key: string,
    opts?: {
      expiresIn?: number;
      filename?: string;
      contentType?: string;
      /** "attachment" (default with a filename) downloads; "inline" lets the browser show it. */
      disposition?: "inline" | "attachment";
    },
  ): Promise<string>;
}

/** Keys are relative, forward-slash paths; anything that could escape the root is refused. */
export function safeKey(key: string): string {
  const normalized = path.posix.normalize(key).replace(/^\/+/, "");
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("..") ||
    normalized.includes("/../")
  )
    throw new Error("Invalid storage key");
  return normalized;
}

class LocalDriver implements StorageDriver {
  readonly name = "local" as const;
  readonly presign = false;
  constructor(private dir: string) {}
  private file(key: string) {
    return path.join(this.dir, safeKey(key));
  }
  async put(key: string, body: Buffer | Uint8Array) {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, body);
  }
  get(key: string) {
    return readFile(this.file(key));
  }
  async stream(key: string) {
    return Readable.toWeb(createReadStream(this.file(key))) as ReadableStream<Uint8Array>;
  }
  async head(key: string) {
    try {
      const s = await stat(this.file(key));
      return { size: s.size, contentType: null };
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await unlink(this.file(key)).catch(() => {});
  }
  presignPut(): Promise<PresignedPut> {
    return Promise.reject(new Error("The local storage driver cannot presign uploads"));
  }
  presignGet(): Promise<string> {
    return Promise.reject(new Error("The local storage driver cannot presign downloads"));
  }
}

class S3Driver implements StorageDriver {
  readonly name = "s3" as const;
  readonly presign = true;
  private client: import("@aws-sdk/client-s3").S3Client | undefined;
  constructor(private bucket: string) {}
  private async s3() {
    if (this.client) return this.client;
    const env = loadEnv();
    const { S3Client } = await import("@aws-sdk/client-s3");
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE ?? true,
      credentials:
        env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
    return this.client;
  }
  async put(key: string, body: Buffer | Uint8Array, opts?: PutOptions) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (
      await this.s3()
    ).send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: safeKey(key),
        Body: body,
        ContentType: opts?.contentType,
        CacheControl: opts?.cacheControl ?? "public, max-age=31536000, immutable",
      }),
    );
  }
  async get(key: string) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const res = await (
      await this.s3()
    ).send(new GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  async stream(key: string) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const res = await (
      await this.s3()
    ).send(new GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
    return res.Body!.transformToWebStream() as ReadableStream<Uint8Array>;
  }
  async head(key: string) {
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      const res = await (
        await this.s3()
      ).send(new HeadObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
      return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? null };
    } catch (e) {
      if ((e as { name?: string }).name === "NotFound") return null;
      throw e;
    }
  }
  async delete(key: string) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (
      await this.s3()
    ).send(new DeleteObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
  }
  async presignPut(
    key: string,
    opts: { contentType: string; contentLength: number; expiresIn?: number },
  ) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const expiresIn = opts.expiresIn ?? 900;
    const url = await getSignedUrl(
      await this.s3(),
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: safeKey(key),
        ContentType: opts.contentType,
        ContentLength: opts.contentLength,
      }),
      { expiresIn },
    );
    return {
      url,
      headers: { "content-type": opts.contentType, "content-length": String(opts.contentLength) },
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }
  async presignGet(
    key: string,
    opts: {
      expiresIn?: number;
      filename?: string;
      contentType?: string;
      disposition?: "inline" | "attachment";
    } = {},
  ) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    return getSignedUrl(
      await this.s3(),
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: safeKey(key),
        ...(opts.filename && {
          ResponseContentDisposition: `${opts.disposition ?? "attachment"}; filename="${opts.filename.replace(/["\r\n]/g, "")}"`,
        }),
        ...(opts.contentType && { ResponseContentType: opts.contentType }),
      }),
      { expiresIn: opts.expiresIn ?? 300 },
    );
  }
}

let driver: StorageDriver | undefined;

export function getStorage(): StorageDriver {
  if (driver) return driver;
  const env = loadEnv();
  if (env.STORAGE_DRIVER === "s3") {
    if (!env.S3_BUCKET) throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
    driver = new S3Driver(env.S3_BUCKET);
  } else {
    driver = new LocalDriver(path.resolve(env.STORAGE_LOCAL_DIR));
  }
  return driver;
}

/** For tests: forget the cached driver so a new env takes effect. */
export function resetStorage() {
  driver = undefined;
}

export {
  clamavScanner,
  parseClamReply,
  scanFile,
  setScanner,
  type ScanResult,
  type Scanner,
} from "./scan";
