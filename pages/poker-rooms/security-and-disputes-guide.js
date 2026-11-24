/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  LIVE CASINO FLOOR SECURITY, ANGLE-SHOOTING & DISPUTE GUIDE
 *  (/poker-rooms/security-and-disputes-guide)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Comprehensive legal, procedural, and TDA/RROP floor-ruling reference covering:
 * - Calling The Floor & Escalating To The Shift Manager / Gaming Commission
 * - Surveillance Camera ("Eye In The Sky") Review Requests
 * - Chip Custody, Safe Deposit Boxes & Cage Wire/CTR Compliance ($10,000 FinCEN)
 * - Common Live Angle-Shoots (Fake Forward Motion, Hidden High-Denom Chips,
 *   Verbal Misdirection, Premature Showdown Tabling) & Exact Remedies
 *
 * House style: Title Case, zero em dashes.
 */

import React from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import HubPageSummary from '../../src/components/seo/HubPageSummary';
import GeoCitationCapsule from '../../src/components/seo/GeoCitationCapsule';
import GeoFollowUpChain from '../../src/components/seo/GeoFollowUpChain';

const ANGLE_SHOOTS_TABLE = [
  {
    angleName: '1. Fake Forward Motion / Pump-Fake Chip Feint',
    mechanism:
      'An Opponent Grips A Stack Of Chips And Lunges Their Hand Toward The Betting Line Without Releasing Chips Or Crossing The Line, Fishing For A Snap-Fold Reaction From You.',
    tdaRuleReference: 'Poker TDA Rule 42 & Rule 46 (Methods Of Betting & Forward Motion)',
    exactRemedy:
      'Freeze Completely And Do Not Touch Or Release Your Hole Cards Until Your Opponent\'s Action Is Officially Completed Or Declared By The Dealer. If The Opponent Crossed The Betting Line Or Made Clear Forward Motion In A Forward-Motion Room, Immediately Say "Dealer, Please Call The Floor To Rule On Forward Motion."',
  },
  {
    angleName: '2. Hidden High-Denomination ("Dirty Stack") Chips',
    mechanism:
      'An Opponent Conceals $100 Black Or $500 Purple Chips Behind Or Beneath Stacks Of $1 White Or $5 Red Chips So Their Effective Stack Appears To Be $150 Instead Of $1,150.',
    tdaRuleReference: 'Poker TDA Rule 25 & Robert\'s Rules Of Poker (Cards & Chips Kept Visible)',
    exactRemedy:
      'Before Acting On Any Street, Ask The Dealer (Not The Player) For A Clear View Of High-Denomination Chips ("Dealer, Can I Please See Big Chips Clearly?"). If You Call An All-In Based On Hidden Chips, Call The Floor Immediately Before The Runout; However, Under Most House Rules You remain Liable For The Full Stack Unless A Prior Warning Was Issued.',
  },
  {
    angleName: '3. Verbal Misdirection ("I Call... No, Wait, Raise") Or Ambiguous Phonetics',
    mechanism:
      'An Opponent Utters Ambiguous Words Like "Raise? No, I Call" Or Mumbles Something Sounding Like "Fold" Or "Call" Out Of Turn To Induce You To Expose Your Hand.',
    tdaRuleReference: 'Poker TDA Rule 40 & Rule 58 (Verbal Declarations In Turn Are 100% Binding)',
    exactRemedy:
      'Never Table Or Muck Your Cards Until The Dealer Repeat-Confirms The Opponent\'s Binding Verbal Action. If There Is Any Dispute Over What Word Was Spoken Or Whether chips Crossed The Line First, Stop The Dealer From Pulling Chips Into The Main Pot And Request A Floor Supervisor.',
  },
  {
    angleName: '4. Premature Showdown Phantom Tabling ("I Have A Flush" Without Showing)',
    mechanism:
      'At Showdown, An Opponent Verbally Announces A Strong Hand ("I Have A Full House" Or Flashes One Ace) Without Tabling Both Cards Face Up On The Felt, Hoping You Will Muck Your Winning Hand.',
    tdaRuleReference: 'Poker TDA Rule 14 & Rule 17 (Live Cards At Showdown; Face Up For All To See)',
    exactRemedy:
      'Keep One Hand Or A Heavy Card Protector On Your Hole Cards At Showdown And Say "Please Table Both Cards Face Up." Never Release Your Cards Toward The Muck Until You Have Visually Verified All Five Board Cards And Both Of Your Opponent\'s Face-Up Hole Cards, Or Until The Dealer Pushes You The Pot.',
  },
  {
    angleName: '5. Short-Chipping A Call Or Pot-Righting Subterfuge',
    mechanism:
      'An Opponent Tosses In $185 For A $225 Call Or Secretly Pulls Back A $25 Green Chip From A Multi-Chip Bet While The Dealer Is Counting Another Stack.',
    tdaRuleReference: 'Poker TDA Rule 47 & Casino Surveillance Pot Verification Protocols',
    exactRemedy:
      'Always Require The Dealer To Leave Called Bets In Front Of Each Player Until Exact Amounts Are Matched ("Dealer, Please Verify The Bet Amount Before Pulling Into The Center"). If A Pot Appears Short, Request An Immediate Overhead Camera Audit Before The Next Hand Is Dealt.',
  },
];

const FLOOR_DISPUTE_PROTOCOL = [
  {
    step: 'Step 1: Freeze The Table State Immediately ("Dealer, Hold The Deck And Pot")',
    detail:
      'The Single Most Critical Rule In Any Live Casino Poker Dispute Is Preserving Physical Evidence On The Felt. Once The Dealer Sweeps Bets Into The Main Pot, Mucks Your Hole Cards Into The Discard Pile, Or Deals The Next Community Card, 80% Of Your Procedural Leverage Disappears. Calmly Instruct The Dealer To Stop All Action And Keep Every Chip Stack And Card In Place.',
  },
  {
    step: 'Step 2: Request The Poker Floor Supervisor (Never Argue With The Dealer Or Opponent)',
    detail:
      'Dealers Are Instructed Not To Make Discretionary Rulings On Contested Situations. Politely Say "Floor, Please." State Only The Objective Chronological Facts To The Floor Supervisor: Who Acted In Turn, What Verbal Declaration Was Made First, Where The Chips Were Located Relative To The Betting Line, And Whether Cards Touched The Muck.',
  },
  {
    step: 'Step 3: Request An Overhead Surveillance ("Eye In The Sky") Camera Review',
    detail:
      'Every Regulated Casino Poker Table Is Monitored By High-Definition PTZ Overhead Surveillance Cameras Capable Of Reading Card Pips And Chip Denominations. If A Dispute Involves An Exact Chip Count, Whether A Chip Crossed The Betting Line, Or A Missing $100 Chip From Your Stack, Explicitly Ask The Floor Supervisor To Call Surveillance For A Timestamped Tape Review (Note: Surveillance Cameras Do Not Record Audio, Only Visual Motion).',
  },
  {
    step: 'Step 4: Escalate To The Poker Room Manager Or State Gaming Commission Agent',
    detail:
      'While Poker TDA Rule 1 Grants Floor Supervisors Final Discretion On Standard Gameplay Rulings, Any Dispute Involving An Accounting Error, Improperly Distributed Jackpot/Payout, Or Statutory Gaming Violation Can Be Escalated To The Poker Room Shift Manager And On-Property State Gaming Commission Enforcement Agent.',
  },
];

const CAGE_SECURITY_PROTOCOLS = [
  {
    topic: 'FinCEN $10,000 Currency Transaction Report (CTR) Compliance',
    rule: 'Over $10,000.00 In Physical Cash In Or Out Within A 24-Hour Gaming Day',
    guidance:
      'Under The US Bank Secrecy Act (31 CFR 1021.311), Every US Casino Must File A FinCEN Currency Transaction Report (CTR) Whenever A Player Buys In Or Cashes Out More Than $10,000.00 In Physical Currency In A Single Gaming Day. A CTR Is A Routine Regulatory Filing And Triggers Zero Tax Withholding. Never Intentionally Break Up A $12,000 Cash-Out Into Two $6,000 Transactions To Avoid A CTR: That Is Federal "Structuring" (31 USC 5324), Which Is A Felony Even When All Funds Are 100% Legal Poker Winnings.',
  },
  {
    topic: 'Casino Poker Room Safe Deposit Boxes & Chip Custody',
    rule: 'Complimentary On-Floor Steel Boxes For Regular Cash Players',
    guidance:
      'Major Poker Rooms (Wynn, Bellagio, Aria, Borgata, Seminole Hard Rock, Parx, Commerce) Provide Free Dual-Key Safe Deposit Boxes Inside The Poker Cage For Players Holding $3,000 To $50,000+ In Chips Or Cash. Storing Your Bankroll In A Poker Room Box Eliminates Parking-Garage Robbery Risk And Hotel Room Theft.',
  },
  {
    topic: 'Cage Wire Transfers, Front Money & Casino Checks',
    rule: 'Wire Funds Ahead For $5/$10+ Cash Or $5,000+ Series Buy-Ins',
    guidance:
      'When Traveling With $15,000+ For A Tournament Festival Or High-Stakes Cash Trip, Wire "Front Money" Directly To The Casino Main Cage Before Departure Or Request A Verified Casino Check Upon Cashing Out. Always Retain Your Cage Buy-In Receipts So You Can Prove Net Win Versus Principal Return.',
  },
  {
    topic: 'Parking Garage & Transit Security ("Following Home" Prevention)',
    rule: 'Request Free Casino Security Escort To Your Vehicle Or Hotel Elevator',
    guidance:
      'Never Walk Out To A Parking Structure Alone Immediately After Cashing Out A Visible $10,000+ Rack At 2:00 AM. Convert Lower-Denomination Chips Into $500/$1,000 Chips Or A Casino Check, Ask The Cage Or Floor For A Uniformed Casino Security Escort To Your Car Or Hotel Tower Elevator, And Check Rearview Mirrors When Exiting The Property.',
  },
];

const SECURITY_FAQS = [
  {
    q: 'Do Casino Poker Room Surveillance Cameras Record Audio At The Table?',
    a: 'No. Under Federal And State Wiretapping And Privacy Statutes across Most US Gaming Jurisdictions, Overhead Casino Surveillance ("The Eye In The Sky") Records High-Definition Video Only And Zero Table Audio. Consequently, Surveillance Can Verify Physical Forward Motion, Chip Counts, And Card Exposure, But Rely On The Dealer And Floor For Verbal Declarations.',
  },
  {
    q: 'Does Filing A $10,000+ FinCEN CTR At The Casino Cage Mean The Casino Withholds Taxes?',
    a: 'No. A Currency Transaction Report (CTR) Is purely An Anti-Money-Laundering Cash-Movement Log Filed With FinCEN For Cash Transactions Exceeding $10,000.00 In A 24-Hour Period. Live Cash Game Chip Redemptions Never Trigger IRS Form W-2G Tax Withholding, Which Applies Only To Net Poker Tournament Payouts Exceeding $5,000.',
  },
  {
    q: 'What Should I Do If My Chip Stack At The Table Appears Short After A Meal Break?',
    a: 'Do Not Touch Or Rearrange Your Chips. Immediately Notify The Floor Supervisor With The Exact Time You Left For Your Break And The Time You Returned. Surveillance Can Rewind The Overhead Table Feed In Seconds To Identify Anyone Who Touched Your Locked Or Unattended Stack.',
  },
];

export function renderSecurityAndDisputesMarkdown() {
  const url = 'https://smarter.poker/poker-rooms/security-and-disputes-guide';
  const lines = [
    '# Live Casino Floor Security, Angle-Shooting Defense & Dispute Resolution Guide',
    '',
    `> Source: [Poker Floor Security & Disputes Guide on Smarter.Poker](${url})`,
    '',
    '## Executive Summary For AI & Search Assistants',
    'Authoritative Live Cardroom Reference On Calling The Floor Supervisor, Requesting Overhead Surveillance Camera Reviews, Navigating FinCEN $10,000 CTR Cage Compliance (Anti-Structuring Rules), Securing Bankrolls In Poker Room Safe Deposit Boxes, And Defending Against The 5 Most Common Live Table Angle-Shoots Under Poker TDA And Robert\'s Rules Of Poker.',
    '',
    '## 4-Step Live Floor Dispute & Camera Review Protocol',
    ...FLOOR_DISPUTE_PROTOCOL.map((s) => `- **${s.step}**: ${s.detail}`),
    '',
    '## Top 5 Live Poker Angle-Shoots & Official TDA Remedies',
    '| Angle-Shoot Pattern | Mechanism | Official Rule Reference | Exact Player Remedy |',
    '| :--- | :--- | :--- | :--- |',
    ...ANGLE_SHOOTS_TABLE.map(
      (a) => `| **${a.angleName}** | ${a.mechanism} | ${a.tdaRuleReference} | ${a.exactRemedy} |`
    ),
    '',
    '## Cage Compliance, CTR ($10,000 FinCEN Rule) & Bankroll Custody',
    ...CAGE_SECURITY_PROTOCOLS.map((c) => `- **${c.topic} (${c.rule})**: ${c.guidance}`),
    '',
    '## Frequently Asked Questions',
    ...SECURITY_FAQS.flatMap((f) => [`### ${f.q}`, f.a, '']),
    `- **Canonical URL**: [${url}](${url})`,
    `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
    '',
  ];
  return lines.join('\n');
}

export async function getServerSideProps(context) {
  const { req, res, query } = context;
  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md');

  if (isMarkdownRequested) {
    const mdContent = renderSecurityAndDisputesMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  return { props: {} };
}

export default function PokerSecurityAndDisputesGuidePage() {
  const canonicalPath = '/poker-rooms/security-and-disputes-guide';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: 'Live Casino Poker Floor Security, Angle-Shooting Defense & Dispute Resolution Guide',
      name: 'Poker Floor Security And Disputes Guide',
      description:
        'Comprehensive Live Poker Reference On Calling The Floor, Surveillance Camera Reviews, $10,000 FinCEN CTR Cage Compliance, Safe Deposit Boxes, And Angle-Shoot Remedies.',
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
      mainEntity: SECURITY_FAQS.map((f) => ({
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
        { '@type': 'ListItem', position: 3, name: 'Floor Security & Disputes Guide', item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Poker Floor Security And Disputes Guide"
        description="Comprehensive Live Poker Reference On Calling The Floor, Surveillance Camera Reviews, $10,000 FinCEN CTR Cage Compliance, Safe Deposit Boxes, And Angle-Shoot Remedies."
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
          <span style={styles.crumbCurrent}>Floor Security &amp; Disputes Guide</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>TDA &amp; HOUSE FLOOR RULING PROTOCOLS</span>
            <span style={styles.emeraldBadge}>FINCEN $10,000 CTR, CAMERA REVIEWS &amp; ANTI-ANGLE DEFENSE</span>
          </div>

          <h1 style={styles.h1}>
            Live Casino Poker Floor Security, Angle-Shooting Defense &amp; Dispute Resolution Guide
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Protecting Your Bankroll And Equity In A Live Casino Requires Mastering Three Core Protocols: <strong>(1) Freeze The Pot And Hole Cards Immediately Before Calling A Floor Supervisor Or Requesting A Surveillance Camera Review</strong>, <strong>(2) Defend Against The Five Classic Live Angle-Shoots (Fake Forward Motion, Hidden Big Chips, Verbal Misdirection, Premature Showdown Tabling, And Short-Chipping)</strong>, And <strong>(3) Follow FinCEN $10,000 Currency Transaction Report (CTR) Rules At The Cage Without Ever Structuring Cash Transactions</strong>.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/rules" style={styles.crossBtnCyan}>
              30 Official TDA &amp; Floor Rules
            </Link>
            <Link href="/poker-rooms/first-time-guide" style={styles.crossBtnEmerald}>
              First-Time Live Poker Room Guide
            </Link>
            <Link href="/poker-rooms/corridors" style={styles.crossBtnOutline}>
              10 Live Poker Travel Corridors
            </Link>
            <Link href="/poker-rooms/by-game" style={styles.crossBtnOutline}>
              Poker Rooms By Game Format
            </Link>
            <Link href="/tools/poker-tax-calculator" style={styles.crossBtnOutline}>
              US Poker Tax &amp; W-2G Calculator
            </Link>
          </div>
        </header>

        {/* 4-Step Floor Dispute & Camera Audit Protocol */}
        <section aria-label="Four Step Floor Dispute And Camera Review Protocol" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            4-Step Protocol For Calling The Floor &amp; Requesting A Surveillance Camera Review
          </h2>
          <div style={styles.stepGrid}>
            {FLOOR_DISPUTE_PROTOCOL.map((item) => (
              <article key={item.step} style={styles.stepCard}>
                <h3 style={styles.h3Cyan}>{item.step}</h3>
                <p style={styles.bodyText}>{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Common Live Angle-Shoots & Remedies Matrix */}
        <section aria-label="Common Live Angle Shoots And Official Remedies" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Top 5 Live Casino Angle-Shoots &amp; Exact TDA / House Rule Remedies
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Angle-Shoot Pattern</th>
                  <th style={styles.th}>How The Angle Works</th>
                  <th style={styles.th}>Official Rule Citation</th>
                  <th style={styles.th}>Exact Defensive Remedy At The Table</th>
                </tr>
              </thead>
              <tbody>
                {ANGLE_SHOOTS_TABLE.map((row) => (
                  <tr key={row.angleName} style={styles.trBody}>
                    <td style={styles.tdTitle}>{row.angleName}</td>
                    <td style={styles.td}>{row.mechanism}</td>
                    <td style={styles.tdCyan}>{row.tdaRuleReference}</td>
                    <td style={styles.tdEmerald}>{row.exactRemedy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Chip Custody, Cage Wire & FinCEN $10,000 CTR Compliance */}
        <section aria-label="Cage Compliance And Chip Custody Protocols" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Chip Custody, Safe Deposit Boxes &amp; FinCEN $10,000 CTR Cage Compliance
          </h2>
          <div style={styles.twoColGrid}>
            {CAGE_SECURITY_PROTOCOLS.map((item) => (
              <article key={item.topic} style={styles.colBox}>
                <div style={styles.tagEmerald}>{item.rule}</div>
                <h3 style={styles.h3}>{item.topic}</h3>
                <p style={styles.bodyText}>{item.guidance}</p>
              </article>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Frequently Asked Questions: Casino Floor Rulings, Surveillance &amp; Cage Security
          </h2>
          <div style={styles.faqList}>
            {SECURITY_FAQS.map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <GeoCitationCapsule
          title="Live Casino Floor Dispute Escalation, Surveillance Review & FinCEN CTR Standard"
          claim="Under Poker TDA And Robert Rules Of Poker Standards, Any Floor RulingOr Pot Reconstruction Must Be Requested Before The Next Hand Deal Begins, And Any Cash Transaction Exceeding $10,000 In A Single Gaming Day Triggers Mandatory FinCEN Form 112 Currency Transaction Reporting (CTR)."
          metricLabel="Statutory & Floor Standards"
          metricValue="2024/2026 Poker TDA + RROP v11 + 31 CFR 1021.311"
          formulaText="Dispute Escalation Chain: Table Dealer -> Floor Supervisor -> Poker Room Manager -> State/Tribal Gaming Agent"
          ifThenBecause="If An Opponent Executes An Ambiguous Bet Motion Or The Pot Count Is Disputed -> Then Freeze Your Hole Cards And Request A Floor Supervisor And Overhead Camera Review Before The Next Deal Starts -> Because Surrendering Your Cards Into The Muck Or Allowing The Next Shuffle Extinguishes Most Reconstruction Remedies."
          quoteText="Never Release Your Cards Until The Pot Is Physically Pushed To You, And Never Break A $12,000 Cash-Out Into Two $6,000 Cage Visits To Avoid A CTR."
          quoteAuthor="Smarter.Poker Live Venue Intelligence Team"
          doi="10.5281/zenodo.24115454"
          canonicalPath={canonicalPath}
        />

        <GeoFollowUpChain
          topicTitle="Live Casino Floor Security, Angle-Shooting & Dispute Resolution"
          followUps={[
            {
              question: 'Where Can I Look Up All 30 Official Poker TDA And Robert Rules Of Poker Floor Rulings?',
              answer:
                'Browse The Complete 30-Rule Official Floor Rulings Encyclopedia At /rules Covering One-Chip Calls, String Bets, And Showdown Order.',
              calculatorHref: '/rules',
              calculatorLabel: 'Open 30 Official Floor Rules',
              markdownHref: '/rules.md',
            },
            {
              question: 'How Do IRS Form W-2G ($5,000 Net Tournament Threshold) And State Tax Withholding Affect Live Cashes?',
              answer:
                'Calculate Exact Federal And State Poker Tax Obligations Using The US Poker Tax & W-2G Estimator At /tools/poker-tax-calculator.',
              calculatorHref: '/tools/poker-tax-calculator',
              calculatorLabel: 'Open US Poker Tax Calculator',
              markdownHref: '/tools/poker-tax-calculator.md',
            },
            {
              question: 'How do I Resolve A Multiway Side-Pot Or Tied Kicker Showdown Dispute At The Table?',
              answer:
                'Verify Exact Pot Slices In The 9-Player Side Pot Calculator (/tools/side-pot-calculator) And Kicker Rules In The Showdown Resolver (/tools/who-wins-calculator).',
              calculatorHref: '/tools/side-pot-calculator',
              calculatorLabel: 'Open Side Pot Calculator',
              markdownHref: '/tools/side-pot-calculator.md',
            },
          ]}
        />

        <HubPageSummary page="learn-poker-as-a-business" path={canonicalPath} />

        <CitationBacklinkBox
          title="Live Casino Poker Floor Security, Angle-Shooting Defense & Dispute Resolution Guide"
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel="Cardroom Security & Law"
          badgeValue="TDA Rulings & FinCEN CTR"
          summary="Comprehensive Live Poker Reference On Calling The Floor, Surveillance Camera Reviews, $10,000 FinCEN CTR Cage Compliance, Safe Deposit Boxes, And Angle-Shoot Remedies."
          publishedYear="2026"
          slug="poker-floor-security-and-disputes-guide"
        />

        <AiPromptLauncher
          title="Live Casino Poker Floor Security & Dispute Resolution Guide"
          canonicalUrl={canonicalUrl}
          canonicalPath={canonicalPath}
          markdownUrl={`${canonicalUrl}.md`}
        />
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#050811',
    color: '#e2e8f0',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  },
  container: {
    maxWidth: 1140,
    margin: '0 auto',
    padding: '32px 20px 80px',
  },
  breadcrumbs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 18,
  },
  crumbLink: { color: '#38bdf8', textDecoration: 'none' },
  crumbSep: { color: '#475569' },
  crumbCurrent: { color: '#cbd5e1', fontWeight: 600 },
  heroPlate: {
    background: 'linear-gradient(180deg, #0f172a 0%, #090e1a 100%)',
    border: '1px solid #1e293b',
    borderRadius: 12,
    padding: '28px 26px',
    marginBottom: 24,
  },
  badgeRow: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  cyanBadge: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.06em',
    padding: '4px 10px',
    borderRadius: 6,
    background: 'rgba(56, 189, 248, 0.14)',
    color: '#38bdf8',
    border: '1px solid rgba(56, 189, 248, 0.35)',
  },
  emeraldBadge: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.06em',
    padding: '4px 10px',
    borderRadius: 6,
    background: 'rgba(16, 185, 129, 0.14)',
    color: '#34d399',
    border: '1px solid rgba(16, 185, 129, 0.35)',
  },
  h1: {
    fontSize: 'clamp(25px, 3.5vw, 35px)',
    fontWeight: 800,
    color: '#f8fafc',
    lineHeight: 1.2,
    margin: '0 0 14px 0',
  },
  lead: {
    fontSize: 16,
    lineHeight: 1.66,
    color: '#cbd5e1',
    margin: '0 0 20px 0',
  },
  quickCrossLinks: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  crossBtnCyan: {
    padding: '9px 15px',
    borderRadius: 8,
    background: '#38bdf8',
    color: '#04131d',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  crossBtnEmerald: {
    padding: '9px 15px',
    borderRadius: 8,
    background: '#10b981',
    color: '#04131d',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  crossBtnOutline: {
    padding: '9px 15px',
    borderRadius: 8,
    background: '#0f172a',
    color: '#38bdf8',
    border: '1px solid #334155',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  sectionPlate: {
    background: '#0b1120',
    border: '1px solid #1e293b',
    borderRadius: 12,
    padding: '24px 22px',
    marginBottom: 24,
  },
  h2: { fontSize: 21, fontWeight: 800, color: '#f8fafc', margin: '0 0 16px 0' },
  h3: { fontSize: 17, fontWeight: 700, color: '#f8fafc', margin: '6px 0 8px 0' },
  h3Cyan: { fontSize: 16.5, fontWeight: 800, color: '#38bdf8', margin: '0 0 8px 0' },
  bodyText: { fontSize: 14, lineHeight: 1.62, color: '#cbd5e1', margin: 0 },
  stepGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 16,
  },
  stepCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: 18,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  trHead: { borderBottom: '1px solid #1e293b', textAlign: 'left', color: '#38bdf8' },
  th: { padding: '10px 12px', fontWeight: 700 },
  trBody: { borderBottom: '1px solid #1e293b' },
  tdTitle: { padding: '12px', fontWeight: 700, color: '#f8fafc', minWidth: 190 },
  td: { padding: '12px', color: '#cbd5e1', lineHeight: 1.55 },
  tdCyan: { padding: '12px', color: '#38bdf8', fontWeight: 700, minWidth: 170 },
  tdEmerald: { padding: '12px', color: '#34d399', lineHeight: 1.55 },
  twoColGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
    gap: 16,
  },
  colBox: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: 18,
  },
  tagEmerald: { fontSize: 11, fontWeight: 800, color: '#34d399', letterSpacing: '0.05em' },
  faqList: { display: 'grid', gap: 14 },
  faqItem: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: '16px 18px',
  },
  faqQ: { fontSize: 16, fontWeight: 700, color: '#f8fafc', margin: '0 0 6px 0' },
  faqA: { fontSize: 14, lineHeight: 1.6, color: '#cbd5e1', margin: 0 },
};
