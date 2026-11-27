/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER CAREER, PRO TAXES & BUSINESS ENTITY GUIDE (/learn/poker-as-a-business)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Authoritative educational reference covering Amateur (Schedule 1 / Schedule A)
 * vs. Professional Gambler (IRS Schedule C) status, Commissioner v. Groetzinger
 * 9-factor test, OBBBA 90% loss deduction cap impact, contemporaneously
 * maintained session logs, 2026 W-2G threshold ($2,000), International Tax
 * Treaties (0% vs 30% FDAP), and LLC/S-Corp considerations.
 *
 * House style: Title Case, zero em dashes.
 */

import React from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import SmarterAccountUnlockGate from '../../src/components/seo/SmarterAccountUnlockGate';

const GROETZINGER_CRITERIA = [
  {
    factor: '1. Continuity & Regularity Of Activity (Commissioner Vs. Groetzinger, 480 U.S. 23)',
    requirement:
      'Playing Poker With Full-Time Regularity (Typically 1,000+ To 1,500+ Logged Hours Per Year Across Cash Games Or Tournaments) As A Primary Livelihood Rather Than Sporadic Weekend Recreation.',
  },
  {
    factor: '2. Contemporaneous Session Logbooks & Separate Bankroll Accounting',
    requirement:
      'Maintaining A Dedicated Poker Bankroll Checking/Savings Account Separate From Personal Household Accounts And Recording Every Net Session Result At The Time Of Play (Date, Venue, Game Type, Stakes, Hours, Net Win/Loss).',
  },
  {
    factor: '3. Businesslike Conduct & Ongoing Study / Solver Expenses',
    requirement:
      'Operating With Written Bankroll Management Rules, Documented Solver/Training Subscriptions, Staking Contracts, And Systematic Adjustments To Maximize Long-Term Profit.',
  },
  {
    factor: '4. Dependence On Poker Income For Livelihood',
    requirement:
      'Relying On Net Poker Earnings (Or Full-Time Time Commitment) As Your Primary Trade Or Business Under Internal Revenue Code Section 162.',
  },
];

const INTERNATIONAL_TREATY_ROWS = [
  {
    country: 'United Kingdom, Ireland, Canada (Treaty / Domestic Rules)',
    usWithholding: '0% Withholding For UK/Ireland Residents With Valid Form W-8BEN & ITIN (Canada Allows Pro-Rata Loss Offset Under Article XXII)',
    localTreatment: 'UK And Canada Do Not Tax Recreational Gambling Winnings Domestically (Subject To Local Professional Trade Tests).',
  },
  {
    country: 'Germany, France, Spain, Italy, Austria, Czech Republic',
    usWithholding: '0% US Federal Withholding Under US Tax Treaty Form W-8BEN + ITIN Filing At The Casino Cage',
    localTreatment: 'Exempt From 30% US FDAP Withholding At WSOP/WPT Cages When Treaty Paperwork Is Completed Before Payout.',
  },
  {
    country: 'Non-Treaty Countries (Brazil, Argentina, China, Australia, Etc.)',
    usWithholding: 'Mandatory 30% Flat FDAP Withholding On Net Tournament Payouts Over $5,000 Under IRC Section 1441',
    localTreatment: '30% Withheld At The US Casino Cage Unless Recoverable Via Non-Resident Form 1040-NR Where Permitted.',
  },
];

const SESSION_LOG_FIELDS = [
  'Exact Calendar Date And Start/End Timestamps Of The Session',
  'Name And City/State Location Of The Cardroom, Casino, Or Tournament Series',
  'Game Variant And Blind Stakes (For Example: $2/$5 No-Limit Hold\'em Or $1,100 NLH Tournament)',
  'Total Buy-In Amount And Total Cash-Out Amount (Net Session Win Or Net Session Loss)',
  'Table Or Seat Numbers, Player Rewards Card Check-In Stamp, Or Tournament Receipt Number',
  'Supporting Secondary Evidence: ATM Withdrawal Receipts, Cage Marker Slips, Hotel Folios, And Win/Loss Statements',
];

const BUSINESS_FAQS = [
  {
    q: 'How Does The OBBBA 90% Gambling Loss Deduction Cap Affect Poker Players In 2026?',
    a: 'Under The One Big Beautiful Bill Act (OBBBA) Amendment To IRC Section 165(d), Deductible Gambling Losses (Plus Schedule C Travel And Business Expenses For Pros) Are Capped At 90% Of Gross Gambling Winnings Rather Than 100%. This Means Even A Break-Even High-Volume Player With $200,000 In Gross Winning Sessions And $200,000 In Gross Losing Sessions Faces $20,000 In Phantom Taxable Income. Use Our Poker Tax Calculator To Model Your Exact Net Liability.',
  },
  {
    q: 'What Is The New IRS Form W-2G Reporting Threshold For Poker Tournaments In 2026?',
    a: 'Beginning In Tax Year 2026, The IRS Form W-2G Reporting Threshold Increased To $2,000 (Indexed For Inflation Under OBBBA Rules), Replacing The Legacy Thresholds, Though Poker Tournament Net Payouts Over $5,000 Still Trigger Mandatory W-2G Reporting And Backup/Treaty Withholding Verification.',
  },
  {
    q: 'Can I Form An LLC Or S-Corp To Avoid Self-Employment Tax On My Table Winnings?',
    a: 'Table Play Winnings Reported As A Professional Gambler Flow Through To Self-Employment Tax (15.3% Up To The Social Security Wage Base Plus 2.9% Medicare). While An S-Corp Is Widely Used By Poker Content Creators, Coaches, Sponsorship Earners, And Streamers To Split Reasonable Salary From Distributions On Media/Coaching Revenue, Consult A Qualified Gaming CPA Before Routing Direct Table Action Through A Pass-Through Entity.',
  },
  {
    q: 'Can I Just Report My Net Year-End Profit Instead Of Gross Winning And Losing Sessions?',
    a: 'No. Under Long-Standing IRS And US Tax Court Precedent, You Cannot Net Losing Days Against Winning Days Off-Return. Every Separate Poker Session Must Be Aggregated Into Total Gross Winning Sessions And Total Gross Losing Sessions.',
  },
];

export default function PokerAsABusinessPage() {
  const canonicalPath = '/learn/poker-as-a-business';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: 'Professional Poker Career, Tax Law, Schedule C & Business Entity Guide (2026)',
      name: 'Professional Poker Tax And Career Guide',
      description:
        'Complete Guide To Professional Vs. Amateur Poker Taxes: IRS Schedule C Vs. Schedule 1, Commissioner v. Groetzinger, OBBBA 90% Loss Cap, $2,000 W-2G Threshold, And Staking.',
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: '2026-11-24',
      dateModified: '2026-11-24',
      isAccessibleForFree: true,
      author: { '@id': 'https://smarter.poker/#organization' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'header p:first-of-type'],
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${canonicalUrl}#faq`,
      mainEntity: BUSINESS_FAQS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: f.a,
        },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${canonicalUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Learn Poker', item: 'https://smarter.poker/learn' },
        { '@type': 'ListItem', position: 3, name: 'Professional Poker Tax & Career Guide', item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Professional Poker Tax And Career Guide"
        description="Complete Guide To Professional Vs. Amateur Poker Taxes: IRS Schedule C Vs. Schedule 1, Commissioner v. Groetzinger, OBBBA 90% Loss Cap, $2,000 W-2G Threshold, And Staking."
        canonical={canonicalPath}
        jsonLd={jsonLd}
      />

      <UniversalHeader pageDepth={2} />

      <main style={styles.container}>
        <nav aria-label="Breadcrumb" style={styles.breadcrumbs}>
          <Link href="/" style={styles.crumbLink}>
            Smarter.Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <Link href="/learn" style={styles.crumbLink}>
            Learn Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>Professional Poker Tax &amp; Career Guide</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>2026 IRS SCHEDULE C &amp; OBBBA 90% LOSS CAP GUIDE</span>
            <span style={styles.emeraldBadge}>GROETZINGER TEST, W-2G &amp; STAKING ACCOUNTING</span>
          </div>

          <h1 style={styles.h1}>
            Poker As A Business: Professional Gambler Taxes, Schedule C, OBBBA 90% Cap &amp; Entity Guide
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Transitioning From A Winning Amateur To A Full-Time Poker Professional Changes Your Entire Tax, Accounting, And Entity Architecture. In The United States, Amateur Players Report Gross Winning Sessions On <strong>Form 1040 Schedule 1</strong> And Must Itemize Losses On <strong>Schedule A</strong> (Forfeiting The Standard Deduction), Whereas Qualifying Professionals Under <strong>Commissioner Vs. Groetzinger</strong> Report On <strong>IRS Schedule C</strong>, Deduct Business Travel Expenses, Pay <strong>15.3% Self-Employment Tax</strong>, And Navigate The <strong>2026 OBBBA 90% Loss Deduction Cap</strong>.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/tools/poker-tax-calculator" style={styles.crossBtnCyan}>
              Open 2026 Poker Tax &amp; OBBBA 90% Cap Calculator
            </Link>
            <Link href="/tools/staking-calculator" style={styles.crossBtnEmerald}>
              Launch Tournament Staking &amp; Markup Calculator
            </Link>
            <Link href="/tools/bankroll-calculator" style={styles.crossBtnOutline}>
              Pro Risk Of Ruin &amp; Bankroll Calculator
            </Link>
            <Link href="/poker-rooms/states" style={styles.crossBtnOutline}>
              All 50 US States &amp; DC Poker Laws &amp; Tax Guides
            </Link>
          </div>
        </header>

        {/* Amateur vs Professional Gambler Comparison Table */}
        <section aria-label="Amateur Versus Professional Gambler Tax Comparison" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Amateur Player (Schedule 1 + Schedule A) Vs. Professional Gambler (IRS Schedule C)
          </h2>
          <div style={{ overflowX: 'auto', maxWidth: '100%', WebkitOverflowScrolling: 'touch' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Tax &amp; Accounting Dimension</th>
                  <th style={styles.th}>Amateur / Recreational Filers</th>
                  <th style={styles.th}>Professional Gambler (Schedule C)</th>
                </tr>
              </thead>
              <tbody>
                <tr style={styles.trBody}>
                  <td style={styles.tdTitle}>Where Gross Winning Sessions Report</td>
                  <td style={styles.td}>Form 1040 Schedule 1 (Other Income)</td>
                  <td style={styles.tdCyan}>Form 1040 Schedule C (Gross Receipts)</td>
                </tr>
                <tr style={styles.trBody}>
                  <td style={styles.tdTitle}>Where Gross Losing Sessions Deduct</td>
                  <td style={styles.td}>Schedule A Itemized Deductions (Forfeits Standard Deduction)</td>
                  <td style={styles.tdEmerald}>Schedule C Above-The-Line (Keeps Full Standard Deduction!)</td>
                </tr>
                <tr style={styles.trBody}>
                  <td style={styles.tdTitle}>Adjusted Gross Income (AGI) Impact</td>
                  <td style={styles.td}>Inflates AGI By Full Gross Winning Sessions (Can Trigger Phase-Outs)</td>
                  <td style={styles.tdEmerald}>Only Net Schedule C Profit Enters Adjusted Gross Income (AGI)</td>
                </tr>
                <tr style={styles.trBody}>
                  <td style={styles.tdTitle}>2026 OBBBA IRC Section 165(D) 90% Loss Cap</td>
                  <td style={styles.td}>Losses Capped At 90% Of Gross Winning Sessions</td>
                  <td style={styles.td}>Combined Losses + Business Expenses Capped At 90% Of Winnings</td>
                </tr>
                <tr style={styles.trBody}>
                  <td style={styles.tdTitle}>Travel, Hotel, Flights &amp; Coaching Deductions</td>
                  <td style={styles.td}>0% Deductible (Personal Recreation Expenses)</td>
                  <td style={styles.tdCyan}>Deductible Ordinary &amp; Necessary Business Expenses On Schedule C</td>
                </tr>
                <tr style={styles.trBody}>
                  <td style={styles.tdTitle}>Self-Employment Tax (15.3% FICA) &amp; Solo 401(K)</td>
                  <td style={styles.td}>No Self-Employment Tax; No Retirement Plan Contribution Access</td>
                  <td style={styles.tdCyan}>Pay 15.3% SE Tax; Eligible For Solo 401(K) &amp; SEP-IRA Shelters</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Commissioner Vs. Groetzinger & OBBBA 90% Cap */}
        <section aria-label="Groetzinger Test And OBBBA 90 Percent Cap" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Qualifying For Professional Status: Commissioner Vs. Groetzinger (480 U.S. 23)
          </h2>
          <p style={styles.bodyText}>
            In The Landmark 1987 Supreme Court Ruling <strong>Commissioner Vs. Groetzinger</strong>, The Court Established That If A Taxpayer Devotes Full-Time Endeavor To Gambling In Good Faith With Continuity And Regularity To Produce A Livelihood, It Constitutes A Trade Or Business Under IRC Section 162:
          </p>
          <div style={styles.twoColGrid}>
            {GROETZINGER_CRITERIA.map((g) => (
              <div key={g.factor} style={styles.colBox}>
                <div style={styles.tagCyan}>LEGAL BENCHMARK</div>
                <h3 style={styles.h3}>{g.factor}</h3>
                <p style={styles.bodyText}>{g.requirement}</p>
              </div>
            ))}
          </div>
        </section>

        {/* OBBBA 90% Loss Cap & 2026 W-2G ($2,000) Rules */}
        <section aria-label="OBBBA 90 Percent Cap And 2026 W-2G Threshold" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            2026 OBBBA 90% Loss Deduction Cap &amp; Updated $2,000 W-2G Reporting Rules
          </h2>
          <div style={styles.twoColGrid}>
            <div style={styles.colBox}>
              <div style={styles.tagEmerald}>IRC SECTION 165(D) 90% LOSS CAP</div>
              <h3 style={styles.h3}>How The 90% Loss Deduction Cap Impacts High-Volume Grinders</h3>
              <p style={styles.bodyText}>
                Under The One Big Beautiful Bill Act (OBBBA) Revision To Internal Revenue Code Section 165(D), Taxpayers May Only Deduct Up To <strong>90% Of Their Gambling Losses</strong> Against Gross Gambling Winnings. Because The IRS Taxes Poker On A <strong>Session-By-Session Basis</strong> Rather Than Year-End Net Profit, High-Volume Tournament And Cash Players Who Accumulate $300,000 In Gross Winning Sessions And $250,000 In Gross Losing Sessions Can Only Deduct $225,000 (90% Of $250,000), Paying Tax On $75,000 Despite Only Netting $50,000 In Real Cash.
              </p>
            </div>

            <div style={styles.colBox}>
              <div style={styles.tagCyan}>2026 W-2G &amp; FORM 1099-K / 1099-MISC</div>
              <h3 style={styles.h3}>$2,000 W-2G Reporting Threshold &amp; Staking Form 1099 Rules</h3>
              <p style={styles.bodyText}>
                For Tax Year 2026, The General IRS Form W-2G Reporting Threshold Is Modernized To <strong>$2,000</strong> (Indexed For Inflation), While Poker Tournament Net Winnings Exceeding $5,000 (Payout Minus Buy-In) Trigger Mandatory Casino Form W-2G Issuance. When Selling Action Or Backing Players In Tournaments, Issue <strong>Form 1099-MISC</strong> Or Execute Written CO-Ownership Staking Agreements Before Event Registration So You Are Not Taxed On 100% Of A Form W-2G Payout When You Only Retained 50% Of The Action.
              </p>
            </div>
          </div>
        </section>

        {/* Contemporaneous Session Logs & LLC / S-Corp Structure */}
        <section aria-label="Contemporaneous Session Logs And LLC Entities" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Contemporaneously Maintained Session Logs (IRS Revenue Procedure 77-29) &amp; LLC / S-Corp Entities
          </h2>
          <div style={styles.twoColGrid}>
            <div style={styles.colBox}>
              <div style={styles.tagCyan}>AUDIT-PROOF RECORDKEEPING</div>
              <h3 style={styles.h3}>6 Mandatory Fields In Your Contemporaneous Session Log</h3>
              <ul style={styles.bulletList}>
                {SESSION_LOG_FIELDS.map((field) => (
                  <li key={field} style={styles.bulletItem}>
                    {field}
                  </li>
                ))}
              </ul>
            </div>

            <div style={styles.colBox}>
              <div style={styles.tagEmerald}>BUSINESS ENTITIES FOR PROS</div>
              <h3 style={styles.h3}>LLC Vs. S-Corp For Content, Coaching, Sponsorships &amp; Table Play</h3>
              <p style={styles.bodyText}>
                Many Modern Poker Professionals Earn Revenue Across Two Distinct Streams: (1) <strong>Direct Table Play</strong> (Cash Games &amp; Tournaments) And (2) <strong>Off-Felt Poker Business Revenue</strong> (YouTube/Twitch Streaming, Coaching, Affiliates, Book Royalties, And Patch Sponsorships). Forming An <strong>LLC Or S-Corporation</strong> For Your Coaching, Media, And Sponsorship Business Segregates Liability, Unlocks Reasonable-Salary S-Corp Payroll Optimization, And Enables Clean Solo 401(K) Profit-Sharing Contributions Without Commingling Staking Funds.
              </p>
            </div>
          </div>
        </section>

        {/* International Tax Treaties */}
        <section aria-label="International Poker Tax Treaties" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            International Tax Treaties: 0% Treaty Exemption Vs. 30% US FDAP Withholding At WSOP
          </h2>
          <div style={{ overflowX: 'auto', maxWidth: '100%', WebkitOverflowScrolling: 'touch' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Player Residency Jurisdiction</th>
                  <th style={styles.th}>US Casino Cage Withholding Rule</th>
                  <th style={styles.th}>Domestic Home-Country Tax Treatment</th>
                </tr>
              </thead>
              <tbody>
                {INTERNATIONAL_TREATY_ROWS.map((row) => (
                  <tr key={row.country} style={styles.trBody}>
                    <td style={styles.tdTitle}>{row.country}</td>
                    <td style={styles.tdCyan}>{row.usWithholding}</td>
                    <td style={styles.td}>{row.localTreatment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/poker-tax-calculator" style={styles.crossBtnCyan}>
              Calculate Your 2026 Poker Tax &amp; OBBBA Liability
            </Link>
            <Link href="/tools/staking-calculator" style={styles.crossBtnEmerald}>
              Calculate Staking Markup &amp; Backer Splits
            </Link>
            <Link href="/poker-rooms/international" style={styles.crossBtnOutline}>
              Explore 10 International Poker Destination Tax Guides
            </Link>
          </div>
        </section>
        <SmarterAccountUnlockGate
          variant="study-deck"
          context="learn-poker-as-a-business"
          title="Unlock Free Bankroll Ledger, Session Exports & Tax-Ready Logs"
          redirectPath={canonicalPath}
        />


        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions: Professional Poker Taxes &amp; Schedule C</h2>
          <div style={styles.faqList}>
            {BUSINESS_FAQS.map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <p style={styles.disclaimer}>
          Educational Tax &amp; Legal Disclaimer: Smarter.Poker Provides Independent Educational Information Citing Published Internal Revenue Code Sections, Supreme Court Precedent (Commissioner Vs. Groetzinger), And International Tax Treaties. This Guide Is Not Formal Tax Or Legal Advice; Consult A Licensed CPA Or Tax Attorney For Your Specific Filing.
        </p>

        <CitationBacklinkBox
          title="Professional Poker Career, Tax Law, Schedule C & Business Entity Guide"
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel="2026 Tax & Career Law"
          badgeValue="IRC §162 & §165(d)"
          summary="Comprehensive reference comparing Amateur Schedule 1 vs Professional Schedule C poker taxation, Commissioner v. Groetzinger criteria, OBBBA 90% loss cap, and W-2G rules."
          publishedYear="2026"
          slug="professional-poker-tax-career-guide"
        />

        <AiPromptLauncher
          title="Professional Poker Career, Tax Law & Schedule C Guide"
          canonicalUrl={canonicalUrl}
          canonicalPath={canonicalPath}
        />
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#071321',
    color: '#f2f7ff',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  },
  container: {
    maxWidth: 1080,
    margin: '0 auto',
    padding: '32px 20px 80px',
  },
  breadcrumbs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    fontSize: 13,
    color: '#bdd0e2',
    marginBottom: 18,
  },
  crumbLink: { color: '#38bdf8', textDecoration: 'none' },
  crumbSep: { color: '#2b4663' },
  crumbCurrent: { color: '#bdd0e2', fontWeight: 600 },
  heroPlate: {
    background: 'linear-gradient(180deg, #0d1f33 0%, #0a1a2b 100%)',
    border: '1px solid #2b4663',
    borderRadius: 0,
    padding: '28px 26px',
    marginBottom: 26,
  },
  badgeRow: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  cyanBadge: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.06em',
    padding: '4px 10px',
    borderRadius: 0,
    background: 'rgba(56, 189, 248, 0.14)',
    color: '#38bdf8',
    border: '1px solid rgba(56, 189, 248, 0.35)',
  },
  emeraldBadge: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.06em',
    padding: '4px 10px',
    borderRadius: 0,
    background: 'rgba(16, 185, 129, 0.14)',
    color: '#34d399',
    border: '1px solid rgba(16, 185, 129, 0.35)',
  },
  h1: {
    fontSize: 'clamp(26px, 3.6vw, 36px)',
    fontWeight: 800,
    color: '#f2f7ff',
    lineHeight: 1.2,
    margin: '0 0 14px 0',
  },
  lead: {
    fontSize: 16,
    lineHeight: 1.68,
    color: '#bdd0e2',
    margin: '0 0 20px 0',
  },
  quickCrossLinks: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  crossBtnCyan: {
    padding: '9px 15px',
    borderRadius: 0,
    background: '#38bdf8',
    color: '#071321',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  crossBtnEmerald: {
    padding: '9px 15px',
    borderRadius: 0,
    background: '#10b981',
    color: '#071321',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  crossBtnOutline: {
    padding: '9px 15px',
    borderRadius: 0,
    background: '#0d1f33',
    color: '#38bdf8',
    border: '1px solid #2b4663',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  sectionPlate: {
    background: '#0a1a2b',
    border: '1px solid #2b4663',
    borderRadius: 0,
    padding: '24px 22px',
    marginBottom: 26,
  },
  h2: { fontSize: 21, fontWeight: 800, color: '#f2f7ff', margin: '0 0 14px 0' },
  h3: { fontSize: 16.5, fontWeight: 800, color: '#f2f7ff', margin: '6px 0 10px 0' },
  bodyText: { fontSize: 14.5, lineHeight: 1.65, color: '#bdd0e2', margin: 0 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  trHead: { borderBottom: '1px solid #2b4663', textAlign: 'left', color: '#38bdf8' },
  th: { padding: '10px 12px', fontWeight: 700 },
  trBody: { borderBottom: '1px solid #2b4663' },
  tdTitle: { padding: '11px 12px', fontWeight: 700, color: '#f2f7ff' },
  td: { padding: '11px 12px', color: '#bdd0e2' },
  tdCyan: { padding: '11px 12px', color: '#38bdf8', fontWeight: 700 },
  tdEmerald: { padding: '11px 12px', color: '#34d399', fontWeight: 700 },
  twoColGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
    gap: 16,
    marginTop: 14,
  },
  colBox: {
    background: '#0d1f33',
    border: '1px solid #2b4663',
    borderRadius: 0,
    padding: 18,
  },
  tagCyan: {
    display: 'inline-block',
    fontSize: 11,
    fontWeight: 800,
    color: '#38bdf8',
    letterSpacing: '0.05em',
  },
  tagEmerald: {
    display: 'inline-block',
    fontSize: 11,
    fontWeight: 800,
    color: '#34d399',
    letterSpacing: '0.05em',
  },
  bulletList: { margin: 0, paddingLeft: 18, display: 'grid', gap: 10 },
  bulletItem: { fontSize: 14, lineHeight: 1.6, color: '#bdd0e2' },
  faqList: { display: 'grid', gap: 14 },
  faqItem: {
    background: '#0d1f33',
    border: '1px solid #2b4663',
    borderRadius: 0,
    padding: '16px 18px',
  },
  faqQ: { fontSize: 16, fontWeight: 700, color: '#f2f7ff', margin: '0 0 6px 0' },
  faqA: { fontSize: 14, lineHeight: 1.6, color: '#bdd0e2', margin: 0 },
  disclaimer: {
    fontSize: 12.5,
    color: '#bdd0e2',
    lineHeight: 1.6,
    marginBottom: 22,
  },
};

export async function getServerSideProps({ req, res, query }) {
  const accept = String(req?.headers?.accept || '');
  if (
    query?.format === 'md' ||
    query?.format === 'markdown' ||
    accept.includes('text/markdown') ||
    req?.url?.includes('format=md')
  ) {
    const { renderHubToolMarkdown } = await import('../api/hub-tool-markdown');
    const md = renderHubToolMarkdown('/learn/poker-as-a-business', query);
    if (md) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Vary', 'Accept');
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      res.write(md);
      res.end();
      return { props: {} };
    }
  }
  return { props: {} };
}

