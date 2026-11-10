/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER VARIANTS & MIXED GAMES ENCYCLOPEDIA INDEX (/games)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Server-rendered directory at /games (and raw Markdown at /games.md) covering
 * 15 poker variants across Community Card, Stud, Draw & Lowball, and Mixed
 * Rotations.
 *
 * Design: #SmarterCasinoRealism (#020608 obsidian, #101a20 gunmetal, #25c8ff cyan,
 * #f2b84b vault gold, borderRadius: '2px').
 * House style: Title Case, zero em dashes.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import {
  GAME_CATEGORIES,
  GAMES_AS_OF,
  GAMES_BASE_PATH,
  GAMES_URL,
  POKER_VARIANTS,
  gameVariantPath,
} from '../../src/content/games/variants';

const GAMES_INDEX_FAQS = [
  {
    q: 'What Are The Four Main Families Of Poker Variants?',
    a: 'All Poker Variants Fall Into Four Structural Families: (1) Community Card Games (Texas Hold\'em, PLO4/5/6, Short Deck, Pineapple) Where Players Combine Private Hole Cards With Shared Center Cards; (2) Stud Games (7-Card Stud, Stud Hi-Lo, Razz) Where Players Receive A Mix Of Face-Down And Face-Up Individual Cards With No Community Board; (3) Draw & Lowball Games (2-7 Triple Draw, NL 2-7 Single Draw, Badugi) Where Players Exchange Private Cards To Improve Hidden Hands; And (4) Mixed Rotations (H.O.R.S.E. And 8-Game) That Cycle Through All Three Families.',
  },
  {
    q: 'What Is The Most Important Rule Difference Between Texas Hold\'em And Omaha?',
    a: 'In Texas Hold\'em, You May Use Zero, One, Or Both Of Your Hole Cards To Make Your Best 5-Card Hand. In Every Variant Of Omaha (PLO4, PLO5, PLO6, And Omaha Hi-Lo), You Are Strictly Required To Use Exactly Two Of Your Hole Cards Combined With Exactly Three Community Cards.',
  },
  {
    q: 'What Is The Difference Between Ace-To-Five Lowball And Deuce-To-Seven Lowball?',
    a: 'In Ace-To-Five (California) Lowball Used In Razz, Omaha Hi-Lo, And Stud Hi-Lo, Aces Are Always Low (1) And Straights And Flushes Do Not Hurt Your Low (Making A-2-3-4-5 The Nut Wheel). In Deuce-To-Seven (Kansas City) Lowball Used In 2-7 Triple Draw And NL 2-7 Single Draw, Aces Are Always High And Straights And Flushes Count Against You (Making 7-5-4-3-2 Unsuited The Best Hand).',
  },
  {
    q: 'Why Does A Flush Beat A Full House In Short Deck (6+ Hold\'em)?',
    a: 'Removing All 2s, 3s, 4s, And 5s Leaves Only 9 Cards Of Each Suit In The 36-Card Deck. Out Of 376,992 Possible 5-Card Hands, Only 4,104 Are Non-Straight Flushes Whereas 12,960 Are Full Houses, Making A Flush More Than Three Times Rarer Than A Full House.',
  },
];

export default function PokerGamesIndexPage() {
  const [selectedCategory, setSelectedCategory] = useState('All');

  const visibleVariants =
    selectedCategory === 'All'
      ? POKER_VARIANTS
      : POKER_VARIANTS.filter((v) => v.category === selectedCategory);

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${GAMES_URL}#article`,
      headline: 'Poker Variants & Mixed Games Encyclopedia: 15 Complete Rulebooks & Strategy Guides',
      description:
        'Comprehensive Guide To 15 Official Poker Variants Including Texas Hold\'em, PLO4, PLO5, PLO6, Omaha Hi-Lo, Short Deck 6+, Double-Board Bomb Pots, 7-Card Stud, Razz, 2-7 Lowball, Badugi, And H.O.R.S.E.',
      datePublished: GAMES_AS_OF,
      dateModified: GAMES_AS_OF,
      inLanguage: 'en-US',
      mainEntityOfPage: GAMES_URL,
      author: { '@id': 'https://smarter.poker/#organization' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
    },
    {
      '@type': 'CollectionPage',
      '@id': `${GAMES_URL}#collection`,
      name: 'Poker Variants & Mixed Games Encyclopedia',
      url: GAMES_URL,
      inLanguage: 'en-US',
      dateModified: GAMES_AS_OF,
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: POKER_VARIANTS.length,
        itemListElement: POKER_VARIANTS.map((v, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: v.title,
          url: `https://smarter.poker${gameVariantPath(v.slug)}`,
        })),
      },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${GAMES_URL}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Poker Variants & Mixed Games', item: GAMES_URL },
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': `${GAMES_URL}#faq`,
      mainEntity: GAMES_INDEX_FAQS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: f.a,
        },
      })),
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Poker Variants & Mixed Games Guide"
        description="Complete Rules, Hand Rankings, Betting Structures, And Starting Hand Strategy For 15 Poker Variants: Hold'em, PLO4/5/6, Omaha Hi-Lo, Short Deck, Stud, Razz, 2-7 Triple Draw, And Badugi."
        canonical={GAMES_BASE_PATH}
        markdownUrl="https://smarter.poker/games.md"
        jsonLd={jsonLd}
      />

      <UniversalHeader pageDepth={1} />

      <main style={styles.container}>
        <nav aria-label="Breadcrumb" style={styles.breadcrumbs}>
          <Link href="/" style={styles.crumbLink}>
            Smarter.Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>Poker Variants &amp; Mixed Games Encyclopedia</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.goldBadge}>15 COMPLETE VARIANT RULEBOOKS</span>
            <span style={styles.cyanBadge}>HOLD&apos;EM · PLO · STUD · LOWBALL · MIXED</span>
            <a href="/games.md" style={styles.mdBadge}>
              RAW MARKDOWN (/GAMES.MD)
            </a>
          </div>

          <h1 style={styles.h1}>
            Poker Variants &amp; Mixed Games Encyclopedia: Official Rules, Hand Rankings &amp; Starting Hand Strategy
          </h1>

          <p style={styles.lead}>
            Master All 15 Major Live, Tournament, And Private Club Poker Formats. Compare Hole Card Counts, Must-Use-Two
            Omaha Mandates, Pot-Limit Betting Formulas, Short Deck 36-Card Probabilities, Seven-Card Stud Bring-Ins, And
            Ace-To-Five Vs. Deuce-To-Seven Lowball Rankings.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/learn/poker-hand-rankings" style={styles.crossBtnGold}>
              Poker Hand Rankings &amp; Lowball Cheat Sheet
            </Link>
            <Link href="/rules" style={styles.crossBtnCyan}>
              30 Official TDA &amp; Cash Floor Rulings
            </Link>
            <Link href="/tools/poker-odds-calculator" style={styles.crossBtnOutline}>
              Multiway Poker Odds Calculator
            </Link>
            <Link href="/tools/plo-bet-calculator" style={styles.crossBtnOutline}>
              PLO Pot-Limit Bet Calculator
            </Link>
          </div>
        </header>

        <section aria-label="Filter Variants By Category" style={styles.filterBar}>
          <button
            type="button"
            onClick={() => setSelectedCategory('All')}
            style={selectedCategory === 'All' ? styles.filterBtnActive : styles.filterBtn}
          >
            All Poker Variants ({POKER_VARIANTS.length})
          </button>
          {GAME_CATEGORIES.map((cat) => {
            const count = POKER_VARIANTS.filter((v) => v.category === cat).length;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                style={selectedCategory === cat ? styles.filterBtnActive : styles.filterBtn}
              >
                {cat} ({count})
              </button>
            );
          })}
        </section>

        <section aria-label="Master Comparison Matrix Of 15 Poker Variants" style={styles.tablePlate}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.h2}>Master Comparison Table Of All 15 Poker Variants</h2>
            <span style={styles.asOfText}>Verified As Of {GAMES_AS_OF}</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Variant Name</th>
                  <th style={styles.th}>Family</th>
                  <th style={styles.th}>Hole Cards &amp; Usage Rule</th>
                  <th style={styles.th}>Board / Upcards</th>
                  <th style={styles.th}>Betting Structure</th>
                  <th style={styles.th}>Hand Ranking System</th>
                </tr>
              </thead>
              <tbody>
                {visibleVariants.map((v) => (
                  <tr key={v.slug} style={styles.trBody}>
                    <td style={styles.tdTitle}>
                      <Link href={gameVariantPath(v.slug)} style={styles.variantLink}>
                        {v.name}
                      </Link>
                    </td>
                    <td style={styles.tdCat}>{v.category}</td>
                    <td style={styles.tdCell}>{v.holeCards}</td>
                    <td style={styles.tdCell}>{v.boardCards}</td>
                    <td style={styles.tdCell}>{v.bettingStructure}</td>
                    <td style={styles.tdRank}>{v.handRankingSystem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {GAME_CATEGORIES.map((category) => {
          const catGames = POKER_VARIANTS.filter((v) => v.category === category);
          return (
            <section key={category} style={styles.categorySection}>
              <div style={styles.categoryHeaderRow}>
                <h2 style={styles.h2}>{category} Variants</h2>
                <span style={styles.categoryCount}>{catGames.length} Complete Guides</span>
              </div>
              <div style={styles.cardGrid}>
                {catGames.map((v) => (
                  <article key={v.slug} style={styles.cardPlate}>
                    <div>
                      <div style={styles.cardTopMeta}>
                        <span style={styles.cardCatTag}>{v.bettingStructure}</span>
                        <a href={`/games/${v.slug}.md`} style={styles.cardMdLink}>
                          .MD
                        </a>
                      </div>
                      <h3 style={styles.h3}>
                        <Link href={gameVariantPath(v.slug)} style={styles.cardTitleLink}>
                          {v.name}
                        </Link>
                      </h3>
                      <p style={styles.cardSummary}>{v.summary}</p>
                    </div>
                    <div style={styles.cardSpecStrip}>
                      <div>
                        <span style={styles.specLabel}>Hole Cards: </span>
                        <span style={styles.specVal}>{v.holeCards}</span>
                      </div>
                      <div>
                        <span style={styles.specLabel}>Rankings: </span>
                        <span style={styles.specVal}>{v.handRankingSystem}</span>
                      </div>
                      <div style={{ marginTop: '8px' }}>
                        <Link href={gameVariantPath(v.slug)} style={styles.readGuideLink}>
                          Open Full {v.name} Rules &amp; Strategy Guide
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}

        <section style={styles.crossHubPlate}>
          <h2 style={styles.h2}>Interactive Equity Calculators, Hand Rankings &amp; Official Rules</h2>
          <p style={styles.bodyText}>
            Pair Variant Rulebooks With Live Combinatorial Calculators And Floor Rulings:
          </p>
          <div style={styles.hubLinkGrid}>
            <Link href="/learn/poker-hand-rankings" style={styles.hubCard}>
              <span style={styles.hubCardLabel}>HAND RANKINGS CHEAT SHEET</span>
              <span style={styles.hubCardTitle}>Standard 10-Tier High, Short Deck 6+, A-5 Lowball &amp; 2-7 Lowball</span>
            </Link>
            <Link href="/tools/poker-odds-calculator" style={styles.hubCard}>
              <span style={styles.hubCardLabel}>MULTI-VARIANT EQUITY ENGINE</span>
              <span style={styles.hubCardTitle}>Hold&apos;Em, PLO4, PLO5, PLO6 &amp; Short Deck Odds Calculator</span>
            </Link>
            <Link href="/tools/plo-bet-calculator" style={styles.hubCard}>
              <span style={styles.hubCardLabel}>POT-LIMIT BETTING SOLVER</span>
              <span style={styles.hubCardTitle}>PLO Maximum Pot-Size Raise Calculator (3x + Trail + Center Pot)</span>
            </Link>
            <Link href="/rules" style={styles.hubCard}>
              <span style={styles.hubCardLabel}>OFFICIAL FLOOR RULINGS</span>
              <span style={styles.hubCardTitle}>30 TDA &amp; RROP Rules: Bomb Pots, Kill Pots, Hi-Lo &amp; Showdowns</span>
            </Link>
            <Link href="/learn/hands" style={styles.hubCard}>
              <span style={styles.hubCardLabel}>169 STARTING HANDS</span>
              <span style={styles.hubCardTitle}>Complete 13x13 Starting Hand Encyclopedia &amp; GTO Matrix</span>
            </Link>
            <Link href="/glossary" style={styles.hubCard}>
              <span style={styles.hubCardLabel}>POKER GLOSSARY</span>
              <span style={styles.hubCardTitle}>Definitions For Every Club, Live Room, And Mixed-Game Term</span>
            </Link>
          </div>
        </section>

        <section style={styles.faqPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions On Poker Variants &amp; Mixed Games</h2>
          <div style={styles.faqList}>
            {GAMES_INDEX_FAQS.map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title="Poker Variants & Mixed Games Encyclopedia (15 Complete Rulebooks)"
          canonicalUrl={GAMES_URL}
          badgeType="gto"
          badgeLabel="Poker Variants Authority"
          badgeValue="15 Official Game Guides"
          summary="Complete rulebooks, hand ranking systems, and starting hand strategy tiers for 15 poker variants published by Smarter.Poker."
          slug="poker-variants-encyclopedia"
        />

        <AiPromptLauncher
          title="Poker Variants & Mixed Games Encyclopedia (15 Complete Rulebooks)"
          canonicalUrl={GAMES_URL}
          canonicalPath="/games"
          markdownUrl="/games.md"
        />

        <p style={styles.complianceFooter}>
          Smarter.Poker Is A Free-To-Play Poker Training, Rules Reference, And Social Community Platform. 18+. Club
          Chips And Diamonds Have No Cash Value.
        </p>
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#020608',
    color: '#e2e8f0',
    fontFamily: 'var(--font-inter), Inter, system-ui, -apple-system, sans-serif',
  },
  container: {
    maxWidth: '1180px',
    margin: '0 auto',
    padding: '28px 18px 80px',
  },
  breadcrumbs: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#94a3b8',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  crumbLink: {
    color: '#25c8ff',
    textDecoration: 'none',
    fontWeight: 600,
  },
  crumbSep: {
    color: '#475569',
  },
  crumbCurrent: {
    color: '#cbd5e1',
  },
  heroPlate: {
    backgroundColor: '#101a20',
    border: '1px solid rgba(37, 200, 255, 0.28)',
    borderRadius: '2px',
    padding: '28px 26px',
    marginBottom: '24px',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 12px 32px rgba(0, 0, 0, 0.55)',
  },
  badgeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '14px',
  },
  goldBadge: {
    backgroundColor: 'rgba(242, 184, 75, 0.14)',
    border: '1px solid #f2b84b',
    color: '#f2b84b',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    padding: '4px 10px',
    borderRadius: '2px',
  },
  cyanBadge: {
    backgroundColor: 'rgba(37, 200, 255, 0.12)',
    border: '1px solid #25c8ff',
    color: '#25c8ff',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    padding: '4px 10px',
    borderRadius: '2px',
  },
  mdBadge: {
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    border: '1px solid rgba(148, 163, 184, 0.4)',
    color: '#e2e8f0',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    padding: '4px 10px',
    borderRadius: '2px',
    textDecoration: 'none',
  },
  h1: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 'clamp(24px, 3.5vw, 35px)',
    fontWeight: 800,
    lineHeight: 1.2,
    color: '#ffffff',
    margin: '0 0 14px',
    letterSpacing: '0.02em',
  },
  lead: {
    fontSize: '16px',
    lineHeight: 1.65,
    color: '#cbd5e1',
    margin: '0 0 20px',
    maxWidth: '940px',
  },
  quickCrossLinks: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
  },
  crossBtnGold: {
    backgroundColor: '#f2b84b',
    color: '#020608',
    fontWeight: 700,
    fontSize: '13px',
    padding: '9px 14px',
    borderRadius: '2px',
    textDecoration: 'none',
  },
  crossBtnCyan: {
    backgroundColor: '#25c8ff',
    color: '#020608',
    fontWeight: 700,
    fontSize: '13px',
    padding: '9px 14px',
    borderRadius: '2px',
    textDecoration: 'none',
  },
  crossBtnOutline: {
    backgroundColor: '#020608',
    border: '1px solid rgba(37, 200, 255, 0.4)',
    color: '#25c8ff',
    fontWeight: 600,
    fontSize: '13px',
    padding: '8px 14px',
    borderRadius: '2px',
    textDecoration: 'none',
  },
  filterBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '24px',
  },
  filterBtn: {
    backgroundColor: '#101a20',
    border: '1px solid rgba(148, 163, 184, 0.25)',
    color: '#cbd5e1',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: 600,
    borderRadius: '2px',
    cursor: 'pointer',
  },
  filterBtnActive: {
    backgroundColor: 'rgba(37, 200, 255, 0.16)',
    border: '1px solid #25c8ff',
    color: '#25c8ff',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: 700,
    borderRadius: '2px',
    cursor: 'pointer',
  },
  tablePlate: {
    backgroundColor: '#101a20',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    borderRadius: '2px',
    padding: '22px',
    marginBottom: '32px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '16px',
  },
  h2: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 'clamp(18px, 2.5vw, 23px)',
    fontWeight: 700,
    color: '#ffffff',
    margin: 0,
    letterSpacing: '0.02em',
  },
  asOfText: {
    fontSize: '12px',
    color: '#f2b84b',
    fontWeight: 600,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  trHead: {
    backgroundColor: '#020608',
    borderBottom: '2px solid #25c8ff',
    textAlign: 'left',
  },
  th: {
    padding: '11px 12px',
    color: '#25c8ff',
    fontWeight: 700,
    fontSize: '11.5px',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  trBody: {
    borderBottom: '1px solid rgba(148, 163, 184, 0.14)',
  },
  tdTitle: {
    padding: '12px',
    verticalAlign: 'top',
    minWidth: '170px',
  },
  variantLink: {
    color: '#25c8ff',
    fontWeight: 700,
    textDecoration: 'none',
  },
  tdCat: {
    padding: '12px',
    color: '#f2b84b',
    fontWeight: 700,
    verticalAlign: 'top',
    whiteSpace: 'nowrap',
  },
  tdCell: {
    padding: '12px',
    color: '#cbd5e1',
    lineHeight: 1.5,
    verticalAlign: 'top',
  },
  tdRank: {
    padding: '12px',
    color: '#f8fafc',
    fontWeight: 600,
    lineHeight: 1.5,
    verticalAlign: 'top',
  },
  categorySection: {
    marginBottom: '34px',
  },
  categoryHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid rgba(37, 200, 255, 0.25)',
    paddingBottom: '10px',
    marginBottom: '16px',
  },
  categoryCount: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#25c8ff',
    letterSpacing: '0.06em',
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: '14px',
  },
  cardPlate: {
    backgroundColor: '#101a20',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    borderRadius: '2px',
    padding: '18px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  cardTopMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
    gap: '8px',
  },
  cardCatTag: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#f2b84b',
    letterSpacing: '0.04em',
  },
  cardMdLink: {
    fontSize: '11px',
    color: '#94a3b8',
    textDecoration: 'none',
    border: '1px solid rgba(148, 163, 184, 0.3)',
    padding: '2px 6px',
    borderRadius: '2px',
  },
  h3: {
    fontSize: '17px',
    fontWeight: 700,
    margin: '0 0 8px',
    lineHeight: 1.35,
  },
  cardTitleLink: {
    color: '#ffffff',
    textDecoration: 'none',
  },
  cardSummary: {
    fontSize: '13.5px',
    lineHeight: 1.6,
    color: '#cbd5e1',
    margin: '0 0 14px',
  },
  cardSpecStrip: {
    backgroundColor: '#020608',
    border: '1px solid rgba(148, 163, 184, 0.14)',
    borderRadius: '2px',
    padding: '10px 12px',
    fontSize: '12px',
    display: 'grid',
    gap: '4px',
  },
  specLabel: {
    color: '#f2b84b',
    fontWeight: 700,
  },
  specVal: {
    color: '#cbd5e1',
  },
  readGuideLink: {
    fontSize: '12.5px',
    fontWeight: 700,
    color: '#25c8ff',
    textDecoration: 'none',
  },
  crossHubPlate: {
    backgroundColor: '#101a20',
    border: '1px solid rgba(242, 184, 75, 0.35)',
    borderRadius: '2px',
    padding: '24px',
    marginBottom: '30px',
  },
  bodyText: {
    fontSize: '14.5px',
    lineHeight: 1.6,
    color: '#cbd5e1',
    margin: '8px 0 18px',
  },
  hubLinkGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '12px',
  },
  hubCard: {
    backgroundColor: '#020608',
    border: '1px solid rgba(37, 200, 255, 0.25)',
    borderRadius: '2px',
    padding: '14px 16px',
    textDecoration: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  hubCardLabel: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#f2b84b',
    letterSpacing: '0.07em',
  },
  hubCardTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#25c8ff',
    lineHeight: 1.4,
  },
  faqPlate: {
    backgroundColor: '#101a20',
    border: '1px solid rgba(37, 200, 255, 0.22)',
    borderRadius: '2px',
    padding: '24px',
    marginBottom: '28px',
  },
  faqList: {
    display: 'grid',
    gap: '16px',
    marginTop: '16px',
  },
  faqItem: {
    backgroundColor: '#020608',
    border: '1px solid rgba(148, 163, 184, 0.18)',
    borderRadius: '2px',
    padding: '16px 18px',
  },
  faqQ: {
    fontSize: '15.5px',
    fontWeight: 700,
    color: '#25c8ff',
    margin: '0 0 8px',
  },
  faqA: {
    fontSize: '14px',
    lineHeight: 1.65,
    color: '#cbd5e1',
    margin: 0,
  },
  complianceFooter: {
    fontSize: '12px',
    color: '#64748b',
    textAlign: 'center',
    marginTop: '32px',
  },
};
