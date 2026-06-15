import { randomUUID } from 'crypto'
import { Inject, Injectable } from '@nestjs/common'
import { STORAGE_DRIVER, type StorageDriver, type StoredFile, type UploadInput } from './storage.types'

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
}

function extensionFor(originalName: string | undefined, contentType: string): string {
  if (originalName && originalName.includes('.')) {
    const ext = originalName.slice(originalName.lastIndexOf('.')).toLowerCase()
    if (/^\.[a-z0-9]{1,5}$/.test(ext)) return ext
  }
  return EXT_BY_TYPE[contentType] ?? ''
}

function sanitizeFolder(folder: string | undefined): string {
  const clean = (folder ?? 'uploads')
    .split('/')
    .map((part) => part.replace(/[^a-zA-Z0-9_-]/g, ''))
    .filter(Boolean)
    .join('/')
  return clean || 'uploads'
}

/**
 * Injectable storage facade. Any module that needs file storage depends on this and
 * is decoupled from the concrete driver (local / R2). Generates a collision-free key,
 * stores the bytes, and returns { key, url }.
 */
@Injectable()
export class StorageService {
  constructor(@Inject(STORAGE_DRIVER) private readonly driver: StorageDriver) {}

  async upload(input: UploadInput): Promise<StoredFile> {
    const key = `${sanitizeFolder(input.folder)}/${randomUUID()}${extensionFor(input.originalName, input.contentType)}`
    await this.driver.put(key, input.buffer, input.contentType)
    return { key, url: this.driver.url(key) }
  }

  url(key: string): string {
    return this.driver.url(key)
  }

  delete(key: string): Promise<void> {
    return this.driver.delete(key)
  }

  presignPut(key: string, contentType: string, expiresInSeconds?: number): Promise<string> {
    if (!this.driver.presignPut) {
      throw new Error('The active storage driver does not support presigned uploads.')
    }
    return this.driver.presignPut(key, contentType, expiresInSeconds)
  }
}
