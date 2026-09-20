import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "@bookly/config";

export type PutOptions = { contentType?: string; cacheControl?: string };

export interface StorageDriver {
  put(
    key: string,
    body: Buffer | Uint8Array,
    opts?: PutOptions,
  ): Promise<{ key: string; url: string }>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}

function safeKey(key: string) {
  const normalized = path.posix.normalize(key).replace(/^\/+/, "");
  if (normalized.startsWith("..")) throw new Error("Invalid storage key");
  return normalized;
}

/** Files on disk, served by the app at /uploads/<key>. Fine for single-server self-hosting. */
class LocalDriver implements StorageDriver {
  constructor(
    private dir: string,
    private baseUrl: string,
  ) {}
  async put(key: string, body: Buffer | Uint8Array) {
    const k = safeKey(key);
    const file = path.join(this.dir, k);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    return { key: k, url: this.publicUrl(k) };
  }
  get(key: string) {
    return readFile(path.join(this.dir, safeKey(key)));
  }
  async delete(key: string) {
    await unlink(path.join(this.dir, safeKey(key))).catch(() => {});
  }
  publicUrl(key: string) {
    return `${this.baseUrl}/uploads/${safeKey(key)}`;
  }
}

/** Any S3-compatible store: AWS S3, Cloudflare R2, MinIO, Backblaze… */
class S3Driver implements StorageDriver {
  private client: import("@aws-sdk/client-s3").S3Client | undefined;
  constructor(
    private bucket: string,
    private publicBase: string,
  ) {}
  private async s3() {
    if (this.client) return this.client;
    const env = loadEnv();
    const { S3Client } = await import("@aws-sdk/client-s3");
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE ?? false,
      credentials:
        env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
    return this.client;
  }
  async put(key: string, body: Buffer | Uint8Array, opts?: PutOptions) {
    const k = safeKey(key);
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (
      await this.s3()
    ).send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: k,
        Body: body,
        ContentType: opts?.contentType,
        CacheControl: opts?.cacheControl ?? "public, max-age=31536000, immutable",
      }),
    );
    return { key: k, url: this.publicUrl(k) };
  }
  async get(key: string) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const res = await (
      await this.s3()
    ).send(new GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  async delete(key: string) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (
      await this.s3()
    ).send(new DeleteObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
  }
  publicUrl(key: string) {
    return `${this.publicBase.replace(/\/$/, "")}/${safeKey(key)}`;
  }
}

let driver: StorageDriver | undefined;

export function getStorage(): StorageDriver {
  if (driver) return driver;
  const env = loadEnv();
  if (env.STORAGE_DRIVER === "s3") {
    if (!env.S3_BUCKET) throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
    driver = new S3Driver(
      env.S3_BUCKET,
      env.S3_PUBLIC_URL ?? `${env.S3_ENDPOINT}/${env.S3_BUCKET}`,
    );
  } else {
    driver = new LocalDriver(path.resolve(env.STORAGE_LOCAL_DIR), env.APP_URL);
  }
  return driver;
}
