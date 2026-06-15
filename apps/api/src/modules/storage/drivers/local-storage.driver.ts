import { mkdir, unlink, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { StorageDriver } from '../storage.types'

/**
 * Dev / self-host driver: writes under `baseDir` (served statically at /uploads) and
 * returns `${publicBaseUrl}/uploads/<key>`. No external service required.
 */
export class LocalStorageDriver implements StorageDriver {
  constructor(
    private readonly baseDir: string,
    private readonly publicBaseUrl: string,
  ) {}

  async put(key: string, body: Buffer): Promise<void> {
    const full = join(this.baseDir, key)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, body)
  }

  url(key: string): string {
    return `${this.publicBaseUrl.replace(/\/$/, '')}/uploads/${key}`
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(join(this.baseDir, key))
    } catch {
      // already gone — fine
    }
  }
}
