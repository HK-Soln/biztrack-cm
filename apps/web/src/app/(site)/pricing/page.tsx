import type { Metadata } from 'next'
import { siteHtml } from '../_chrome/body'

export const metadata: Metadata = {
  title: 'Pricing — BizTrack CM · Free, Solo, Business & Pro plans in FCFA',
  description:
    'BizTrack CM pricing in FCFA: start free, then Solo (5 000/mo), Business (15 000/mo) or Pro (35 000/mo). Save 2 months on annual billing. 14-day free trial on every paid plan.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Pricing — BizTrack CM',
    description:
      'Start free, then Solo, Business or Pro. 14-day free trial, save 2 months on annual.',
    url: '/pricing',
    images: ['/site/img/app-desktop-dash.png'],
  },
}

const productJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'BizTrack CM',
  description: 'Offline-first POS & business management for Cameroon shops.',
  brand: { '@type': 'Brand', name: 'BizTrack CM' },
  offers: [
    { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'XAF' },
    { '@type': 'Offer', name: 'Solo', price: '5000', priceCurrency: 'XAF' },
    { '@type': 'Offer', name: 'Business', price: '15000', priceCurrency: 'XAF' },
    { '@type': 'Offer', name: 'Pro', price: '35000', priceCurrency: 'XAF' },
  ],
}

const BODY = `
  <section class="page-hero">
    <div class="wrap">
      <div class="crumb"><a href="index.html" data-en="Home" data-fr="Accueil">Home</a><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg><span data-en="Pricing" data-fr="Tarifs">Pricing</span></div>
      <span class="eyebrow on-dark" data-en="Pricing" data-fr="Tarifs">Pricing</span>
      <h1 data-en="Fair pricing, in FCFA" data-fr="Des tarifs justes, en FCFA">Fair pricing, in FCFA</h1>
      <p data-en="Start free and stay free for the basics. Upgrade only when your shop grows. Every paid plan includes a 14-day free trial — no card required." data-fr="Commencez gratuitement et restez-le pour l'essentiel. Passez à une formule supérieure quand votre commerce grandit. Chaque formule payante inclut 14 jours d'essai — sans carte.">Start free. Upgrade only when your shop grows. 14-day free trial on every paid plan.</p>
    </div>
  </section>

  <section class="sec">
    <div class="wrap">
      <div class="price-toggle center" style="display:flex">
        <div class="price-seg" data-price-seg>
          <button data-cycle="mo" class="on" data-en="Monthly" data-fr="Mensuel">Monthly</button>
          <button data-cycle="yr" data-en="Annual" data-fr="Annuel">Annual <span class="save-tag" data-en="save 2 months" data-fr="−2 mois">save 2 months</span></button>
        </div>
      </div>

      <div class="plans">
        <div class="plan reveal">
          <div class="pn">Free</div>
          <div class="pd" data-en="Get started with the essentials." data-fr="L'essentiel pour démarrer.">Get started with the essentials.</div>
          <div class="prow"><span class="amt" data-mo="0" data-yr="0">0</span><span class="cur">FCFA</span></div>
          <div class="per" data-en="Free forever" data-fr="Gratuit à vie">Free forever</div>
          <a class="btn btn-ghost btn-block" href="download.html" data-en="Download" data-fr="Télécharger">Download</a>
          <div class="note" data-en="Includes:" data-fr="Inclut :">Includes:</div>
          <ul class="feats">
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="1 user account" data-fr="1 compte utilisateur">1 user account</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="Up to 50 products" data-fr="Jusqu'à 50 produits">Up to 50 products</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="POS &amp; daily sales" data-fr="Caisse &amp; ventes du jour">POS & daily sales</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="Basic sales report" data-fr="Rapport de ventes de base">Basic sales report</span></li>
          </ul>
        </div>
        <div class="plan reveal">
          <div class="pn">Solo</div>
          <div class="pd" data-en="For a single owner-run shop." data-fr="Pour une boutique tenue par le propriétaire.">For a single owner-run shop.</div>
          <div class="prow"><span class="amt" data-mo="5 000" data-yr="50 000">5 000</span><span class="cur">FCFA</span></div>
          <div class="per" data-per-mo data-per-mo-en="per month" data-per-yr-en="per year · save 10 000" data-per-mo-fr="par mois" data-per-yr-fr="par an · économisez 10 000" data-en="per month" data-fr="par mois">per month</div>
          <a class="btn btn-ghost btn-block" href="download.html" data-en="Start free trial" data-fr="Essai gratuit">Start free trial</a>
          <div class="note" data-en="Everything in Free, plus:" data-fr="Tout de Free, plus :">Everything in Free, plus:</div>
          <ul class="feats">
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="2 user accounts" data-fr="2 comptes utilisateurs">2 user accounts</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="Up to 250 products" data-fr="Jusqu'à 250 produits">Up to 250 products</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="Credit &amp; debtors tracking" data-fr="Suivi crédit &amp; créances">Credit & debtors tracking</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="Mobile Money (MoMo) sync" data-fr="Synchro Mobile Money (MoMo)">Mobile Money (MoMo) sync</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="Receipts by SMS &amp; WhatsApp" data-fr="Reçus par SMS &amp; WhatsApp">Receipts by SMS & WhatsApp</span></li>
          </ul>
        </div>
        <div class="plan pop reveal">
          <div class="pn">Business</div>
          <div class="pd" data-en="For growing shops with a team." data-fr="Pour les commerces avec une équipe.">For growing shops with a team.</div>
          <div class="prow"><span class="amt" data-mo="15 000" data-yr="150 000">15 000</span><span class="cur">FCFA</span></div>
          <div class="per" data-per-mo data-per-mo-en="per month" data-per-yr-en="per year · save 30 000" data-per-mo-fr="par mois" data-per-yr-fr="par an · économisez 30 000" data-en="per month" data-fr="par mois">per month</div>
          <a class="btn btn-primary btn-block" href="download.html" data-en="Start free trial" data-fr="Essai gratuit">Start free trial</a>
          <div class="note" data-en="Everything in Solo, plus:" data-fr="Tout de Solo, plus :">Everything in Solo, plus:</div>
          <ul class="feats">
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="10 user accounts" data-fr="10 comptes utilisateurs">10 user accounts</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="Up to 1 000 products" data-fr="Jusqu'à 1 000 produits">Up to 1 000 products</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="Roles &amp; permissions" data-fr="Rôles &amp; permissions">Roles & permissions</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="OHADA &amp; DGI statements" data-fr="États OHADA &amp; DGI">OHADA & DGI statements</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="Deposits &amp; pre-orders" data-fr="Acomptes &amp; précommandes">Deposits & pre-orders</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="Expense tracking" data-fr="Suivi des dépenses">Expense tracking</span></li>
          </ul>
        </div>
        <div class="plan reveal">
          <div class="pn">Pro</div>
          <div class="pd" data-en="For multi-branch businesses." data-fr="Pour les entreprises multi-sites.">For multi-branch businesses.</div>
          <div class="prow"><span class="amt" data-mo="35 000" data-yr="350 000">35 000</span><span class="cur">FCFA</span></div>
          <div class="per" data-per-mo data-per-mo-en="per month" data-per-yr-en="per year · save 70 000" data-per-mo-fr="par mois" data-per-yr-fr="par an · économisez 70 000" data-en="per month" data-fr="par mois">per month</div>
          <a class="btn btn-ghost btn-block" href="contact.html" data-en="Contact sales" data-fr="Contacter l'équipe">Contact sales</a>
          <div class="note" data-en="Everything in Business, plus:" data-fr="Tout de Business, plus :">Everything in Business, plus:</div>
          <ul class="feats">
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="Unlimited users &amp; products" data-fr="Utilisateurs &amp; produits illimités">Unlimited users & products</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="Multi-branch &amp; stock transfer" data-fr="Multi-sites &amp; transfert de stock">Multi-branch & stock transfer</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="Advanced analytics" data-fr="Analyses avancées">Advanced analytics</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="Priority support" data-fr="Support prioritaire">Priority support</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="API access &amp; webhooks" data-fr="Accès API &amp; webhooks">API access & webhooks</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg><span data-en="Dedicated account manager" data-fr="Gestionnaire de compte dédié">Dedicated account manager</span></li>
          </ul>
        </div>
      </div>

      <p class="center" style="margin-top:26px;font-size:13.5px;color:var(--text-muted)" data-en="All prices in FCFA (XAF). Mobile Money and card accepted. Prices may be updated in future." data-fr="Tous les prix en FCFA (XAF). Mobile Money et carte acceptés. Les tarifs peuvent évoluer.">All prices in FCFA (XAF). Mobile Money and card accepted.</p>
    </div>
  </section>

  <section class="sec" style="background:var(--canvas)">
    <div class="wrap">
      <div class="shead center reveal"><span class="eyebrow centered" data-en="Good to know" data-fr="Bon à savoir">Good to know</span>
        <h2 class="title" data-en="Pricing questions" data-fr="Questions sur les tarifs">Pricing questions</h2></div>
      <div class="faq">
        <div class="qa reveal"><button class="q"><span class="qt" data-en="Is there really a free plan?" data-fr="Y a-t-il vraiment une formule gratuite ?">Is there really a free plan?</span><span class="ch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></span></button>
          <div class="a"><div class="inner" data-en="Yes. The Free plan lets one person run a POS with up to 50 products and basic reports, forever, at no cost. You only pay when you need more users, products or advanced reports." data-fr="Oui. La formule Free permet à une personne de tenir une caisse avec jusqu'à 50 produits et des rapports de base, gratuitement et pour toujours. Vous ne payez que si vous avez besoin de plus d'utilisateurs, de produits ou de rapports avancés.">Yes — one person, up to 50 products, basic reports, free forever.</div></div></div>
        <div class="qa reveal"><button class="q"><span class="qt" data-en="How does the annual discount work?" data-fr="Comment fonctionne la remise annuelle ?">How does the annual discount work?</span><span class="ch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></span></button>
          <div class="a"><div class="inner" data-en="Pay yearly and you get two months free — the annual price is ten times the monthly price instead of twelve." data-fr="Payez à l'année et vous obtenez deux mois offerts — le prix annuel équivaut à dix mois au lieu de douze.">Pay yearly and get two months free — you pay for ten months, not twelve.</div></div></div>
        <div class="qa reveal"><button class="q"><span class="qt" data-en="Which payment methods do you accept?" data-fr="Quels moyens de paiement acceptez-vous ?">Which payment methods do you accept?</span><span class="ch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></span></button>
          <div class="a"><div class="inner" data-en="MTN Mobile Money, Orange Money and bank cards. Your subscription is billed in FCFA." data-fr="MTN Mobile Money, Orange Money et cartes bancaires. Votre abonnement est facturé en FCFA.">MTN MoMo, Orange Money and bank cards, billed in FCFA.</div></div></div>
        <div class="qa reveal"><button class="q"><span class="qt" data-en="Can I change or cancel my plan?" data-fr="Puis-je changer ou annuler ma formule ?">Can I change or cancel my plan?</span><span class="ch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></span></button>
          <div class="a"><div class="inner" data-en="Anytime. Upgrade, downgrade or cancel from Settings — no lock-in, and your data stays yours." data-fr="À tout moment. Changez ou annulez depuis les Réglages — sans engagement, et vos données restent les vôtres.">Anytime, from Settings — no lock-in, your data stays yours.</div></div></div>
      </div>
      <div class="center" style="margin-top:24px"><a class="tlink" href="faq.html" data-en="See all FAQs →" data-fr="Voir toutes les FAQ →">See all FAQs →</a></div>
    </div>
  </section>
`

export default function PricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <div dangerouslySetInnerHTML={{ __html: siteHtml(BODY) }} />
    </>
  )
}
