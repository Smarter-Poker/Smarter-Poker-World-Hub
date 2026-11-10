/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  FIRST-TIME CASINO LIVE POKER ROOM GUIDE (/poker-rooms/first-time-guide)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive onboarding blueprint for players visiting a live casino poker room
 * for the first time: Live Dealer Tipping & Session Overhead Calculator, 6-Step
 * Cage & Brush Check-In Checklist, Verbal Action & One-Chip Rule Etiquette Table,
 * and Official Chip Color Denominations Table.
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';

const CHECKIN_STEPS = [
  {
    step: 1,
    name: 'Obtain Your Casino Player Rewards Card First',
    detail:
      'Before Walking Into The Poker Room, Stop At The Main Casino Players Club Desk With A Valid Government Photo ID (Age 21+ At Most Commercial Casinos; 18+ At Select Tribal Properties). Virtually Every Live Poker Room Uses Your Players Card To Track Your Seat On The Electronic Waitlist And Accrue Hourly Comp Dollars ($1.00 To $2.00 Per Hour).',
  },
  {
    step: 2,
    name: 'Check In At The Poker Room Brush Podium',
    detail:
      'Walk Up To The Front Podium ("The Brush" Or Host Desk) At The Entrance Of The Poker Room. Tell The Floor Staff Your Name And Which Game And Stake You Want To Play (For Example: "$1/$2 Or $1/$3 No-Limit Hold\'em"). Your Initials Or Name Will Immediately Appear On The Overhead Waitlist Monitors.',
  },
  {
    step: 3,
    name: 'Purchase Your Chips At The Poker Cage Or Table',
    detail:
      'Ask The Brush Whether You Should Buy Chips At The Cashier Window ("The Cage") Or Directly From The Dealer At The Table. At Most Rooms, First-Time $1/$2 And $1/$3 Buy-Ins ($100 To $300) Are Purchased At The Cage In $5 Red Chips And Carried To Your Seat In A Plastic Chip Rack.',
  },
  {
    step: 4,
    name: 'Take Your Assigned Seat And Hand Over Your Card',
    detail:
      'When The Microphone Calls Your Name And Table Number, Walk To The Designated Table, Place Your Chip Rack On The Rail, Unload Your Chips Onto The Felt In Neat 20-Chip Stacks, And Hand Your Players Card To The Dealer So They Can Swipe You Into The Seat.',
  },
  {
    step: 5,
    name: 'Wait For The Big Blind Or Post Immediately',
    detail:
      'As A New Player In A Cash Game, You Can Sit Out For Up To Two Or Three Hands Until The Big Blind Reaches Your Seat Automatically, Allowing You To Observe Table Speed For Free Without Posting A Dead Blind.',
  },
  {
    step: 6,
    name: 'Color Up And Rack Your Chips When Leaving',
    detail:
      'In Cash Games, You Are Free To Leave On Any Hand With Zero Notice. Grab An Empty Plastic Chip Rack From The Floor Stand, Stack Your Chips In 20-Chip Columns (100 Chips Per Rack), And Redeem Them For Cash At The Casino Cage.',
  },
];

const ETIQUETTE_RULES = [
  {
    rule: 'The Single Oversized Chip Rule (TDA Rule 44)',
    mistake: 'Tossing A Single $25 Green Chip Into A $3 Pot Expecting It To Count As A $25 Raise.',
    ruling:
      'Without A Verbal Declaration Of "Raise" Before The Chip Hits The Felt, Throwing A Single Oversized Chip Into The Pot Is Strictly Ruled A Call Of The Existing Bet.',
  },
  {
    rule: 'Verbal Declarations Are 100% Binding (TDA Rule 40)',
    mistake: 'Saying "Call" Out Loud While Reaching For Raising Chips.',
    ruling:
      'Any Clear Verbal Action ("Call", "Raise", "All-In", "Fold") Spoken In Turn Immediately Binds You To That Action Regardless Of What Chips You Touch.',
  },
  {
    rule: 'No String Betting Or Forward Motion Violations',
    mistake: 'Moving One Stack Forward Into The Pot And Going Back To Your Stack For A Second Stack Without Announcing The Total.',
    ruling:
      'To Raise With Multiple Chip Stacks, Either Verbally Announce Your Exact Total Bet Amount First Or Push All Chips Forward In One Single Continuous Motion.',
  },
  {
    rule: 'Keep Big-Denomination Chips Visible In Front',
    mistake: 'Hiding $100 Black Or $25 Green Chips Behind Towering Stacks Of $1 White Or $5 Red Chips.',
    ruling:
      'All Highest-Denomination Chips Must Be Stacked On Top Or Clearly In Front Of Lower Denominations So Every Opponent Can Accurately Assess Your Stack.',
  },
  {
    rule: 'Protect Your Hole Cards And Never Expose During Play',
    mistake: 'Holding Cards High Off The Table Or Showing Your Neighbor Your Folded Cards While Others Are Still In The Hand.',
    ruling:
      'Keep Hole Cards On The Felt Beneath A Card Protector Or Chip, And Never Discuss Or Flash Folded Cards While Action Remains Live (One-Player-To-A-Hand Rule).',
  },
  {
    rule: 'Show Both Cards To Win At Showdown',
    mistake: 'Turning Over Only Your Ace And Mucking Your Second Hole Card Before The Dealer Pushes You The Pot.',
    ruling:
      'To Claim Any Contested Pot At Showdown, Both Hole Cards Must Be Tabled Face Up On The Felt. Mucking Either Card Before The Pot Is Awarded Forfeits Your Claim.',
  },
];

const CHIP_DENOMINATIONS = [
  {
    colorName: 'White (Or Light Blue)',
    hex: '#f8fafc',
    denomination: '$1',
    stack20Value: '$20 Per Stack ($100 Full Rack)',
    usage: 'Small Blinds, $1/$2 And $1/$3 Cash Games, And Dealer Tipping.',
  },
  {
    colorName: 'Pink Or Sky Blue',
    hex: '#f472b6',
    denomination: '$2 Or $2.50',
    stack20Value: '$40 Or $50 Per Stack',
    usage: 'Used In $2/$3 California Games, $4/$8 Limit Games, And Blackjack Snappers.',
  },
  {
    colorName: 'Red ("Nickels")',
    hex: '#ef4444',
    denomination: '$5',
    stack20Value: '$100 Per Stack ($500 Full Rack)',
    usage: 'The Universal Workhorse Chip Of $1/$2, $1/$3, And $2/$5 No-Limit Hold\'em Across America.',
  },
  {
    colorName: 'Green ("Quarters")',
    hex: '#10b981',
    denomination: '$25',
    stack20Value: '$500 Per Stack ($2,500 Full Rack)',
    usage: 'Primary Currency In $2/$5 And $5/$10 Cash Games And Deep-Stack $1/$3 Buy-Ins.',
  },
  {
    colorName: 'Black ("Blacks")',
    hex: '#334155',
    denomination: '$100',
    stack20Value: '$2,000 Per Stack ($10,000 Full Rack)',
    usage: 'Used In $5/$10+ High-Stakes Cash Games And Deep Texas Match-The-Stack Tables.',
  },
  {
    colorName: 'Purple ("Barneys")',
    hex: '#a855f7',
    denomination: '$500',
    stack20Value: '$10,000 Per Stack ($50,000 Full Rack)',
    usage: 'High-Limit Cash Games ($10/$20, $25/$50+) And High-Roller Cage Transactions.',
  },
  {
    colorName: 'Yellow / Gold ("Bananas" Or "Pumpkins")',
    hex: '#eab308',
    denomination: '$1,000',
    stack20Value: '$20,000 Per Stack ($100,000 Full Rack)',
    usage: 'Nosebleed Cash Games ($50/$100+) And High-Stakes Bobby\'s Room / Ivey Room Play.',
  },
];

const FIRST_TIME_FAQS = [
  {
    q: 'How Much Should I Tip The Poker Dealer When I Win A Pot?',
    a: 'In Standard $1/$2, $1/$3, And $2/$5 Live Cash Games, The Universal Standard Is $1 Per Contested Pot Won, Or $2 To $3 On Larger Multi-Street Pots Exceeding $100. You Never Tip On Hands You Lose Or Fold, And Tipping $1 On An Uncontested Walk Or Blind Steal Is Optional.',
  },
  {
    q: 'How Much Cash Should I Bring For My First $1/$2 Or $1/$3 Live Session?',
    a: 'Most US Poker Rooms Cap $1/$2 Buy-Ins At $200 To $300 And $1/$3 Buy-Ins At $300 To $500. Bring Two Full 100-Big-Blind Buy-Ins In Cash ($400 To $600 Total) So You Can Top Up Your Stack To 100 Big Blinds If You Lose Early Small Pots.',
  },
  {
    q: 'Can I Use My Phone At A Live Casino Poker Table?',
    a: 'Yes, When You Are Not Actively In A Hand. Once You Fold Your Cards, You May Text Or Browse Quietly, But Using Any Poker Solver, Preflop Chart App, Or Real-Time Assistance (RTA) At The Table Or Talking On A Voice Call While Holding Live Hole Cards Is Strictly Prohibited.',
  },
  {
    q: 'What Happens If I Accidentally Expose One Of My Hole Cards During The Deal?',
    a: 'Immediately Alert The Dealer. If The Dealer Accidentally Flashed Your Card While Pitching, They Will Replace It With The Top Card Of The Deck And Use The Exposed Card As The Burn Card. If You Exposed Your Own Card After Receiving It, Your Hand Remains Live And You Must Play With That Information Public.',
  },
];

export default function FirstTimeCasinoPokerGuidePage() {
  const [bigBlind, setBigBlind] = useState(3);
  const [handsPerHour, setHandsPerHour] = useState(28);
  const [potsWonPerHour, setPotsWonPerHour] = useState(3.2);
  const [tipPerPot, setTipPerPot] = useState(1.25);
  const [sessionHours, setSessionHours] = useState(5);

  const calc = useMemo(() => {
    const bb = Math.max(1, Number(bigBlind) || 3);
    const hph = Math.max(10, Number(handsPerHour) || 28);
    const pwh = Math.max(0.5, Number(potsWonPerHour) || 3.2);
    const tip = Math.max(0, Number(tipPerPot) || 1.25);
    const hrs = Math.max(1, Number(sessionHours) || 5);

    const hourlyTipCost = pwh * tip;
    const totalTipsPaid = hourlyTipCost * hrs;
    const totalHands = hph * hrs;
    const tipsInBBPerHour = hourlyTipCost / bb;
    const bbPer100TipImpact = (tipsInBBPerHour / hph) * 100;

    return {
      hourlyTipCost,
      totalTipsPaid,
      totalHands,
      bbPer100TipImpact,
    };
  }, [bigBlind, handsPerHour, potsWonPerHour, tipPerPot, sessionHours]);

  const canonicalUrl = 'https://smarter.poker/poker-rooms/first-time-guide';

  const jsonLd = [
    {
      '@type': 'HowTo',
      '@id': `${canonicalUrl}#howto`,
      name: 'How To Check In And Play In A Live Casino Poker Room For The First Time',
      description:
        'Interactive First-Time Live Casino Poker Room Guide With Dealer Tipping Calculator, Chip-Buying Etiquette, Table Rules, And Check-In Workflow.',
      totalTime: 'PT15M',
      step: CHECKIN_STEPS.map((s) => ({
        '@type': 'HowToStep',
        position: s.step,
        name: s.name,
        text: s.detail,
      })),
    },
    {
      '@type': 'FAQPage',
      '@id': `${canonicalUrl}#faq`,
      mainEntity: FIRST_TIME_FAQS.map((f) => ({
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
        { '@type': 'ListItem', position: 2, name: 'Regional Poker Guides', item: 'https://smarter.poker/poker-rooms/guides' },
        { '@type': 'ListItem', position: 3, name: 'First-Time Live Poker Room Guide', item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="First-Time Casino Live Poker Room Guide"
        description="Interactive First-Time Live Casino Poker Room Guide With Dealer Tipping Calculator, Chip-Buying Etiquette, Table Rules, And Check-In Workflow."
        canonical="/poker-rooms/first-time-guide"
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
          <span style={styles.crumbCurrent}>First-Time Live Poker Room Guide</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>BEGINNER TO PRO ONBOARDING</span>
            <span style={styles.emeraldBadge}>INCLUDES DEALER TIPPING &amp; BB/100 CALCULATOR</span>
          </div>

          <h1 style={styles.h1}>
            First-Time Casino Live Poker Room Guide: Check-In, Chip Colors, Etiquette &amp; Tipping Math
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Walking Into A Brick-And-Mortar Casino Poker Room For The First Time Is Simple Once You Know The Six-Step Podium Routine: <strong>(1) Get A Casino Players Card</strong>, <strong>(2) Put Your Name On The Brush Waitlist For $1/$2 Or $1/$3 NLH</strong>, <strong>(3) Buy 100 Big Blinds ($200 - $300) In $5 Red Chips At The Cage</strong>, <strong>(4) Wait For The Big Blind At Your Assigned Seat</strong>, <strong>(5) Announce Verbal Actions Clearly Before Moving Chips</strong>, And <strong>(6) Tip The Dealer $1 To $2 When You Win A Contested Pot</strong>.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/rules" style={styles.crossBtnCyan}>
              30 Official TDA &amp; Floor Rules
            </Link>
            <Link href="/tools/rake-calculator" style={styles.crossBtnEmerald}>
              Live Cash Rake Calculator
            </Link>
            <Link href="/poker-rooms/guides" style={styles.crossBtnOutline}>
              12 Regional US Market Guides
            </Link>
            <Link href="/poker-series/guides" style={styles.crossBtnOutline}>
              10 Major Poker Series Guides
            </Link>
            <Link href="/tools" style={styles.crossBtnOutline}>
              24 Free Poker Calculators
            </Link>
            <Link href="/learn" style={styles.crossBtnOutline}>
              GTO Strategy Academy
            </Link>
            <Link href="/learn/matchups" style={styles.crossBtnOutline}>
              25 All-In Hand Matchups
            </Link>
            <Link href="/hub/poker-near-me" style={styles.crossBtnOutline}>
              Find Live Rooms Near Me
            </Link>
          </div>
        </header>

        {/* Interactive Live Dealer Tipping & Session Overhead Calculator */}
        <section aria-label="Live Dealer Tipping And Session Overhead Calculator" style={styles.sectionPlate}>
          <div style={styles.sectionHeaderRow}>
            <h2 style={styles.h2}>
              Interactive Live Dealer Tipping &amp; Session Overhead Calculator
            </h2>
            <span style={styles.calcBadge}>REAL-TIME BB/100 IMPACT</span>
          </div>

          <p style={styles.sectionSub}>
            Every Dollar Tipped To The Dealer Comes Directly Out Of Your Hourly Winrate. Adjust Your Stake, Hands Dealt Per Hour, Pots Won Per Hour, Average Tip Per Pot Won, And Session Length To Measure Your Exact Tipping Overhead:
          </p>

          <div style={styles.calcInputGrid}>
            <div style={styles.inputGroup}>
              <label htmlFor="bb-input" style={styles.inputLabel}>
                Big Blind Size ($ USD)
              </label>
              <input
                id="bb-input"
                type="number"
                min="1"
                max="100"
                step="1"
                value={bigBlind}
                onChange={(e) => setBigBlind(e.target.value)}
                style={styles.numInput}
              />
            </div>

            <div style={styles.inputGroup}>
              <label htmlFor="hph-input" style={styles.inputLabel}>
                Hands Dealt Per Hour
              </label>
              <input
                id="hph-input"
                type="number"
                min="15"
                max="45"
                step="1"
                value={handsPerHour}
                onChange={(e) => setHandsPerHour(e.target.value)}
                style={styles.numInput}
              />
            </div>

            <div style={styles.inputGroup}>
              <label htmlFor="pwh-input" style={styles.inputLabel}>
                Pots Won Per Hour
              </label>
              <input
                id="pwh-input"
                type="number"
                min="0.5"
                max="12"
                step="0.1"
                value={potsWonPerHour}
                onChange={(e) => setPotsWonPerHour(e.target.value)}
                style={styles.numInput}
              />
            </div>

            <div style={styles.inputGroup}>
              <label htmlFor="tip-input" style={styles.inputLabel}>
                Average Tip Per Pot Won ($)
              </label>
              <input
                id="tip-input"
                type="number"
                min="0"
                max="20"
                step="0.25"
                value={tipPerPot}
                onChange={(e) => setTipPerPot(e.target.value)}
                style={styles.numInput}
              />
            </div>

            <div style={styles.inputGroup}>
              <label htmlFor="hrs-input" style={styles.inputLabel}>
                Session Length (Hours)
              </label>
              <input
                id="hrs-input"
                type="number"
                min="1"
                max="24"
                step="0.5"
                value={sessionHours}
                onChange={(e) => setSessionHours(e.target.value)}
                style={styles.numInput}
              />
            </div>
          </div>

          <div style={styles.calcOutputGrid}>
            <div style={styles.outputCard}>
              <div style={styles.outputLabel}>Total Tips Paid (Session)</div>
              <div style={styles.outputValueCyan}>${calc.totalTipsPaid.toFixed(2)}</div>
              <div style={styles.outputSub}>Across {Math.round(calc.totalHands)} Hands Dealt</div>
            </div>

            <div style={styles.outputCard}>
              <div style={styles.outputLabel}>Hourly Tip Cost ($/Hr)</div>
              <div style={styles.outputValueEmerald}>${calc.hourlyTipCost.toFixed(2)} / Hr</div>
              <div style={styles.outputSub}>{(calc.hourlyTipCost * 200).toFixed(0)} USD Per 200 Hours</div>
            </div>

            <div style={styles.outputCard}>
              <div style={styles.outputLabel}>BB/100 Tip Impact</div>
              <div style={styles.outputValueCyan}>{calc.bbPer100TipImpact.toFixed(2)} BB/100</div>
              <div style={styles.outputSub}>Winrate Drag From Dealer Tokes</div>
            </div>
          </div>
        </section>

        {/* 6-Step Cage & Brush Check-In Checklist */}
        <section aria-label="Six Step Cage And Brush Check In Checklist" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            6-Step Casino Cage &amp; Brush Podium Check-In Checklist
          </h2>
          <div style={styles.stepGrid}>
            {CHECKIN_STEPS.map((item) => (
              <div key={item.step} style={styles.stepCard}>
                <div style={styles.stepBadge}>STEP {item.step}</div>
                <h3 style={styles.h3}>{item.name}</h3>
                <p style={styles.stepBody}>{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Verbal Action & One-Chip Rule Etiquette Table */}
        <section aria-label="Verbal Action And One Chip Rule Etiquette Table" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Verbal Action, One-Chip Rule &amp; Table Etiquette Reference
          </h2>
          <div style={{ overflowX: 'auto', marginTop: '14px' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Official Cardroom Rule</th>
                  <th style={styles.th}>Common First-Time Mistake</th>
                  <th style={styles.th}>Binding Floor Ruling &amp; Best Practice</th>
                </tr>
              </thead>
              <tbody>
                {ETIQUETTE_RULES.map((row) => (
                  <tr key={row.rule} style={styles.trBody}>
                    <td style={styles.tdRule}>{row.rule}</td>
                    <td style={styles.tdMistake}>{row.mistake}</td>
                    <td style={styles.tdRuling}>{row.ruling}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Chip Color Denominations Table */}
        <section aria-label="Standard US Casino Poker Chip Color Denominations Table" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Standard North American Casino Poker Chip Color Denominations
          </h2>
          <div style={{ overflowX: 'auto', marginTop: '14px' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Chip Color</th>
                  <th style={styles.th}>Denomination</th>
                  <th style={styles.th}>20-Chip Stack / 100-Chip Rack</th>
                  <th style={styles.th}>Primary Cardroom Usage</th>
                </tr>
              </thead>
              <tbody>
                {CHIP_DENOMINATIONS.map((chip) => (
                  <tr key={chip.denomination} style={styles.trBody}>
                    <td style={styles.tdChipColor}>
                      <span
                        style={{
                          ...styles.colorDot,
                          backgroundColor: chip.hex,
                        }}
                      />
                      {chip.colorName}
                    </td>
                    <td style={styles.tdDenom}>{chip.denomination}</td>
                    <td style={styles.tdStackVal}>{chip.stack20Value}</td>
                    <td style={styles.tdRuling}>{chip.usage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ Section */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Frequently Asked Questions For First-Time Live Poker Players
          </h2>
          <div style={styles.faqList}>
            {FIRST_TIME_FAQS.map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title="First-Time Casino Live Poker Room Guide & Dealer Tipping Calculator"
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel="Live Cardroom Onboarding"
          badgeValue="Check-In, Chip Colors & Tipping Math"
          summary="Interactive First-Time Live Casino Poker Room Guide With Dealer Tipping Calculator, Chip-Buying Etiquette, Table Rules, And Check-In Workflow."
          publishedYear="2026"
          slug="first-time-casino-poker-room-guide"
        />

        <AiPromptLauncher
          title="First-Time Casino Live Poker Room Guide & Dealer Tipping Calculator"
          canonicalUrl={canonicalUrl}
          canonicalPath="/poker-rooms/first-time-guide"
          markdownUrl="/poker-rooms/first-time-guide.md"
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
    maxWidth: '1120px',
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
    fontSize: '30px',
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
    marginBottom: '24px',
  },
  sectionHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '10px',
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
    padding: '4px 9px',
    borderRadius: '4px',
  },
  sectionSub: {
    fontSize: '14px',
    color: '#cbd5e1',
    lineHeight: 1.6,
    margin: '0 0 18px',
  },
  calcInputGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
    gap: '14px',
    marginBottom: '20px',
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
    padding: '18px',
  },
  outputLabel: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: '6px',
  },
  outputValueCyan: {
    fontSize: '26px',
    fontWeight: 800,
    color: '#00d4ff',
  },
  outputValueEmerald: {
    fontSize: '26px',
    fontWeight: 800,
    color: '#10b981',
  },
  outputSub: {
    fontSize: '12.5px',
    color: '#cbd5e1',
    marginTop: '4px',
  },
  stepGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
    gap: '16px',
    marginTop: '14px',
  },
  stepCard: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '18px',
  },
  stepBadge: {
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: 800,
    color: '#00d4ff',
    marginBottom: '6px',
    letterSpacing: '0.06em',
  },
  h3: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#f8fafc',
    margin: '0 0 8px',
  },
  stepBody: {
    fontSize: '13.5px',
    lineHeight: 1.6,
    color: '#cbd5e1',
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
  tdRule: {
    padding: '12px',
    color: '#00d4ff',
    fontWeight: 700,
    minWidth: '210px',
  },
  tdMistake: {
    padding: '12px',
    color: '#f8fafc',
    lineHeight: 1.5,
  },
  tdRuling: {
    padding: '12px',
    color: '#cbd5e1',
    lineHeight: 1.5,
  },
  tdChipColor: {
    padding: '12px',
    color: '#f8fafc',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  colorDot: {
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    border: '1px solid #94a3b8',
    display: 'inline-block',
    flexShrink: 0,
  },
  tdDenom: {
    padding: '12px',
    color: '#10b981',
    fontWeight: 800,
    fontSize: '15px',
  },
  tdStackVal: {
    padding: '12px',
    color: '#00d4ff',
    fontWeight: 700,
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
