/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  LIVE CASINO POKER COMPS, REWARDS CARDS & DEALER TIPPING ETIQUETTE GUIDE
 *  (/poker-rooms/comps-and-tipping-guide)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Evergreen live cardroom handbook covering Hourly Comp Rates ($1-$3/hr across
 * MGM Rewards, Caesars Rewards, Wynn Rewards, Venetian, and Regional Rooms),
 * Dealer Toke Standards for Cash & Tournaments, and Food/Room Comp Maximization.
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';

const CASINO_REWARDS_PROGRAMS = [
  {
    program: 'MGM Rewards (Bellagio, Aria, MGM Grand, Borgata, MGM National Harbor)',
    cashCompRate: '$1.50 To $2.00 Per Tracked Cash Game Hour',
    tierCredits: 'Tier Credit Accrual On Tracked Poker Table Hours + Resort Spend',
    redemptionBestUse: 'Direct Food & Beverage Express Comps, Resort Fee Waivers (Gold+), And Discounted Poker Room Rates.',
  },
  {
    program: 'Caesars Rewards (Caesars Palace, Horseshoe, Planet Hollywood, WSOP)',
    cashCompRate: '$1.00 To $1.50 Per Tracked Cash Game Hour (Reward Credits)',
    tierCredits: 'Approximately 17 To 34 Tier Credits Per Hour At $1/$3 & $2/$5',
    redemptionBestUse: 'Achieving Diamond Status (15,000 Tier Credits) Eliminates $45-$55 Daily Resort Fees Across All Caesars Properties During The WSOP.',
  },
  {
    program: 'Wynn Rewards (Wynn / Encore Las Vegas & Encore Boston Harbor)',
    cashCompRate: '$1.50 To $2.00 Per Tracked Cash Game Hour ($3.00/Hr At High Stakes)',
    tierCredits: 'Dedicated Poker Room Comp Dollar Balance Accessible At Dining Outlets',
    redemptionBestUse: 'High-End Dining, Buffet, And Coffee Shop Redemptions Plus Dedicated Poker Room Hotel Rate Blocks.',
  },
  {
    program: 'Venetian Rewards & Regional Standalone Rooms (Parx, Commerce, Seminole)',
    cashCompRate: '$1.50 To $3.00 Per Tracked Hour (Plus Volume Hours Freerolls)',
    tierCredits: 'Qualifies For Dedicated Poker Room Rate ($99-$149 Weekday Room Blocks) With 5-6 Hours Daily Play',
    redemptionBestUse: 'Combining Hourly Food Comps With Monthly 60-To-100 Hour Cash Game Freerolls And High-Hand Promotions.',
  },
];

const TIPPING_STANDARDS = [
  {
    scenario: 'Standard $1/$2, $1/$3 & $2/$5 Contested Cash Pot ($20 To $80)',
    standardTip: '$1.00 Per Pot Won',
    notes: 'Toss A $1 White Chip To The Dealer As The Pot Is Pushed. Never Tip On Hands You Fold Or Lose.',
  },
  {
    scenario: 'Large Multi-Street Or All-In Cash Pot ($150 To $600+)',
    standardTip: '$2.00 To $5.00 Per Pot Won',
    notes: 'Scale Up Slightly On Massive Full-Double Pots Or Complex Split-Pot Side-Pot Calculations.',
  },
  {
    scenario: 'Uncontested Pre-Flop Walk Or Small Blind Steal',
    standardTip: '$0.00 To $1.00 (Optional)',
    notes: 'When Everyone Folds To Your Big Blind Or Pre-Flop Open With No Flop Dealt, Tipping Is Optional (Or Toss $0.50/$1.00 Occasionally).',
  },
  {
    scenario: 'High-Hand Promotion Or Bad Beat Jackpot Payout',
    standardTip: '3% To 5% Of Net Promotional Bonus',
    notes: 'When Winning A $500 High-Hand Or Bad Beat Jackpot Share, Tipping The Dealing Staff $15 To $25 Is Customary.',
  },
  {
    scenario: 'Live Multi-Table Tournament Cash / Final Table Payout',
    standardTip: '1% To 3% Beyond Mandatory Staff Withholding',
    notes: 'Always Check The Structure Sheet First! Most Casinos Already Withhold 3% To 5% Of The Prize Pool For Dealer And Floor Staff.',
  },
  {
    scenario: 'Cocktail Waitress / Table-Side Food Runner',
    standardTip: '$1.00 - $2.00 Per Drink | $3.00 - $5.00 Per Meal',
    notes: 'Tip With A $1 Or $2 Chip Every Time A Complimentary Beverage Or Table-Side Meal Arrives.',
  },
];

const COMPS_FAQS = [
  {
    q: 'Why Do Live Poker Players Earn Fewer Casino Comps Than Slot Or Blackjack Players?',
    a: 'Slot Machines Hold 6% To 12% Of Every Dollar Wagered Against The House, Whereas Poker Is A Player-Versus-Player Game Where The Casino Only Collects A Capped $5 To $7 Pot Rake And Pays A Live Dealer. Consequently, Casinos Award A Fixed $1.00 To $2.50 Per Hour In Poker Comps.',
  },
  {
    q: 'What Is The "Poker Room Hotel Rate" And How Do I Unlock It?',
    a: 'Major Poker Rooms (Such As Wynn, Venetian, Bellagio, Borgata, And Seminole Hard Rock) Offer Discounted Hotel Room Rates To Players Who Log 5 To 6 Hours Of Tracked Cash Game Play Per Day Of Their Stay. Call The Poker Room Brush Desk Directly Before Booking.',
  },
  {
    q: 'Are Dealer Tips Already Included When I Cash A Live Poker Tournament?',
    a: 'In 95%+ Of US Commercial Casino Tournaments, The House Automatically Withholds 3% To 5% Of The Total Prize Pool For Dealer And Floor Staff Before Publishing Payouts. Any Additional Tip At The Cage Is 100% Voluntary.',
  },
];

export default function CompsAndTippingGuidePage() {
  const [hoursPerMonth, setHoursPerMonth] = useState(80);
  const [compRatePerHr, setCompRatePerHr] = useState(2.0);
  const [potsWonPerHr, setPotsWonPerHr] = useState(3.0);
  const [avgTipPerPot, setAvgTipPerPot] = useState(1.25);

  const metrics = useMemo(() => {
    const hrs = Math.max(1, Number(hoursPerMonth) || 80);
    const comp = Math.max(0, Number(compRatePerHr) || 2.0);
    const pwh = Math.max(0.5, Number(potsWonPerHr) || 3.0);
    const tip = Math.max(0, Number(avgTipPerPot) || 1.25);

    const monthlyComps = hrs * comp;
    const annualComps = monthlyComps * 12;
    const hourlyTipOutflow = pwh * tip;
    const monthlyTips = hrs * hourlyTipOutflow;
    const netCompOffsetPct = monthlyTips > 0 ? Math.min(100, (monthlyComps / monthlyTips) * 100) : 100;

    return {
      monthlyComps,
      annualComps,
      hourlyTipOutflow,
      monthlyTips,
      netCompOffsetPct,
    };
  }, [hoursPerMonth, compRatePerHr, potsWonPerHr, avgTipPerPot]);

  const canonicalPath = '/poker-rooms/comps-and-tipping-guide';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: 'Live Casino Poker Comps, Rewards Cards & Dealer Tipping Etiquette Guide',
      name: 'Live Casino Poker Comps, Rewards Cards & Dealer Tipping Etiquette Guide',
      description:
        'Complete Guide To Live Casino Poker Room Comps ($1-$3/Hr Across MGM, Caesars, Wynn & Regional Rooms), Poker Room Hotel Rates, And Dealer Tipping Etiquette.',
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: '2026-11-10',
      dateModified: '2026-11-10',
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
      mainEntity: COMPS_FAQS.map((f) => ({
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
        { '@type': 'ListItem', position: 2, name: 'Poker Room Guides', item: 'https://smarter.poker/poker-rooms/guides' },
        { '@type': 'ListItem', position: 3, name: 'Casino Comps & Tipping Guide', item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Live Casino Poker Comps And Tipping Guide"
        description="Complete Guide To Live Casino Poker Room Comps ($1-$3/Hr Across MGM, Caesars, Wynn & Regional Rooms), Poker Room Hotel Rates, And Dealer Tipping Etiquette."
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
          <Link href="/poker-rooms/guides" style={styles.crumbLink}>
            Poker Room Guides
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>Comps, Rewards &amp; Tipping Guide</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>MGM, CAESARS, WYNN &amp; REGIONAL COMPS</span>
            <span style={styles.emeraldBadge}>INCLUDES COMP VS TIPPING OFFSET CALCULATOR</span>
          </div>

          <h1 style={styles.h1}>
            Live Casino Poker Comps, Rewards Cards &amp; Dealer Tipping Etiquette Guide
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Nearly Every US Casino Poker Room Awards
            <strong> $1.00 To $3.00 Per Tracked Hour In Player Rewards Comps</strong> Plus Access To Discounted
            <strong> Poker Room Hotel Rates (With 5 To 6 Hours Of Daily Play)</strong>. Meanwhile, Standard Cash Game Dealer Tipping Is
            <strong> $1.00 Per Contested Pot Won ($2 To $3 On Large Multi-Street Pots)</strong>, Meaning Your Hourly Casino Comps Offset Roughly 40% To 55% Of Your Dealer Toke Overhead.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/poker-rooms/first-time-guide" style={styles.crossBtnCyan}>
              First-Time Live Poker Room Guide
            </Link>
            <Link href="/poker-rooms/states" style={styles.crossBtnEmerald}>
              15 US State Legality &amp; Tax Guides
            </Link>
            <Link href="/poker-rooms/guides" style={styles.crossBtnOutline}>
              12 Regional City Market Guides
            </Link>
            <Link href="/tools/rake-calculator" style={styles.crossBtnOutline}>
              Live Cash Rake Calculator
            </Link>
            <Link href="/hub/poker-near-me" style={styles.crossBtnOutline}>
              Find Live Rooms Near Me
            </Link>
          </div>
        </header>

        {/* Interactive Comp vs Tipping Offset Calculator */}
        <section aria-label="Interactive Comp Versus Tipping Offset Calculator" style={styles.sectionPlate}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.h2}>
              Interactive Monthly Poker Comps Vs. Dealer Tipping Offset Calculator
            </h2>
            <span style={styles.calcBadge}>ANNUAL REWARDS ESTIMATOR</span>
          </div>

          <div style={styles.calcInputGrid}>
            <div style={styles.inputGroup}>
              <label htmlFor="comp-hrs" style={styles.inputLabel}>
                Monthly Live Hours Played
              </label>
              <input
                id="comp-hrs"
                type="number"
                min="1"
                max="300"
                value={hoursPerMonth}
                onChange={(e) => setHoursPerMonth(e.target.value)}
                style={styles.numInput}
              />
            </div>

            <div style={styles.inputGroup}>
              <label htmlFor="comp-rate" style={styles.inputLabel}>
                Casino Comp Rate ($ / Hr)
              </label>
              <input
                id="comp-rate"
                type="number"
                min="0"
                max="10"
                step="0.25"
                value={compRatePerHr}
                onChange={(e) => setCompRatePerHr(e.target.value)}
                style={styles.numInput}
              />
            </div>

            <div style={styles.inputGroup}>
              <label htmlFor="comp-pots" style={styles.inputLabel}>
                Pots Won Per Hour
              </label>
              <input
                id="comp-pots"
                type="number"
                min="0.5"
                max="10"
                step="0.1"
                value={potsWonPerHr}
                onChange={(e) => setPotsWonPerHr(e.target.value)}
                style={styles.numInput}
              />
            </div>

            <div style={styles.inputGroup}>
              <label htmlFor="comp-tip" style={styles.inputLabel}>
                Avg Tip Per Pot Won ($)
              </label>
              <input
                id="comp-tip"
                type="number"
                min="0"
                max="10"
                step="0.25"
                value={avgTipPerPot}
                onChange={(e) => setAvgTipPerPot(e.target.value)}
                style={styles.numInput}
              />
            </div>
          </div>

          <div style={styles.calcOutputGrid}>
            <div style={styles.outputCard}>
              <div style={styles.outputLabel}>Monthly Comp Dollars Earned</div>
              <div style={styles.outputValueEmerald}>${metrics.monthlyComps.toFixed(2)}</div>
              <div style={styles.outputSub}>${metrics.annualComps.toFixed(0)} Per Year In Free Dining/Rooms</div>
            </div>
            <div style={styles.outputCard}>
              <div style={styles.outputLabel}>Monthly Dealer Tips Paid</div>
              <div style={styles.outputValueCyan}>${metrics.monthlyTips.toFixed(2)}</div>
              <div style={styles.outputSub}>${metrics.hourlyTipOutflow.toFixed(2)} Per Hour Tip Outflow</div>
            </div>
            <div style={styles.outputCard}>
              <div style={styles.outputLabel}>Comp-To-Tip Rebate Offset</div>
              <div style={styles.outputValueEmerald}>{metrics.netCompOffsetPct.toFixed(1)}%</div>
              <div style={styles.outputSub}>Percentage Of Dealer Tips Covered By Comps</div>
            </div>
          </div>
        </section>

        {/* Major Casino Rewards Programs Comparison */}
        <section aria-label="Major Casino Poker Rewards Programs" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Major US Casino Loyalty Programs: Hourly Poker Comp Rates &amp; Perks
          </h2>
          <div style={{ overflowX: 'auto', marginTop: '14px' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Casino Rewards Program</th>
                  <th style={styles.th}>Hourly Poker Comp Rate</th>
                  <th style={styles.th}>Tier Credit Mechanics</th>
                  <th style={styles.th}>Highest-EV Redemption Strategy</th>
                </tr>
              </thead>
              <tbody>
                {CASINO_REWARDS_PROGRAMS.map((row) => (
                  <tr key={row.program} style={styles.trBody}>
                    <td style={styles.tdBold}>{row.program}</td>
                    <td style={styles.tdEmerald}>{row.cashCompRate}</td>
                    <td style={styles.tdCyan}>{row.tierCredits}</td>
                    <td style={styles.tdCell}>{row.redemptionBestUse}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Dealer Tipping Etiquette Table */}
        <section aria-label="Dealer Tipping Standards By Scenario" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Live Poker Dealer &amp; Staff Tipping Standards By Scenario
          </h2>
          <div style={{ overflowX: 'auto', marginTop: '14px' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Cardroom Scenario</th>
                  <th style={styles.th}>Recommended Tip</th>
                  <th style={styles.th}>Etiquette &amp; Winrate Notes</th>
                </tr>
              </thead>
              <tbody>
                {TIPPING_STANDARDS.map((row) => (
                  <tr key={row.scenario} style={styles.trBody}>
                    <td style={styles.tdBold}>{row.scenario}</td>
                    <td style={styles.tdCyan}>{row.standardTip}</td>
                    <td style={styles.tdCell}>{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions On Poker Comps &amp; Tipping</h2>
          <div style={styles.faqList}>
            {COMPS_FAQS.map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title="Live Casino Poker Comps, Rewards Cards & Dealer Tipping Etiquette Guide"
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel="Cardroom Economics Guide"
          badgeValue="$1-$3/Hr Comps & Toke Math"
          summary="Complete Guide To Live Casino Poker Room Comps ($1-$3/Hr Across MGM, Caesars, Wynn & Regional Rooms), Poker Room Hotel Rates, And Dealer Tipping Etiquette."
          publishedYear="2026"
          slug="poker-comps-and-tipping-guide"
        />

        <AiPromptLauncher
          title="Live Casino Poker Comps & Dealer Tipping Guide"
          canonicalUrl={canonicalUrl}
          canonicalPath={canonicalPath}
          markdownUrl="/poker-rooms/comps-and-tipping-guide.md"
        />
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#0a0f18',
    color: '#e2e8f0',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  },
  container: {
    maxWidth: '1140px',
    margin: '0 auto',
    padding: '28px 20px 80px',
  },
  breadcrumbs: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
    fontSize: '13px',
    color: '#94a3b8',
    marginBottom: '20px',
  },
  crumbLink: {
    color: '#00d4ff',
    textDecoration: 'none',
    fontWeight: 600,
  },
  crumbSep: {
    color: '#475569',
  },
  crumbCurrent: {
    color: '#e2e8f0',
    fontWeight: 600,
  },
  heroPlate: {
    backgroundColor: '#111a2a',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '28px',
    marginBottom: '24px',
  },
  badgeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '14px',
  },
  cyanBadge: {
    backgroundColor: 'rgba(0, 212, 255, 0.12)',
    border: '1px solid #00d4ff',
    color: '#00d4ff',
    fontSize: '11px',
    fontWeight: 700,
    padding: '4px 10px',
    borderRadius: '4px',
    letterSpacing: '0.06em',
  },
  emeraldBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    border: '1px solid #10b981',
    color: '#10b981',
    fontSize: '11px',
    fontWeight: 700,
    padding: '4px 10px',
    borderRadius: '4px',
    letterSpacing: '0.06em',
  },
  h1: {
    fontSize: '31px',
    fontWeight: 800,
    color: '#f8fafc',
    margin: '0 0 14px',
    lineHeight: 1.2,
  },
  lead: {
    fontSize: '15.5px',
    lineHeight: 1.65,
    color: '#cbd5e1',
    margin: '0 0 22px',
  },
  quickCrossLinks: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
  },
  crossBtnCyan: {
    backgroundColor: '#00d4ff',
    color: '#0a0f18',
    fontWeight: 700,
    fontSize: '13px',
    padding: '9px 16px',
    borderRadius: '6px',
    textDecoration: 'none',
  },
  crossBtnEmerald: {
    backgroundColor: '#10b981',
    color: '#0a0f18',
    fontWeight: 700,
    fontSize: '13px',
    padding: '9px 16px',
    borderRadius: '6px',
    textDecoration: 'none',
  },
  crossBtnOutline: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    color: '#e2e8f0',
    fontWeight: 600,
    fontSize: '13px',
    padding: '9px 16px',
    borderRadius: '6px',
    textDecoration: 'none',
  },
  sectionPlate: {
    backgroundColor: '#111a2a',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '24px',
    marginBottom: '26px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '16px',
  },
  h2: {
    fontSize: '21px',
    fontWeight: 800,
    color: '#f8fafc',
    margin: 0,
  },
  calcBadge: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#10b981',
    border: '1px solid #10b981',
    padding: '4px 10px',
    borderRadius: '4px',
  },
  calcInputGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
    gap: '14px',
    marginBottom: '18px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  inputLabel: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#00d4ff',
  },
  numInput: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '10px 12px',
    color: '#f8fafc',
    fontSize: '15px',
    fontWeight: 700,
  },
  calcOutputGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '14px',
  },
  outputCard: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '16px',
  },
  outputLabel: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: '6px',
  },
  outputValueCyan: {
    fontSize: '24px',
    fontWeight: 800,
    color: '#00d4ff',
  },
  outputValueEmerald: {
    fontSize: '24px',
    fontWeight: 800,
    color: '#10b981',
  },
  outputSub: {
    fontSize: '12px',
    color: '#cbd5e1',
    marginTop: '4px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13.5px',
  },
  trHead: {
    backgroundColor: '#0a0f18',
    borderBottom: '2px solid #00d4ff',
    textAlign: 'left',
  },
  th: {
    padding: '11px 12px',
    color: '#00d4ff',
    fontWeight: 700,
    fontSize: '12px',
  },
  trBody: {
    borderBottom: '1px solid #1e293b',
  },
  tdBold: {
    padding: '12px',
    color: '#f8fafc',
    fontWeight: 700,
  },
  tdCyan: {
    padding: '12px',
    color: '#00d4ff',
    fontWeight: 600,
  },
  tdEmerald: {
    padding: '12px',
    color: '#10b981',
    fontWeight: 700,
  },
  tdCell: {
    padding: '12px',
    color: '#cbd5e1',
    lineHeight: 1.5,
  },
  faqList: {
    display: 'grid',
    gap: '14px',
    marginTop: '14px',
  },
  faqItem: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '16px',
  },
  faqQ: {
    fontSize: '15.5px',
    fontWeight: 700,
    color: '#00d4ff',
    margin: '0 0 8px',
  },
  faqA: {
    fontSize: '14px',
    lineHeight: 1.6,
    color: '#cbd5e1',
    margin: 0,
  },
};
