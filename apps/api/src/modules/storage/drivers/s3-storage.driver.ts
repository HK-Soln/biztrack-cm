import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { StorageDriver } from '../storage.types'

/**
 * S3-compatible driver (Cloudflare R2 by default; also AWS S3 / Backblaze B2 /
 * Supabase / MinIO). `publicBaseUrl` is the bucket's public origin (R2 public bucket
 * or custom domain) used to render stored files.
 */
export class S3StorageDriver implements StorageDriver {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly publicBaseUrl: string,
  ) {}

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    )
  }

  url(key: string): string {
    return `${this.publicBaseUrl.replace(/\/$/, '')}/${key}`
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }

  presignPut(key: string, contentType: string, expiresInSeconds = 600): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: expiresInSeconds },
    )
  }
}
