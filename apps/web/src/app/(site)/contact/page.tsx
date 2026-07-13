import type { Metadata } from 'next'
import { siteHtml } from '../_chrome/body'

export const metadata: Metadata = {
  title: 'Contact BizTrack CM — Sales, support & demos',
  description:
    'Get in touch with the BizTrack CM team. Request a demo, ask about pricing, or get support by WhatsApp, phone or the contact form. Serving shops across Cameroon.',
  alternates: { canonical: '/contact' },
  openGraph: {
    title: 'Contact BizTrack CM',
    description: 'Request a demo, ask about pricing, or get support by WhatsApp, phone or form.',
    url: '/contact',
  },
}

const orgJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'BizTrack CM',
  url: 'https://hk-solutions.app/',
  parentOrganization: { '@type': 'Organization', name: 'HK Solutions' },
  contactPoint: {
    '@type': 'ContactPoint',
    telephone: '+971588629213',
    contactType: 'customer support',
    email: 'support@hk-solutions.app',
    availableLanguage: ['English', 'French'],
  },
}

const BODY = `
  <section class="page-hero">
    <div class="wrap">
      <div class="crumb"><a href="index.html" data-en="Home" data-fr="Accueil">Home</a><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg><span data-en="Contact" data-fr="Contact">Contact</span></div>
      <span class="eyebrow on-dark" data-en="Contact" data-fr="Contact">Contact</span>
      <h1 data-en="Let's get your shop set up" data-fr="Configurons votre commerce ensemble">Let's get your shop set up</h1>
      <p data-en="Whether you want a demo, help choosing a plan, or a hand rolling BizTrack out across your team — tell us a little about your business and we'll be in touch fast." data-fr="Que vous vouliez une démo, de l'aide pour choisir une formule, ou un accompagnement pour déployer BizTrack dans votre équipe — parlez-nous de votre commerce et nous reviendrons vers vous rapidement.">Tell us about your business — demo, pricing help, or a full rollout — and we'll be in touch fast.</p>
    </div>
  </section>

  <section class="sec">
    <div class="wrap">
      <div class="contact-grid">
        <div class="ct-info reveal">
          <a class="ct-item" href="https://wa.me/971588629213">
            <span class="ii" style="background:#E7F6EC;color:#128C7E"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm0 18.3c-1.5 0-3-.4-4.3-1.2l-.3-.2-2.9.8.8-2.8-.2-.3A8.3 8.3 0 1 1 12 20.3Zm4.6-6.2c-.25-.13-1.5-.74-1.7-.82-.23-.08-.4-.13-.56.13-.17.25-.65.82-.8 1-.14.16-.29.18-.54.06a6.8 6.8 0 0 1-2-1.24 7.5 7.5 0 0 1-1.4-1.72c-.14-.25 0-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.13-.56-1.36-.77-1.86-.2-.48-.4-.42-.56-.42h-.48c-.16 0-.43.06-.65.31-.22.25-.86.84-.86 2.05s.88 2.38 1 2.54c.13.17 1.74 2.66 4.2 3.73.59.25 1.05.4 1.4.52.6.18 1.14.16 1.56.1.48-.07 1.5-.61 1.7-1.2.22-.59.22-1.1.15-1.2-.06-.11-.23-.17-.48-.3Z"/></svg></span>
            <span><span class="t" data-en="WhatsApp" data-fr="WhatsApp">WhatsApp</span><span class="d">+971 58 862 9213<br><span style="color:var(--text-muted)" data-en="Fastest way to reach us" data-fr="Le plus rapide pour nous joindre">Fastest way to reach us</span></span></span>
          </a>
          <a class="ct-item" href="tel:+971588629213">
            <span class="ii"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6.6 3h-2A1.6 1.6 0 0 0 3 4.6 16.4 16.4 0 0 0 19.4 21a1.6 1.6 0 0 0 1.6-1.6v-2a1.6 1.6 0 0 0-1.3-1.6l-2.3-.5a1.6 1.6 0 0 0-1.6.7l-.5.8A12.5 12.5 0 0 1 8.5 10l.8-.5a1.6 1.6 0 0 0 .7-1.6l-.5-2.3A1.6 1.6 0 0 0 8 3.7Z"/></svg></span>
            <span><span class="t" data-en="Phone" data-fr="Téléphone">Phone</span><span class="d">+971 58 862 9213</span></span>
          </a>
          <a class="ct-item" href="mailto:support@hk-solutions.app">
            <span class="ii"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></span>
            <span><span class="t" data-en="Email" data-fr="Email">Email</span><span class="d">support@hk-solutions.app</span></span>
          </a>
          <div class="ct-item">
            <span class="ii"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>
            <span><span class="t" data-en="Support hours" data-fr="Heures d'assistance">Support hours</span><span class="d" data-en="Mon–Sat · 8:00–19:00 (WAT)<br>In French &amp; English" data-fr="Lun–Sam · 8:00–19:00 (WAT)<br>En français &amp; anglais">Mon–Sat · 8:00–19:00 (WAT)<br>In French & English</span></span>
          </div>
        </div>

        <div class="form-card reveal">
          <div id="form-ok" class="form-ok">
            <div class="ok-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg></div>
            <h3 data-en="Message sent — thank you!" data-fr="Message envoyé — merci !">Message sent — thank you!</h3>
            <p data-en="Our team will get back to you within one business day, usually much sooner on WhatsApp." data-fr="Notre équipe vous répondra sous un jour ouvré, souvent bien plus vite sur WhatsApp.">We'll get back to you within one business day — usually sooner on WhatsApp.</p>
          </div>
          <form id="lead-form" novalidate>
            <div class="field row2">
              <div><label data-en="Full name <span class='req'>*</span>" data-fr="Nom complet <span class='req'>*</span>">Full name *</label>
                <input type="text" name="name" required data-ph-en="Henson Amah" data-ph-fr="Henson Amah" placeholder="Henson Amah" /></div>
              <div><label data-en="Business name" data-fr="Nom du commerce">Business name</label>
                <input type="text" name="business" data-ph-en="Boutique Mballa" data-ph-fr="Boutique Mballa" placeholder="Boutique Mballa" /></div>
            </div>
            <div class="field row2">
              <div><label data-en="Phone / WhatsApp <span class='req'>*</span>" data-fr="Téléphone / WhatsApp <span class='req'>*</span>">Phone / WhatsApp *</label>
                <input type="tel" name="phone" required data-ph-en="+237 6 XX XX XX XX" data-ph-fr="+237 6 XX XX XX XX" placeholder="+237 6 XX XX XX XX" /></div>
              <div><label data-en="Email" data-fr="Email">Email</label>
                <input type="email" name="email" data-ph-en="you@example.com" data-ph-fr="vous@exemple.com" placeholder="you@example.com" /></div>
            </div>
            <div class="field row2">
              <div><label data-en="City" data-fr="Ville">City</label>
                <select name="city">
                  <option data-en="Select…" data-fr="Choisir…">Select…</option>
                  <option>Douala</option><option>Yaoundé</option><option>Bafoussam</option><option>Bamenda</option><option>Buea</option><option>Garoua</option>
                  <option data-en="Other" data-fr="Autre">Other</option>
                </select></div>
              <div><label data-en="I'm interested in" data-fr="Je suis intéressé par">I'm interested in</label>
                <select name="topic">
                  <option data-en="A product demo" data-fr="Une démo produit">A product demo</option>
                  <option data-en="Choosing a plan" data-fr="Choisir une formule">Choosing a plan</option>
                  <option data-en="Rolling out to my team" data-fr="Déployer dans mon équipe">Rolling out to my team</option>
                  <option data-en="Technical support" data-fr="Assistance technique">Technical support</option>
                  <option data-en="Partnership / reseller" data-fr="Partenariat / revendeur">Partnership / reseller</option>
                </select></div>
            </div>
            <div class="field">
              <label data-en="How can we help? <span class='req'>*</span>" data-fr="Comment pouvons-nous aider ? <span class='req'>*</span>">How can we help? *</label>
              <textarea name="message" required data-ph-en="Tell us about your shop — what you sell, how many people work there, and what you'd like BizTrack to do for you." data-ph-fr="Parlez-nous de votre commerce — ce que vous vendez, combien de personnes y travaillent, et ce que vous attendez de BizTrack." placeholder="Tell us about your shop…"></textarea>
            </div>
            <label class="consent"><input type="checkbox" name="consent" required />
              <span data-en="I agree to be contacted about BizTrack CM and accept the <a class='tlink' href='privacy.html'>privacy policy</a>." data-fr="J'accepte d'être contacté au sujet de BizTrack CM et j'accepte la <a class='tlink' href='privacy.html'>politique de confidentialité</a>.">I agree to be contacted about BizTrack CM and accept the <a class="tlink" href="privacy.html">privacy policy</a>.</span></label>
            <button type="submit" class="btn btn-primary btn-block btn-lg" data-en="Send message" data-fr="Envoyer le message">Send message</button>
            <p style="font-size:12.5px;color:var(--text-muted);margin-top:12px;text-align:center" data-en="Prefer to chat now? Message us on WhatsApp for the fastest reply." data-fr="Vous préférez discuter maintenant ? Écrivez-nous sur WhatsApp pour une réponse immédiate.">Prefer to chat now? Message us on WhatsApp for the fastest reply.</p>
          </form>
        </div>
      </div>
    </div>
  </section>
`

export default function ContactPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
      <div dangerouslySetInnerHTML={{ __html: siteHtml(BODY) }} />
    </>
  )
}
