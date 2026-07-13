import type { Metadata } from 'next'
import { siteHtml } from '../_chrome/body'

export const metadata: Metadata = {
  title: 'Privacy Policy — BizTrack CM',
  description:
    'How BizTrack CM (a product of HK Solutions) collects, uses, stores and protects your business and personal data, and the rights you have over it.',
  alternates: { canonical: '/privacy' },
  robots: { index: true, follow: true },
}

const BODY = `
  <section class="page-hero" style="padding:56px 0 44px">
    <div class="wrap">
      <div class="crumb"><a href="index.html" data-en="Home" data-fr="Accueil">Home</a><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg><span data-en="Privacy" data-fr="Confidentialité">Privacy</span></div>
      <span class="eyebrow on-dark" data-en="Legal" data-fr="Légal">Legal</span>
      <h1 style="font-size:clamp(30px,4vw,44px)" data-en="Privacy Policy" data-fr="Politique de confidentialité">Privacy Policy</h1>
    </div>
  </section>

  <section class="sec">
    <div class="wrap"><div class="legal">
      <p class="updated" data-en="Last updated: 15 June 2026" data-fr="Dernière mise à jour : 15 juin 2026">Last updated: 15 June 2026</p>
      <p data-en="This policy explains how BizTrack CM, a product of HK Solutions (&ldquo;we&rdquo;, &ldquo;us&rdquo;), handles information when you use our apps and website. We keep it plain and short on purpose." data-fr="Cette politique explique comment BizTrack CM, un produit de HK Solutions («&nbsp;nous&nbsp;»), traite les informations lorsque vous utilisez nos applications et notre site. Nous la voulons claire et courte, volontairement.">This policy explains how BizTrack CM, a product of HK Solutions, handles information when you use our apps and website.</p>

      <div class="toc">
        <h4 data-en="On this page" data-fr="Sur cette page">On this page</h4>
        <ol>
          <li><a href="#p1" data-en="Information we collect" data-fr="Informations collectées">Information we collect</a></li>
          <li><a href="#p2" data-en="How we use it" data-fr="Utilisation">How we use it</a></li>
          <li><a href="#p3" data-en="Where your data lives" data-fr="Où vivent vos données">Where your data lives</a></li>
          <li><a href="#p4" data-en="Sharing" data-fr="Partage">Sharing</a></li>
          <li><a href="#p5" data-en="Your rights" data-fr="Vos droits">Your rights</a></li>
          <li><a href="#p6" data-en="Contact" data-fr="Contact">Contact</a></li>
        </ol>
      </div>

      <h2 id="p1" data-en="1. Information we collect" data-fr="1. Informations que nous collectons">1. Information we collect</h2>
      <p data-en="Account details you provide (name, business name, phone number, email); business data you enter (products, sales, customers, expenses); and basic technical data (device type, app version, crash logs) needed to keep the app reliable." data-fr="Les informations de compte que vous fournissez (nom, nom du commerce, numéro de téléphone, email) ; les données d'activité que vous saisissez (produits, ventes, clients, dépenses) ; et des données techniques de base (type d'appareil, version de l'app, journaux de plantage) nécessaires à la fiabilité de l'app.">Account details you provide, business data you enter, and basic technical data needed to keep the app reliable.</p>

      <h2 id="p2" data-en="2. How we use it" data-fr="2. Comment nous l'utilisons">2. How we use it</h2>
      <p data-en="To provide the service, sync your data across your devices, process your subscription, offer support, and improve the product. We do not sell your data, and we do not use your business records for advertising." data-fr="Pour fournir le service, synchroniser vos données entre vos appareils, traiter votre abonnement, offrir de l'assistance et améliorer le produit. Nous ne vendons pas vos données et n'utilisons pas vos données d'activité à des fins publicitaires.">To run the service, sync your devices, process your subscription and support you. We never sell your data.</p>

      <h2 id="p3" data-en="3. Where your data lives" data-fr="3. Où vivent vos données">3. Where your data lives</h2>
      <p data-en="BizTrack is offline-first: your data is stored primarily on your device. When you sync, it is transmitted securely and backed up on our servers so you can restore it or use it on another device." data-fr="BizTrack est hors-ligne d'abord : vos données sont d'abord stockées sur votre appareil. Lors de la synchronisation, elles sont transmises de façon sécurisée et sauvegardées sur nos serveurs pour vous permettre de les restaurer ou de les utiliser sur un autre appareil.">Your data is stored primarily on your device, and backed up securely when you sync.</p>

      <h2 id="p4" data-en="4. Sharing" data-fr="4. Partage">4. Sharing</h2>
      <p data-en="We share data only with service providers who help us run BizTrack (for example hosting and payment processing), under contract and only as needed. We may disclose information where required by law." data-fr="Nous ne partageons des données qu'avec des prestataires qui nous aident à faire fonctionner BizTrack (hébergement, traitement des paiements), sous contrat et uniquement si nécessaire. Nous pouvons divulguer des informations lorsque la loi l'exige.">Only with service providers who help us run BizTrack, under contract and only as needed.</p>

      <h2 id="p5" data-en="5. Your rights" data-fr="5. Vos droits">5. Your rights</h2>
      <p data-en="You can access, export, correct or delete your data at any time from the app or by contacting us. Your business data belongs to you — there is no lock-in." data-fr="Vous pouvez accéder à vos données, les exporter, les corriger ou les supprimer à tout moment depuis l'app ou en nous contactant. Vos données d'activité vous appartiennent — sans verrouillage.">Access, export, correct or delete your data anytime. It belongs to you — no lock-in.</p>

      <h2 id="p6" data-en="6. Contact" data-fr="6. Contact">6. Contact</h2>
      <p data-en="Questions about privacy? Email support@hk-solutions.app or message us on WhatsApp at +971 58 862 9213." data-fr="Des questions sur la confidentialité ? Écrivez à support@hk-solutions.app ou contactez-nous sur WhatsApp au +971 58 862 9213.">Questions? Email support@hk-solutions.app or WhatsApp +971 58 862 9213.</p>
      <p style="margin-top:20px"><a class="tlink" href="terms.html" data-en="Read our Terms of Service →" data-fr="Lire nos Conditions d'utilisation →">Read our Terms of Service →</a></p>
    </div></div>
  </section>
`

export default function PrivacyPage() {
  return <div dangerouslySetInnerHTML={{ __html: siteHtml(BODY) }} />
}
