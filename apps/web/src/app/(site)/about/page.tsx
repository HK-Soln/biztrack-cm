import type { Metadata } from 'next'
import { siteHtml } from '../_chrome/body'

export const metadata: Metadata = {
  title: 'About BizTrack CM — Business software built in & for Cameroon',
  description:
    'BizTrack CM is an offline-first business platform for Cameroonian shop owners, built by HK Solutions. Learn about our mission to digitise small business across Cameroon.',
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'About BizTrack CM',
    description: 'Offline-first business software built in and for Cameroon, by HK Solutions.',
    url: '/about',
  },
}

const BODY = `
  <section class="page-hero">
    <div class="wrap">
      <div class="crumb"><a href="index.html" data-en="Home" data-fr="Accueil">Home</a><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg><span data-en="About" data-fr="À propos">About</span></div>
      <span class="eyebrow on-dark" data-en="About us" data-fr="À propos">About us</span>
      <h1 data-en="Digitising Cameroonian business, one shop at a time" data-fr="Numériser le commerce camerounais, une boutique à la fois">Digitising Cameroonian business, one shop at a time</h1>
      <p data-en="BizTrack CM was born from a simple frustration: the best business tools were never built for how shops in Cameroon actually operate. So we built one that is." data-fr="BizTrack CM est né d'une frustration simple : les meilleurs outils de gestion n'ont jamais été pensés pour le fonctionnement réel des commerces camerounais. Nous en avons créé un qui l'est.">Born from a simple frustration: the best tools were never built for how Cameroon trades.</p>
    </div>
  </section>

  <section class="sec">
    <div class="wrap">
      <div class="split reveal">
        <div class="scopy">
          <span class="eyebrow" data-en="Our mission" data-fr="Notre mission">Our mission</span>
          <h3 style="margin-top:14px" data-en="Powerful business software that works where you are" data-fr="Un logiciel de gestion puissant, là où vous êtes">Powerful business software that works where you are</h3>
          <p data-en="Millions of small businesses across Cameroon still run on paper cash books and mental arithmetic. They lose money to forgotten debts, stock-outs and hours of manual accounting. Meanwhile, most software assumes fast internet, foreign payment rails and English-only staff." data-fr="Des millions de petits commerces au Cameroun fonctionnent encore au cahier de caisse et au calcul mental. Ils perdent de l'argent en dettes oubliées, ruptures de stock et heures de comptabilité manuelle. Pourtant, la plupart des logiciels supposent internet rapide, moyens de paiement étrangers et personnel anglophone uniquement.">Most software assumes fast internet, foreign payment rails and English-only staff — Cameroon needs none of those assumptions.</p>
          <p data-en="BizTrack flips that. It is offline-first, bilingual, built around Mobile Money and OHADA accounting — professional software that meets shop owners exactly where they are." data-fr="BizTrack inverse la logique. Hors-ligne d'abord, bilingue, construit autour du Mobile Money et de la comptabilité OHADA — un logiciel professionnel qui rencontre les commerçants là où ils sont.">BizTrack is offline-first, bilingual, and built around Mobile Money and OHADA accounting.</p>
        </div>
        <div class="shot-wrap reveal"><div class="shot framed"><img src="img/app-desktop-dash.png" alt="BizTrack CM dashboard" /></div></div>
      </div>
    </div>
  </section>

  <section class="sec" style="background:var(--canvas)">
    <div class="wrap">
      <div class="shead center reveal"><span class="eyebrow centered" data-en="What we believe" data-fr="Nos convictions">What we believe</span>
        <h2 class="title" data-en="The principles behind BizTrack" data-fr="Les principes derrière BizTrack">The principles behind BizTrack</h2></div>
      <div class="fgrid">
        <div class="fcard reveal"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/></svg></div>
          <h3 data-en="Offline is not optional" data-fr="Le hors-ligne n'est pas une option">Offline is not optional</h3>
          <p data-en="Networks fail. Software that stops when the internet does is not fit for purpose here." data-fr="Les réseaux tombent. Un logiciel qui s'arrête avec internet n'est pas adapté ici.">Software that stops when the internet does is not fit for purpose here.</p></div>
        <div class="fcard reveal"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h16v4H4zM4 12h16M4 16h16M4 20h16"/></svg></div>
          <h3 data-en="Local by design" data-fr="Local par conception">Local by design</h3>
          <p data-en="MoMo, Orange Money, OHADA, French and English — the essentials, not afterthoughts." data-fr="MoMo, Orange Money, OHADA, français et anglais — l'essentiel, pas des ajouts.">MoMo, Orange Money, OHADA and both languages — essentials, not afterthoughts.</p></div>
        <div class="fcard reveal"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 4 6v6c0 5 3.5 7.5 8 9 4.5-1.5 8-4 8-9V6Z"/><path d="m9 12 2 2 4-4"/></svg></div>
          <h3 data-en="Your data is yours" data-fr="Vos données vous appartiennent">Your data is yours</h3>
          <p data-en="Export it anytime. No lock-in, no hostage-taking. We earn your subscription every month." data-fr="Exportez-les quand vous voulez. Sans verrouillage. Nous méritons votre abonnement chaque mois.">Export anytime. No lock-in — we earn your subscription every month.</p></div>
      </div>
    </div>
  </section>

  <section class="sec">
    <div class="wrap">
      <div class="split rev reveal">
        <div class="scopy">
          <span class="eyebrow" data-en="Who builds it" data-fr="Qui le construit">Who builds it</span>
          <h3 style="margin-top:14px" data-en="A product of HK Solutions" data-fr="Un produit de HK Solutions">A product of HK Solutions</h3>
          <p data-en="BizTrack CM is built by HK Solutions, a software studio led by a Cameroonian engineer with a background in accounting, fintech and payments. That mix — ledgers that must balance and systems that must not drift — is exactly the discipline a business platform demands." data-fr="BizTrack CM est développé par HK Solutions, un studio logiciel dirigé par un ingénieur camerounais issu de la comptabilité, de la fintech et des paiements. Ce mélange — des comptes qui doivent s'équilibrer et des systèmes qui ne doivent pas dériver — c'est exactement la rigueur qu'exige une plateforme de gestion.">Built by HK Solutions — a studio led by a Cameroonian engineer with a background in accounting, fintech and payments.</p>
          <div class="cta" style="display:flex;gap:12px;flex-wrap:wrap;margin-top:22px">
            <a class="btn btn-primary" href="contact.html" data-en="Get in touch" data-fr="Nous contacter">Get in touch</a>
            <a class="btn btn-ghost" href="https://hk-solutions.app" data-en="HK Solutions ↗" data-fr="HK Solutions ↗">HK Solutions ↗</a>
          </div>
        </div>
        <div class="reveal">
          <div class="stats" style="grid-template-columns:1fr 1fr">
            <div class="stat"><div class="n">2026</div><div class="l" data-en="Launched in Cameroon" data-fr="Lancé au Cameroun">Launched in Cameroon</div></div>
            <div class="stat"><div class="n">2</div><div class="l" data-en="Languages supported" data-fr="Langues prises en charge">Languages supported</div></div>
            <div class="stat"><div class="n">4</div><div class="l" data-en="Platforms shipped" data-fr="Plateformes livrées">Platforms shipped</div></div>
            <div class="stat"><div class="n"><span class="g">OHADA</span></div><div class="l" data-en="Accounting standard" data-fr="Norme comptable">Accounting standard</div></div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="sec" style="padding-top:0">
    <div class="wrap"><div class="cta-band reveal">
      <h2 data-en="Join the shops already running on BizTrack" data-fr="Rejoignez les commerces déjà sur BizTrack">Join the shops already running on BizTrack</h2>
      <p data-en="Free to start, works offline, in French and English." data-fr="Gratuit au démarrage, fonctionne hors-ligne, en français et en anglais.">Free to start, works offline, in French and English.</p>
      <div class="cta"><a class="btn btn-gold btn-lg" href="/contact" data-en="Download free" data-fr="Télécharger gratuitement">Download free</a>
        <a class="btn btn-on-dark btn-lg" href="contact.html" data-en="Talk to us" data-fr="Nous contacter">Talk to us</a></div>
    </div></div>
  </section>
`

export default function AboutPage() {
  return <div dangerouslySetInnerHTML={{ __html: siteHtml(BODY) }} />
}
