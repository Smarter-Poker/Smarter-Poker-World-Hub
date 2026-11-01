import React from 'react';
import Link from 'next/link';
import SEOHead, { schemas } from '../seo/SEOHead';
import AiPromptLauncher from '../seo/AiPromptLauncher';

const FEATURE_SEMANTIC_MESH = {
  '/features/preflop-charts-matrix': {
    learnHref: '/learn/category/preflop',
    learnLabel: 'Preflop Strategy Lessons',
    lessons: [
      { href: '/learn/utg-opening-range', label: 'UTG Opening Range In 6-Max' },
      { href: '/learn/button-opening-range', label: 'Button Opening Range In 6-Max' },
      { href: '/learn/big-blind-defense', label: 'Big Blind Defense Versus A Raise' },
    ],
    glossary: [
      { href: '/glossary/rfi', label: 'RFI (Raise First In)' },
      { href: '/glossary/3-bet', label: '3-Bet' },
      { href: '/glossary/range', label: 'Range' },
    ],
    tools: [
      { href: '/hub/training/preflop-charts', label: '6-Max 100BB Preflop Range Browser' },
      { href: '/hub/training/range-builder', label: 'Interactive 13x13 Preflop Range Builder' },
      { href: '/learn/hands', label: 'Starting Hand Encyclopedia' },
    ],
  },
  '/features/poker-equity-calculators': {
    learnHref: '/learn/category/math',
    learnLabel: 'Poker Math And ICM Lessons',
    lessons: [
      { href: '/learn/pot-odds', label: 'How To Calculate Pot Odds' },
      { href: '/learn/icm-basics', label: 'How ICM Works In Poker Tournaments' },
      { href: '/learn/expected-value', label: 'Expected Value (EV) In Poker' },
    ],
    glossary: [
      { href: '/glossary/equity', label: 'Equity' },
      { href: '/glossary/icm', label: 'ICM' },
      { href: '/glossary/pot-odds', label: 'Pot Odds' },
    ],
    tools: [
      { href: '/hub/training/icm-simulator', label: 'Tournament ICM Equity Simulator' },
      { href: '/hub/training/hand-comparison', label: 'A/B Poker Hand Equity Comparison Tool' },
      { href: '/hub/training/final-table-sim', label: 'Final Table ICM And Deal Simulator' },
    ],
  },
  '/features/bankroll-tax-tracker': {
    learnHref: '/learn/category/bankroll',
    learnLabel: 'Bankroll Management Lessons',
    lessons: [
      { href: '/learn/cash-game-bankroll', label: 'Cash Game Bankroll Rules' },
      { href: '/learn/tournament-bankroll', label: 'Tournament Bankroll Requirements' },
      { href: '/learn/risk-of-ruin', label: 'Risk Of Ruin In Poker' },
    ],
    glossary: [
      { href: '/glossary/variance', label: 'Variance' },
      { href: '/glossary/effective-stack', label: 'Effective Stack' },
      { href: '/glossary/rake', label: 'Rake' },
    ],
    tools: [
      { href: '/hub/training/risk-analyzer', label: 'Poker Risk Of Ruin And Variance Simulator' },
      { href: '/hub/training/custom-rake', label: 'Poker Rake Cost Estimator' },
      { href: '/compare/best-poker-bankroll-trackers', label: 'Best Poker Bankroll Trackers Compared' },
    ],
  },
  '/features/poker-training-games': {
    learnHref: '/learn/category/postflop',
    learnLabel: 'Postflop And GTO Strategy Lessons',
    lessons: [
      { href: '/learn/continuation-betting', label: 'Continuation Betting On The Flop' },
      { href: '/learn/minimum-defense-frequency', label: 'Minimum Defense Frequency (MDF)' },
      { href: '/learn/check-raising', label: 'How To Check-Raise In Poker' },
    ],
    glossary: [
      { href: '/glossary/gto', label: 'GTO (Game Theory Optimal)' },
      { href: '/glossary/c-bet', label: 'Continuation Bet' },
      { href: '/glossary/mdf', label: 'MDF (Minimum Defense Frequency)' },
    ],
    tools: [
      { href: '/hub/training/spot-trainer', label: 'Answer-Revealed Solver Spot Study' },
      { href: '/hub/training/drill-builder', label: 'Custom Poker Drill Builder' },
      { href: '/hub/training/skill-tree', label: 'Interactive Poker Skill Tree Map' },
    ],
  },
  '/features/poker-near-me': {
    learnHref: '/learn/category/cash',
    learnLabel: 'Live Cash Game Strategy Lessons',
    lessons: [
      { href: '/learn/rake-and-win-rate', label: 'How Rake Affects Your Win Rate' },
      { href: '/learn/straddle-games', label: 'How To Play In Straddle Games' },
    ],
    glossary: [
      { href: '/glossary/waitlist', label: 'Waitlist' },
      { href: '/glossary/straddle', label: 'Straddle' },
      { href: '/glossary/rake', label: 'Rake' },
    ],
    tools: [
      { href: '/hub/poker-near-me/venues', label: 'Live Poker Venue Directory' },
      { href: '/hub/daily-tournaments', label: 'Daily Poker Tournaments Schedule' },
      { href: '/research/us-live-poker-room-rake-and-jackpot-benchmark', label: 'US Live Poker Room Rake Benchmark' },
    ],
  },
  '/features/poker-dealer-toke-tracker': {
    learnHref: '/learn/category/bankroll',
    learnLabel: 'Bankroll And Live Room Lessons',
    lessons: [
      { href: '/learn/rake-and-win-rate', label: 'How Live Room Rake And Drops Work' },
      { href: '/learn/cash-game-bankroll', label: 'Managing Session Income And Variance' },
    ],
    glossary: [
      { href: '/glossary/dealer-button', label: 'Dealer Button' },
      { href: '/glossary/table-balancing', label: 'Table Balancing' },
      { href: '/glossary/must-move-table', label: 'Must-Move Table' },
    ],
    tools: [
      { href: '/hub/commander/venues', label: 'Club Commander Live Poker Rooms' },
      { href: '/compare/smarter-poker-vs-downcount', label: 'Smarter.Poker Vs DownCount Comparison' },
    ],
  },
  '/features/poker-ai-coach': {
    learnHref: '/learn/category/theory',
    learnLabel: 'Game Theory And Solver Lessons',
    lessons: [
      { href: '/learn/expected-value', label: 'Expected Value (EV) In Poker' },
      { href: '/learn/minimum-defense-frequency', label: 'Minimum Defense Frequency (MDF)' },
      { href: '/learn/board-texture', label: 'How To Read Board Texture' },
    ],
    glossary: [
      { href: '/glossary/nash-equilibrium', label: 'Nash Equilibrium' },
      { href: '/glossary/exploitative-play', label: 'Exploitative Play' },
      { href: '/glossary/nodelocking', label: 'Nodelocking' },
    ],
    tools: [
      { href: '/hub/personal-assistant', label: 'Jarvis Personal Poker Assistant' },
      { href: '/hub/personal-assistant/leaks', label: 'Automated Leak Finder Audit' },
      { href: '/hub/training/weakness-scanner', label: 'Position And Street Weakness Scanner' },
    ],
  },
  '/features/virtual-poker-sandbox': {
    learnHref: '/learn/category/postflop',
    learnLabel: 'Postflop Combinatorics And SPR Lessons',
    lessons: [
      { href: '/learn/stack-to-pot-ratio', label: 'Stack To Pot Ratio (SPR) Explained' },
      { href: '/learn/counting-combos', label: 'Counting Poker Hand Combinations' },
      { href: '/learn/counting-outs', label: 'Counting Outs And The Rule Of 2 And 4' },
    ],
    glossary: [
      { href: '/glossary/spr', label: 'SPR (Stack To Pot Ratio)' },
      { href: '/glossary/combo', label: 'Combo' },
      { href: '/glossary/board-texture', label: 'Board Texture' },
    ],
    tools: [
      { href: '/hub/training/hand-lab', label: 'Interactive Poker Hand Lab And Board Analyzer' },
      { href: '/hub/training/custom-solve', label: 'Custom GTO Spot And Preflop Query' },
      { href: '/compare/smarter-poker-vs-piosolver', label: 'Smarter.Poker Vs PioSolver Comparison' },
    ],
  },
  '/features/club-commander': {
    learnHref: '/learn/category/cash',
    learnLabel: 'Live Poker Room Operations And Cash Lessons',
    lessons: [
      { href: '/learn/rake-and-win-rate', label: 'How Rake Affects Player Win Rates' },
      { href: '/learn/straddle-games', label: 'Straddle Games And Stack Depth' },
    ],
    glossary: [
      { href: '/glossary/waitlist', label: 'Waitlist' },
      { href: '/glossary/high-hand-promotion', label: 'High Hand Promotion' },
      { href: '/glossary/bad-beat-jackpot', label: 'Bad Beat Jackpot' },
    ],
    tools: [
      { href: '/hub/commander', label: 'Club Commander Player Hub' },
      { href: '/hub/commander/tournaments', label: 'Club Commander Live Tournament Clocks' },
      { href: '/compare/best-poker-room-management-software', label: 'Best Poker Room Software Compared' },
    ],
  },
  '/features/poker-messenger-video-calls': {
    learnHref: '/learn/category/theory',
    learnLabel: 'Online Table Dynamics And Theory',
    lessons: [
      { href: '/learn/preflop-ranges-by-position', label: 'Preflop Opening Ranges By Position' },
      { href: '/learn/tilt-control', label: 'How To Control Tilt At The Table' },
    ],
    glossary: [
      { href: '/glossary/time-bank', label: 'Time Bank' },
      { href: '/glossary/showdown', label: 'Showdown' },
    ],
    tools: [
      { href: '/hub/messenger', label: 'Smarter.Poker Encrypted Messenger' },
      { href: '/hub/training/study-group-finder', label: 'Poker Study Group Finder' },
    ],
  },
  '/features/poker-trivia': {
    learnHref: '/learn/category/math',
    learnLabel: 'Poker Odds, Rules And Math Lessons',
    lessons: [
      { href: '/learn/pot-odds', label: 'Pot Odds: How To Know If A Call Pays' },
      { href: '/learn/counting-outs', label: 'Counting Outs And The Rule Of 2 And 4' },
      { href: '/learn/bluff-break-even-percentage', label: 'How Often A Bluff Must Work' },
    ],
    glossary: [
      { href: '/glossary/outs', label: 'Outs' },
      { href: '/glossary/implied-odds', label: 'Implied Odds' },
      { href: '/glossary/fold-equity', label: 'Fold Equity' },
    ],
    tools: [
      { href: '/hub/trivia/survival-game', label: 'Poker Trivia Survival Mode' },
      { href: '/hub/training/flashcards', label: 'Spaced-Repetition GTO Flashcards' },
      { href: '/hub/training/quiz-builder', label: 'Custom GTO Poker Quiz Builder' },
    ],
  },
  '/features/home-poker-games': {
    learnHref: '/learn/category/tournaments',
    learnLabel: 'Home Game And Tournament Structure Lessons',
    lessons: [
      { href: '/learn/m-ratio-and-short-stacks', label: 'M Ratio And Blind Structure Pacing' },
      { href: '/learn/straddle-games', label: 'How To Play In Straddle And Bomb Pot Games' },
    ],
    glossary: [
      { href: '/glossary/bomb-pot', label: 'Bomb Pot' },
      { href: '/glossary/chip-up', label: 'Chip-Up' },
      { href: '/glossary/blinds', label: 'Blinds' },
    ],
    tools: [
      { href: '/hub/home-games/in', label: 'Verified Home Games By State And City' },
      { href: '/hub/commander/home-games', label: 'Club Commander Home Game Clocks And Waitlists' },
      { href: '/hub/training/tournament-prep', label: 'Tournament Structure And M-Ratio Planner' },
    ],
  },
  '/features/interactive-video-coaching': {
    learnHref: '/learn/category/postflop',
    learnLabel: 'Interactive Strategy Curriculum',
    lessons: [
      { href: '/learn/continuation-betting', label: 'Continuation Betting: When To C-Bet' },
      { href: '/learn/facing-a-3-bet', label: 'What To Do When You Face A 3-Bet' },
      { href: '/learn/final-table-icm', label: 'Final Table ICM Strategy' },
    ],
    glossary: [
      { href: '/glossary/range-advantage', label: 'Range Advantage' },
      { href: '/glossary/nut-advantage', label: 'Nut Advantage' },
      { href: '/glossary/polarized-range', label: 'Polarized Range' },
    ],
    tools: [
      { href: '/hub/training/coach-mode', label: 'Guided GTO Coach Mode' },
      { href: '/hub/training/scenario-demo', label: 'Interactive GTO Strategy And Solver Tutorial' },
      { href: '/compare/smarter-poker-vs-run-it-once', label: 'Smarter.Poker Vs Run It Once Comparison' },
    ],
  },
  '/features/private-poker-clubs': {
    learnHref: '/learn/category/cash',
    learnLabel: 'Private Club And Cash Game Guides',
    lessons: [
      { href: '/learn/rake-and-win-rate', label: 'How Club Rake Affects Win Rate' },
      { href: '/learn/cash-game-bankroll', label: 'Bankroll Rules For Club Cash Games' },
    ],
    glossary: [
      { href: '/glossary/poker-union', label: 'Poker Union' },
      { href: '/glossary/club-agent', label: 'Club Agent' },
      { href: '/glossary/rakeback', label: 'Rakeback' },
      { href: '/glossary/run-it-twice', label: 'Run It Twice' },
    ],
    tools: [
      { href: '/hub/club-arena', label: 'Poker Arena Private Club Hub' },
      { href: '/compare/best-poker-club-apps', label: 'Best Private Poker Club Apps Compared' },
      { href: '/research/private-poker-club-and-cardroom-software-economics', label: 'Private Poker Club Economics Study' },
    ],
  },
  '/features/poker-reels-social-feed': {
    learnHref: '/learn/category/mental-game',
    learnLabel: 'Mental Game And Community Strategy',
    lessons: [
      { href: '/learn/tilt-control', label: 'How To Control Tilt At The Poker Table' },
      { href: '/learn/expected-value', label: 'Focusing On Expected Value Over Short-Term Results' },
    ],
    glossary: [
      { href: '/glossary/tilt', label: 'Tilt' },
      { href: '/glossary/variance', label: 'Variance' },
      { href: '/glossary/villain', label: 'Villain' },
    ],
    tools: [
      { href: '/hub/reels', label: 'Smarter.Poker Short-Video Reels' },
      { href: '/hub/training/training-feed', label: 'Community Training Activity Feed' },
      { href: '/hub/social-pages', label: 'Public Poker Community Pages' },
    ],
  },
};

export default function FeatureLanderLayout({
  title,
  metaTitle,
  description,
  canonical,
  ogImage,
  badgeText = '100% Free Platform Feature',
  primaryCtaText = 'Launch In World Hub',
  primaryCtaHref = '/hub',
  secondaryCtaText = 'View Plain-Text Spec',
  secondaryCtaHref,
  markdownUrl,
  features = [],
  comparison = null,
  howItWorks = [],
  faqs = [],
  jsonLd = [],
}) {
  const schemaList = [
    schemas.organization,
    {
      '@type': 'WebPage',
      '@id': `https://smarter.poker${canonical}#page`,
      url: `https://smarter.poker${canonical}`,
      name: metaTitle || title,
      description,
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'p'],
      },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `https://smarter.poker${canonical}#app`,
      name: title,
      applicationCategory: 'GameApplication',
      operatingSystem: 'Any (Web, iOS, Android)',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      description,
      url: `https://smarter.poker${canonical}`,
      ...(Array.isArray(features) && features.length > 0
        ? { featureList: features.map((f) => `${f.title}: ${f.description}`) }
        : {}),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `https://smarter.poker${canonical}#breadcrumb`,
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: 'https://smarter.poker/',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Features',
          item: 'https://smarter.poker/features',
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: title,
          item: `https://smarter.poker${canonical}`,
        },
      ],
    },
    ...jsonLd,
  ];

  if (Array.isArray(howItWorks) && howItWorks.length > 0) {
    schemaList.push({
      '@type': 'HowTo',
      '@id': `https://smarter.poker${canonical}#howto`,
      name: `How To Use ${title}`,
      description,
      totalTime: 'PT2M',
      step: howItWorks.map((step, idx) => ({
        '@type': 'HowToStep',
        position: idx + 1,
        name: step.title,
        text: step.description,
        url: `https://smarter.poker${canonical}#step-${idx + 1}`,
      })),
    });
  }

  if (Array.isArray(faqs) && faqs.length > 0) {
    schemaList.push({
      '@type': 'FAQPage',
      '@id': `https://smarter.poker${canonical}#faq`,
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: f.answer,
        },
      })),
    });
  }

  return (
    <>
      <SEOHead
        title={metaTitle || title}
        description={description}
        canonical={canonical}
        ogImage={ogImage || `/api/og/tool-card?tool=features&title=${encodeURIComponent(title)}`}
        jsonLd={schemaList}
        markdownUrl={markdownUrl}
      />

      <main style={styles.page}>
        <article style={styles.article}>
          <nav style={styles.breadcrumb} aria-label="Breadcrumb">
            <Link href="/" style={styles.breadcrumbLink}>
              Home
            </Link>
            <span style={styles.breadcrumbSeparator}>/</span>
            <Link href="/features" style={styles.breadcrumbLink}>
              Features
            </Link>
            <span style={styles.breadcrumbSeparator}>/</span>
            <span style={styles.breadcrumbCurrent}>{title}</span>
          </nav>

          <header style={styles.header}>
            <div style={styles.badge}>{badgeText}</div>
            <h1 style={styles.h1}>{title}</h1>
            <p style={styles.lead}>{description}</p>
            <div style={styles.ctaGroup}>
              <Link href={primaryCtaHref} style={styles.primaryBtn}>
                {primaryCtaText}
              </Link>
              {secondaryCtaHref && (
                <a href={secondaryCtaHref} style={styles.secondaryBtn}>
                  {secondaryCtaText}
                </a>
              )}
            </div>
          </header>

          {features.length > 0 && (
            <section style={styles.section}>
              <h2 style={styles.h2}>Core Capabilities & Architecture</h2>
              <div style={styles.grid}>
                {features.map((f, idx) => (
                  <div key={idx} style={styles.card}>
                    <h3 style={styles.cardTitle}>{f.title}</h3>
                    <p style={styles.cardText}>{f.description}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {comparison && (
            <section style={styles.section}>
              <h2 style={styles.h2}>{comparison.title}</h2>
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {comparison.headers.map((h, idx) => (
                        <th key={idx} style={styles.th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.rows.map((row, rIdx) => (
                      <tr key={rIdx} style={rIdx % 2 === 1 ? styles.trAlt : styles.tr}>
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} style={cIdx === 0 ? styles.tdBold : styles.td}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {howItWorks.length > 0 && (
            <section style={styles.section}>
              <h2 style={styles.h2}>How It Works</h2>
              <ol style={styles.stepList}>
                {howItWorks.map((step, idx) => (
                  <li key={idx} id={`step-${idx + 1}`} style={styles.stepItem}>
                    <span style={styles.stepNumber}>{idx + 1}</span>
                    <div>
                      <h3 style={styles.stepTitle}>{step.title}</h3>
                      <p style={styles.stepDescription}>{step.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {faqs.length > 0 && (
            <section style={styles.section}>
              <h2 style={styles.h2}>Frequently Asked Questions</h2>
              <div style={styles.faqList}>
                {faqs.map((faq, idx) => (
                  <div key={idx} style={styles.faqItem}>
                    <h3 style={styles.faqQuestion}>{faq.question}</h3>
                    <p style={styles.faqAnswer}>{faq.answer}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {FEATURE_SEMANTIC_MESH[canonical] && (
            <section style={styles.section}>
              <h2 style={styles.h2}>Related Strategy Lessons, Tools & Glossary Definitions</h2>
              <div style={styles.footerLinks}>
                <Link href={FEATURE_SEMANTIC_MESH[canonical].learnHref} style={styles.footerLink}>
                  {FEATURE_SEMANTIC_MESH[canonical].learnLabel}
                </Link>
                {FEATURE_SEMANTIC_MESH[canonical].lessons.map((l) => (
                  <Link key={l.href} href={l.href} style={styles.footerLink}>
                    {l.label}
                  </Link>
                ))}
                {(FEATURE_SEMANTIC_MESH[canonical].tools || []).map((t) => (
                  <Link key={t.href} href={t.href} style={styles.footerLink}>
                    {t.label}
                  </Link>
                ))}
                {FEATURE_SEMANTIC_MESH[canonical].glossary.map((g) => (
                  <Link key={g.href} href={g.href} style={styles.footerLink}>
                    {g.label} Definition
                  </Link>
                ))}
              </div>
            </section>
          )}

          <AiPromptLauncher
            title={metaTitle || title}
            canonicalUrl={`https://smarter.poker${canonical}`}
            markdownUrl={markdownUrl || `https://smarter.poker${canonical}.md`}
          />

          <footer style={styles.footer}>
            <p style={styles.footerNote}>
              Free To Play Platform Operated By Smarter Software Inc. Zero Financial Deposit Required.
            </p>
            <div style={styles.footerLinks}>
              <Link href="/terms" style={styles.footerLink}>
                Terms Of Service
              </Link>
              <Link href="/privacy" style={styles.footerLink}>
                Privacy Policy
              </Link>
              <Link href="/about" style={styles.footerLink}>
                About Smarter.Poker
              </Link>
            </div>
          </footer>
        </article>
      </main>
    </>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #0a0a12 0%, #050510 100%)',
    color: '#e6ecf5',
    fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif",
  },
  article: { maxWidth: 920, margin: '0 auto', padding: '40px 20px 64px' },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: '#7f8ca3',
    marginBottom: 28,
  },
  breadcrumbLink: { color: '#00c6ff', textDecoration: 'none' },
  breadcrumbSeparator: { color: '#4a5568' },
  breadcrumbCurrent: { color: '#b8c4d6', fontWeight: 500 },
  header: { marginBottom: 44 },
  badge: {
    display: 'inline-block',
    background: 'rgba(0, 198, 255, 0.1)',
    border: '1px solid rgba(0, 198, 255, 0.3)',
    color: '#00c6ff',
    padding: '4px 12px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.5px',
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  h1: {
    fontFamily: "var(--font-orbitron), sans-serif",
    fontSize: 'clamp(26px, 4.5vw, 38px)',
    fontWeight: 700,
    lineHeight: 1.25,
    color: '#ffffff',
    margin: '0 0 16px',
    letterSpacing: '0.5px',
  },
  lead: {
    fontSize: 17,
    lineHeight: 1.7,
    color: '#c7d2e2',
    margin: '0 0 24px',
  },
  ctaGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 20,
  },
  primaryBtn: {
    display: 'inline-block',
    background: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
    color: '#ffffff',
    fontWeight: 600,
    fontSize: 15,
    padding: '12px 24px',
    borderRadius: 8,
    textDecoration: 'none',
    letterSpacing: '0.5px',
  },
  secondaryBtn: {
    display: 'inline-block',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    color: '#e6ecf5',
    fontWeight: 600,
    fontSize: 15,
    padding: '12px 24px',
    borderRadius: 8,
    textDecoration: 'none',
  },
  section: {
    marginTop: 48,
    paddingTop: 36,
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
  },
  h2: {
    fontFamily: "var(--font-orbitron), sans-serif",
    fontSize: 'clamp(20px, 3vw, 24px)',
    fontWeight: 600,
    color: '#ffffff',
    margin: '0 0 24px',
    letterSpacing: '0.5px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 16,
  },
  card: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(0, 198, 255, 0.15)',
    borderRadius: 12,
    padding: '20px 18px',
  },
  cardTitle: {
    fontFamily: "var(--font-orbitron), sans-serif",
    fontSize: 15,
    fontWeight: 600,
    color: '#00c6ff',
    margin: '0 0 8px',
    letterSpacing: '0.3px',
  },
  cardText: {
    fontSize: 14,
    lineHeight: 1.6,
    color: '#b8c4d6',
    margin: 0,
  },
  tableWrapper: {
    overflowX: 'auto',
    borderRadius: 12,
    border: '1px solid rgba(0, 198, 255, 0.2)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 14,
    textAlign: 'left',
  },
  th: {
    background: 'rgba(0, 198, 255, 0.12)',
    color: '#ffffff',
    fontWeight: 600,
    padding: '14px 16px',
    borderBottom: '1px solid rgba(0, 198, 255, 0.2)',
  },
  tr: {
    background: 'rgba(255, 255, 255, 0.02)',
  },
  trAlt: {
    background: 'rgba(255, 255, 255, 0.04)',
  },
  td: {
    padding: '14px 16px',
    color: '#c7d2e2',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  tdBold: {
    padding: '14px 16px',
    color: '#ffffff',
    fontWeight: 600,
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  stepList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'grid',
    gap: 16,
  },
  stepItem: {
    display: 'flex',
    gap: 16,
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    padding: '18px 20px',
  },
  stepNumber: {
    fontFamily: "var(--font-orbitron), sans-serif",
    fontSize: 18,
    fontWeight: 700,
    color: '#00c6ff',
    background: 'rgba(0, 198, 255, 0.12)',
    width: 36,
    height: 36,
    borderRadius: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#ffffff',
    margin: '0 0 6px',
  },
  stepDescription: {
    fontSize: 14,
    lineHeight: 1.6,
    color: '#b8c4d6',
    margin: 0,
  },
  faqList: {
    display: 'grid',
    gap: 16,
  },
  faqItem: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(0, 198, 255, 0.12)',
    borderRadius: 12,
    padding: '18px 20px',
  },
  faqQuestion: {
    fontSize: 16,
    fontWeight: 600,
    color: '#00c6ff',
    margin: '0 0 8px',
  },
  faqAnswer: {
    fontSize: 14,
    lineHeight: 1.6,
    color: '#c7d2e2',
    margin: 0,
  },
  footer: {
    marginTop: 56,
    paddingTop: 28,
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    textAlign: 'center',
  },
  footerNote: {
    fontSize: 13,
    color: '#7f8ca3',
    margin: '0 0 14px',
  },
  footerLinks: {
    display: 'flex',
    justifyContent: 'center',
    gap: 18,
  },
  footerLink: {
    fontSize: 13,
    color: '#9fd8ff',
    textDecoration: 'underline',
  },
};
