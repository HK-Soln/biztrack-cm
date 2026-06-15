export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER')

export interface UploadInput {
  buffer: Buffer
  contentType: string
  originalName?: string
  /** Logical folder/prefix, e.g. 'categories' or '<businessId>/products'. */
  folder?: string
}

export interface StoredFile {
  /** Storage key (path within the bucket/dir). Persist this. */
  key: string
  /** Public URL to render the file. */
  url: string
}

/**
 * Pluggable storage backend. One interface, swappable drivers (local disk for dev,
 * S3-compatible — Cloudflare R2 etc. — for prod). Services depend on StorageService,
 * never on a concrete driver.
 */
export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>
  url(key: string): string
  delete(key: string): Promise<void>
  /** True if an object with this key currently exists in the backend. */
  exists(key: string): Promise<boolean>
  /**
   * Reverse of {@link url}: extract the storage key from a public URL this driver
   * produced. Returns null if the URL is NOT served by this backend (e.g. an
   * external/foreign URL) — callers use that to reject untrusted references.
   */
  keyFromUrl(url: string): string | null
  /** Presigned PUT for direct browser→storage upload (optional per driver). */
  presignPut?(key: string, contentType: string, expiresInSeconds?: number): Promise<string>
}
