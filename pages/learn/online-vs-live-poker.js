/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  ONLINE VS. LIVE POKER STRATEGY TRANSITION GUIDE (/learn/online-vs-live-poker)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Comprehensive comparison and strategic transition blueprint between Online
 * 6-Max/9-Max Poker and Brick-and-Mortar Live Casino Cardrooms: Open Sizing
 * (2.2x vs 4x-5x), Hands Per Hour (85 vs 28), Rake & Tipping Impact, Multiway
 * Frequency, 3-Bet Calibration, and Physical Live Dynamics.
 *
 * House style: Title Case, zero em dashes.
 */

import React from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';

const COMPARISON_ROWS = [
  {
    dimension: 'Hands Dealt Per Table Per Hour',
    onlineMetric: '75 - 95 Hands/Hr (Regular) | 220+ Hands/Hr (Fast-Fold)',
    liveMetric: '25 - 32 Hands/Hr (Automatic Shuffler)',
    strategicImpact: 'One Year Of Live Volume (40,000 Hands) Equals Just Two Weeks Of Online 4-Tabling; Patience Is Mandatory Live.',
  },
  {
    dimension: 'Default Unopened Raise-First-In (RFI) Sizing',
    onlineMetric: '2.0x To 2.5x Big Blinds',
    liveMetric: '3.5x To 5.0x Big Blinds (+1BB Per Limper)',
    strategicImpact: 'Live Players Call Inelastically Preflop; Raising 2.2x Live Triggers 6-Way Pots And Destroys Equity Realization.',
  },
  {
    dimension: 'Average Players Seeing The Flop',
    onlineMetric: '2.1 Players (88%+ Heads-Up Postflop)',
    liveMetric: '3.4 To 4.8 Players At $1/$2 & $1/$3',
    strategicImpact: 'Small Range C-Bets (25% Pot) With Air Fail Multiway; Shift To Value-Heavy Larger C-Bets Live.',
  },
  {
    dimension: 'Population Preflop 3-Bet Frequency',
    onlineMetric: '8.5% To 12.0% (Linear & Polarized Bluffs)',
    liveMetric: '2.0% To 4.5% At Low Stakes (6.0% To 8.5% At $2/$5+)',
    strategicImpact: 'At $1/$3 Live, A 3-Bet From A Passive Player Is Almost Exclusively JJ+, AK; Fold Dominated Offsuit Broadways.',
  },
  {
    dimension: 'Pot Rake & Dealer Tip Overhead',
    onlineMetric: '5% Capped At $1 - $4 (Zero Dealer Tipping)',
    liveMetric: '10% Capped At $5 - $7 + $1-$2 Promo + $1-$2 Tip',
    strategicImpact: 'High Flop Drops Punish Passive Flat-Calling At $1/$2; Win Bigger Pots Or Move Up To $2/$5 / Time-Rake Games.',
  },
  {
    dimension: 'River Check-Raise & Overbet Bluff Frequency',
    onlineMetric: 'Balanced Or Near-MDF In Tough NL100+ Pools',
    liveMetric: 'Severely Under-Bluffed Across $1/$2 To $2/$5',
    strategicImpact: 'Over-Fold One-Pair Bluff-Catchers To Live River Raises Unless You Beat Part Of Villain\'s Value Range.',
  },
  {
    dimension: 'Equivalent Skill Level Benchmark',
    onlineMetric: 'Beating Online NL10 / NL25 For +5 BB/100',
    liveMetric: 'Crushing Live $1/$3 & $2/$5 For +10 To +15 BB/Hr',
    strategicImpact: 'Online Micro-Stakes Winners Already Possess Superior Technical Fundamentals Over 90% Of Live Low-Stakes Fields.',
  },
];

const TRANSITION_PILLARS = [
  {
    tag: 'PILLAR 01: ONLINE PLAYER MOVING TO LIVE CASH',
    title: 'How Online Regulars Must Adjust To Crush Live $1/$3 & $2/$5',
    points: [
      'Abandon 2.2x Open Sizes At Low Stakes: Open 3.5x To 4.5x Plus 1BB Per Limper So You Isolate Weak Limpers Instead Of Playing 6-Way Family Pots.',
      'Stop Auto-C-Betting 33% Pot Into Four Opponents: In Multiway Live Pots, Check Back Marginal One-Pair Or Air Hands And Bet 66% To 85% Pot When You Hold Strong Value Or High-Equity Draws.',
      'Respect Tight Live 3-Bets And River Raises: Do Not Run 4-Bet Bluffs With A5s Against A 65-Year-Old Local Who Has Not 3-Bet In Four Hours.',
      'Maintain Emotional Discipline At 28 Hands Per Hour: Never Loosen Your UTG Range Out Of Boredom During A Two-Hour Card Dead Stretch.',
    ],
  },
  {
    tag: 'PILLAR 02: LIVE PLAYER MOVING TO ONLINE 6-MAX',
    title: 'How Live Cash Players Must Adjust To Survive Online 6-Max',
    points: [
      'Trim Your Open Sizes Down To 2.2x - 2.5x: Opening 4x Online Bleeds Chips Whenever Aggressive Cutoff, Button, And Blind Regulars 3-Bet You.',
      'Eliminate Open-Limping And Cold-Calling In The Small Blind: Online Regulars Squeeze Multiway Limpers And Flat-Callers Relentlessly.',
      'Defend Against High-Frequency C-Bets And 3-Bets: If You Fold Every Time You Miss The Flop Online, Regulars Will Print Money With 25% Pot Range C-Bets.',
      'Protect Your Checking Ranges: Online Opponents Immediately Attack Capped Turn And River Check-Call Lines With 125% Pot Overbets.',
    ],
  },
];

const TRANSITION_FAQS = [
  {
    q: 'What Online Stake Equals Live $1/$2 Or $1/$3 No-Limit Hold\'em In Skill?',
    a: 'Technically And Strategically, Beating Online NL5 Or NL10 ($0.05/$0.10) Over 50,000 Hands Is Harder Than Beating Live $1/$2 Or $1/$3, And Beating Online NL25 Or NL50 Translates Directly To Winning At Live $2/$5 And $5/$10.',
  },
  {
    q: 'Why Do Live Poker Players Open To 4x Or 5x The Big Blind Instead Of 2.2x?',
    a: 'Live Recreational Players Did Not Drive To The Casino To Fold Preflop. When A $1/$3 Player Sees A $7 Raise, They View It As Seven Dollars Rather Than 2.3 Big Blinds And Call With Any Suited Or Connected Cards. Raising To $12 Or $15 Charges Loose Callers The Maximum Price.',
  },
  {
    q: 'Why Are Multiway Pots So Much More Common In Live Poker?',
    a: 'Live Players Cold-Call Too Widely From Middle Position, The Cutoff, And The Button Instead Of 3-Betting Or Folding. Once One Player Calls A Raise, Subsequent Players Get 3-To-1 Or 4-To-1 Pot Odds To Overcall.',
  },
];

export default function OnlineVsLivePokerGuidePage() {
  const canonicalPath = '/learn/online-vs-live-poker';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: 'Online Vs. Live Poker Strategy Transition Guide: Sizing, Rake & Adjustments',
      name: 'Online Vs. Live Poker Strategy Transition Guide',
      description:
        'Complete Strategy Comparison Between Online 6-Max Poker And Live Casino Cash Games: Open Sizing (2.2x Vs 4x), Hands Per Hour (85 Vs 28), Multiway Pots, 3-Bet Frequencies, And Skill Equivalents.',
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
      mainEntity: TRANSITION_FAQS.map((f) => ({
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
        { '@type': 'ListItem', position: 3, name: 'Online Vs. Live Poker Guide', item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Online Vs. Live Poker Strategy And Sizing"
        description="Complete Strategy Comparison Between Online 6-Max Poker And Live Casino Cash Games: Open Sizing (2.2x Vs 4x), Hands Per Hour (85 Vs 28), Multiway Pots, 3-Bet Frequencies, And Skill Equivalents."
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
          <span style={styles.crumbCurrent}>Online Vs. Live Poker Transition Guide</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>ONLINE 6-MAX VS LIVE FULL-RING</span>
            <span style={styles.emeraldBadge}>SIZING, VOLUME, MULTIWAY &amp; 3-BET CALIBRATION</span>
          </div>

          <h1 style={styles.h1}>
            Online Vs. Live Poker Strategy Transition Guide: Open Sizing, Multiway Pots &amp; Skill Equivalents
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Online And Live No-Limit Hold&apos;Em Share The Exact Same Rulebook But Operate Under Completely Different Economic And Behavioral Realities:
            <strong> Online 6-Max Runs At 85+ Hands Per Hour With 2.2x Opens, 10% 3-Betting, And Heads-Up Pots</strong>, While
            <strong> Live $1/$3 &amp; $2/$5 Runs At 28 Hands Per Hour With 4x-5x Opens, Multiway Family Pots, And Under-Bluffed Rivers</strong>.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/learn/stakes" style={styles.crossBtnCyan}>
              7 Stake Level &amp; Move-Up Guides
            </Link>
            <Link href="/learn/live-poker-tells" style={styles.crossBtnEmerald}>
              Live Poker Tells Encyclopedia
            </Link>
            <Link href="/poker-rooms/first-time-guide" style={styles.crossBtnOutline}>
              First-Time Live Poker Room Guide
            </Link>
            <Link href="/learn/positions" style={styles.crossBtnOutline}>
              9-Seat Position Encyclopedia
            </Link>
            <Link href="/tools/rake-calculator" style={styles.crossBtnOutline}>
              Live Cash Rake Calculator
            </Link>
          </div>
        </header>

        {/* Master Comparison Table */}
        <section aria-label="Online Versus Live Poker Comparison Table" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            7-Point Structural Comparison: Online 6-Max Vs. Live Casino Cash Games
          </h2>
          <div style={{ overflowX: 'auto', marginTop: '14px' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Strategic Dimension</th>
                  <th style={styles.th}>Online 6-Max Benchmark</th>
                  <th style={styles.th}>Live 9-Max Cardroom Benchmark</th>
                  <th style={styles.th}>Required Tactical Adjustment</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.dimension} style={styles.trBody}>
                    <td style={styles.tdBold}>{row.dimension}</td>
                    <td style={styles.tdCyan}>{row.onlineMetric}</td>
                    <td style={styles.tdEmerald}>{row.liveMetric}</td>
                    <td style={styles.tdCell}>{row.strategicImpact}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Two Transition Pillars */}
        <section aria-label="Strategic Transition Playbooks" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Bidirectional Transition Playbooks</h2>
          <div style={styles.pillarGrid}>
            {TRANSITION_PILLARS.map((p) => (
              <div key={p.tag} style={styles.pillarCard}>
                <div style={styles.pillarTag}>{p.tag}</div>
                <h3 style={styles.h3}>{p.title}</h3>
                <ul style={styles.bulletList}>
                  {p.points.map((pt) => (
                    <li key={pt} style={styles.bulletItem}>
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions: Online Vs. Live Poker</h2>
          <div style={styles.faqList}>
            {TRANSITION_FAQS.map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title="Online Vs. Live Poker Strategy Transition Guide"
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel="Ecosystem Transition Guide"
          badgeValue="Online 6-Max Vs Live Cash"
          summary="Complete Strategy Comparison Between Online 6-Max Poker And Live Casino Cash Games: Open Sizing (2.2x Vs 4x), Hands Per Hour (85 Vs 28), Multiway Pots, 3-Bet Frequencies, And Skill Equivalents."
          publishedYear="2026"
          slug="online-vs-live-poker-strategy-guide"
        />

        <AiPromptLauncher
          title="Online Vs. Live Poker Strategy Transition Guide"
          canonicalUrl={canonicalUrl}
          canonicalPath={canonicalPath}
          markdownUrl="/learn/online-vs-live-poker.md"
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
  h2: {
    fontSize: '21px',
    fontWeight: 800,
    color: '#f8fafc',
    margin: 0,
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
    fontWeight: 600,
  },
  tdCell: {
    padding: '12px',
    color: '#cbd5e1',
    lineHeight: 1.5,
  },
  pillarGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '16px',
    marginTop: '14px',
  },
  pillarCard: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '20px',
  },
  pillarTag: {
    fontSize: '11px',
    fontWeight: 800,
    color: '#00d4ff',
    marginBottom: '6px',
    letterSpacing: '0.05em',
  },
  h3: {
    fontSize: '17px',
    fontWeight: 700,
    color: '#f8fafc',
    margin: '0 0 12px',
  },
  bulletList: {
    margin: 0,
    paddingLeft: '18px',
    display: 'grid',
    gap: '8px',
  },
  bulletItem: {
    fontSize: '13.5px',
    lineHeight: 1.6,
    color: '#cbd5e1',
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
