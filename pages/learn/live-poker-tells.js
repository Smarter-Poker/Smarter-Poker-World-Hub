/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  LIVE POKER TELLS, BETTING TIMING & ANTI-ANGLE-SHOOTING ENCYCLOPEDIA
 *  (/learn/live-poker-tells)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Behavioral & cardroom security reference covering Physical & Behavioral Tells,
 * Betting Speed & Timing Tells, Verbal Speech Patterns, and Protecting Yourself
 * Against Live Casino Angle Shots.
 *
 * House style: Title Case, zero em dashes.
 */

import React from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';

const TELL_CATALOG = [
  {
    tell: '1. The Instant Glance At Own Chip Stack When A Flop Hits',
    reliability: 'High (85%+ Accuracy On Recreational Players)',
    meaning: 'Strong Made Hand Or Monster Draw Preparing To Commit Chips.',
    explanation:
      'When A Recreational Player Peeks At The Three Flop Cards And Immediately Glances Down At Their Own Chip Stack Within A Split Second, It Is An Involuntary Subconscious Calculation Of How Much They Can Bet Or Win. Fold Marginal Bluff-Catchers.',
  },
  {
    tell: '2. "Act Strong Means Weak, Act Weak Means Strong" (Caro\'s Law)',
    reliability: 'High Against Unstudied Players',
    meaning: 'Exaggerated Sighing, Shrugging Or Shaking Head Before Raising Almost Always Signals The Nuts.',
    explanation:
      'Players Rarely Want You To Fold When They Hold A Monster. Theatrical Displays Of Reluctance ("Well, I Guess I\'ll Gamble...") Or Feigned Weakness Prior To Putting In A Large Bet Or Raise Signal Extreme Strength.',
  },
  {
    tell: '3. Post-Bet Frozen Statue Posture Vs. Relaxed Breathing',
    reliability: 'Very High On River Overbets & Shoves',
    meaning: 'Frozen, Stiff, Holding-Breath Posture Correlates With Bluffing; Relaxed Movement Correlates With Value.',
    explanation:
      'A Player Firing A Large River Bluff Experiences An Evolutionary Fight-Or-Flight Freeze Response Because They Fear Being Observed And Called. Conversely, A Player Holding A Full House Releases Tension Once The Bet Is In And Comfortably Drinks Water Or Chats.',
  },
  {
    tell: '4. Instant Snap-Call On Flop Or Turn (Timing Tell)',
    reliability: 'Very High Across Both Live & Online Play',
    meaning: 'Medium-Strength One-Pair Or Obvious Draw (Rarely The Nuts Or A Monster Slow-Play).',
    explanation:
      'When An Opponent Calls Your Flop Or Turn Bet In Under One Second Without Pausing To Consider Raising, You Can Eliminate Nearly All Sets, Two Pairs, And Monster Combo Draws From Their Range. Their Range Is Capped At Top Pair Or A Naked Draw.',
  },
  {
    tell: '5. The Early-Action Chip Grab (Out-Of-Turn Intimidation)',
    reliability: 'Moderate To High',
    meaning: 'Weak-To-Medium Hand Trying To Discourage You From Betting.',
    explanation:
      'When An In-Position Player Reaches For Calling Or Raising Chips While You Are Still Thinking About Whether To Bet Out Of Position, They Almost Always Hold A Vulnerable Showdown Hand Or Draw That Wants A Free Card.',
  },
  {
    tell: '6. Involuntary Hand Tremble Or Neck Pulse During A Big Bet',
    reliability: 'High When Properly Interpreted',
    meaning: 'Adrenaline Spike Indicating A Monster Value Hand (Not A Bluff!).',
    explanation:
      'New Players Often Misread Shaking Hands As Nervous Bluffing. In Reality, Most Players Experience Their Largest Adrenaline Surge When They Flop Or Turn A Monster And Realize They Are About To Win A Massive Pot.',
  },
  {
    tell: '7. Card Re-Checking After A Monotone Or 3-Flush Flop/Turn',
    reliability: 'High Against Multiway Callers',
    meaning: 'Player Does Not Hold Two Suited Cards Of That Suit.',
    explanation:
      'A Player Who Entered The Pot Explicitly Because They Held As 5s Or Ks Qs Already Knows Their Exact Suit. A Player Who Peeks Back Under Their Hole Cards When The Third Heart Lands Is Checking Whether Their Offsuit Ace Or King Happens To Be A Heart.',
  },
  {
    tell: '8. Forceful Chip Splash Vs. Quiet Placement',
    reliability: 'Moderate',
    meaning: 'Forceful Forward Splash Often Attempts To Project Intimidation On A Bluff.',
    explanation:
      'While Individual Baselines Vary, Players Who Slam Chips Aggressively Into The Center While Staring Directly At You Are Frequently Attempting To Deter A Call, Whereas Players Who Gently Slide Chips Forward Want To Invite A Call.',
  },
];

const ANGLE_SHOT_DEFENSES = [
  {
    angle: 'The Fake Fold / Card-Dirt Motion',
    mechanic: 'An Opponent Makes A Forward Tossing Motion With Their Cards As If Folding To Trick You Into Tabling Or Mucking Your Hand Prematurely.',
    defense:
      'Never Release Or Expose Your Hole Cards Until The Dealer Physically Pulls The Opponent\'s Cards Into The Muck Pile Or Pushes You The Pot. Keep A Card Protector On Your Hand At All Times.',
  },
  {
    angle: 'The Ambiguous "Pump Fake" Bet Or String Motion',
    mechanic: 'A Player Reaches Into The Pot With A Stack Of $25 Or $100 Chips Without Saying A Word, Pauses To Watch Your Facial Reaction, And Then Pulls Back Or Drops Just One Calling Chip.',
    defense:
      'Remain 100% Motionless Looking At A Fixed Spot On The Felt Whenever An Opponent Is Acting. If They Cross The Betting Line Or Release Chips, Immediately Ask The Dealer To Clarify The Binding Action Before Moving A Muscle.',
  },
  {
    angle: 'Hiding High-Denomination $100 Or $500 Chips',
    mechanic: 'Stacking Black ($100) Or Purple ($500) Chips Behind Or Underneath Stacks Of Red ($5) Chips So You Underestimate Their Effective Stack Size.',
    defense:
      'Under Official TDA Rule 25, High-Denomination Chips Must Be Clearly Visible At All Times. Before Calling Or Shoving, Politely Ask The Dealer: "Can I See A Clear View Of All Big Chips?"',
  },
  {
    angle: 'Verbal Misdirection ("You Win" At Showdown)',
    mechanic: 'At Showdown, An Opponent Says "You Got It" Or "I Missed" Without Mucking Their Cards, Hoping You Will Toss Your Winning Hand Face-Down Into The Muck So They Can Table A Pair And Claim The Pot.',
    defense:
      'Never Muck At Showdown Based On Verbal Concessions. Immediately Table Both Hole Cards Face-Up On The Felt And Let The Dealer Read The Board And Award The Pot.',
  },
];

const TELLS_FAQS = [
  {
    q: 'Are Live Poker Tells More Important Than GTO Math And Ranges?',
    a: 'No. Combinatoric Ranges, Pot Odds, And Bet Sizing Account For 85%+ Of Your Long-Term Edge. Live Tells Serve As A Tie-Breaker On Close 50/50 River Bluff-Catches Or Value-Bet Decisions When The Math Is Nearly Indifferent.',
  },
  {
    q: 'Why Do Shaking Hands Usually Mean A Monster Hand Rather Than A Bluff?',
    a: 'When A Player Decides To Bluff, They Have Mentally Prepared For The Act Before Reaching For Chips. When A Player Unexpectedly Makes Quads, A Full House, Or A Nut Flush In A Huge Pot, An Involuntary Rush Of Epinephrine (Adrenaline) Causes Visible Finger Tremors.',
  },
  {
    q: 'What Is The Single Easiest Way To Prevent Giving Off Live Tells Yourself?',
    a: 'Standardize Your Routine On Every Street: Wait 3 To 5 Seconds Before Acting On Every Decision, Look At A Fixed Spot In The Center Of The Board While Your Opponent Thinks, And Announce All Bet Amounts Verbally.',
  },
];

export default function LivePokerTellsPage() {
  const canonicalPath = '/learn/live-poker-tells';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: 'Live Poker Tells, Betting Timing & Anti-Angle-Shooting Encyclopedia',
      name: 'Live Poker Tells, Betting Timing & Anti-Angle-Shooting Encyclopedia',
      description:
        'Master 8 Reliable Live Poker Physical, Timing, And Verbal Tells Plus 4 Anti-Angle-Shooting Cardroom Defenses Under Official TDA Rules.',
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
      mainEntity: TELLS_FAQS.map((f) => ({
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
        { '@type': 'ListItem', position: 3, name: 'Live Poker Tells & Anti-Angle Guide', item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Live Poker Tells And Timing Strategy Guide"
        description="Master 8 Reliable Live Poker Physical, Timing, And Verbal Tells Plus 4 Anti-Angle-Shooting Cardroom Defenses Under Official TDA Rules."
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
          <span style={styles.crumbCurrent}>Live Poker Tells &amp; Anti-Angle Guide</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>8 RELIABLE BEHAVIORAL &amp; TIMING TELLS</span>
            <span style={styles.emeraldBadge}>OFFICIAL TDA ANTI-ANGLE-SHOOTING DEFENSE</span>
          </div>

          <h1 style={styles.h1}>
            Live Poker Tells, Betting Timing &amp; Anti-Angle-Shooting Encyclopedia
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Reliable Live Poker Tells Are Grounded In Autonomic Nervous System Responses And Betting Timing:
            <strong> Instant Stack-Glances After The Flop Signal Strength</strong>,
            <strong> Frozen Post-Bet Posture Signals Bluffing Tension</strong>,
            <strong> Sub-Second Snap-Calls Cap Ranges At Medium Strength</strong>, And
            <strong> Involuntary Hand Trembles Almost Always Signal Adrenaline From A Monster Hand</strong>.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/rules" style={styles.crossBtnCyan}>
              30 Official TDA &amp; Floor Rules
            </Link>
            <Link href="/poker-rooms/first-time-guide" style={styles.crossBtnEmerald}>
              First-Time Live Poker Room Guide
            </Link>
            <Link href="/learn/online-vs-live-poker" style={styles.crossBtnOutline}>
              Online Vs. Live Transition Guide
            </Link>
            <Link href="/learn/famous-hands" style={styles.crossBtnOutline}>
              12 Famous Televised Hands
            </Link>
            <Link href="/poker-rooms/comps-and-tipping-guide" style={styles.crossBtnOutline}>
              Casino Comps &amp; Tipping Guide
            </Link>
          </div>
        </header>

        {/* 8 Reliable Live Tells */}
        <section aria-label="Eight Reliable Live Poker Tells" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            8 High-Reliability Physical, Timing &amp; Verbal Live Poker Tells
          </h2>
          <div style={styles.cardGrid}>
            {TELL_CATALOG.map((item) => (
              <article key={item.tell} style={styles.card}>
                <div style={styles.cardMeta}>
                  <span style={styles.badgeCyan}>{item.reliability}</span>
                </div>
                <h3 style={styles.h3}>{item.tell}</h3>
                <p style={styles.meaningText}>
                  <strong>What It Means:</strong> {item.meaning}
                </p>
                <p style={styles.bodyText}>{item.explanation}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Anti-Angle-Shooting Defenses */}
        <section aria-label="Anti Angle Shooting Cardroom Defenses" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            4 Common Live Cardroom Angle Shots &amp; How To Protect Your Stack
          </h2>
          <div style={styles.cardGrid}>
            {ANGLE_SHOT_DEFENSES.map((item) => (
              <div key={item.angle} style={styles.card}>
                <div style={styles.badgeEmerald}>CARDROOM SECURITY PROTOCOL</div>
                <h3 style={styles.h3}>{item.angle}</h3>
                <p style={styles.bodyText}>
                  <strong>The Angle:</strong> {item.mechanic}
                </p>
                <p style={{ ...styles.meaningText, marginTop: '8px', marginBottom: 0 }}>
                  <strong>Ironclad Defense:</strong> {item.defense}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions On Live Poker Tells</h2>
          <div style={styles.faqList}>
            {TELLS_FAQS.map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title="Live Poker Tells, Betting Timing & Anti-Angle-Shooting Encyclopedia"
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel="Live Behavioral Guide"
          badgeValue="Tells, Timing & Angle Defense"
          summary="Master 8 Reliable Live Poker Physical, Timing, And Verbal Tells Plus 4 Anti-Angle-Shooting Cardroom Defenses Under Official TDA Rules."
          publishedYear="2026"
          slug="live-poker-tells-encyclopedia"
        />

        <AiPromptLauncher
          title="Live Poker Tells & Anti-Angle-Shooting Encyclopedia"
          canonicalUrl={canonicalUrl}
          canonicalPath={canonicalPath}
          markdownUrl="/learn/live-poker-tells.md"
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
    margin: '0 0 16px',
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '16px',
  },
  card: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '18px',
  },
  cardMeta: {
    marginBottom: '8px',
  },
  badgeCyan: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#00d4ff',
    letterSpacing: '0.04em',
  },
  badgeEmerald: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#10b981',
    marginBottom: '6px',
    letterSpacing: '0.04em',
  },
  h3: {
    fontSize: '17px',
    fontWeight: 700,
    color: '#f8fafc',
    margin: '0 0 8px',
  },
  meaningText: {
    fontSize: '13.5px',
    lineHeight: 1.55,
    color: '#10b981',
    margin: '0 0 8px',
  },
  bodyText: {
    fontSize: '13.5px',
    lineHeight: 1.6,
    color: '#cbd5e1',
    margin: 0,
  },
  faqList: {
    display: 'grid',
    gap: '14px',
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
