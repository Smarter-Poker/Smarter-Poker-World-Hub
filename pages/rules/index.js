/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  OFFICIAL POKER RULES & FLOOR RULINGS ENCYCLOPEDIA INDEX (/rules)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Server-rendered directory at /rules (and raw Markdown at /rules.md) covering
 * 30 Robert's Rules of Poker (RROP) and Poker TDA floor rulings.
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
  POKER_RULES,
  RULE_CATEGORIES,
  RULES_AS_OF,
  RULES_BASE_PATH,
  RULES_URL,
  rulePath,
} from '../../src/content/rules/rules';

const INDEX_FAQS = [
  {
    q: 'What Is The Difference Between Poker TDA Rules And Robert\'s Rules Of Poker?',
    a: 'The Poker Tournament Directors Association (TDA) Rules Standardize Multi-Table Tournament Play Worldwide (Covering Shot Clocks, Big Blind Antes, Hand-For-Hand Bubbles, And Color-Ups), Whereas Robert\'s Rules Of Poker (RROP) Serves As The Foundational Rulebook For Live Cash Games, Split-Pot Variants, Kill Pots, And Cardroom Table Stakes Procedures.',
  },
  {
    q: 'Does A Verbal Declaration Override Physical Chip Movement In Live Poker?',
    a: 'Yes. Under Both TDA Rule 40 And Robert\'s Rules Of Poker, Any Clear Verbal Statement Made In Turn ("Call", "Raise", "All-In", "Fold") Is 100% Binding And Takes Precedence Over Contradictory Physical Chip Movements.',
  },
  {
    q: 'What Happens When I Throw A Single Oversized Chip Into The Pot Without Speaking?',
    a: 'Under The Universal Single Oversized Chip Rule (TDA Rule 44), Silently Tossing A Single Chip Larger Than The Facing Bet Into The Pot Is Always Ruled A Call Unless You Verbally Declare "Raise" Before The Chip Crosses The Betting Line.',
  },
  {
    q: 'Who Must Show Their Hole Cards First At A Poker Showdown?',
    a: 'On Any Hand That Reaches Showdown After River Betting, The Last Aggressive Player (Who Made The Final Bet Or Raise On The River) Must Table Their Hand First. If The River Checks Around With Zero Betting, Showdown Starts With The First Active Player To The Left Of The Dealer Button.',
  },
];

export default function PokerRulesIndexPage() {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [copiedQuickSheet, setCopiedQuickSheet] = useState(false);

  const handleCopyTopRulings = async () => {
    const text = [
      '[Smarter.Poker Official Home-Game & Club Floor Quick Rulings (TDA / RROP)]',
      '1. Showdown Order: Last Aggressive Player On River Shows First; If Checked Down, Left Of Button Shows First.',
      '2. Single Oversized Chip (TDA Rule 44): Silently Tossing One Oversized Chip Is A Call Unless "Raise" Is Declared First.',
      '3. Verbal Declarations (TDA Rule 40): Verbal Action In Turn ("Call", "Raise", "All-In") Is 100% Binding.',
      '4. String Bets: Multi-Motion Chip Movements Without A Prior Verbal Raise Declaration Are Restricted To A Minimum Call.',
      '5. Odd Chip In Split Pots: Awarded To The First Active Player To The Left Of The Dealer Button (Or High Hand In Hi-Lo).',
      'Full 30-Rule Official Floor Encyclopedia: https://smarter.poker/rules',
    ].join('\n');
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setCopiedQuickSheet(true);
        setTimeout(() => setCopiedQuickSheet(false), 2200);
      }
    } catch {
      // Ignore clipboard failure
    }
  };

  const filteredRules =
    selectedCategory === 'All'
      ? POKER_RULES
      : POKER_RULES.filter((r) => r.category === selectedCategory);

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${RULES_URL}#article`,
      headline: 'Official Poker Rules & Tournament Floor Rulings Encyclopedia (TDA & RROP)',
      description:
        'Complete Reference To 30 Official Poker Rules, Tournament TDA Rulings, And Cash Game Floor Procedures Covering Showdown Order, String Bets, Side Pots, Odd Chips, And Bomb Pots.',
      datePublished: RULES_AS_OF,
      dateModified: RULES_AS_OF,
      inLanguage: 'en-US',
      mainEntityOfPage: RULES_URL,
      author: { '@id': 'https://smarter.poker/#organization' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
    },
    {
      '@type': 'CollectionPage',
      '@id': `${RULES_URL}#collection`,
      name: 'Official Poker Rules & Floor Rulings Encyclopedia',
      url: RULES_URL,
      inLanguage: 'en-US',
      dateModified: RULES_AS_OF,
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: POKER_RULES.length,
        itemListElement: POKER_RULES.map((rule, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: rule.title,
          url: `https://smarter.poker${rulePath(rule.slug)}`,
        })),
      },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${RULES_URL}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Official Poker Rules & Floor Rulings', item: RULES_URL },
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': `${RULES_URL}#faq`,
      mainEntity: INDEX_FAQS.map((f) => ({
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
        title="Official Poker Rules and TDA Floor Rulings"
        description="Complete Encyclopedia Of 30 Official Poker Rules, Tournament TDA Rulings, And Robert's Rules Of Poker Cash Game Procedures: Showdown Order, String Bets, Side Pots, And Straddles."
        canonical={RULES_BASE_PATH}
        markdownUrl="https://smarter.poker/rules.md"
        jsonLd={jsonLd}
      />

      <UniversalHeader pageDepth={1} />

      <main style={styles.container}>
        <nav aria-label="Breadcrumb" style={styles.breadcrumbs}>
          <Link href="/" style={styles.crumbLink}>
            Smarter.Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>Official Poker Rules &amp; Floor Rulings</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.goldBadge}>OFFICIAL TDA &amp; RROP STANDARD</span>
            <span style={styles.cyanBadge}>30 AUTHORITATIVE FLOOR RULINGS</span>
            <a href="/rules.md" style={styles.mdBadge}>
              RAW MARKDOWN (/RULES.MD)
            </a>
          </div>

          <h1 style={styles.h1}>
            Official Poker Rules, Tournament TDA Standards &amp; Live Floor Rulings Encyclopedia
          </h1>

          <p style={styles.lead}>
            Every Binding Action, Showdown Priority, Side Pot Calculation, And Cardroom Procedure Governed By The
            Poker Tournament Directors Association (TDA) And {"Robert's"} Rules Of Poker (RROP). Built For Players,
            Dealers, And Tournament Floor Supervisors Seeking Instant, Unambiguous Rulings.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/learn/poker-hand-rankings" style={styles.crossBtnGold}>
              Official Poker Hand Rankings Cheat Sheet
            </Link>
            <Link href="/games" style={styles.crossBtnCyan}>
              15 Poker Variants &amp; Mixed Games Rules
            </Link>
            <Link href="/tools/side-pot-calculator" style={styles.crossBtnOutline}>
              Multi-Way Side Pot Calculator
            </Link>
            <Link href="/glossary" style={styles.crossBtnOutline}>
              Poker Glossary ({'80+'} Terms)
            </Link>
            <button
              type="button"
              onClick={handleCopyTopRulings}
              style={{
                padding: '9px 14px',
                background: copiedQuickSheet ? '#10b981' : '#081118',
                color: copiedQuickSheet ? '#020608' : '#25c8ff',
                border: '1px solid #25c8ff',
                borderRadius: '2px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {copiedQuickSheet
                ? 'Copied Top 5 Home-Game Rulings'
                : 'Copy Top 5 Rulings For Group Chat'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && typeof window.print === 'function') {
                  window.print();
                }
              }}
              style={{
                padding: '9px 14px',
                background: '#081118',
                color: '#f2b84b',
                border: '1px solid #f2b84b',
                borderRadius: '2px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Print Official 30-Rule Table Sheet
            </button>
          </div>
        </header>

        <section aria-label="Filter Rules By Category" style={styles.filterBar}>
          <button
            type="button"
            onClick={() => setSelectedCategory('All')}
            style={selectedCategory === 'All' ? styles.filterBtnActive : styles.filterBtn}
          >
            All Floor Rulings ({POKER_RULES.length})
          </button>
          {RULE_CATEGORIES.map((cat) => {
            const count = POKER_RULES.filter((r) => r.category === cat).length;
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

        <section aria-label="Master Floor Rulings Table" style={styles.tablePlate}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.h2}>Master Index Of 30 Official Poker Rules &amp; Floor Decisions</h2>
            <span style={styles.asOfText}>Verified As Of {RULES_AS_OF}</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>#</th>
                  <th style={styles.th}>Official Rule &amp; Floor Topic</th>
                  <th style={styles.th}>Category</th>
                  <th style={styles.th}>TDA / RROP Authority</th>
                  <th style={styles.th}>Core Floor Ruling Summary</th>
                </tr>
              </thead>
              <tbody>
                {filteredRules.map((rule, idx) => (
                  <tr key={rule.slug} style={styles.trBody}>
                    <td style={styles.tdNum}>{idx + 1}</td>
                    <td style={styles.tdTitle}>
                      <Link href={rulePath(rule.slug)} style={styles.ruleLink}>
                        {rule.title}
                      </Link>
                    </td>
                    <td style={styles.tdCat}>{rule.category}</td>
                    <td style={styles.tdRef}>{rule.tdaRef}</td>
                    <td style={styles.tdSummary}>{rule.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {RULE_CATEGORIES.map((category) => {
          const catRules = POKER_RULES.filter((r) => r.category === category);
          return (
            <section key={category} style={styles.categorySection}>
              <div style={styles.categoryHeaderRow}>
                <h2 style={styles.h2}>{category} Rules &amp; Procedures</h2>
                <span style={styles.categoryCount}>{catRules.length} Official Rulings</span>
              </div>
              <div style={styles.cardGrid}>
                {catRules.map((rule) => (
                  <article key={rule.slug} style={styles.cardPlate}>
                    <div style={styles.cardTopMeta}>
                      <span style={styles.cardRefTag}>{rule.tdaRef}</span>
                      <a href={`/rules/${rule.slug}.md`} style={styles.cardMdLink}>
                        .MD
                      </a>
                    </div>
                    <h3 style={styles.h3}>
                      <Link href={rulePath(rule.slug)} style={styles.cardTitleLink}>
                        {rule.title}
                      </Link>
                    </h3>
                    <p style={styles.cardSummary}>{rule.summary}</p>
                    <div style={styles.cardFooter}>
                      <Link href={rulePath(rule.slug)} style={styles.readRulingLink}>
                        Read Full Floor Ruling &amp; 3 Scenarios
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}

        <section style={styles.crossHubPlate}>
          <h2 style={styles.h2}>Connected Poker Math Calculators &amp; Reference Hubs</h2>
          <p style={styles.bodyText}>
            Floor Rulings Work Hand-In-Hand With Exact Combinatorial Math. Pair These Official Rules With Our
            Browser-Based Calculators And Hand Ranking Matrices:
          </p>
          <div style={styles.hubLinkGrid}>
            <Link href="/learn/poker-hand-rankings" style={styles.hubCard}>
              <span style={styles.hubCardLabel}>HAND RANKINGS &amp; TIE-BREAKERS</span>
              <span style={styles.hubCardTitle}>Official 10-Tier Hand Rankings, Short Deck 6+, And Lowball Rules</span>
            </Link>
            <Link href="/games" style={styles.hubCard}>
              <span style={styles.hubCardLabel}>GAME VARIANTS ENCYCLOPEDIA</span>
              <span style={styles.hubCardTitle}>15 Complete Guides: Hold&apos;Em, PLO4/5/6, Stud, Razz, 2-7 &amp; Badugi</span>
            </Link>
            <Link href="/tools/side-pot-calculator" style={styles.hubCard}>
              <span style={styles.hubCardLabel}>ALL-IN SIDE POT SOLVER</span>
              <span style={styles.hubCardTitle}>Multi-Way All-In Main &amp; Side Pot Breakdown For Up To 9 Players</span>
            </Link>
            <Link href="/tools/icm-calculator" style={styles.hubCard}>
              <span style={styles.hubCardLabel}>FINAL TABLE DEAL MATH</span>
              <span style={styles.hubCardTitle}>Malmuth-Harville Tournament ICM &amp; Final Table Chop Calculator</span>
            </Link>
            <Link href="/tools/blind-structure-calculator" style={styles.hubCard}>
              <span style={styles.hubCardLabel}>TDA TOURNAMENT DIRECTOR</span>
              <span style={styles.hubCardTitle}>Blind Structure, Big Blind Ante &amp; Color-Up Schedule Generator</span>
            </Link>
            <Link href="/glossary" style={styles.hubCard}>
              <span style={styles.hubCardLabel}>OFFICIAL POKER GLOSSARY</span>
              <span style={styles.hubCardTitle}>80+ Club Poker, Live Cardroom, Preflop &amp; GTO Strategy Definitions</span>
            </Link>
          </div>
        </section>

        <section style={styles.faqPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions On Official Poker Rules</h2>
          <div style={styles.faqList}>
            {INDEX_FAQS.map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title="Official Poker Rules & Tournament TDA Floor Rulings Encyclopedia"
          canonicalUrl={RULES_URL}
          badgeType="research"
          badgeLabel="Official Rules Authority"
          badgeValue="30 TDA & RROP Rulings"
          summary="Authoritative reference to 30 official Robert's Rules of Poker and Poker TDA floor rulings published by Smarter.Poker."
          slug="official-poker-rules-encyclopedia"
        />

        <AiPromptLauncher
          title="Official Poker Rules & Tournament TDA Floor Rulings Encyclopedia"
          canonicalUrl={RULES_URL}
          canonicalPath="/rules"
          markdownUrl="/rules.md"
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
    fontSize: 'clamp(24px, 3.6vw, 36px)',
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
    fontSize: '13.5px',
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
    fontSize: '12px',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  trBody: {
    borderBottom: '1px solid rgba(148, 163, 184, 0.14)',
  },
  tdNum: {
    padding: '12px',
    color: '#f2b84b',
    fontWeight: 700,
    verticalAlign: 'top',
    width: '38px',
  },
  tdTitle: {
    padding: '12px',
    verticalAlign: 'top',
    minWidth: '220px',
  },
  ruleLink: {
    color: '#25c8ff',
    fontWeight: 700,
    textDecoration: 'none',
  },
  tdCat: {
    padding: '12px',
    color: '#f8fafc',
    fontWeight: 600,
    verticalAlign: 'top',
    whiteSpace: 'nowrap',
  },
  tdRef: {
    padding: '12px',
    color: '#f2b84b',
    fontSize: '12.5px',
    verticalAlign: 'top',
    minWidth: '160px',
  },
  tdSummary: {
    padding: '12px',
    color: '#cbd5e1',
    lineHeight: 1.55,
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
  },
  cardRefTag: {
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
    fontSize: '16px',
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
  cardFooter: {
    borderTop: '1px solid rgba(148, 163, 184, 0.14)',
    paddingTop: '10px',
  },
  readRulingLink: {
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
