import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const b = body as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const name = str(b.name)
  const phone = str(b.phone)
  const message = str(b.message)

  if (!name || !phone || !message) {
    return NextResponse.json({ error: 'name, phone and message are required' }, { status: 400 })
  }

  const apiUrl = process.env.API_INTERNAL_URL
  const secret = process.env.INTERNAL_API_SECRET
  if (!apiUrl || !secret) {
    console.error('API_INTERNAL_URL or INTERNAL_API_SECRET not configured')
    return NextResponse.json({ error: 'Service unavailable' }, { status: 500 })
  }

  const payload = {
    name,
    phone,
    message,
    email: str(b.email) || undefined,
    business: str(b.business) || undefined,
    city: str(b.city) || undefined,
    topic: str(b.topic) || undefined,
    consent: b.consent === true || b.consent === 'true',
    locale: str(b.locale) === 'fr' ? 'fr' : 'en',
  }

  try {
    const upstream = await fetch(`${apiUrl}/api/v1/marketing/contact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
        'x-internal-secret': secret,
      },
      body: JSON.stringify(payload),
    })
    const data = await upstream.json().catch(() => ({}))
    return NextResponse.json(data, { status: upstream.status })
  } catch (err) {
    console.error('Contact proxy error:', err)
    return NextResponse.json({ error: 'Service unavailable' }, { status: 500 })
  }
}
