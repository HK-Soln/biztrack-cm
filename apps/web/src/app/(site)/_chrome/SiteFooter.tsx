/* Server-rendered marketing footer (ported from the design's buildFooter). */

const PHONE_RAW = '971588629213'

type Link = [en: string, fr: string, href: string]

const COLS: Array<{ en: string; fr: string; links: Link[] }> = [
  {
    en: 'Product',
    fr: 'Produit',
    links: [
      ['Features', 'Fonctionnalités', '/features'],
      ['Pricing', 'Tarifs', '/pricing'],
      ['Download', 'Télécharger', '/download'],
      ["What's new", 'Nouveautés', '/blog'],
    ],
  },
  {
    en: 'Company',
    fr: 'Entreprise',
    links: [
      ['About', 'À propos', '/about'],
      ['Blog', 'Blog', '/blog'],
      ['Contact', 'Contact', '/contact'],
      ['Support', 'Assistance', '/contact'],
    ],
  },
  {
    en: 'Legal',
    fr: 'Légal',
    links: [
      ['Privacy', 'Confidentialité', '/privacy'],
      ['Terms', 'Conditions', '/terms'],
      ['FAQ', 'FAQ', '/faq'],
    ],
  },
]

const LinkedInIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M4.98 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM3 9h4v12H3V9Zm6 0h3.8v1.7h.05c.53-1 1.83-2.05 3.76-2.05C20.7 8.65 22 10.3 22 13.6V21h-4v-6.5c0-1.55-.03-3.55-2.16-3.55-2.16 0-2.49 1.7-2.49 3.44V21H9V9Z" />
  </svg>
)
const WhatsAppIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm0 18.3c-1.5 0-3-.4-4.3-1.2l-.3-.2-2.9.8.8-2.8-.2-.3A8.3 8.3 0 1 1 12 20.3Zm4.6-6.2c-.25-.13-1.5-.74-1.7-.82-.23-.08-.4-.13-.56.13-.17.25-.65.82-.8 1-.14.16-.29.18-.54.06a6.8 6.8 0 0 1-2-1.24 7.5 7.5 0 0 1-1.4-1.72c-.14-.25 0-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.13-.56-1.36-.77-1.86-.2-.48-.4-.42-.56-.42h-.48c-.16 0-.43.06-.65.31-.22.25-.86.84-.86 2.05s.88 2.38 1 2.54c.13.17 1.74 2.66 4.2 3.73.59.25 1.05.4 1.4.52.6.18 1.14.16 1.56.1.48-.07 1.5-.61 1.7-1.2.22-.59.22-1.1.15-1.2-.06-.11-.23-.17-.48-.3Z" />
  </svg>
)
const FacebookIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M14 9V7.5c0-.7.5-1 1-1h2V3h-2.5C11.9 3 10 4.8 10 7.3V9H7.5v3.5H10V21h3.5v-8.5H16l.5-3.5H14Z" />
  </svg>
)
const XIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.5 3h3l-6.6 7.6L22 21h-6.2l-4.8-6.3L5.5 21h-3l7-8.1L2 3h6.3l4.4 5.8L17.5 3Zm-1 16h1.7L7.6 4.8H5.8L16.5 19Z" />
  </svg>
)

export function SiteFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="cols">
          <div className="fbrand">
            <a className="brand" href="/">
              <span className="mk">
                B<span className="pip" />
              </span>
              <span>
                <span className="bt">BizTrack CM</span>
                <span className="bs">Business Management</span>
              </span>
            </a>
            <p
              data-en="The offline-first POS &amp; business platform built for Cameroonian shop owners. Sales, inventory, credit and OHADA reports — right on your phone."
              data-fr="La plateforme de gestion et point de vente, hors-ligne d'abord, conçue pour les commerçants camerounais. Ventes, stock, crédit et rapports OHADA — sur votre téléphone."
            >
              The offline-first POS &amp; business platform built for Cameroonian shop owners.
            </p>
            <div className="socials">
              <a
                href="https://www.linkedin.com/in/henson-kudi-amah-64736b190/"
                aria-label="LinkedIn"
              >
                {LinkedInIcon}
              </a>
              <a href={`https://wa.me/${PHONE_RAW}`} aria-label="WhatsApp">
                {WhatsAppIcon}
              </a>
              <a href="#" aria-label="Facebook">
                {FacebookIcon}
              </a>
              <a href="#" aria-label="X">
                {XIcon}
              </a>
            </div>
          </div>
          {COLS.map((col) => (
            <div className="fc" key={col.en}>
              <h4 data-en={col.en} data-fr={col.fr}>
                {col.en}
              </h4>
              {col.links.map(([en, fr, href], i) => (
                <a key={`${href}-${i}`} href={href} data-en={en} data-fr={fr}>
                  {en}
                </a>
              ))}
            </div>
          ))}
        </div>
        <div className="fbot">
          <span className="cp">
            © {year} BizTrack CM ·{' '}
            <span data-en="All rights reserved." data-fr="Tous droits réservés.">
              All rights reserved.
            </span>
          </span>
          <span className="flg">
            <a href="/privacy" data-en="Privacy" data-fr="Confidentialité">
              Privacy
            </a>
            <a href="/terms" data-en="Terms" data-fr="Conditions">
              Terms
            </a>
          </span>
          <span className="made">
            <span data-en="A product of" data-fr="Un produit de">
              A product of
            </span>{' '}
            <b>HK Solutions</b> <span className="gg">·</span> biztrack.cm
          </span>
        </div>
      </div>
    </footer>
  )
}
