import type { Metadata } from 'next'
import { siteHtml } from '../_chrome/body'

export const metadata: Metadata = {
  title: 'FAQ — BizTrack CM · Offline, Mobile Money, OHADA & more',
  description:
    'Frequently asked questions about BizTrack CM: does it work offline, which devices are supported, MTN MoMo & Orange Money, OHADA reports, data safety, pricing and setup.',
  alternates: { canonical: '/faq' },
  openGraph: {
    title: 'FAQ — BizTrack CM',
    description:
      'Answers on offline use, Mobile Money, OHADA reports, devices, data safety and pricing.',
    url: '/faq',
  },
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Does BizTrack really work offline?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. BizTrack is offline-first: every sale, product and report is stored on your device and works with no internet. When a connection returns, your data syncs automatically across your devices.',
      },
    },
    {
      '@type': 'Question',
      name: 'Which devices does BizTrack support?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Android phones and tablets, iPhone and iPad, plus Windows and macOS desktop apps — all sharing one account.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I take MTN MoMo and Orange Money?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. You can record MTN Mobile Money and Orange Money on any sale, split a single sale across cash and both wallets, and reconcile them in reports.',
      },
    },
    {
      '@type': 'Question',
      name: 'Are the reports OHADA and DGI compliant?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'BizTrack generates 20+ reports including P&L, balance sheet, VAT payable and stock valuation in OHADA and DGI format, exportable to PDF and CSV.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is my data safe?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Your data is stored on your device and backed up securely when you sync. It stays yours — you can export it anytime, and there is no lock-in.',
      },
    },
    {
      '@type': 'Question',
      name: 'How much does BizTrack cost?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'There is a free plan forever. Paid plans start at 5,000 FCFA/month (Solo), 15,000 FCFA/month (Business) and 35,000 FCFA/month (Pro), with two months free on annual billing.',
      },
    },
  ],
}

const BODY = `
  <section class="page-hero">
    <div class="wrap">
      <div class="crumb"><a href="index.html" data-en="Home" data-fr="Accueil">Home</a><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg><span data-en="FAQ" data-fr="FAQ">FAQ</span></div>
      <span class="eyebrow on-dark" data-en="Questions &amp; answers" data-fr="Questions &amp; réponses">Questions & answers</span>
      <h1 data-en="Frequently asked questions" data-fr="Questions fréquentes">Frequently asked questions</h1>
      <p data-en="Everything you need to know about running your shop on BizTrack. Can't find your answer? Reach us on WhatsApp." data-fr="Tout ce qu'il faut savoir pour gérer votre commerce avec BizTrack. Vous ne trouvez pas ? Écrivez-nous sur WhatsApp.">Everything you need to know. Can't find your answer? Reach us on WhatsApp.</p>
    </div>
  </section>

  <section class="sec">
    <div class="wrap">
      <div class="faq">
        <div class="qa reveal"><button class="q"><span class="qt" data-en="Does BizTrack really work offline?" data-fr="BizTrack fonctionne-t-il vraiment hors-ligne ?">Does BizTrack really work offline?</span><span class="ch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></span></button>
          <div class="a"><div class="inner" data-en="Yes — it's offline-first by design. Every sale, product and report is stored on your device and works with no internet at all. When a connection returns, your data syncs automatically across your phones, tablets and desktops. Nothing is ever lost." data-fr="Oui — hors-ligne d'abord par conception. Chaque vente, produit et rapport est stocké sur votre appareil et fonctionne sans aucune connexion. Dès le retour du réseau, vos données se synchronisent automatiquement entre téléphones, tablettes et ordinateurs. Rien n'est jamais perdu.">Yes — offline-first by design. Everything is stored on-device and syncs automatically when you're back online.</div></div></div>
        <div class="qa reveal"><button class="q"><span class="qt" data-en="Which devices does BizTrack support?" data-fr="Quels appareils sont pris en charge ?">Which devices does BizTrack support?</span><span class="ch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></span></button>
          <div class="a"><div class="inner" data-en="Android phones and tablets, iPhone and iPad, and Windows and macOS desktops — all sharing one account. Cashiers usually sell on a phone or tablet while the owner reviews reports on a laptop." data-fr="Téléphones et tablettes Android, iPhone et iPad, ainsi que les ordinateurs Windows et macOS — le tout avec un seul compte. Les caissiers vendent souvent sur téléphone ou tablette pendant que le propriétaire consulte les rapports sur ordinateur.">Android, iOS, Windows and macOS — all on one account.</div></div></div>
        <div class="qa reveal"><button class="q"><span class="qt" data-en="Can I take MTN MoMo and Orange Money?" data-fr="Puis-je encaisser MTN MoMo et Orange Money ?">Can I take MTN MoMo and Orange Money?</span><span class="ch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></span></button>
          <div class="a"><div class="inner" data-en="Yes. Record MTN Mobile Money and Orange Money on any sale, split a single sale across cash and both wallets, and reconcile every payment method in your reports." data-fr="Oui. Enregistrez MTN Mobile Money et Orange Money sur toute vente, répartissez une même vente entre espèces et les deux portefeuilles, et rapprochez chaque mode de paiement dans vos rapports.">Yes — record and split MoMo, Orange Money and cash on any sale, and reconcile in reports.</div></div></div>
        <div class="qa reveal"><button class="q"><span class="qt" data-en="Are the reports OHADA and DGI compliant?" data-fr="Les rapports sont-ils conformes OHADA et DGI ?">Are the reports OHADA and DGI compliant?</span><span class="ch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></span></button>
          <div class="a"><div class="inner" data-en="BizTrack produces 20+ reports — including profit &amp; loss, balance sheet, VAT payable and stock valuation — in OHADA and DGI format, exportable to PDF and CSV to hand straight to your accountant." data-fr="BizTrack produit plus de 20 rapports — dont compte de résultat, bilan, TVA à payer et valorisation des stocks — au format OHADA et DGI, exportables en PDF et CSV à remettre directement à votre comptable.">20+ reports including P&L, balance sheet and VAT payable in OHADA/DGI format, exportable to PDF and CSV.</div></div></div>
        <div class="qa reveal"><button class="q"><span class="qt" data-en="Is my business data safe?" data-fr="Mes données sont-elles en sécurité ?">Is my business data safe?</span><span class="ch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></span></button>
          <div class="a"><div class="inner" data-en="Your data is stored on your device and backed up securely when you sync. It stays yours: you can export it anytime, and there's no lock-in. Role-based access and an activity log keep your team accountable." data-fr="Vos données sont stockées sur votre appareil et sauvegardées en toute sécurité à la synchronisation. Elles restent les vôtres : exportables à tout moment, sans verrouillage. Les accès par rôle et le journal d'activité gardent votre équipe responsable.">Stored on your device, backed up on sync, exportable anytime — no lock-in.</div></div></div>
        <div class="qa reveal"><button class="q"><span class="qt" data-en="How much does BizTrack cost?" data-fr="Combien coûte BizTrack ?">How much does BizTrack cost?</span><span class="ch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></span></button>
          <div class="a"><div class="inner" data-en="There's a free plan forever. Paid plans are Solo (5 000 FCFA/mo), Business (15 000 FCFA/mo) and Pro (35 000 FCFA/mo), with two months free on annual billing and a 14-day free trial on every paid plan." data-fr="Une formule gratuite pour toujours. Les formules payantes sont Solo (5 000 FCFA/mois), Business (15 000 FCFA/mois) et Pro (35 000 FCFA/mois), avec deux mois offerts en annuel et 14 jours d'essai sur chaque formule payante.">Free forever, then Solo (5 000), Business (15 000) and Pro (35 000) FCFA/mo — 14-day trial, 2 months free on annual.</div></div></div>
        <div class="qa reveal"><button class="q"><span class="qt" data-en="How long does setup take?" data-fr="Combien de temps pour la configuration ?">How long does setup take?</span><span class="ch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></span></button>
          <div class="a"><div class="inner" data-en="Most shops are selling the same day. Download, create your business, add a few products and you're live. Need to load a big catalogue or train a team? We'll help — just get in touch." data-fr="La plupart des commerces vendent le jour même. Téléchargez, créez votre entreprise, ajoutez quelques produits et c'est parti. Un gros catalogue à importer ou une équipe à former ? Nous vous aidons — contactez-nous.">Most shops sell the same day. Big catalogue or team to train? We'll help.</div></div></div>
        <div class="qa reveal"><button class="q"><span class="qt" data-en="Can I use it in French and English?" data-fr="Puis-je l'utiliser en français et en anglais ?">Can I use it in French and English?</span><span class="ch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></span></button>
          <div class="a"><div class="inner" data-en="Absolutely. The entire app — menus, receipts and reports — switches between French and English, so bilingual teams work in whichever language they prefer." data-fr="Absolument. Toute l'app — menus, reçus et rapports — bascule entre le français et l'anglais, pour que les équipes bilingues travaillent dans la langue de leur choix.">Yes — the whole app, receipts and reports switch between French and English.</div></div></div>
      </div>

      <div class="center" style="margin-top:44px">
        <p class="lead" data-en="Still have a question?" data-fr="Une autre question ?">Still have a question?</p>
        <div class="cta" style="display:flex;gap:12px;justify-content:center;margin-top:18px;flex-wrap:wrap">
          <a class="btn btn-primary" href="contact.html" data-en="Contact us" data-fr="Contactez-nous">Contact us</a>
          <a class="btn btn-ghost" href="https://wa.me/971588629213" data-en="Chat on WhatsApp" data-fr="Discuter sur WhatsApp">Chat on WhatsApp</a>
        </div>
      </div>
    </div>
  </section>
`

export default function FaqPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div dangerouslySetInnerHTML={{ __html: siteHtml(BODY) }} />
    </>
  )
}
