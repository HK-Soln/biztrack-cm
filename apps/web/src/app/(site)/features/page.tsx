import type { Metadata } from 'next'
import { siteHtml } from '../_chrome/body'

export const metadata: Metadata = {
  title: 'Features — BizTrack CM · POS, inventory, credit & OHADA reports',
  description:
    'Explore every BizTrack CM feature: fast point of sale, live inventory, credit & debtor tracking, MTN MoMo & Orange Money, OHADA/DGI reports, team roles and offline-first sync — for shops across Cameroon.',
  alternates: { canonical: '/features' },
  openGraph: {
    title: 'Features — BizTrack CM',
    description:
      'Fast POS, live inventory, credit tracking, MoMo & Orange Money, OHADA reports — offline-first, bilingual.',
    url: '/features',
    images: ['/site/img/app-desktop-sell.png'],
  },
}

const BODY = `
  <section class="page-hero">
    <div class="wrap">
      <div class="crumb"><a href="index.html" data-en="Home" data-fr="Accueil">Home</a><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg><span data-en="Features" data-fr="Fonctionnalités">Features</span></div>
      <span class="eyebrow on-dark" data-en="Features" data-fr="Fonctionnalités">Features</span>
      <h1 data-en="Everything your shop needs, nothing it doesn't" data-fr="Tout ce dont votre commerce a besoin, rien de superflu">Everything your shop needs, nothing it doesn't</h1>
      <p data-en="BizTrack replaces the cash book, the stock notebook, the debtors list and the spreadsheet — with one offline-first app that speaks your language and your accounting rules." data-fr="BizTrack remplace le cahier de caisse, le carnet de stock, la liste des créances et le tableur — par une seule app hors-ligne qui parle votre langue et vos règles comptables.">One offline-first app that replaces the cash book, the stock notebook and the spreadsheet.</p>
    </div>
  </section>

  <section class="sec">
    <div class="wrap">
      <div class="fgrid">
        <div class="fcard reveal"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h11v8H4zM15 10h4l1 3v2h-6z"/><circle cx="8" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg></div>
          <h3 data-en="Point of sale" data-fr="Point de vente">Point of sale</h3>
          <p data-en="Scan or tap to add items, apply discounts and charges, choose a customer, and split payment across cash, MoMo and Orange Money." data-fr="Scannez ou touchez pour ajouter, appliquez remises et frais, choisissez un client, et répartissez le paiement entre espèces, MoMo et Orange Money.">Scan or tap, split payments, and check out in seconds.</p></div>
        <div class="fcard reveal"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3ZM3 7.5 12 12l9-4.5M12 12v9"/></svg></div>
          <h3 data-en="Inventory &amp; stock" data-fr="Inventaire &amp; stock">Inventory & stock</h3>
          <p data-en="Products with variants, units of measure, categories and brands. Counts adjust automatically on sales, restocks and transfers." data-fr="Produits avec variantes, unités de mesure, catégories et marques. Les quantités s'ajustent automatiquement aux ventes, réapprovisionnements et transferts.">Variants, units, categories — counts adjust automatically.</p></div>
        <div class="fcard reveal"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2v3m0 14v3M5 12H2m20 0h-3"/><circle cx="12" cy="12" r="4.5"/></svg></div>
          <h3 data-en="Low-stock alerts" data-fr="Alertes de rupture">Low-stock alerts</h3>
          <p data-en="Set reorder points per product and get warned before you run out — with suggested reorder quantities from your sales pace." data-fr="Définissez un seuil par produit et soyez alerté avant la rupture — avec des quantités suggérées selon votre rythme de vente.">Reorder points and suggested quantities so nothing runs out.</p></div>
        <div class="fcard gold reveal"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></svg></div>
          <h3 data-en="Credit &amp; debtors" data-fr="Crédit &amp; créances">Credit & debtors</h3>
          <p data-en="Sell on credit, set due dates, record part-payments, and send WhatsApp reminders. Track supplier payables the same way." data-fr="Vendez à crédit, fixez des échéances, enregistrez les acomptes et envoyez des rappels WhatsApp. Suivez les dettes fournisseurs pareillement.">Due dates, part-payments and WhatsApp reminders.</p></div>
        <div class="fcard reveal"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-7"/></svg></div>
          <h3 data-en="Reports &amp; OHADA" data-fr="Rapports &amp; OHADA">Reports & OHADA</h3>
          <p data-en="20+ reports: daily sales, sales by product, P&amp;L, balance sheet, VAT payable, stock valuation, cashier performance and more." data-fr="Plus de 20 rapports : ventes du jour, ventes par produit, résultat, bilan, TVA à payer, valorisation des stocks, performance caissiers et plus.">20+ reports in OHADA & DGI format, ready to export.</p></div>
        <div class="fcard reveal"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M15 15.2c3 .3 5 2 5 4.8"/></svg></div>
          <h3 data-en="Team &amp; roles" data-fr="Équipe &amp; rôles">Team & roles</h3>
          <p data-en="Owner, manager, cashier and accountant roles with granular permissions and a full audit log of every action." data-fr="Rôles propriétaire, gérant, caissier et comptable avec permissions fines et journal d'audit complet.">Granular permissions and a full activity log.</p></div>
        <div class="fcard reveal"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2h9l3 3v17H6zM15 2v4h4M9 12h6M9 16h6"/></svg></div>
          <h3 data-en="Receipts &amp; invoices" data-fr="Reçus &amp; factures">Receipts & invoices</h3>
          <p data-en="Print to a thermal printer or send by SMS and WhatsApp. Branded receipts with your shop name, logo and contact." data-fr="Imprimez sur une imprimante thermique ou envoyez par SMS et WhatsApp. Reçus personnalisés à votre nom, logo et contact.">Print thermal or send by SMS & WhatsApp, fully branded.</p></div>
        <div class="fcard reveal"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7h18v12H3zM7 3v4M17 3v4M3 11h18"/></svg></div>
          <h3 data-en="Expenses &amp; deposits" data-fr="Dépenses &amp; acomptes">Expenses & deposits</h3>
          <p data-en="Log expenses against categories, and take customer deposits and pre-orders — all flowing into your P&amp;L and cash position." data-fr="Enregistrez les dépenses par catégorie et prenez acomptes et précommandes — le tout alimentant votre résultat et votre trésorerie.">Track expenses, deposits and pre-orders in one flow.</p></div>
        <div class="fcard gold reveal"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/><path d="m3 3 18 18" opacity=".8"/></svg></div>
          <h3 data-en="Offline &amp; sync" data-fr="Hors-ligne &amp; synchro">Offline & sync</h3>
          <p data-en="Everything is stored on the device and synced across your phones, tablets and desktops the moment a connection returns." data-fr="Tout est stocké sur l'appareil et synchronisé entre vos téléphones, tablettes et ordinateurs dès le retour de la connexion.">On-device storage that syncs across all your devices.</p></div>
      </div>
    </div>
  </section>

  <section class="sec" style="background:var(--canvas)">
    <div class="wrap">
      <div class="split reveal">
        <div class="scopy">
          <span class="eyebrow" data-en="Sell" data-fr="Vendre">Sell</span>
          <h3 style="margin-top:14px" data-en="A till built for speed and split payments" data-fr="Une caisse pensée pour la vitesse et le paiement mixte">A till built for speed and split payments</h3>
          <p data-en="Cameroon runs on Mobile Money and cash together. BizTrack lets you take part MoMo, part cash, part Orange Money on a single sale — and it all reconciles in your reports." data-fr="Le Cameroun fonctionne avec le Mobile Money et les espèces ensemble. BizTrack permet de prendre une partie MoMo, une partie espèces, une partie Orange Money sur une seule vente — et tout se rapproche dans les rapports.">Take part MoMo, part cash, part Orange Money on a single sale.</p>
          <ul class="flist">
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="Barcode scanning &amp; quick search" data-fr="Scan de code-barres &amp; recherche rapide">Barcode scanning & quick search</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="Held sales &amp; multiple open tickets" data-fr="Ventes en attente &amp; tickets multiples">Held sales & multiple open tickets</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="Custom charges, discounts &amp; tax" data-fr="Frais, remises &amp; taxe personnalisés">Custom charges, discounts & tax</span></li>
          </ul>
        </div>
        <div class="shot-wrap reveal"><div class="shot"><img src="img/app-m-sell.png" alt="BizTrack CM mobile point-of-sale with product grid" style="max-width:300px;margin:auto"/></div></div>
      </div>

      <div class="split rev reveal">
        <div class="scopy">
          <span class="eyebrow" data-en="Report" data-fr="Rapports">Report</span>
          <h3 style="margin-top:14px" data-en="Financial statements without an accountant on staff" data-fr="Des états financiers sans comptable en interne">Financial statements without an accountant on staff</h3>
          <p data-en="Overview KPIs at the top, then drill into any of 20+ reports — sales, inventory, and full OHADA financial statements. Print or export to PDF and CSV for your accountant or the DGI." data-fr="Les KPI en haut, puis explorez plus de 20 rapports — ventes, stock et états financiers OHADA complets. Imprimez ou exportez en PDF et CSV pour votre comptable ou la DGI.">Drill into 20+ reports and export for your accountant or the DGI.</p>
          <ul class="flist">
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="P&amp;L, balance sheet &amp; VAT payable" data-fr="Résultat, bilan &amp; TVA à payer">P&L, balance sheet & VAT payable</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="Stock valuation &amp; turnover" data-fr="Valorisation &amp; rotation des stocks">Stock valuation & turnover</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="Cashier performance &amp; refunds" data-fr="Performance caissiers &amp; remboursements">Cashier performance & refunds</span></li>
          </ul>
        </div>
        <div class="shot-wrap reveal"><div class="shot"><img src="img/app-reports.png" alt="BizTrack CM reports centre" /></div></div>
      </div>
    </div>
  </section>

  <section class="sec">
    <div class="wrap"><div class="cta-band reveal">
      <span class="eyebrow on-dark" data-en="One account, every device" data-fr="Un compte, tous vos appareils">One account, every device</span>
      <h2 style="margin-top:14px" data-en="Android in the shop, desktop in the back office" data-fr="Android au comptoir, ordinateur au bureau">Android in the shop, desktop in the back office</h2>
      <p data-en="The same business, in sync across Android, iOS, Windows and Mac. Cashiers sell on a phone or tablet; you review reports on a laptop." data-fr="La même activité, synchronisée sur Android, iOS, Windows et Mac. Les caissiers vendent sur téléphone ou tablette ; vous consultez les rapports sur ordinateur.">The same business in sync across Android, iOS, Windows and Mac.</p>
      <div class="cta">
        <a class="btn btn-gold btn-lg" href="/contact" data-en="Download BizTrack" data-fr="Télécharger BizTrack">Download BizTrack</a>
        <a class="btn btn-on-dark btn-lg" href="pricing.html" data-en="See pricing" data-fr="Voir les tarifs">See pricing</a>
      </div>
    </div></div>
  </section>
`

export default function FeaturesPage() {
  return <div dangerouslySetInnerHTML={{ __html: siteHtml(BODY) }} />
}
