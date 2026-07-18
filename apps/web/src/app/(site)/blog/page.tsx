import type { Metadata } from 'next'
import { siteHtml } from '../_chrome/body'

export const metadata: Metadata = {
  title: 'Blog & news — BizTrack CM · Tips for Cameroonian shop owners',
  description:
    'News, product updates and practical guides for running a shop in Cameroon: Mobile Money bookkeeping, managing credit, OHADA basics, inventory tips and BizTrack releases.',
  alternates: { canonical: '/blog' },
  openGraph: {
    title: 'BizTrack CM — Blog & news',
    description: 'Product updates and practical guides for Cameroonian shop owners.',
    url: '/blog',
  },
}

const BODY = `
  <section class="page-hero">
    <div class="wrap">
      <div class="crumb"><a href="index.html" data-en="Home" data-fr="Accueil">Home</a><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg><span data-en="Blog" data-fr="Blog">Blog</span></div>
      <span class="eyebrow on-dark" data-en="Blog &amp; news" data-fr="Blog &amp; actualités">Blog & news</span>
      <h1 data-en="Ideas for running a better shop" data-fr="Des idées pour mieux gérer votre commerce">Ideas for running a better shop</h1>
      <p data-en="Product updates, and practical guides on Mobile Money bookkeeping, credit, inventory and OHADA — written for Cameroonian business owners." data-fr="Nouveautés produit et guides pratiques sur la comptabilité Mobile Money, le crédit, le stock et l'OHADA — pour les commerçants camerounais.">Product updates and practical guides for Cameroonian business owners.</p>
    </div>
  </section>

  <section class="sec">
    <div class="wrap">
      <div class="blog-grid">
        <article class="post feature reveal">
          <div class="thumb"><span class="cat" data-en="Announcement" data-fr="Annonce">Announcement</span><span class="ph">image · article cover</span></div>
          <div class="pbody">
            <span class="pdate" data-en="15 June 2026 · 4 min read" data-fr="15 juin 2026 · 4 min de lecture">15 June 2026 · 4 min read</span>
            <h3 style="font-size:24px" data-en="BizTrack CM is live — run your shop, simply" data-fr="BizTrack CM est lancé — gérez votre commerce, simplement">BizTrack CM is live — run your shop, simply</h3>
            <p data-en="After months of building alongside real shop owners in Douala and Yaoundé, BizTrack CM is officially available on Android, iOS, Windows and Mac. Here's what's inside, and where we're headed next." data-fr="Après des mois de développement aux côtés de vrais commerçants à Douala et Yaoundé, BizTrack CM est officiellement disponible sur Android, iOS, Windows et Mac. Voici ce qu'il contient et la suite du programme.">BizTrack CM is officially available on Android, iOS, Windows and Mac. Here's what's inside.</p>
            <a class="rm" href="#" data-en="Read the announcement" data-fr="Lire l'annonce">Read the announcement <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></a>
          </div>
        </article>

        <article class="post reveal"><div class="thumb"><span class="cat" data-en="Guide" data-fr="Guide">Guide</span><span class="ph">image · cover</span></div>
          <div class="pbody"><span class="pdate">10 June 2026 · 6 min</span>
            <h3 data-en="Keeping clean books when half your sales are MoMo" data-fr="Tenir des comptes propres quand la moitié des ventes sont en MoMo">Keeping clean books when half your sales are MoMo</h3>
            <p data-en="A simple system for reconciling Mobile Money and cash at the end of each day — without a headache." data-fr="Un système simple pour rapprocher Mobile Money et espèces en fin de journée — sans prise de tête.">Reconcile Mobile Money and cash at day's end — without the headache.</p>
            <a class="rm" href="#" data-en="Read guide" data-fr="Lire le guide">Read guide <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></a></div></article>

        <article class="post reveal"><div class="thumb"><span class="cat" data-en="Credit" data-fr="Crédit">Credit</span><span class="ph">image · cover</span></div>
          <div class="pbody"><span class="pdate">3 June 2026 · 5 min</span>
            <h3 data-en="Stop losing money to forgotten debts" data-fr="Arrêtez de perdre de l'argent avec les dettes oubliées">Stop losing money to forgotten debts</h3>
            <p data-en="Selling on credit is normal here — but untracked credit quietly drains your cash. Here's how to fix it." data-fr="Vendre à crédit est normal ici — mais un crédit non suivi vide discrètement votre trésorerie. Voici comment y remédier.">Untracked credit quietly drains your cash. Here's how to fix it.</p>
            <a class="rm" href="#" data-en="Read guide" data-fr="Lire le guide">Read guide <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></a></div></article>

        <article class="post reveal"><div class="thumb"><span class="cat" data-en="OHADA" data-fr="OHADA">OHADA</span><span class="ph">image · cover</span></div>
          <div class="pbody"><span class="pdate">28 May 2026 · 7 min</span>
            <h3 data-en="OHADA basics every shop owner should know" data-fr="Les bases de l'OHADA que tout commerçant devrait connaître">OHADA basics every shop owner should know</h3>
            <p data-en="What the DGI expects, which statements matter, and how BizTrack produces them automatically." data-fr="Ce qu'attend la DGI, quels états comptent, et comment BizTrack les produit automatiquement.">What the DGI expects and how BizTrack produces it automatically.</p>
            <a class="rm" href="#" data-en="Read guide" data-fr="Lire le guide">Read guide <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></a></div></article>

        <article class="post reveal"><div class="thumb"><span class="cat" data-en="Inventory" data-fr="Stock">Inventory</span><span class="ph">image · cover</span></div>
          <div class="pbody"><span class="pdate">20 May 2026 · 5 min</span>
            <h3 data-en="Never run out of your best sellers again" data-fr="Ne soyez plus jamais en rupture sur vos meilleures ventes">Never run out of your best sellers again</h3>
            <p data-en="Set reorder points that match your real sales pace, and let the app warn you before stock-outs." data-fr="Définissez des seuils adaptés à votre rythme de vente réel, et laissez l'app vous alerter avant la rupture.">Set reorder points to your real sales pace and get warned early.</p>
            <a class="rm" href="#" data-en="Read guide" data-fr="Lire le guide">Read guide <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></a></div></article>

        <article class="post reveal"><div class="thumb"><span class="cat" data-en="Product" data-fr="Produit">Product</span><span class="ph">image · cover</span></div>
          <div class="pbody"><span class="pdate">12 May 2026 · 3 min</span>
            <h3 data-en="What's new: faster checkout &amp; WhatsApp receipts" data-fr="Nouveautés : caisse plus rapide &amp; reçus WhatsApp">What's new: faster checkout & WhatsApp receipts</h3>
            <p data-en="A round-up of the latest improvements shipped to BizTrack this month." data-fr="Un récapitulatif des dernières améliorations livrées dans BizTrack ce mois-ci.">A round-up of the latest improvements shipped this month.</p>
            <a class="rm" href="#" data-en="Read update" data-fr="Lire la note">Read update <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></a></div></article>
      </div>

      <div class="apk-row reveal" style="margin-top:44px;justify-content:space-between">
        <div style="flex:1;min-width:240px">
          <h3 style="font-size:19px" data-en="Get shop-growth tips in your inbox" data-fr="Recevez nos conseils par email">Get shop-growth tips in your inbox</h3>
          <p style="font-size:13.5px;color:var(--text-2);margin-top:6px" data-en="One short, practical email a month. No spam — unsubscribe anytime." data-fr="Un email court et pratique par mois. Pas de spam — désabonnement à tout moment.">One short, practical email a month. No spam.</p>
        </div>
        <form style="display:flex;gap:10px;flex-wrap:wrap;flex:1;min-width:260px">
          <input type="email" required data-ph-en="you@example.com" data-ph-fr="vous@exemple.com" placeholder="you@example.com" style="flex:1;min-width:180px;height:48px;border-radius:11px;border:1.5px solid var(--border);background:#fff;padding:0 14px;font:inherit;font-size:14.5px;outline:none" />
          <button class="btn btn-primary" type="submit" data-en="Subscribe" data-fr="S'inscrire">Subscribe</button>
        </form>
      </div>
    </div>
  </section>
`

export default function BlogPage() {
  return <div dangerouslySetInnerHTML={{ __html: siteHtml(BODY) }} />
}
