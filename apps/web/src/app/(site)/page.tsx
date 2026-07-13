import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'BizTrack CM — Offline-first POS & business software for Cameroon shops',
  description:
    'BizTrack CM is the offline-first point-of-sale and business-management app built for Cameroonian shop owners. Track sales, inventory, credit and OHADA reports — with MTN MoMo & Orange Money, on Android, Windows and Mac. Works without internet.',
  keywords: [
    'POS Cameroun',
    'logiciel de caisse',
    'gestion boutique',
    'MTN MoMo',
    'Orange Money',
    'OHADA',
    'DGI',
    'offline POS',
    'business management app Cameroon',
  ],
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Run your shop. Simply. — BizTrack CM',
    description:
      'Offline-first POS & business management for Cameroonian shops. Sales, inventory, credit, MoMo & OHADA reports — on any device.',
    url: '/',
    images: ['/site/img/app-desktop-dash.png'],
  },
  twitter: {
    title: 'BizTrack CM — Run your shop. Simply.',
    description: 'Offline-first POS & business management for Cameroonian shops.',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'BizTrack CM',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Android, iOS, Windows, macOS',
  description:
    'Offline-first point-of-sale and business-management platform for Cameroonian shop owners, with MTN MoMo & Orange Money payments and OHADA-format reports.',
  url: 'https://hk-solutions.app/',
  author: { '@type': 'Organization', name: 'HK Solutions' },
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'XAF' },
  aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.8', reviewCount: '126' },
}

const Check = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
    <path d="m5 12 4 4L19 6" />
  </svg>
)

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ============ HERO ============ */}
      <section className="hero">
        <div className="wrap">
          <div className="hcopy">
            <span className="hero-eyebrow">
              <span className="live">
                <span className="d" />
                Live now
              </span>
              <span data-en="Built for African business" data-fr="Conçu pour le commerce africain">
                Built for African business
              </span>
            </span>
            <h1
              data-en={'Run your shop. <span class="g">Simply.</span>'}
              data-fr={'Gérez votre commerce. <span class="g">Simplement.</span>'}
            >
              Run your shop. <span className="g">Simply.</span>
            </h1>
            <p
              className="sub"
              data-en="The offline-first POS &amp; business software built for Cameroonian shop owners. Sales, inventory, credit and reports — with MoMo, Orange Money and OHADA statements, on any device."
              data-fr="Le logiciel de caisse et de gestion, hors-ligne d'abord, conçu pour les commerçants camerounais. Ventes, stock, crédit et rapports — avec MoMo, Orange Money et états OHADA, sur tous vos appareils."
            >
              The offline-first POS &amp; business software built for Cameroonian shop owners.
            </p>
            <div className="cta">
              <a
                className="btn btn-gold btn-lg"
                href="/download"
                data-en="Download free"
                data-fr="Télécharger gratuitement"
              >
                Download free
              </a>
              <a
                className="btn btn-on-dark btn-lg"
                href="/features"
                data-en="See features"
                data-fr="Voir les fonctionnalités"
              >
                See features
              </a>
            </div>
            <div className="os">
              <span className="oi">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01" />
                </svg>
                <span data-en="Works fully offline" data-fr="Fonctionne hors-ligne">
                  Works fully offline
                </span>
              </span>
              <span className="oi">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
                <span data-en="MoMo &amp; Orange Money" data-fr="MoMo &amp; Orange Money">
                  MoMo &amp; Orange Money
                </span>
              </span>
              <span className="oi">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16v4H4zM4 12h16M4 16h16M4 20h16" />
                </svg>
                <span data-en="OHADA &amp; DGI ready" data-fr="Conforme OHADA &amp; DGI">
                  OHADA &amp; DGI ready
                </span>
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <img
              className="hero-phone"
              src="/site/img/app-m-home.png"
              alt="BizTrack CM mobile dashboard showing today's sales, receivables and stock"
            />
            <div className="float-card float-a">
              <span
                className="fi"
                style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  width="18"
                >
                  <path d="m5 12 4 4L19 6" />
                </svg>
              </span>
              <span>
                <span className="ft" data-en="Sale · 6 items" data-fr="Vente · 6 articles">
                  Sale · 6 items
                </span>
                <span className="fd">MoMo · +32 000</span>
              </span>
            </div>
            <div className="float-card float-b">
              <span className="fi" style={{ background: 'var(--navy-soft)', color: 'var(--navy)' }}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  width="18"
                >
                  <path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01" />
                </svg>
              </span>
              <span>
                <span className="ft" data-en="Works offline" data-fr="Hors-ligne">
                  Works offline
                </span>
                <span className="fd" data-en="No internet needed" data-fr="Sans connexion">
                  No internet needed
                </span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* trust strip */}
      <div className="trust-strip">
        <div className="wrap">
          <span
            className="tl"
            data-en="Trusted by shops across Cameroon"
            data-fr="La confiance des commerces au Cameroun"
          >
            Trusted by shops across Cameroon
          </span>
          <span className="ti">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z" />
              <circle cx="7" cy="17" r="1.6" />
              <circle cx="17" cy="17" r="1.6" />
            </svg>
            <span data-en="Boutiques &amp; épiceries" data-fr="Boutiques &amp; épiceries">
              Boutiques &amp; épiceries
            </span>
          </span>
          <span className="ti">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 21V7l9-4 9 4v14M9 21v-6h6v6" />
            </svg>
            <span
              data-en="Pharmacies &amp; quincailleries"
              data-fr="Pharmacies &amp; quincailleries"
            >
              Pharmacies &amp; quincailleries
            </span>
          </span>
          <span className="ti">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v10M9 9.5h4.5a1.5 1.5 0 0 1 0 3H9m0 0h4.5" />
            </svg>
            <span data-en="Restaurants &amp; bars" data-fr="Restaurants &amp; bars">
              Restaurants &amp; bars
            </span>
          </span>
        </div>
      </div>

      {/* ============ FEATURES GRID ============ */}
      <section className="sec">
        <div className="wrap">
          <div className="shead center reveal">
            <span
              className="eyebrow centered"
              data-en="Everything in one app"
              data-fr="Tout dans une seule app"
            >
              Everything in one app
            </span>
            <h2
              className="title"
              data-en="One tool to run the whole business"
              data-fr="Un seul outil pour toute la gestion"
            >
              One tool to run the whole business
            </h2>
            <p
              className="lead"
              data-en="From the first sale of the morning to the OHADA statement at month-end — BizTrack keeps every part of your shop in sync, even without internet."
              data-fr="De la première vente du matin à l'état OHADA en fin de mois — BizTrack garde chaque partie de votre commerce synchronisée, même sans internet."
            >
              From the first sale of the morning to the OHADA statement at month-end.
            </p>
          </div>
          <div className="fgrid">
            <div className="fcard reveal">
              <div className="ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 7h11v8H4zM15 10h4l1 3v2h-6z" />
                  <circle cx="8" cy="18" r="1.6" />
                  <circle cx="17" cy="18" r="1.6" />
                </svg>
              </div>
              <h3 data-en="Fast point of sale" data-fr="Caisse rapide">
                Fast point of sale
              </h3>
              <p
                data-en="Ring up sales in seconds — scan a barcode or tap a product, split payment across cash, MoMo and Orange Money, and print or send the receipt."
                data-fr="Encaissez en quelques secondes — scannez un code-barres ou touchez un produit, répartissez le paiement entre espèces, MoMo et Orange Money, imprimez ou envoyez le reçu."
              >
                Ring up sales in seconds, split across cash, MoMo and Orange Money.
              </p>
            </div>
            <div className="fcard reveal">
              <div className="ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3ZM3 7.5 12 12l9-4.5M12 12v9" />
                </svg>
              </div>
              <h3 data-en="Live inventory" data-fr="Stock en temps réel">
                Live inventory
              </h3>
              <p
                data-en="Stock counts update on every sale and restock. Low-stock alerts, supplier prices, variants and units of measure — nothing runs out by surprise."
                data-fr="Le stock se met à jour à chaque vente et réapprovisionnement. Alertes de rupture, prix fournisseurs, variantes et unités — plus de mauvaise surprise."
              >
                Counts update on every sale, with low-stock alerts and supplier prices.
              </p>
            </div>
            <div className="fcard reveal">
              <div className="ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M3 10h18M7 15h4" />
                </svg>
              </div>
              <h3 data-en="Credit &amp; debtors" data-fr="Crédit &amp; créances">
                Credit &amp; debtors
              </h3>
              <p
                data-en="Track who owes what, set due dates, and send WhatsApp reminders. Manage supplier payables the same way — receivables and payables in one place."
                data-fr="Suivez qui doit quoi, fixez des échéances et envoyez des rappels WhatsApp. Gérez les dettes fournisseurs de la même façon — créances et dettes au même endroit."
              >
                Track debtors and payables, set due dates, send WhatsApp reminders.
              </p>
            </div>
            <div className="fcard reveal">
              <div className="ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-7" />
                </svg>
              </div>
              <h3 data-en="OHADA reports" data-fr="Rapports OHADA">
                OHADA reports
              </h3>
              <p
                data-en="20+ ready reports: daily sales, P&amp;L, balance sheet, VAT payable, stock valuation — all in OHADA &amp; DGI format, exportable to PDF and CSV."
                data-fr="Plus de 20 rapports prêts : ventes du jour, compte de résultat, bilan, TVA à payer, valorisation des stocks — au format OHADA &amp; DGI, exportables en PDF et CSV."
              >
                20+ ready reports in OHADA &amp; DGI format, exportable to PDF and CSV.
              </p>
            </div>
            <div className="fcard gold reveal">
              <div className="ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01" />
                  <path d="m3 3 18 18" opacity=".8" />
                </svg>
              </div>
              <h3 data-en="Offline-first" data-fr="Hors-ligne d'abord">
                Offline-first
              </h3>
              <p
                data-en="Keep selling when the network drops. Everything is stored on the device and syncs safely the moment you're back online — no data lost, ever."
                data-fr="Continuez à vendre même sans réseau. Tout est stocké sur l'appareil et se synchronise en toute sécurité dès le retour de la connexion — aucune donnée perdue."
              >
                Keep selling when the network drops; sync safely when you're back.
              </p>
            </div>
            <div className="fcard reveal">
              <div className="ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="9" cy="8" r="3" />
                  <path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" />
                  <circle cx="17.5" cy="9" r="2.5" />
                  <path d="M15 15.2c3 .3 5 2 5 4.8" />
                </svg>
              </div>
              <h3 data-en="Team &amp; roles" data-fr="Équipe &amp; rôles">
                Team &amp; roles
              </h3>
              <p
                data-en="Give cashiers, managers and accountants exactly the access they need. Every action is logged, so you always know who did what."
                data-fr="Donnez aux caissiers, gérants et comptables l'accès dont ils ont besoin. Chaque action est journalisée : vous savez toujours qui a fait quoi."
              >
                Give each role the right access, with a full activity log.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============ SPLIT FEATURES (screenshots) ============ */}
      <section className="sec" style={{ background: 'var(--canvas)' }}>
        <div className="wrap">
          <div className="split reveal">
            <div className="scopy">
              <span className="eyebrow" data-en="Dashboard" data-fr="Tableau de bord">
                Dashboard
              </span>
              <h3
                style={{ marginTop: '14px' }}
                data-en="Your whole business, at a glance"
                data-fr="Toute votre activité, en un coup d'œil"
              >
                Your whole business, at a glance
              </h3>
              <p
                data-en="Open the app and see today's profit, revenue, margin and cash position — plus what customers owe you and what you owe suppliers. No spreadsheets, no guesswork."
                data-fr="Ouvrez l'app et voyez le bénéfice du jour, le chiffre d'affaires, la marge et la trésorerie — ainsi que ce que vos clients vous doivent et ce que vous devez aux fournisseurs. Sans tableur, sans approximation."
              >
                See today's profit, revenue, margin and cash position the moment you open the app.
              </p>
              <ul className="flist">
                <li>
                  {Check}
                  <span
                    data-en="Real-time profit &amp; margin tracking"
                    data-fr="Suivi du bénéfice et de la marge en temps réel"
                  >
                    Real-time profit &amp; margin tracking
                  </span>
                </li>
                <li>
                  {Check}
                  <span
                    data-en="Role-based dashboards for owner, manager &amp; cashier"
                    data-fr="Tableaux de bord par rôle : propriétaire, gérant &amp; caissier"
                  >
                    Role-based dashboards for owner, manager &amp; cashier
                  </span>
                </li>
                <li>
                  {Check}
                  <span
                    data-en="Compare today, this month, quarter or year"
                    data-fr="Comparez aujourd'hui, ce mois, le trimestre ou l'année"
                  >
                    Compare today, this month, quarter or year
                  </span>
                </li>
              </ul>
            </div>
            <div className="shot-wrap reveal">
              <div className="shot">
                <img
                  src="/site/img/app-desktop-dash.png"
                  alt="BizTrack CM desktop dashboard with net profit, revenue and cash position"
                />
              </div>
              <div className="shot-tag">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 18v3" />
                </svg>
                <span data-en="Desktop &amp; web" data-fr="Bureau &amp; web">
                  Desktop &amp; web
                </span>
              </div>
            </div>
          </div>

          <div className="split rev reveal">
            <div className="scopy">
              <span className="eyebrow" data-en="Point of sale" data-fr="Point de vente">
                Point of sale
              </span>
              <h3
                style={{ marginTop: '14px' }}
                data-en="Checkout that keeps up with your counter"
                data-fr="Une caisse à la vitesse de votre comptoir"
              >
                Checkout that keeps up with your counter
              </h3>
              <p
                data-en="A clean, fast till your cashiers actually enjoy using. Search or scan, add charges and discounts, pick the customer, split the payment — and hand over a receipt in seconds."
                data-fr="Une caisse simple et rapide que vos caissiers aiment utiliser. Cherchez ou scannez, ajoutez frais et remises, choisissez le client, répartissez le paiement — et remettez un reçu en quelques secondes."
              >
                A clean, fast till your cashiers actually enjoy using.
              </p>
              <ul className="flist">
                <li>
                  {Check}
                  <span
                    data-en="Barcode scan or tap-to-add"
                    data-fr="Scan de code-barres ou ajout tactile"
                  >
                    Barcode scan or tap-to-add
                  </span>
                </li>
                <li>
                  {Check}
                  <span
                    data-en="Split cash / MoMo / Orange Money on one sale"
                    data-fr="Répartissez espèces / MoMo / Orange Money sur une vente"
                  >
                    Split cash / MoMo / Orange Money on one sale
                  </span>
                </li>
                <li>
                  {Check}
                  <span
                    data-en="Send receipts by SMS &amp; WhatsApp"
                    data-fr="Envoyez les reçus par SMS &amp; WhatsApp"
                  >
                    Send receipts by SMS &amp; WhatsApp
                  </span>
                </li>
              </ul>
            </div>
            <div className="shot-wrap reveal">
              <div className="shot">
                <img
                  src="/site/img/app-desktop-sell.png"
                  alt="BizTrack CM point-of-sale screen with product grid and categories"
                />
              </div>
            </div>
          </div>

          <div className="split reveal">
            <div className="scopy">
              <span className="eyebrow" data-en="Reports" data-fr="Rapports">
                Reports
              </span>
              <h3
                style={{ marginTop: '14px' }}
                data-en="Accountant-ready, in OHADA format"
                data-fr="Prêt pour le comptable, au format OHADA"
              >
                Accountant-ready, in OHADA format
              </h3>
              <p
                data-en="Everything your accountant and the DGI expect — profit &amp; loss, balance sheet, VAT payable, stock valuation and more. Generate, print or export in one tap."
                data-fr="Tout ce qu'attendent votre comptable et la DGI — compte de résultat, bilan, TVA à payer, valorisation des stocks et plus. Générez, imprimez ou exportez en un geste."
              >
                Everything your accountant and the DGI expect, generated in one tap.
              </p>
              <ul className="flist">
                <li>
                  {Check}
                  <span
                    data-en="20+ reports across sales, stock &amp; finance"
                    data-fr="Plus de 20 rapports : ventes, stock &amp; finance"
                  >
                    20+ reports across sales, stock &amp; finance
                  </span>
                </li>
                <li>
                  {Check}
                  <span
                    data-en="OHADA &amp; DGI-compliant statements"
                    data-fr="États conformes OHADA &amp; DGI"
                  >
                    OHADA &amp; DGI-compliant statements
                  </span>
                </li>
                <li>
                  {Check}
                  <span data-en="Export to PDF &amp; CSV" data-fr="Export PDF &amp; CSV">
                    Export to PDF &amp; CSV
                  </span>
                </li>
              </ul>
            </div>
            <div className="shot-wrap reveal">
              <div className="shot">
                <img
                  src="/site/img/app-reports.png"
                  alt="BizTrack CM reports centre with revenue, expenses, net profit and VAT"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ LOCALISED FOR CAMEROON ============ */}
      <section className="sec">
        <div className="wrap">
          <div className="shead center reveal">
            <span className="eyebrow centered" data-en="Made for here" data-fr="Fait pour ici">
              Made for here
            </span>
            <h2
              className="title"
              data-en="Built for how Cameroon really trades"
              data-fr="Pensé pour le commerce camerounais"
            >
              Built for how Cameroon really trades
            </h2>
            <p
              className="lead"
              data-en="Not a foreign tool bolted onto local habits — BizTrack is designed around Mobile Money, bilingual staff, patchy networks and OHADA accounting."
              data-fr="Pas un outil étranger plaqué sur des habitudes locales — BizTrack est conçu autour du Mobile Money, des équipes bilingues, des réseaux instables et de la comptabilité OHADA."
            >
              Designed around Mobile Money, bilingual staff, patchy networks and OHADA accounting.
            </p>
          </div>
          <div className="local-grid">
            <div className="local reveal">
              <span className="pill" style={{ background: '#FFF4DC', color: '#9A6B00' }}>
                <span
                  className="dot"
                  style={{
                    width: '9px',
                    height: '9px',
                    borderRadius: '50%',
                    background: '#FFCC00',
                  }}
                />
                MTN MoMo
              </span>
              <h4 data-en="Mobile Money, built in" data-fr="Mobile Money intégré">
                Mobile Money, built in
              </h4>
              <p
                data-en="Record MTN MoMo and Orange Money on every sale, and reconcile them in reports."
                data-fr="Enregistrez MTN MoMo et Orange Money sur chaque vente et rapprochez-les dans les rapports."
              >
                Record MoMo &amp; Orange Money on every sale and reconcile in reports.
              </p>
            </div>
            <div className="local reveal">
              <span
                className="pill"
                style={{ background: 'var(--navy-soft)', color: 'var(--navy)' }}
              >
                FR · EN
              </span>
              <h4 data-en="Fully bilingual" data-fr="Entièrement bilingue">
                Fully bilingual
              </h4>
              <p
                data-en="Switch the whole app between French and English — receipts and reports too."
                data-fr="Basculez toute l'app entre le français et l'anglais — reçus et rapports compris."
              >
                Switch the whole app between French and English — receipts too.
              </p>
            </div>
            <div className="local reveal">
              <span
                className="pill"
                style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
              >
                OHADA
              </span>
              <h4 data-en="OHADA &amp; DGI reports" data-fr="Rapports OHADA &amp; DGI">
                OHADA &amp; DGI reports
              </h4>
              <p
                data-en="Statements in the format your accountant and the tax office already use."
                data-fr="Des états au format déjà utilisé par votre comptable et le fisc."
              >
                Statements in the format your accountant and the DGI already use.
              </p>
            </div>
            <div className="local reveal">
              <span
                className="pill"
                style={{ background: 'var(--gold-soft)', color: 'var(--gold-600)' }}
              >
                <span
                  className="dot"
                  style={{
                    width: '9px',
                    height: '9px',
                    borderRadius: '50%',
                    background: 'var(--gold)',
                  }}
                />
                <span data-en="Offline" data-fr="Hors-ligne">
                  Offline
                </span>
              </span>
              <h4 data-en="Works without internet" data-fr="Marche sans internet">
                Works without internet
              </h4>
              <p
                data-en="Sell all day on a weak or no connection; it syncs the moment you're online."
                data-fr="Vendez toute la journée sans connexion ; la synchro se fait dès le retour du réseau."
              >
                Sell all day with no connection; syncs the moment you're online.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============ STATS ============ */}
      <section className="sec-sm">
        <div className="wrap">
          <div className="stats reveal">
            <div className="stat">
              <div className="n">
                100<span className="g">%</span>
              </div>
              <div
                className="l"
                data-en="Works offline — no internet required"
                data-fr="Fonctionne hors-ligne — sans internet"
              >
                Works offline — no internet required
              </div>
            </div>
            <div className="stat">
              <div className="n">
                20<span className="g">+</span>
              </div>
              <div
                className="l"
                data-en="OHADA &amp; DGI reports built in"
                data-fr="Rapports OHADA &amp; DGI intégrés"
              >
                OHADA &amp; DGI reports built in
              </div>
            </div>
            <div className="stat">
              <div className="n">2</div>
              <div
                className="l"
                data-en="Languages — French &amp; English"
                data-fr="Langues — français &amp; anglais"
              >
                Languages — French &amp; English
              </div>
            </div>
            <div className="stat">
              <div className="n">4</div>
              <div
                className="l"
                data-en="Platforms — Android, iOS, Windows, Mac"
                data-fr="Plateformes — Android, iOS, Windows, Mac"
              >
                Platforms — Android, iOS, Windows, Mac
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ PRICING PREVIEW ============ */}
      <section className="sec" style={{ background: 'var(--canvas)' }}>
        <div className="wrap">
          <div className="shead center reveal">
            <span className="eyebrow centered" data-en="Simple pricing" data-fr="Tarifs simples">
              Simple pricing
            </span>
            <h2
              className="title"
              data-en="Start free. Grow when you're ready."
              data-fr="Commencez gratuitement. Évoluez à votre rythme."
            >
              Start free. Grow when you're ready.
            </h2>
            <p
              className="lead"
              data-en="Every paid plan comes with a 14-day free trial. No card required to start."
              data-fr="Chaque formule payante inclut 14 jours d'essai gratuit. Sans carte pour commencer."
            >
              Every paid plan comes with a 14-day free trial. No card required.
            </p>
          </div>
          <div className="plans" style={{ maxWidth: '920px', marginInline: 'auto' }}>
            <div className="plan reveal">
              <div className="pn">Free</div>
              <div
                className="pd"
                data-en="Get started with the essentials."
                data-fr="L'essentiel pour démarrer."
              >
                Get started with the essentials.
              </div>
              <div className="prow">
                <span className="amt">0</span>
                <span className="cur">FCFA</span>
              </div>
              <div className="per" data-en="Free forever" data-fr="Gratuit à vie">
                Free forever
              </div>
              <a
                className="btn btn-ghost btn-block"
                href="/download"
                data-en="Download"
                data-fr="Télécharger"
              >
                Download
              </a>
              <ul className="feats">
                <li>
                  {Check}
                  <span data-en="1 user · up to 50 products" data-fr="1 utilisateur · 50 produits">
                    1 user · up to 50 products
                  </span>
                </li>
                <li>
                  {Check}
                  <span data-en="POS &amp; daily sales" data-fr="Caisse &amp; ventes du jour">
                    POS &amp; daily sales
                  </span>
                </li>
              </ul>
            </div>
            <div className="plan reveal">
              <div className="pn">Solo</div>
              <div
                className="pd"
                data-en="For a single owner-run shop."
                data-fr="Pour une boutique tenue par le propriétaire."
              >
                For a single owner-run shop.
              </div>
              <div className="prow">
                <span className="amt">5 000</span>
                <span className="cur">FCFA</span>
              </div>
              <div className="per" data-en="per month" data-fr="par mois">
                per month
              </div>
              <a
                className="btn btn-ghost btn-block"
                href="/pricing"
                data-en="Choose Solo"
                data-fr="Choisir Solo"
              >
                Choose Solo
              </a>
              <ul className="feats">
                <li>
                  {Check}
                  <span data-en="2 users · 250 products" data-fr="2 utilisateurs · 250 produits">
                    2 users · 250 products
                  </span>
                </li>
                <li>
                  {Check}
                  <span data-en="Credit &amp; MoMo sync" data-fr="Crédit &amp; synchro MoMo">
                    Credit &amp; MoMo sync
                  </span>
                </li>
              </ul>
            </div>
            <div className="plan pop reveal">
              <div className="pn">Business</div>
              <div
                className="pd"
                data-en="For growing shops with a team."
                data-fr="Pour les commerces avec une équipe."
              >
                For growing shops with a team.
              </div>
              <div className="prow">
                <span className="amt">15 000</span>
                <span className="cur">FCFA</span>
              </div>
              <div className="per" data-en="per month" data-fr="par mois">
                per month
              </div>
              <a
                className="btn btn-primary btn-block"
                href="/pricing"
                data-en="Choose Business"
                data-fr="Choisir Business"
              >
                Choose Business
              </a>
              <ul className="feats">
                <li>
                  {Check}
                  <span
                    data-en="10 users · 1 000 products"
                    data-fr="10 utilisateurs · 1 000 produits"
                  >
                    10 users · 1 000 products
                  </span>
                </li>
                <li>
                  {Check}
                  <span data-en="OHADA &amp; DGI · roles" data-fr="OHADA &amp; DGI · rôles">
                    OHADA &amp; DGI · roles
                  </span>
                </li>
              </ul>
            </div>
            <div className="plan reveal">
              <div className="pn">Pro</div>
              <div
                className="pd"
                data-en="For multi-branch businesses."
                data-fr="Pour les entreprises multi-sites."
              >
                For multi-branch businesses.
              </div>
              <div className="prow">
                <span className="amt">35 000</span>
                <span className="cur">FCFA</span>
              </div>
              <div className="per" data-en="per month" data-fr="par mois">
                per month
              </div>
              <a
                className="btn btn-ghost btn-block"
                href="/pricing"
                data-en="Choose Pro"
                data-fr="Choisir Pro"
              >
                Choose Pro
              </a>
              <ul className="feats">
                <li>
                  {Check}
                  <span
                    data-en="Unlimited users &amp; products"
                    data-fr="Utilisateurs &amp; produits illimités"
                  >
                    Unlimited users &amp; products
                  </span>
                </li>
                <li>
                  {Check}
                  <span data-en="Multi-branch &amp; API" data-fr="Multi-sites &amp; API">
                    Multi-branch &amp; API
                  </span>
                </li>
              </ul>
            </div>
          </div>
          <div className="center" style={{ marginTop: '28px' }}>
            <a
              className="tlink"
              href="/pricing"
              data-en="Compare all plans &amp; features →"
              data-fr="Comparer toutes les formules →"
            >
              Compare all plans &amp; features →
            </a>
          </div>
        </div>
      </section>

      {/* ============ TESTIMONIALS ============ */}
      <section className="sec">
        <div className="wrap">
          <div className="shead center reveal">
            <span
              className="eyebrow centered"
              data-en="Loved by shop owners"
              data-fr="Adopté par les commerçants"
            >
              Loved by shop owners
            </span>
            <h2
              className="title"
              data-en="What business owners tell us"
              data-fr="Ce que disent les commerçants"
            >
              What business owners tell us
            </h2>
          </div>
          <div className="tgrid">
            <div className="tcard reveal">
              <div className="stars">★★★★★</div>
              <p
                className="q"
                data-en="&ldquo;The power cuts out, the network drops — BizTrack keeps taking sales. At night the report is already done. I stopped keeping a cash book.&rdquo;"
                data-fr="«&nbsp;Le courant saute, le réseau tombe — BizTrack continue d'encaisser. Le soir, le rapport est déjà prêt. J'ai arrêté le cahier de caisse.&nbsp;»"
              >
                &ldquo;The network drops — BizTrack keeps taking sales. I stopped keeping a cash
                book.&rdquo;
              </p>
              <div className="who">
                <span className="av">EM</span>
                <span>
                  <span className="nm">Estelle Mballa</span>
                  <span className="rl" data-en="Grocery · Douala" data-fr="Épicerie · Douala">
                    Grocery · Douala
                  </span>
                </span>
              </div>
            </div>
            <div className="tcard reveal">
              <div className="stars">★★★★★</div>
              <p
                className="q"
                data-en="&ldquo;Debtors used to disappear in my head. Now every credit has a due date and a WhatsApp reminder. I recovered money I'd written off.&rdquo;"
                data-fr="«&nbsp;Les créances se perdaient dans ma tête. Maintenant chaque crédit a une échéance et un rappel WhatsApp. J'ai récupéré de l'argent que j'avais abandonné.&nbsp;»"
              >
                &ldquo;Now every credit has a due date and a reminder. I recovered money I'd written
                off.&rdquo;
              </p>
              <div className="who">
                <span className="av">JT</span>
                <span>
                  <span className="nm">Jean Talla</span>
                  <span
                    className="rl"
                    data-en="Hardware · Yaoundé"
                    data-fr="Quincaillerie · Yaoundé"
                  >
                    Hardware · Yaoundé
                  </span>
                </span>
              </div>
            </div>
            <div className="tcard reveal">
              <div className="stars">★★★★★</div>
              <p
                className="q"
                data-en="&ldquo;My accountant used to charge me to sort receipts. I send her the OHADA report from the app and we're done in minutes.&rdquo;"
                data-fr="«&nbsp;Ma comptable me facturait le tri des reçus. Je lui envoie le rapport OHADA depuis l'app et c'est réglé en quelques minutes.&nbsp;»"
              >
                &ldquo;I send my accountant the OHADA report from the app and we're done in
                minutes.&rdquo;
              </p>
              <div className="who">
                <span className="av">AN</span>
                <span>
                  <span className="nm">Aïcha Ngo</span>
                  <span
                    className="rl"
                    data-en="Pharmacy · Bafoussam"
                    data-fr="Pharmacie · Bafoussam"
                  >
                    Pharmacy · Bafoussam
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ CTA BAND ============ */}
      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="cta-band reveal">
            <span
              className="eyebrow on-dark"
              data-en="Ready when you are"
              data-fr="Prêt quand vous l'êtes"
            >
              Ready when you are
            </span>
            <h2
              style={{ marginTop: '14px' }}
              data-en="Download BizTrack and run your first sale today"
              data-fr="Téléchargez BizTrack et faites votre première vente aujourd'hui"
            >
              Download BizTrack and run your first sale today
            </h2>
            <p
              data-en="Free to start, works offline, in French and English. Available on Android, iOS, Windows and Mac."
              data-fr="Gratuit au démarrage, fonctionne hors-ligne, en français et en anglais. Disponible sur Android, iOS, Windows et Mac."
            >
              Free to start, works offline, in French and English.
            </p>
            <div className="cta">
              <a
                className="btn btn-gold btn-lg"
                href="/download"
                data-en="Download free"
                data-fr="Télécharger gratuitement"
              >
                Download free
              </a>
              <a
                className="btn btn-on-dark btn-lg"
                href="/contact"
                data-en="Talk to us"
                data-fr="Nous contacter"
              >
                Talk to us
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
