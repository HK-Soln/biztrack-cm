'use client'
import { useState, useEffect } from 'react'
import styles from './roadmap.module.css'

const SECTIONS = [
  { id: 'shipped',   label: 'Already live',             color: '#1D9E75' },
  { id: 'june2026',  label: 'June 2026',                color: '#F5A623' },
  { id: 'ohada2026', label: 'OHADA Full · Q3–Q4 2026',  color: '#378ADD' },
  { id: 'paytrack',  label: 'PayTrack CM · 2027',        color: '#7F77DD' },
]

export function RoadmapContent() {
  const [activeSection, setActiveSection] = useState('shipped')

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            ;(e.target as HTMLElement).dataset.visible = 'true'
            observer.unobserve(e.target)
          }
        })
      },
      { threshold: 0.08, rootMargin: '0px 0px -30px 0px' },
    )
    document.querySelectorAll('[data-reveal]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const sectionIds = SECTIONS.map((s) => s.id)
    const onScroll = () => {
      let current = sectionIds[0]!
      sectionIds.forEach((id) => {
        const el = document.getElementById(id)
        if (el && window.scrollY >= el.offsetTop - 120) current = id
      })
      setActiveSection(current)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.noise} aria-hidden="true" />

      {/* ── NAV ─────────────────────────────────────────────────────────────── */}
      <nav className={styles.nav}>
        <div className={styles.container}>
          <div className={styles.navInner}>
            <a href="/" className={styles.logo}>BizTrack<span>CM</span></a>
            <span className={styles.navTag}>Product Roadmap 2026–2027</span>
          </div>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.container}>
          <div className={styles.heroEyebrow}>🇨🇲 Made in Cameroon · For Africa</div>
          <h1 className={styles.heroTitle}>
            Building the future of<br />
            African business management.<br />
            <em>One feature at a time.</em>
          </h1>
          <p className={styles.heroP}>
            We ship fast. Every update on this page is a commitment to our users — shop owners, accountants, and
            businesses across Cameroon and Central Africa. This is what we&apos;re building and when you can expect it.
          </p>
          <div className={styles.stats}>
            <div>
              <div className={`${styles.statV} ${styles.statVTeal}`}>12</div>
              <div className={styles.statL}>Modules live</div>
            </div>
            <div>
              <div className={styles.statV}>16</div>
              <div className={styles.statL}>Report templates</div>
            </div>
            <div>
              <div className={`${styles.statV} ${styles.statVTeal}`}>6</div>
              <div className={styles.statL}>Features shipping June 2026</div>
            </div>
            <div>
              <div className={styles.statV}>OHADA</div>
              <div className={styles.statL}>Fully compliant · all 17 OHADA states</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TIMELINE NAV ────────────────────────────────────────────────────── */}
      <div className={styles.timelineOuter}>
        <div className={styles.container}>
          <div className={styles.tnav}>
            {SECTIONS.map(({ id, label, color }) => (
              <button
                key={id}
                className={`${styles.tnavLink} ${activeSection === id ? styles.tnavLinkActive : ''}`}
                onClick={() => scrollTo(id)}
              >
                <span className={styles.tnavDot} style={{ background: color }} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── ALREADY SHIPPED ─────────────────────────────────────────────────── */}
      <section className={styles.release} id="shipped">
        <div className={styles.container}>
          <div className={styles.releaseHead} data-reveal="">
            <div>
              <span className={`${styles.releaseTag} ${styles.tagLive}`}>✓ Live Now</span>
              <div className={styles.releaseV}>BizTrack CM v1.0</div>
              <div className={styles.releaseDate}>
                <i className={styles.releaseDateIcon}>↗</i> Shipped · Sprints 1–12
              </div>
              <div className={styles.releaseSummary}>
                The full POS and business management foundation. 12 modules, 16 reports, fully offline-capable. Used
                by real shop owners in Douala, Yaoundé, Buea, and Bamenda right now.
              </div>
            </div>
            <div className={styles.releaseDesc}>
              <h3>The foundation is live.</h3>
              <p>
                BizTrack CM v1.0 delivers everything a Cameroonian shop needs to run their business: record sales in
                under 10 seconds, track inventory automatically, manage credit with customers and suppliers, record
                expenses, and generate 16 different financial reports — all working without internet. The entire
                product is OHADA-aware, designed for XAF, and built for Android.
              </p>
              <p style={{ marginTop: '0.75rem' }}>
                We also completed full multi-user access (RBAC) and simplified OHADA output — balance sheet and P&amp;L
                auto-generated from your existing data, ready to share with your bank or accountant.
              </p>
            </div>
          </div>

          <div className={styles.shippedGrid} data-reveal="" data-delay="1">
            {[
              'POS & sales (offline-first)',
              'Inventory & stock management',
              'Products & categories',
              'Expenses module',
              'Debtors — who owes you',
              'Creditors — who you owe',
              'Contacts directory',
              '16 report templates',
              'Home dashboard',
              'Pre-orders & deposits',
              'Multi-user roles (RBAC)',
              'Lite OHADA balance sheet & P&L',
            ].map((item) => (
              <div key={item} className={styles.shippedItem}>
                <span className={styles.shippedCheck}>✓</span>
                <span className={styles.shippedLabel}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── JUNE 2026 ───────────────────────────────────────────────────────── */}
      <section className={styles.release} id="june2026">
        <div className={styles.container}>
          <div className={styles.releaseHead} data-reveal="">
            <div>
              <span className={`${styles.releaseTag} ${styles.tagSoon}`}>⚡ Shipping June 2026</span>
              <div className={styles.releaseV}>BizTrack CM v1.2</div>
              <div className={styles.releaseDate}>
                <i className={styles.releaseDateIcon}>↗</i> Expected: 30 June 2026
              </div>
              <div className={styles.releaseSummary}>
                Six features that make BizTrack CM significantly more valuable for shops that have been running for a
                while — health intelligence, cost tracking, wider receipt reach, organic growth, till control, and
                customer loyalty.
              </div>
            </div>
            <div className={styles.releaseDesc}>
              <h3>More value for your daily operations.</h3>
              <p>
                This release is built for shops that have been using BizTrack CM for a few months and are ready for
                more. Every feature in this release addresses something shop owners do today in notebooks, in their
                heads, or not at all. We&apos;re making the invisible visible.
              </p>
            </div>
          </div>

          <div className={styles.fgrid}>
            {/* Business Health Score */}
            <div className={`${styles.fcard} ${styles.fcardTeal}`} data-reveal="" data-delay="1">
              <div className={`${styles.fcardIcon} ${styles.fiTeal}`}>📊</div>
              <h4>Business Health Score</h4>
              <p>
                A single colour-coded signal on your home dashboard that tells you instantly whether your business is
                healthy, needs attention, or is at risk — before you dig into the numbers.
              </p>
              <div className={styles.fcardDetail}>
                <p>Five signals computed automatically every morning:</p>
                <ul>
                  <li>Gross margin this month vs last month (is your profit shrinking?)</li>
                  <li>Expense ratio — are expenses eating your revenue?</li>
                  <li>Overdue receivables as a % of monthly revenue</li>
                  <li>Stock health — what % of your products are above threshold?</li>
                  <li>Credit collection rate — how much of issued credit has been collected?</li>
                </ul>
                <p style={{ marginTop: '0.625rem' }}>
                  Each score shows as Green / Amber / Red with a plain-language explanation:{' '}
                  <em>
                    &ldquo;Your margin is healthy but XAF 87,000 in overdue receivables is affecting your cash
                    position.&rdquo;
                  </em>{' '}
                  Tap to see exactly which signals are driving the score.
                </p>
              </div>
              <span className={styles.fcardWhen}>Shipping 30 June 2026</span>
            </div>

            {/* Supplier Price Tracker */}
            <div className={`${styles.fcard} ${styles.fcardTeal}`} data-reveal="" data-delay="2">
              <div className={`${styles.fcardIcon} ${styles.fiTeal}`}>📦</div>
              <h4>Supplier Price Tracker</h4>
              <p>
                Every time you restock, BizTrack CM records what you paid per unit. Now that history becomes
                intelligence. See exactly how your supplier prices have moved over time and compare costs across
                suppliers.
              </p>
              <div className={styles.fcardDetail}>
                <p>New price history tab on every product page:</p>
                <ul>
                  <li>Last 12 restock entries: date, quantity, unit cost, supplier name</li>
                  <li>Price trend line — rising or falling at a glance</li>
                  <li>Compare suppliers: average unit cost per supplier for the same product</li>
                  <li>Alert when a product&apos;s cost has increased more than 5% from the previous restock</li>
                </ul>
                <p style={{ marginTop: '0.625rem' }}>
                  No new data to enter. This is built entirely on your existing restock records.
                </p>
              </div>
              <span className={styles.fcardWhen}>Shipping 30 June 2026</span>
            </div>

            {/* SMS Receipt Fallback */}
            <div className={`${styles.fcard} ${styles.fcardAmber}`} data-reveal="" data-delay="1">
              <div className={`${styles.fcardIcon} ${styles.fiAmber}`}>💬</div>
              <h4>SMS Receipt Fallback</h4>
              <p>
                Not every customer uses WhatsApp. Now every customer — including those on basic phones — can receive
                their receipt by SMS the moment a sale is confirmed.
              </p>
              <div className={styles.fcardDetail}>
                <p>How it works:</p>
                <ul>
                  <li>
                    SMS is sent automatically alongside the WhatsApp receipt if the customer has a phone number on
                    record
                  </li>
                  <li>Message stays under 160 characters: sale number, shop name, total, date</li>
                  <li>Powered by Africa&apos;s Talking — reliable Cameroonian network coverage</li>
                  <li>Owner can enable or disable SMS receipts in Settings to manage cost</li>
                  <li>Cost per SMS: approximately XAF 25</li>
                </ul>
              </div>
              <span className={`${styles.fcardWhen} ${styles.fcardWhenAmber}`}>Shipping 30 June 2026</span>
            </div>

            {/* In-Product Referral */}
            <div className={`${styles.fcard} ${styles.fcardAmber}`} data-reveal="" data-delay="2">
              <div className={`${styles.fcardIcon} ${styles.fiAmber}`}>🔗</div>
              <h4>In-Product Referral Mechanism</h4>
              <p>
                BizTrack CM now actively helps you grow by making it effortless to introduce it to other shop owners
                — through every receipt and a single tap in the app.
              </p>
              <div className={styles.fcardDetail}>
                <p>Two touchpoints, both automatic:</p>
                <ul>
                  <li>
                    <strong>Receipt footer</strong> — every thermal receipt and WhatsApp receipt now includes:
                    &ldquo;Gérez votre boutique avec BizTrack CM — biztrack.cm&rdquo;. Every receipt your cashier
                    prints becomes a marketing touchpoint to your customers.
                  </li>
                  <li>
                    <strong>In-app prompt</strong> — after 30 days and 100+ sales, a one-time message appears:
                    &ldquo;Know another shop owner? Share BizTrack CM.&rdquo; One tap opens WhatsApp with a
                    pre-written message and your unique referral link. We track which referrals activate.
                  </li>
                </ul>
              </div>
              <span className={`${styles.fcardWhen} ${styles.fcardWhenAmber}`}>Shipping 30 June 2026</span>
            </div>

            {/* Cash Drawer Reconciliation */}
            <div className={`${styles.fcard} ${styles.fcardBlue}`} data-reveal="" data-delay="1">
              <div className={`${styles.fcardIcon} ${styles.fiBlue}`}>💰</div>
              <h4>Cash Drawer Reconciliation</h4>
              <p>
                Know exactly whether the cash in the till matches what BizTrack CM says should be there. Catch
                errors, identify discrepancies, and run a properly managed till for every shift.
              </p>
              <div className={styles.fcardDetail}>
                <p>Shift workflow:</p>
                <ul>
                  <li>
                    <strong>Opening:</strong> cashier enters the opening float (cash in the drawer at start of
                    shift). System records time, user, and opening amount.
                  </li>
                  <li>
                    <strong>Closing:</strong> cashier counts the actual cash and enters the total. System shows
                    expected vs actual and calculates the variance.
                  </li>
                  <li>
                    <strong>Variance flag:</strong> if variance exceeds XAF 1,000, it is flagged in the daily sales
                    report and the owner is notified immediately.
                  </li>
                  <li>
                    Full shift history visible in the Cashier Performance report: recurring variances by cashier, by
                    shift, over time.
                  </li>
                </ul>
              </div>
              <span className={`${styles.fcardWhen} ${styles.fcardWhenBlue}`}>Shipping 30 June 2026</span>
            </div>

            {/* Customer Loyalty */}
            <div className={`${styles.fcard} ${styles.fcardBlue}`} data-reveal="" data-delay="2">
              <div className={`${styles.fcardIcon} ${styles.fiBlue}`}>⭐</div>
              <h4>Customer Loyalty Programme</h4>
              <p>
                Reward your best customers automatically. Create stamp-card loyalty programmes tied directly to your
                contact records — no separate app needed for your customers.
              </p>
              <div className={styles.fcardDetail}>
                <p>How it works:</p>
                <ul>
                  <li>Owner creates a programme: &ldquo;Buy 10 Eau Minérale 75cl, earn 1 free&rdquo;</li>
                  <li>
                    Customer is identified by their phone number at the sell screen — no app, no card needed
                  </li>
                  <li>
                    Every qualifying sale auto-increments their stamp count. Nothing extra for the cashier to do.
                  </li>
                  <li>
                    When the customer earns their reward, the sell screen shows an alert: &ldquo;Marie has earned a
                    free Eau Min.&rdquo;
                  </li>
                  <li>
                    Loyalty dashboard for the owner: active programmes, customers near their reward, total
                    redemptions this month
                  </li>
                </ul>
              </div>
              <span className={`${styles.fcardWhen} ${styles.fcardWhenBlue}`}>Shipping 30 June 2026</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── FULL OHADA ──────────────────────────────────────────────────────── */}
      <section className={styles.release} id="ohada2026">
        <div className={styles.container}>
          <div className={styles.releaseHead} data-reveal="">
            <div>
              <span className={`${styles.releaseTag} ${styles.tagQ3}`}>📋 Q3–Q4 2026</span>
              <div className={styles.releaseV}>Full OHADA Accounting</div>
              <div className={styles.releaseDate}>
                <i className={styles.releaseDateIcon}>↗</i> Rolling release: Aug → Dec 2026
              </div>
              <div className={styles.releaseSummary}>
                The most significant upgrade in BizTrack CM&apos;s history. A complete OHADA-compliant accounting
                engine introduced gradually — without breaking a single existing workflow — and applicable across all
                17 OHADA member states in Central and West Africa.
              </div>
            </div>
            <div className={styles.releaseDesc}>
              <h3>From POS to a full accounting platform.</h3>
              <p>
                Today BizTrack CM is an excellent business management tool. This release makes it a full OHADA
                accounting system — the kind that satisfies your bank, your tax authority (DGI), and your auditor.
                The critical principle guiding this entire release is: <em>nothing breaks</em>. Your cashier records
                sales exactly as they do now. In the background, the correct journal entries are generated
                automatically, tracking every accounting number required by SYSCOHADA Révisé.
              </p>
              <p style={{ marginTop: '0.75rem' }}>
                Because this is a major undertaking, we&apos;re delivering it in five tightly scoped milestones over
                approximately 5 months. Each milestone ships a complete, usable feature — you don&apos;t wait 6 months
                to see anything.
              </p>
            </div>
          </div>

          <div className={styles.ohadaBox} data-reveal="">
            <h3>The core principle: automatic OHADA compliance, invisible to the cashier</h3>
            <p>
              When a cashier records a sale today, BizTrack CM saves it to the database. After this release,
              BizTrack CM will also automatically generate the correct double-entry journal entries in the
              background — without any additional steps from the cashier or owner. Here is an example of what
              happens automatically for a mixed cash/credit sale with VAT and transport:
            </p>
            <div className={styles.journal}>
              <div className={styles.jHead}>
                Example — Sale: XAF 50,000 goods | XAF 9,625 TVA (19.25%) | XAF 3,000 transport | Paid: XAF
                30,000 cash + XAF 32,625 credit
              </div>
              <div className={styles.jDr}>Dr&nbsp;&nbsp;5711&nbsp;&nbsp;Cash account&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;30,000 XAF&nbsp;&nbsp;(cash received)</div>
              <div className={styles.jDr}>Dr&nbsp;&nbsp;4111&nbsp;&nbsp;Trade debtors&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;32,625 XAF&nbsp;&nbsp;(credit balance)</div>
              <hr className={styles.jSep} />
              <div className={styles.jCr}>Cr&nbsp;&nbsp;7011&nbsp;&nbsp;Sales — merchandise&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;50,000 XAF&nbsp;&nbsp;(revenue)</div>
              <div className={styles.jCr}>Cr&nbsp;&nbsp;4431&nbsp;&nbsp;TVA collectée&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;9,625 XAF&nbsp;&nbsp;(VAT liability — Class 4)</div>
              <div className={styles.jCr}>Cr&nbsp;&nbsp;7061&nbsp;&nbsp;Transport revenue&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3,000 XAF&nbsp;&nbsp;(other income)</div>
              <hr className={styles.jSep} />
              <div style={{ fontSize: '0.72rem', color: 'var(--textXS)', marginTop: '0.25rem' }}>
                All entries generated automatically. Cashier does nothing different. Owner and accountant can view
                the full journal at any time.
              </div>
            </div>
          </div>

          <div className={styles.milestones} data-reveal="" data-delay="1">
            {/* Milestone 2a */}
            <div className={styles.ms}>
              <div>
                <span className={`${styles.msTag} ${styles.msTagTeal}`}>Milestone 2a</span>
                <div className={styles.msWhen}>Automatic journal entries</div>
                <div className={styles.msPeriod}>August 2026</div>
              </div>
              <div className={styles.msContent}>
                <h4>Every transaction generates correct OHADA journal entries automatically</h4>
                <p>
                  The accounting engine is switched on. For every sale, expense, restock, credit payment, and
                  deposit recorded in BizTrack CM, the system generates the correct double-entry journal entries
                  against the OHADA chart of accounts (Classes 1–7). A new Journal Viewer screen shows the full
                  ledger, filterable by date, account, and transaction type. A Trial Balance report is added to the
                  reports dashboard. <strong>No workflow changes for cashiers or owners.</strong>
                </p>
                <ul>
                  <li>Cash sales → Dr 5711 / Cr 7011 + COGS entry</li>
                  <li>MTN MoMo sales → Dr 5721 / Cr 7011 + COGS entry</li>
                  <li>Credit sales → Dr 4111 / Cr 7011 + VAT + charges</li>
                  <li>Expenses → Dr 6xxx (correct OHADA expense account) / Cr 5711</li>
                  <li>Restocks on credit → Dr 3111 / Cr 4011</li>
                </ul>
              </div>
            </div>

            {/* Milestone 2b */}
            <div className={styles.ms}>
              <div>
                <span className={`${styles.msTag} ${styles.msTagTeal}`}>Milestone 2b</span>
                <div className={styles.msWhen}>VAT statement report</div>
                <div className={styles.msPeriod}>September 2026</div>
              </div>
              <div className={styles.msContent}>
                <h4>Real-time VAT liability — know exactly what you owe the DGI at any moment</h4>
                <p>
                  A dedicated VAT Statement report shows your net VAT position at any time: TVA collectée (VAT
                  charged to customers on sales) minus TVA déductible (VAT paid to suppliers on restocks). The net
                  balance is what the business owes to the Direction Générale des Impôts. This report can be
                  generated for any period and exported as PDF for tax filing. Businesses on the RS (Régime
                  Simplifié) and RN (Régime Normal) are both supported with the correct TVA rates and filing
                  periods.
                </p>
                <ul>
                  <li>TVA collectée: total VAT charged on all sales in the period</li>
                  <li>TVA déductible: total VAT paid to suppliers on restocks</li>
                  <li>Net TVA payable: the balance owed to DGI</li>
                  <li>Breakdown by month and by tax rate (19.25% standard, 0% exempt)</li>
                  <li>Payment deadline alert: system notifies owner when VAT filing is due</li>
                </ul>
              </div>
            </div>

            {/* Milestone 2c */}
            <div className={styles.ms}>
              <div>
                <span className={`${styles.msTag} ${styles.msTagBlue}`}>Milestone 2c</span>
                <div className={styles.msWhen}>Accounting periods</div>
                <div className={styles.msPeriod}>October 2026</div>
              </div>
              <div className={styles.msContent}>
                <h4>Financial year management — open, run, and close accounting periods formally</h4>
                <p>
                  BizTrack CM now operates within formal accounting periods aligned with OHADA requirements. The
                  owner defines their financial year (calendar year or custom). The system knows which period is
                  open and generates period-specific reports automatically. At year-end, a structured closing
                  workflow guides the owner through the steps required before closing the books.
                </p>
                <ul>
                  <li>Open a financial year with a defined start and end date</li>
                  <li>Opening balances carried forward automatically from the prior year&apos;s closing</li>
                  <li>All reports are period-aware — filter any report by accounting period</li>
                  <li>
                    Year-end closing workflow: verify reconciliation, post any adjustments, generate closing
                    entries, lock the period
                  </li>
                  <li>Locked periods cannot be edited — an audit trail requirement under OHADA</li>
                  <li>Inter-period comparative reporting: current period vs same period last year</li>
                </ul>
              </div>
            </div>

            {/* Milestone 2d */}
            <div className={styles.ms}>
              <div>
                <span className={`${styles.msTag} ${styles.msTagAmber}`}>Milestone 2d</span>
                <div className={styles.msWhen}>Fixed assets management</div>
                <div className={styles.msPeriod}>November 2026</div>
              </div>
              <div className={styles.msContent}>
                <h4>Full fixed asset register — acquisitions, depreciation, disposals, and impairment</h4>
                <p>
                  Every physical asset owned by the business is tracked in a formal asset register compliant with
                  SYSCOHADA Class 2 accounts. Depreciation is calculated automatically each month and the journal
                  entries are posted without any manual intervention. Assets can be disposed of, revalued, or
                  written down — all generating the correct OHADA accounting entries.
                </p>
                <ul>
                  <li>
                    Asset register: description, acquisition date, cost, useful life, depreciation method
                    (straight-line or reducing balance), salvage value, OHADA account code
                  </li>
                  <li>
                    Asset categories: Equipment (2454), Furniture (2441), Vehicles (2453), IT (2454), Buildings
                    (232), Land (231)
                  </li>
                  <li>
                    Monthly depreciation calculated automatically — journal: Dr 681x Depreciation / Cr 285x
                    Accumulated depreciation
                  </li>
                  <li>
                    Asset disposal: system calculates gain or loss and posts the correct entries (Dr 252x + Dr 285x
                    / Cr 245x + Cr/Dr 82x)
                  </li>
                  <li>Impairment write-down when carrying value exceeds recoverable amount</li>
                  <li>
                    Fixed assets schedule report: opening value, additions, disposals, depreciation, closing net
                    book value
                  </li>
                </ul>
              </div>
            </div>

            {/* Milestone 2e */}
            <div className={styles.ms}>
              <div>
                <span className={`${styles.msTag} ${styles.msTagPurple}`}>Milestone 2e</span>
                <div className={styles.msWhen}>Capital management</div>
                <div className={styles.msPeriod}>December 2026</div>
              </div>
              <div className={styles.msContent}>
                <h4>Full equity, capital, drawings, liabilities, dividends, and statutory OHADA reports</h4>
                <p>
                  The final milestone completes the OHADA accounting engine. Capital management tracks the full
                  equity position of the business — how capital was introduced, how it grows or shrinks, how
                  profits are distributed or retained. Long-term and short-term liabilities are formally tracked.
                  The system generates the three statutory financial statements required by OHADA for annual filing.
                </p>
                <ul>
                  <li>
                    Capital accounts (Class 1): share capital, retained earnings, reserves, long-term loans,
                    short-term borrowings
                  </li>
                  <li>Capital injection: owner records initial or additional capital → Dr 5711 / Cr 101 Capital</li>
                  <li>Drawings: owner withdrawals → Dr 106 Drawings / Cr 5711</li>
                  <li>Profit appropriation: retained earnings, dividend distribution, transfer to reserves</li>
                  <li>Long-term liabilities: bank loans, leases — tracked with repayment schedules</li>
                  <li>
                    Statutory reports generated at year-end: Balance sheet (Bilan), Income statement (Compte de
                    résultat), Cash flow statement (Tableau des flux) — all in SYSCOHADA Révisé format
                  </li>
                  <li>
                    Equity movement statement showing opening → additions → profit → drawings → closing equity
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className={styles.noteBoxGreen} data-reveal="">
            <p>
              <strong>Why this matters beyond Cameroon:</strong> All 17 OHADA member states — Cameroon, Gabon,
              Congo-Brazzaville, Chad, Central African Republic, Equatorial Guinea, and 11 others — are legally
              required to maintain accounts in the SYSCOHADA format. BizTrack CM will be the first affordable
              business management software to achieve full SYSCOHADA Révisé compliance, making it distributable
              across Central and West Africa without modification.
            </p>
          </div>
        </div>
      </section>

      {/* ── PAYTRACK CM ─────────────────────────────────────────────────────── */}
      <section className={styles.release} id="paytrack">
        <div className={styles.container}>
          <div className={styles.releaseHead} data-reveal="">
            <div>
              <span className={`${styles.releaseTag} ${styles.tagQ4}`}>🚀 2027</span>
              <div className={styles.releaseV}>PayTrack CM</div>
              <div className={styles.releaseDate}>
                <i className={styles.releaseDateIcon}>↗</i> Target: Q1–Q2 2027
              </div>
              <div className={styles.releaseSummary}>
                A full standalone digital payments infrastructure product for Cameroon and Central Africa — and a
                native integration inside BizTrack CM. MTN MoMo, Orange Money, QR codes, card terminals, and
                payment links.
              </div>
            </div>
            <div className={styles.releaseDesc}>
              <h3>The payments layer Cameroon has been missing.</h3>
              <p>
                PayTrack CM is not just a feature of BizTrack CM — it is a full product in its own right. Any
                business, online shop, school, or developer in Cameroon can create a PayTrack CM merchant account
                and start accepting digital payments. BizTrack CM will be its first and deepest integration
                partner.
              </p>
              <p style={{ marginTop: '0.75rem' }}>
                The 6–12 months between now and PayTrack CM are not idle — formal partnership applications with MTN
                Cameroon, Orange Money, and a card provider are in progress now, and the regulatory groundwork
                (COBAC compliance, BEAC digital payments framework, SARL registration) is being completed in
                parallel.
              </p>
            </div>
          </div>

          <div className={styles.ptHero} data-reveal="">
            <h3>PayTrack CM — standalone payments product</h3>
            <p>
              PayTrack CM gives any Cameroonian business a single integration point for all digital payment
              methods. The customer pays on their phone in seconds. The merchant receives instant confirmation.
              Funds settle to mobile money or bank account daily.
            </p>
            <div className={styles.ptTags}>
              <span
                className={styles.ptTag}
                style={{ background: 'rgba(245,166,35,.12)', color: 'var(--amber)', border: '1px solid rgba(245,166,35,.25)' }}
              >
                MTN Mobile Money
              </span>
              <span
                className={styles.ptTag}
                style={{ background: 'rgba(226,75,74,.1)', color: '#f07070', border: '1px solid rgba(226,75,74,.2)' }}
              >
                Orange Money
              </span>
              <span
                className={styles.ptTag}
                style={{ background: 'rgba(55,138,221,.1)', color: 'var(--blue)', border: '1px solid rgba(55,138,221,.2)' }}
              >
                QR Code payments
              </span>
              <span
                className={styles.ptTag}
                style={{ background: 'rgba(127,119,221,.1)', color: 'var(--purple)', border: '1px solid rgba(127,119,221,.2)' }}
              >
                Card terminal
              </span>
              <span
                className={styles.ptTag}
                style={{ background: 'var(--surface)', color: 'var(--textS)', border: '1px solid var(--border)' }}
              >
                Payment links
              </span>
              <span
                className={styles.ptTag}
                style={{ background: 'var(--surface)', color: 'var(--textS)', border: '1px solid var(--border)' }}
              >
                Developer API &amp; SDK
              </span>
            </div>
          </div>

          <div className={styles.fgrid} data-reveal="" data-delay="1">
            {/* Mobile Money */}
            <div className={`${styles.fcard} ${styles.fcardPurple}`}>
              <div className={`${styles.fcardIcon} ${styles.fiPurple}`}>📲</div>
              <h4>Mobile Money — push payments</h4>
              <p>
                Cashier enters the sale total and requests payment. The customer receives a push notification on
                their MTN or Orange phone and approves in seconds. PayTrack CM confirms the payment to BizTrack CM
                automatically — no manual verification needed.
              </p>
              <div className={styles.fcardDetail}>
                <ul>
                  <li>USSD push to customer phone — no app required for the customer</li>
                  <li>Payment confirmation webhook updates the sale status instantly</li>
                  <li>MoMo transaction reference stored on the receipt and in the sale record</li>
                  <li>
                    Pending payment state if customer doesn&apos;t respond — cashier can retry or switch to cash
                  </li>
                </ul>
              </div>
            </div>

            {/* QR Code */}
            <div className={`${styles.fcard} ${styles.fcardPurple}`}>
              <div className={`${styles.fcardIcon} ${styles.fiPurple}`}>📱</div>
              <h4>QR Code payments</h4>
              <p>
                A dynamic QR code generated for the exact sale amount. The customer scans with their MTN or Orange
                app. A single QR works for both providers — no need for two separate codes. Ideal for counter
                displays.
              </p>
              <div className={styles.fcardDetail}>
                <ul>
                  <li>Dynamic QR generated per transaction — amount is pre-filled for the customer</li>
                  <li>Works with both MTN and Orange wallets from one code</li>
                  <li>Second screen / counter display mode — show the QR facing the customer</li>
                  <li>Instant confirmation when customer completes payment</li>
                </ul>
              </div>
            </div>

            {/* Payment links */}
            <div className={`${styles.fcard} ${styles.fcardPurple}`}>
              <div className={`${styles.fcardIcon} ${styles.fiPurple}`}>🔗</div>
              <h4>Payment links</h4>
              <p>
                Generate a payment link for any amount and share it via WhatsApp, SMS, or email. The customer opens
                it in any browser, chooses their payment method, and pays. Enables remote sales, delivery payments,
                and online orders.
              </p>
              <div className={styles.fcardDetail}>
                <ul>
                  <li>Link generated in one tap with amount, description, and expiry</li>
                  <li>Customer pays via MoMo or card — no app install required</li>
                  <li>Payment confirmed instantly via webhook — BizTrack CM sale is updated</li>
                  <li>Shareable via WhatsApp, SMS, or email from within BizTrack CM</li>
                </ul>
              </div>
            </div>

            {/* Card terminal */}
            <div className={`${styles.fcard} ${styles.fcardPurple}`}>
              <div className={`${styles.fcardIcon} ${styles.fiPurple}`}>💳</div>
              <h4>Card terminal</h4>
              <p>
                A Bluetooth-paired card terminal accepts Visa, Mastercard, and GIM-UEMOA cards. The customer taps
                or inserts their card. BizTrack CM communicates with the terminal and receives confirmation
                automatically.
              </p>
              <div className={styles.fcardDetail}>
                <ul>
                  <li>Bluetooth pairing — no cables, works on the counter or at the customer&apos;s table</li>
                  <li>Supports tap (NFC), chip &amp; PIN, and magnetic stripe</li>
                  <li>GIM-UEMOA network (local) + Visa/Mastercard (international)</li>
                  <li>Provider: evaluating options — Stripe (international) vs local African rail partners</li>
                </ul>
              </div>
            </div>
          </div>

          <div className={styles.noteBoxPurple} data-reveal="">
            <p>
              <strong>PayTrack CM will also be available as a standalone product and developer API</strong> — any
              business in Cameroon can create a merchant account and accept payments through PayTrack CM, whether
              or not they use BizTrack CM. A JavaScript SDK for online shops and a full REST API for developers are
              part of the launch scope.
            </p>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerInner}>
            <span className={styles.footerNote}>© 2026 BizTrack CM · Douala, Cameroon · biztrack.cm</span>
            <a
              href="https://www.linkedin.com/company/hk-soln"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.footerLink}
            >
              LinkedIn ↗
            </a>
            <span className={styles.footerNote}>Dates are targets, not guarantees. We ship when features are ready.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
