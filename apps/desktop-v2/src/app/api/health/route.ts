import { NextResponse } from 'next/server'
import { getProductCount, getSkeletonCheck } from '@/server/bff/skeleton'

// BFF route handler — the client (TanStack Query) calls this same-origin. It reads
// local SQLite via the DataSource; the renderer never touches the DB or the API.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [productCount, check] = await Promise.all([getProductCount(), getSkeletonCheck()])
    return NextResponse.json({
      ok: true,
      productCount,
      skeletonValue: check?.value ?? null,
      source: 'local-sqlite',
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
