// One-off: copy every file under the local uploads dir into the S3/R2 bucket,
// preserving the key (path relative to the uploads dir) 1:1 — so keyFromUrl/exists
// and the /files redirect resolve identically after the switch to STORAGE_DRIVER=s3.
//
// Usage (from apps/api):
//   node scripts/migrate-uploads-to-s3.mjs [--dry-run] [--overwrite] [--dir <path>]
//
// Reads S3_* from apps/api/.env. Skips objects that already exist unless --overwrite.

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, sep, extname } from 'node:path'
import { config as loadEnv } from 'dotenv'
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'

loadEnv()

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const OVERWRITE = args.includes('--overwrite')
const dirFlag = args.indexOf('--dir')
const UPLOADS_DIR =
  dirFlag !== -1 && args[dirFlag + 1]
    ? args[dirFlag + 1]
    : process.env.STORAGE_LOCAL_DIR || join(process.cwd(), 'uploads')

const CONTENT_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing required env var ${name} (set it in apps/api/.env).`)
    process.exit(1)
  }
  return value
}

const BUCKET = requireEnv('S3_BUCKET')
const ENDPOINT = requireEnv('S3_ENDPOINT')
const REGION = process.env.S3_REGION || 'auto'
const client = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
  },
  forcePathStyle: true,
  // R2 rejects AWS's default flexible checksums — only add them when a command requires it.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
})

function describeError(error) {
  return {
    name: error?.name,
    message: error?.message,
    code: error?.Code ?? error?.code,
    httpStatus: error?.$metadata?.httpStatusCode,
    fault: error?.$fault,
    cause: error?.cause?.message ?? error?.cause?.code,
  }
}

// Verify write capability the same way the migration uses the bucket: PUT a tiny
// probe object, then DELETE it. This needs only object read/write — not bucket-list.
async function preflight() {
  const acct = ENDPOINT.replace(/^https?:\/\//, '').split('.')[0]
  console.log(
    `Config: endpoint=${acct}.…  region=${REGION}  bucket=${BUCKET}  ` +
      `key=${(process.env.S3_ACCESS_KEY_ID || '').slice(0, 4)}…`,
  )
  const probeKey = `._preflight/${Date.now()}.txt`
  try {
    await client.send(
      new PutObjectCommand({ Bucket: BUCKET, Key: probeKey, Body: 'ok', ContentType: 'text/plain' }),
    )
    await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: probeKey }))
    console.log('Preflight OK — bucket writable with these credentials.\n')
  } catch (error) {
    console.error('Preflight FAILED — cannot write to the bucket:')
    console.error(JSON.stringify(describeError(error), null, 2))

    // Classify: can we READ? A HEAD on a missing key returns 404 when we're authorized
    // (object simply absent) vs 403 when we're not — this separates a read-only/insufficient
    // token from no-access-at-all (wrong endpoint jurisdiction / bucket scope / IP filter).
    try {
      await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: probeKey }))
      console.error('\nRead check: probe object unexpectedly present — writes may be intermittent.')
    } catch (readError) {
      const status = readError?.$metadata?.httpStatusCode
      const notFound = status === 404 || readError?.name === 'NotFound' || readError?.name === 'NoSuchKey'
      if (notFound) {
        console.error(
          '\nDiagnosis: READ works, WRITE denied → the R2 token is READ-ONLY (or lacks write on\n' +
            'this bucket). Fix: set the token permission to "Object Read & Write" for biztrack-cm.',
        )
      } else {
        console.error(
          `\nDiagnosis: READ is ALSO denied (${status ?? readError?.name}) → not a write-permission\n` +
            'issue. Most likely one of:\n' +
            '  1. Wrong endpoint JURISDICTION — EU buckets use https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com.\n' +
            '     Copy the exact "S3 API" endpoint shown on the bucket → Settings page.\n' +
            '  2. Token scoped to SPECIFIC buckets that do not include biztrack-cm.\n' +
            '  3. Token has client IP-address filtering that excludes your current IP.',
        )
      }
    }
    process.exit(1)
  }
}

async function* walk(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full)
    } else if (entry.isFile()) {
      yield full
    }
  }
}

async function objectExists(key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    return true
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode
    if (status === 404 || error?.name === 'NotFound' || error?.name === 'NoSuchKey') return false
    throw error
  }
}

async function main() {
  const root = UPLOADS_DIR
  try {
    await stat(root)
  } catch {
    console.error(`Uploads dir not found: ${root}`)
    process.exit(1)
  }

  console.log(`Migrating "${root}" -> s3://${BUCKET}${DRY_RUN ? '  (dry run)' : ''}`)

  // Dry run is purely local: list what WOULD upload, no R2 calls at all.
  if (!DRY_RUN) await preflight()

  let uploaded = 0
  let skipped = 0
  let failed = 0

  for await (const file of walk(root)) {
    // S3 keys use forward slashes regardless of OS path separators.
    const key = relative(root, file).split(sep).join('/')
    const contentType = CONTENT_TYPES[extname(file).toLowerCase()] || 'application/octet-stream'

    try {
      if (DRY_RUN) {
        uploaded++
        console.log(`would  ${key} (${contentType})`)
        continue
      }
      if (!OVERWRITE && (await objectExists(key))) {
        skipped++
        console.log(`skip   ${key} (already in bucket)`)
        continue
      }
      await client.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: await readFile(file),
          ContentType: contentType,
        }),
      )
      uploaded++
      console.log(`put    ${key}`)
    } catch (error) {
      failed++
      console.error(`FAIL   ${key}: ${JSON.stringify(describeError(error))}`)
    }
  }

  console.log(
    `\nDone. ${DRY_RUN ? 'would upload' : 'uploaded'}=${uploaded} skipped=${skipped} failed=${failed}`,
  )
  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
