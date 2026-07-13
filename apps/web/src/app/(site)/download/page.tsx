import type { Metadata } from 'next'
import { siteHtml } from '../_chrome/body'

export const metadata: Metadata = {
  title: 'Download BizTrack CM — Android, iOS, Windows & Mac',
  description:
    'Download BizTrack CM free for Android (Google Play or direct APK), iOS, Windows and macOS. Offline-first POS & business management for Cameroonian shops. Works without internet.',
  alternates: { canonical: '/download' },
  openGraph: {
    title: 'Download BizTrack CM',
    description: 'Free for Android, iOS, Windows & Mac. Offline-first POS for Cameroon shops.',
    url: '/download',
    images: ['/site/img/app-m-home.png'],
  },
}

// Branded desktop download → API redirect to the latest Windows installer
// (GET /api/v1/download/desktop). Uses the configured API base so staging/prod differ.
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1').replace(
  /\/$/,
  '',
)
const DESKTOP_DL = `${API_BASE}/download/desktop`

const BODY = `
  <section class="page-hero">
    <div class="wrap">
      <div class="crumb"><a href="index.html" data-en="Home" data-fr="Accueil">Home</a><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg><span data-en="Download" data-fr="Télécharger">Download</span></div>
      <span class="eyebrow on-dark" data-en="Download" data-fr="Télécharger">Download</span>
      <h1 data-en="Get BizTrack on every device" data-fr="BizTrack sur tous vos appareils">Get BizTrack on every device</h1>
      <p data-en="Free to start, works offline, in French and English. Install on the phone at the counter and the computer in the back office — everything stays in sync." data-fr="Gratuit au démarrage, fonctionne hors-ligne, en français et en anglais. Installez sur le téléphone au comptoir et l'ordinateur au bureau — tout reste synchronisé.">Free to start, works offline, in French and English — synced across your devices.</p>
    </div>
  </section>

  <section class="sec">
    <div class="wrap">
      <div class="dl-grid">
        <div class="dl-card reveal">
          <span class="tag-pill" data-en="Most popular" data-fr="Le plus utilisé">Most popular</span>
          <div class="os-ic"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 9.5 19 7a.5.5 0 0 0-.9-.5l-1.4 2.5A8.7 8.7 0 0 0 12 8c-1.7 0-3.3.4-4.7 1L5.9 6.5A.5.5 0 0 0 5 7l1.4 2.5C4 11 2.5 13.6 2.5 16.5h19c0-2.9-1.5-5.5-3.9-7ZM7.5 14a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm9 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg></div>
          <h3>Android</h3>
          <div class="meta" data-en="Android 8.0+ · 38 MB" data-fr="Android 8.0+ · 38 Mo">Android 8.0+ · 38 MB</div>
          <p data-en="The full app for phones and tablets. Get it on Google Play, or download the APK directly if you're outside the store." data-fr="L'app complète pour téléphones et tablettes. Sur Google Play, ou téléchargez l'APK directement hors du store.">The full app for phones and tablets — Google Play or direct APK.</p>
          <div class="badge-row">
            <a class="store-badge" href="#"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 3.5v17a1 1 0 0 0 1.5.87l14-8.5a1 1 0 0 0 0-1.74l-14-8.5A1 1 0 0 0 5 3.5Z"/></svg><span><span class="sb-t" data-en="Get it on" data-fr="Disponible sur">Get it on</span><span class="sb-b">Google Play</span></span></a>
            <a class="store-badge" href="#" style="background:var(--gold);color:var(--navy-900)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16"/></svg><span><span class="sb-t" style="opacity:.7" data-en="Direct download" data-fr="Téléchargement direct">Direct download</span><span class="sb-b" data-en="APK · v1.0" data-fr="APK · v1.0">APK · v1.0</span></span></a>
          </div>
        </div>
        <div class="dl-card reveal">
          <span class="tag-pill" data-en="For iPhone &amp; iPad" data-fr="Pour iPhone &amp; iPad">For iPhone & iPad</span>
          <div class="os-ic"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.4 12.9c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2-.05 1.6-.75 3-.75s1.8.75 3 .72c1.2-.02 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6-.03-.02-2.5-1-2.5-3.8ZM14.2 5.6c.65-.8 1.1-1.9 1-3-1 .04-2.1.66-2.8 1.45-.6.7-1.15 1.83-1 2.9 1.05.08 2.15-.55 2.8-1.35Z"/></svg></div>
          <h3>iOS</h3>
          <div class="meta" data-en="iOS 14+ · iPhone &amp; iPad" data-fr="iOS 14+ · iPhone &amp; iPad">iOS 14+ · iPhone & iPad</div>
          <p data-en="Native iPhone and iPad app with the same offline-first sync. Download from the App Store." data-fr="App iPhone et iPad native avec la même synchro hors-ligne. Téléchargez depuis l'App Store.">Native iPhone and iPad app with the same offline-first sync.</p>
          <div class="badge-row">
            <a class="store-badge" href="#"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.4 12.9c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2-.05 1.6-.75 3-.75s1.8.75 3 .72c1.2-.02 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6-.03-.02-2.5-1-2.5-3.8ZM14.2 5.6c.65-.8 1.1-1.9 1-3-1 .04-2.1.66-2.8 1.45-.6.7-1.15 1.83-1 2.9 1.05.08 2.15-.55 2.8-1.35Z"/></svg><span><span class="sb-t" data-en="Download on the" data-fr="Télécharger sur l'">Download on the</span><span class="sb-b">App Store</span></span></a>
          </div>
        </div>
        <div class="dl-card reveal">
          <span class="tag-pill" data-en="Back office" data-fr="Back-office">Back office</span>
          <div class="os-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg></div>
          <h3 data-en="Windows &amp; Mac" data-fr="Windows &amp; Mac">Windows & Mac</h3>
          <div class="meta" data-en="Windows 10+ · macOS 11+" data-fr="Windows 10+ · macOS 11+">Windows 10+ · macOS 11+</div>
          <p data-en="The desktop app for managing products, reviewing reports and running the back office on a bigger screen." data-fr="L'app bureau pour gérer les produits, consulter les rapports et tenir le back-office sur grand écran.">Manage products and review reports on a bigger screen.</p>
          <div class="badge-row">
            <a class="store-badge" href="${DESKTOP_DL}"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 5.6 10.4 4.6v7.1H3V5.6Zm0 12.8 7.4 1v-7H3v6ZM11.3 4.5 21 3v8.7h-9.7V4.5Zm0 7.9H21V21l-9.7-1.35v-7.25Z"/></svg><span><span class="sb-t" data-en="Download for" data-fr="Télécharger pour">Download for</span><span class="sb-b">Windows</span></span></a>
            <a class="store-badge" href="#"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.4 12.9c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2-.05 1.6-.75 3-.75s1.8.75 3 .72c1.2-.02 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6-.03-.02-2.5-1-2.5-3.8ZM14.2 5.6c.65-.8 1.1-1.9 1-3-1 .04-2.1.66-2.8 1.45-.6.7-1.15 1.83-1 2.9 1.05.08 2.15-.55 2.8-1.35Z"/></svg><span><span class="sb-t" data-en="Download for" data-fr="Télécharger pour">Download for</span><span class="sb-b">macOS</span></span></a>
          </div>
        </div>
      </div>

      <div class="apk-row reveal">
        <div class="qr" aria-hidden="true"><svg viewBox="0 0 100 100" fill="none"><rect width="100" height="100" fill="#fff"/><g fill="#0F2C52"><rect x="8" y="8" width="24" height="24"/><rect x="14" y="14" width="12" height="12" fill="#fff"/><rect x="17" y="17" width="6" height="6" fill="#0F2C52"/><rect x="68" y="8" width="24" height="24"/><rect x="74" y="14" width="12" height="12" fill="#fff"/><rect x="77" y="17" width="6" height="6" fill="#0F2C52"/><rect x="8" y="68" width="24" height="24"/><rect x="14" y="74" width="12" height="12" fill="#fff"/><rect x="17" y="77" width="6" height="6" fill="#0F2C52"/><rect x="40" y="10" width="6" height="6"/><rect x="50" y="10" width="6" height="6"/><rect x="40" y="20" width="6" height="6"/><rect x="56" y="20" width="6" height="6"/><rect x="40" y="40" width="6" height="6"/><rect x="52" y="40" width="6" height="6"/><rect x="64" y="40" width="6" height="6"/><rect x="76" y="42" width="6" height="6"/><rect x="86" y="44" width="6" height="6"/><rect x="44" y="52" width="6" height="6"/><rect x="58" y="54" width="6" height="6"/><rect x="70" y="56" width="6" height="6"/><rect x="82" y="58" width="6" height="6"/><rect x="42" y="66" width="6" height="6"/><rect x="54" y="70" width="6" height="6"/><rect x="66" y="72" width="6" height="6"/><rect x="78" y="74" width="6" height="6"/><rect x="88" y="76" width="6" height="6"/><rect x="46" y="84" width="6" height="6"/><rect x="60" y="86" width="6" height="6"/><rect x="72" y="88" width="6" height="6"/><rect x="84" y="88" width="6" height="6"/></g></svg></div>
        <div style="flex:1;min-width:220px">
          <h3 style="font-size:18px" data-en="Scan to install on Android" data-fr="Scannez pour installer sur Android">Scan to install on Android</h3>
          <p style="font-size:13.5px;color:var(--text-2);margin-top:6px" data-en="Point your phone camera at the code to download the APK directly — handy for outfitting a shop full of devices." data-fr="Pointez l'appareil photo vers le code pour télécharger l'APK directement — pratique pour équiper toute une boutique.">Point your phone camera at the code to download the APK directly.</p>
        </div>
        <a class="btn btn-primary" href="#"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16"/></svg><span data-en="Download APK" data-fr="Télécharger l'APK">Download APK</span></a>
      </div>
      <p class="center" style="margin-top:18px;font-size:13px;color:var(--text-muted)" data-en="Mobile &amp; store links arrive with the mobile launch. Need a hand rolling out to your team? " data-fr="Les liens mobiles &amp; stores arrivent avec le lancement mobile. Besoin d'aide pour équiper votre équipe ? "><a class="tlink" href="contact.html" data-en="Contact us" data-fr="Contactez-nous">Contact us</a></p>
    </div>
  </section>

  <section class="sec" style="background:var(--canvas)">
    <div class="wrap">
      <div class="shead center reveal"><span class="eyebrow centered" data-en="Getting started" data-fr="Prise en main">Getting started</span>
        <h2 class="title" data-en="Selling in three steps" data-fr="Vendez en trois étapes">Selling in three steps</h2></div>
      <div class="fgrid" style="max-width:960px;margin-inline:auto">
        <div class="fcard reveal"><div class="ic" style="font-family:var(--font-sora);font-weight:700;font-size:20px">1</div>
          <h3 data-en="Install &amp; create your shop" data-fr="Installez &amp; créez votre commerce">Install & create your shop</h3>
          <p data-en="Download, sign up with your phone number, and set up your business in a couple of minutes." data-fr="Téléchargez, inscrivez-vous avec votre numéro et configurez votre commerce en quelques minutes.">Download, sign up with your phone, set up in minutes.</p></div>
        <div class="fcard reveal"><div class="ic" style="font-family:var(--font-sora);font-weight:700;font-size:20px">2</div>
          <h3 data-en="Add your products" data-fr="Ajoutez vos produits">Add your products</h3>
          <p data-en="Enter products by hand or import a list. Set prices, stock levels and categories." data-fr="Saisissez vos produits ou importez une liste. Définissez prix, stocks et catégories.">Enter or import products, prices and stock.</p></div>
        <div class="fcard reveal"><div class="ic" style="font-family:var(--font-sora);font-weight:700;font-size:20px">3</div>
          <h3 data-en="Start selling" data-fr="Commencez à vendre">Start selling</h3>
          <p data-en="Ring up your first sale, take MoMo or cash, and watch your dashboard come to life." data-fr="Encaissez votre première vente, prenez MoMo ou espèces, et voyez votre tableau de bord s'animer.">Ring up your first sale and watch the dashboard fill.</p></div>
      </div>
    </div>
  </section>
`

export default function DownloadPage() {
  return <div dangerouslySetInnerHTML={{ __html: siteHtml(BODY) }} />
}
