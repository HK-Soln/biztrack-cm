import { join } from 'path'
import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { S3Client } from '@aws-sdk/client-s3'
import type { AppConfig } from '@/config/configuration'
import { STORAGE_DRIVER, type StorageDriver } from './storage.types'
import { LocalStorageDriver } from './drivers/local-storage.driver'
import { S3StorageDriver } from './drivers/s3-storage.driver'
import { StorageService } from './storage.service'
import { StorageController } from './storage.controller'
import { FilesController } from './files.controller'

function createDriver(config: ConfigService<AppConfig>): StorageDriver {
  if (config.get('STORAGE_DRIVER', { infer: true }) === 's3') {
    const endpoint = config.get('S3_ENDPOINT', { infer: true })
    const bucket = config.get('S3_BUCKET', { infer: true })
    const accessKeyId = config.get('S3_ACCESS_KEY_ID', { infer: true })
    const secretAccessKey = config.get('S3_SECRET_ACCESS_KEY', { infer: true })
    const publicUrl = config.get('S3_PUBLIC_URL', { infer: true })
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !publicUrl) {
      throw new Error(
        'STORAGE_DRIVER=s3 requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and S3_PUBLIC_URL.',
      )
    }
    const client = new S3Client({
      region: config.get('S3_REGION', { infer: true }) ?? 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
      // Cloudflare R2 rejects the AWS SDK's default flexible checksums (added by
      // default in recent SDK versions) — it surfaces as an opaque "UnknownError".
      // Only compute/validate checksums when a command actually requires them.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
    return new S3StorageDriver(client, bucket, publicUrl)
  }

  const baseDir = config.get('STORAGE_LOCAL_DIR', { infer: true }) ?? join(process.cwd(), 'uploads')
  const publicBaseUrl =
    config.get('STORAGE_PUBLIC_URL', { infer: true }) ?? config.get('API_URL', { infer: true }) ?? ''
  return new LocalStorageDriver(baseDir, publicBaseUrl)
}

/**
 * Global storage module — inject {@link StorageService} anywhere to store/serve files.
 * Driver is chosen by env (local disk by default; S3/R2 in prod).
 */
@Global()
@Module({
  controllers: [StorageController, FilesController],
  providers: [
    { provide: STORAGE_DRIVER, useFactory: createDriver, inject: [ConfigService] },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
