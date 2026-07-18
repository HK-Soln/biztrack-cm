import type { Metadata } from 'next'
import { siteHtml } from '../_chrome/body'

export const metadata: Metadata = {
  title: 'Terms of Service — BizTrack CM',
  description:
    'The terms that govern your use of BizTrack CM, a product of HK Solutions — accounts, subscriptions, acceptable use, data ownership and liability.',
  alternates: { canonical: '/terms' },
  robots: { index: true, follow: true },
}

const BODY = `
  <section class="page-hero" style="padding:56px 0 44px">
    <div class="wrap">
      <div class="crumb"><a href="index.html" data-en="Home" data-fr="Accueil">Home</a><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg><span data-en="Terms" data-fr="Conditions">Terms</span></div>
      <span class="eyebrow on-dark" data-en="Legal" data-fr="Légal">Legal</span>
      <h1 style="font-size:clamp(30px,4vw,44px)" data-en="Terms of Service" data-fr="Conditions d'utilisation">Terms of Service</h1>
    </div>
  </section>

  <section class="sec">
    <div class="wrap"><div class="legal">
      <p class="updated" data-en="Last updated: 15 June 2026" data-fr="Dernière mise à jour : 15 juin 2026">Last updated: 15 June 2026</p>
      <p data-en="These terms govern your use of BizTrack CM, a product of HK Solutions. By creating an account or using the apps, you agree to them." data-fr="Ces conditions régissent votre utilisation de BizTrack CM, un produit de HK Solutions. En créant un compte ou en utilisant les applications, vous les acceptez.">These terms govern your use of BizTrack CM, a product of HK Solutions.</p>

      <div class="toc">
        <h4 data-en="On this page" data-fr="Sur cette page">On this page</h4>
        <ol>
          <li><a href="#t1" data-en="Your account" data-fr="Votre compte">Your account</a></li>
          <li><a href="#t2" data-en="Subscriptions &amp; billing" data-fr="Abonnements &amp; facturation">Subscriptions & billing</a></li>
          <li><a href="#t3" data-en="Acceptable use" data-fr="Usage acceptable">Acceptable use</a></li>
          <li><a href="#t4" data-en="Your data" data-fr="Vos données">Your data</a></li>
          <li><a href="#t5" data-en="Availability &amp; liability" data-fr="Disponibilité &amp; responsabilité">Availability & liability</a></li>
          <li><a href="#t6" data-en="Changes &amp; contact" data-fr="Modifications &amp; contact">Changes & contact</a></li>
        </ol>
      </div>

      <h2 id="t1" data-en="1. Your account" data-fr="1. Votre compte">1. Your account</h2>
      <p data-en="You are responsible for keeping your login secure and for the activity of users you add. Give team members only the access they need using roles and permissions." data-fr="Vous êtes responsable de la sécurité de vos identifiants et de l'activité des utilisateurs que vous ajoutez. N'accordez à votre équipe que l'accès nécessaire via les rôles et permissions.">You're responsible for keeping your login secure and for the users you add.</p>

      <h2 id="t2" data-en="2. Subscriptions &amp; billing" data-fr="2. Abonnements &amp; facturation">2. Subscriptions & billing</h2>
      <p data-en="Paid plans are billed in FCFA, monthly or annually, via Mobile Money or card. Paid plans include a 14-day free trial. You can upgrade, downgrade or cancel anytime; cancellation takes effect at the end of the current billing period. Fees already paid are non-refundable except where required by law." data-fr="Les formules payantes sont facturées en FCFA, mensuellement ou annuellement, via Mobile Money ou carte. Elles incluent 14 jours d'essai gratuit. Vous pouvez changer ou annuler à tout moment ; l'annulation prend effet à la fin de la période en cours. Les sommes déjà payées ne sont pas remboursables sauf disposition légale contraire.">Paid plans are billed in FCFA via Mobile Money or card, with a 14-day trial. Cancel anytime.</p>

      <h2 id="t3" data-en="3. Acceptable use" data-fr="3. Usage acceptable">3. Acceptable use</h2>
      <p data-en="Use BizTrack lawfully. Don't attempt to break, resell, reverse-engineer or overload the service, or use it to store unlawful content. We may suspend accounts that put the service or other users at risk." data-fr="Utilisez BizTrack légalement. N'essayez pas de compromettre, revendre, désosser ou surcharger le service, ni de l'utiliser pour stocker du contenu illégal. Nous pouvons suspendre les comptes qui mettent en danger le service ou les autres utilisateurs.">Use BizTrack lawfully — no breaking, reselling, reverse-engineering or unlawful content.</p>

      <h2 id="t4" data-en="4. Your data" data-fr="4. Vos données">4. Your data</h2>
      <p data-en="Your business data remains yours. We store and process it to provide the service as described in our Privacy Policy, and you can export or delete it at any time." data-fr="Vos données d'activité restent les vôtres. Nous les stockons et les traitons pour fournir le service, comme décrit dans notre politique de confidentialité, et vous pouvez les exporter ou les supprimer à tout moment.">Your data stays yours. Export or delete it anytime — see the Privacy Policy.</p>

      <h2 id="t5" data-en="5. Availability &amp; liability" data-fr="5. Disponibilité &amp; responsabilité">5. Availability & liability</h2>
      <p data-en="BizTrack is offline-first and designed to be reliable, but it is provided &ldquo;as is&rdquo; without warranty. To the extent permitted by law, our liability is limited to the fees you paid in the previous 12 months. Keep your own backups by exporting regularly." data-fr="BizTrack est hors-ligne d'abord et conçu pour être fiable, mais il est fourni «&nbsp;tel quel&nbsp;» sans garantie. Dans la limite permise par la loi, notre responsabilité se limite aux sommes payées au cours des 12 derniers mois. Conservez vos propres sauvegardes en exportant régulièrement.">Provided &ldquo;as is&rdquo;; our liability is limited to fees paid in the prior 12 months. Keep your own exports.</p>

      <h2 id="t6" data-en="6. Changes &amp; contact" data-fr="6. Modifications &amp; contact">6. Changes & contact</h2>
      <p data-en="We may update these terms and will note the date above. Questions? Email support@hk-solutions.app or message +971 58 862 9213 on WhatsApp." data-fr="Nous pouvons mettre à jour ces conditions et en indiquerons la date ci-dessus. Des questions ? Écrivez à support@hk-solutions.app ou contactez le +971 58 862 9213 sur WhatsApp.">We may update these terms. Questions? Email support@hk-solutions.app or WhatsApp +971 58 862 9213.</p>
      <p style="margin-top:20px"><a class="tlink" href="privacy.html" data-en="Read our Privacy Policy →" data-fr="Lire notre politique de confidentialité →">Read our Privacy Policy →</a></p>
    </div></div>
  </section>
`

export default function TermsPage() {
  return <div dangerouslySetInnerHTML={{ __html: siteHtml(BODY) }} />
}
