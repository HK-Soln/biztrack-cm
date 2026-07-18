/* Server-rendered marketing header + mobile drawer (ported from the design's buildHeader).
   Plain <a> full-page nav (multi-page site); interactivity is wired imperatively in SiteChrome. */

const NAV: Array<[en: string, fr: string, href: string]> = [
  ['Features', 'Fonctionnalités', '/features'],
  ['Pricing', 'Tarifs', '/pricing'],
  ['Download', 'Télécharger', '/download'],
  ['About', 'À propos', '/about'],
  ['Blog', 'Blog', '/blog'],
  ['Contact', 'Contact', '/contact'],
]

function Brand() {
  return (
    <a className="brand" href="/" aria-label="BizTrack CM home">
      <span className="mk">
        B<span className="pip" />
      </span>
      <span>
        <span className="bt">BizTrack CM</span>
        <span className="bs">Business Management</span>
      </span>
    </a>
  )
}

function LangTog() {
  return (
    <div className="lang-tog" role="group" aria-label="Language">
      {/* Form-filler browser extensions stamp fdprocessedid onto buttons post-SSR;
          suppress the resulting benign hydration attribute mismatch. */}
      <button data-lang="en" className="on" suppressHydrationWarning>
        EN
      </button>
      <button data-lang="fr" suppressHydrationWarning>
        FR
      </button>
    </div>
  )
}

const MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
)

const CloseIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export function SiteHeader() {
  return (
    <>
      <header className="site-header">
        <div className="wrap">
          <Brand />
          <nav className="main-nav">
            {NAV.map(([en, fr, href]) => (
              <a key={href} href={href} data-en={en} data-fr={fr}>
                {en}
              </a>
            ))}
          </nav>
          <div className="header-actions">
            <LangTog />
            <a
              className="btn btn-ghost btn-sm"
              href="https://biztrack.hk-solutions.app"
              data-en="Sign in"
              data-fr="Connexion"
            >
              Sign in
            </a>
            <a
              className="btn btn-primary btn-sm"
              href="/contact"
              data-en="Get the app"
              data-fr="Obtenir l'app"
            >
              Get the app
            </a>
            <button className="burger" aria-label="Menu">
              {MenuIcon}
            </button>
          </div>
        </div>
      </header>

      <div className="m-drawer-ov" />
      <div className="m-drawer">
        <div className="dh">
          <Brand />
          <button className="dx" aria-label="Close">
            {CloseIcon}
          </button>
        </div>
        <nav>
          {NAV.map(([en, fr, href]) => (
            <a key={href} href={href} data-en={en} data-fr={fr}>
              {en}
            </a>
          ))}
          <a href="/" data-en="Home" data-fr="Accueil">
            Home
          </a>
        </nav>
        <div className="dfoot">
          <LangTog />
          <a
            className="btn btn-primary btn-block"
            href="/contact"
            data-en="Get the app"
            data-fr="Obtenir l'app"
          >
            Get the app
          </a>
        </div>
      </div>
    </>
  )
}
