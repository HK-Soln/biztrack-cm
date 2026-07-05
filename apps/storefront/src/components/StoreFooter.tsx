import Link from 'next/link'
import type { PublicStore } from '@biztrack/types'

const socialIcon: Record<string, React.ReactNode> = {
  instagram: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M14 9V7c0-1 .5-2 2-2h2V2h-3c-2.5 0-4 1.7-4 4v3H8v3h3v8h3v-8h2.5l.5-3H14Z" />
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M14 4v9.5a3.5 3.5 0 1 1-3-3.46" />
      <path d="M14 4c.5 2.5 2 4 4.5 4.3" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 4l16 16M20 4L4 20" />
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M7 10v7M7 7v.01M11 17v-4a2 2 0 0 1 4 0v4M11 17v-7" />
    </svg>
  ),
}

/** Normalise a stored handle/URL into an absolute link. */
function socialHref(kind: string, value: string): string {
  if (/^https?:\/\//i.test(value)) return value
  const handle = value.replace(/^@/, '')
  const base: Record<string, string> = {
    instagram: 'https://instagram.com/',
    facebook: 'https://facebook.com/',
    tiktok: 'https://tiktok.com/@',
    x: 'https://x.com/',
    linkedin: 'https://linkedin.com/company/',
  }
  return `${base[kind] ?? 'https://'}${handle}`
}

export function StoreFooter({ store, base }: { store: PublicStore; base: string }) {
  const href = (p: string) => `${base}${p}` || '/'
  const socials = Object.entries(store.socials).filter(([, v]) => v) as Array<[string, string]>
  const year = 2026

  return (
    <footer className="sf-foot">
      <div className="wrap">
        <div className="cols">
          <div className="fc fbrand">
            <div className="brand">
              <div className="mk">
                {store.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={store.logoUrl} alt={store.storeName} />
                ) : (
                  store.storeName.charAt(0).toUpperCase()
                )}
              </div>
              <div>
                <div className="bt">{store.storeName}</div>
                {store.city ? <div className="bs">{store.city}</div> : null}
              </div>
            </div>
            {store.tagline ? <p>{store.tagline}</p> : null}
            {socials.length ? (
              <div className="socials">
                {socials.map(([kind, value]) => (
                  <a
                    key={kind}
                    href={socialHref(kind, value)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={kind}
                  >
                    {socialIcon[kind]}
                  </a>
                ))}
              </div>
            ) : null}
          </div>

          <div className="fc">
            <h4>Boutique</h4>
            <Link href={href('')}>Accueil</Link>
            <Link href={href('/products')}>Tous les produits</Link>
            <Link href={href('/cart')}>Panier</Link>
          </div>

          <div className="fc">
            <h4>Aide</h4>
            <Link href={href('/contact')}>Nous contacter</Link>
            {store.whatsappNumber ? (
              <a
                href={`https://wa.me/${store.whatsappNumber.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp
              </a>
            ) : null}
          </div>

          <div className="fc">
            <h4>Contact</h4>
            {store.phone ? <a href={`tel:${store.phone}`}>{store.phone}</a> : null}
            {store.email ? <a href={`mailto:${store.email}`}>{store.email}</a> : null}
            {store.address ? (
              <span style={{ display: 'block', paddingTop: 6 }}>{store.address}</span>
            ) : null}
          </div>
        </div>

        <div className="fbot">
          <span className="cp">
            © {year} {store.storeName}. Tous droits réservés.
          </span>
          <span className="pw">
            Propulsé par <b>BizTrack CM</b>
          </span>
        </div>
      </div>
    </footer>
  )
}
