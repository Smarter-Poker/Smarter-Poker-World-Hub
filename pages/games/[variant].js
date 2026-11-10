/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER VARIANT & MIXED GAME DETAIL PAGE (/games/[variant])
 * ═══════════════════════════════════════════════════════════════════════════════
 * Server-rendered variant rulebook and starting hand strategy guide at
 * /games/<variant> (and raw Markdown at /games/<variant>.md).
 *
 * Design: #SmarterCasinoRealism (#020608 obsidian, #101a20 gunmetal, #25c8ff cyan,
 * #f2b84b vault gold, borderRadius: '2px').
 * House style: Title Case, zero em dashes.
 */

import React from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import {
  GAMES_AS_OF,
  GAMES_BASE_PATH,
  GAMES_URL,
  POKER_VARIANTS,
  gameVariantPath,
  getGameVariantBySlug,
} from '../../src/content/games/variants';

export async function getStaticPaths() {
  return {
    paths: POKER_VARIANTS.map((v) => ({ params: { variant: v.slug } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const variant = getGameVariantBySlug(params?.variant);
  if (!variant) return { notFound: true };

  const peerVariants = POKER_VARIANTS.filter(
    (v) => v.category === variant.category && v.slug !== variant.slug
  );

  return {
    props: {
      variant,
      peerVariants,
    },
  };
}

export default function PokerVariantDetailPage({ variant, peerVariants = [] }) {
  const canonicalPath = gameVariantPath(variant.slug);
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const mdPath = `${canonicalPath}.md`;

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: variant.h1,
      name: variant.title,
      description: variant.summary,
      datePublished: GAMES_AS_OF,
      dateModified: GAMES_AS_OF,
      inLanguage: 'en-US',
      mainEntityOfPage: canonicalUrl,
      articleSection: variant.category,
      isPartOf: { '@id': `${GAMES_URL}#collection` },
      author: { '@id': 'https://smarter.poker/#organization' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', '#variant-quick-summary'],
      },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${canonicalUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Poker Variants & Mixed Games', item: GAMES_URL },
        { '@type': 'ListItem', position: 3, name: variant.name, item: canonicalUrl },
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': `${canonicalUrl}#faq`,
      mainEntity: (variant.faqs || []).map((f) => ({
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
        title={variant.title}
        description={variant.summary}
        canonical={canonicalPath}
        markdownUrl={`https://smarter.poker${mdPath}`}
        jsonLd={jsonLd}
      />

      <UniversalHeader pageDepth={2} />

      <main style={styles.container}>
        <nav aria-label="Breadcrumb" style={styles.breadcrumbs}>
          <Link href="/" style={styles.crumbLink}>
            Smarter.Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <Link href={GAMES_BASE_PATH} style={styles.crumbLink}>
            Poker Variants &amp; Mixed Games
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>{variant.name}</span>
        </nav>

        <article>
          <header style={styles.heroPlate}>
            <div style={styles.badgeRow}>
              <span style={styles.goldBadge}>{variant.category}</span>
              <span style={styles.cyanBadge}>{variant.bettingStructure}</span>
              <a href={mdPath} style={styles.mdBadge}>
                RAW MARKDOWN ({mdPath})
              </a>
            </div>

            <h1 style={styles.h1}>{variant.h1}</h1>

            <div id="variant-quick-summary" style={styles.summaryBox}>
              <div style={styles.summaryLabel}>OFFICIAL VARIANT DEFINITION</div>
              <p style={styles.summaryText}>{variant.summary}</p>
            </div>

            <div style={styles.specGrid}>
              <div style={styles.specBox}>
                <div style={styles.specTitle}>HOLE CARDS &amp; USAGE</div>
                <div style={styles.specValue}>{variant.holeCards}</div>
              </div>
              <div style={styles.specBox}>
                <div style={styles.specTitle}>BOARD / UPCARDS</div>
                <div style={styles.specValue}>{variant.boardCards}</div>
              </div>
              <div style={styles.specBox}>
                <div style={styles.specTitle}>BETTING STRUCTURE</div>
                <div style={styles.specValue}>{variant.bettingStructure}</div>
              </div>
              <div style={styles.specBox}>
                <div style={styles.specTitle}>HAND RANKING SYSTEM</div>
                <div style={styles.specValue}>{variant.handRankingSystem}</div>
              </div>
            </div>
          </header>

          <section style={styles.sectionPlate}>
            <h2 style={styles.h2}>Official Rules &amp; Dealing Procedure: {variant.name}</h2>
            <ul style={styles.bulletList}>
              {(variant.rulesOverview || []).map((ruleLine, idx) => (
                <li key={ruleLine} style={styles.bulletItem}>
                  <span style={styles.bulletIndex}>RULE #{idx + 1}</span>
                  <p style={styles.bulletText}>{ruleLine}</p>
                </li>
              ))}
            </ul>
          </section>

          <section style={styles.sectionPlate}>
            <h2 style={styles.h2}>{variant.name} Starting Hand Strategy &amp; Tier Breakdown</h2>
            <p style={styles.subLead}>
              Actionable Starting Hand Selection Tiers For Live Cash Games, Tournaments, And Private Club Play:
            </p>
            <div style={styles.tierGrid}>
              {(variant.startingHandStrategy || []).map((st) => (
                <div key={st.tier} style={styles.tierCard}>
                  <div style={styles.tierHeader}>{st.tier}</div>
                  <div style={styles.tierHandsBox}>
                    <span style={styles.tierHandsLabel}>Benchmark Holdings: </span>
                    <span style={styles.tierHandsValue}>{st.hands}</span>
                  </div>
                  <p style={styles.tierAdvice}>{st.advice}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={styles.sectionPlate}>
            <h2 style={styles.h2}>Key Differences From Standard Texas Hold&apos;Em</h2>
            <div style={styles.diffGrid}>
              {(variant.keyDifferencesFromHoldem || []).map((diff, idx) => (
                <div key={diff} style={styles.diffCard}>
                  <div style={styles.diffTag}>KEY DIFFERENCE #{idx + 1}</div>
                  <p style={styles.diffText}>{diff}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={styles.twoColGrid}>
            <div style={styles.colPlate}>
              <h2 style={styles.h2Small}>Interactive Calculators &amp; Hand Rankings</h2>
              <p style={styles.smallNote}>
                Run Exact Combinatorial Equity And Pot-Limit Betting Calculations For {variant.name}:
              </p>
              <div style={styles.linkStack}>
                <Link href="/tools/poker-odds-calculator" style={styles.calcLinkCard}>
                  <span style={styles.calcTag}>MULTI-VARIANT EQUITY ENGINE</span>
                  <span style={styles.calcTitle}>Multiway Poker Odds &amp; Equity Calculator</span>
                </Link>
                <Link href="/tools/plo-bet-calculator" style={styles.calcLinkCard}>
                  <span style={styles.calcTag}>POT-LIMIT BETTING SOLVER</span>
                  <span style={styles.calcTitle}>PLO Maximum Pot-Size Bet &amp; Raise Calculator</span>
                </Link>
                <Link href="/learn/poker-hand-rankings" style={styles.calcLinkCard}>
                  <span style={styles.calcTag}>HAND RANKING AUTHORITY</span>
                  <span style={styles.calcTitle}>Poker Hand Rankings, Short Deck 6+ &amp; Lowball Cheat Sheet</span>
                </Link>
                <Link href="/rules" style={styles.calcLinkCard}>
                  <span style={styles.calcTag}>OFFICIAL FLOOR RULINGS</span>
                  <span style={styles.calcTitle}>30 Official TDA &amp; Cash Game Floor Rulings</span>
                </Link>
              </div>
            </div>

            <div style={styles.colPlate}>
              <h2 style={styles.h2Small}>Related {variant.category} Variants</h2>
              <p style={styles.smallNote}>
                Compare {variant.name} Against Other Variants In The Same Family:
              </p>
              <div style={styles.linkStack}>
                {peerVariants.map((p) => (
                  <Link key={p.slug} href={gameVariantPath(p.slug)} style={styles.peerCard}>
                    <span style={styles.peerName}>{p.name}</span>
                    <span style={styles.peerMeta}>{p.holeCards}</span>
                  </Link>
                ))}
                <Link href={GAMES_BASE_PATH} style={styles.allVariantsBtn}>
                  View All 15 Poker Variants &amp; Mixed Games
                </Link>
              </div>
            </div>
          </section>

          <section style={styles.sectionPlate}>
            <h2 style={styles.h2}>Frequently Asked Questions: {variant.name}</h2>
            <div style={styles.faqGrid}>
              {(variant.faqs || []).map((item) => (
                <div key={item.q} style={styles.faqBox}>
                  <h3 style={styles.faqQ}>{item.q}</h3>
                  <p style={styles.faqA}>{item.a}</p>
                </div>
              ))}
            </div>
          </section>

          <CitationBacklinkBox
            title={`${variant.name} Rules, Hand Rankings & Strategy Guide`}
            canonicalUrl={canonicalUrl}
            badgeType="gto"
            badgeLabel="Official Variant Guide"
            badgeValue={variant.name}
            summary={variant.summary}
            slug={`poker-variant-${variant.slug}`}
          />

          <AiPromptLauncher
            title={`${variant.name} Rules, Hand Rankings & Strategy Guide`}
            canonicalUrl={canonicalUrl}
            canonicalPath={canonicalPath}
            markdownUrl={`/games/${variant.slug}.md`}
          />

          <div style={styles.bottomNavRow}>
            <Link href={GAMES_BASE_PATH} style={styles.backBtn}>
              Back To All 15 Poker Variants &amp; Mixed Games
            </Link>
            <a href="/games.md" style={styles.rawIndexLink}>
              View Complete {'/games.md'} Specification
            </a>
          </div>

          <p style={styles.complianceFooter}>
            Smarter.Poker Is A Free-To-Play Poker Training, Rules Reference, And Social Community Platform. 18+. Club
            Chips And Diamonds Have No Cash Value.
          </p>
        </article>
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
    maxWidth: '1060px',
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
    border: '1px solid rgba(37, 200, 255, 0.3)',
    borderRadius: '2px',
    padding: '26px',
    marginBottom: '22px',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 10px 28px rgba(0, 0, 0, 0.5)',
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
    letterSpacing: '0.07em',
    padding: '4px 10px',
    borderRadius: '2px',
  },
  cyanBadge: {
    backgroundColor: 'rgba(37, 200, 255, 0.12)',
    border: '1px solid #25c8ff',
    color: '#25c8ff',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.07em',
    padding: '4px 10px',
    borderRadius: '2px',
  },
  mdBadge: {
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    color: '#e2e8f0',
    fontSize: '11px',
    fontWeight: 700,
    padding: '4px 10px',
    borderRadius: '2px',
    textDecoration: 'none',
  },
  h1: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 'clamp(22px, 3.4vw, 33px)',
    fontWeight: 800,
    lineHeight: 1.22,
    color: '#ffffff',
    margin: '0 0 18px',
  },
  summaryBox: {
    backgroundColor: '#020608',
    borderLeft: '4px solid #f2b84b',
    borderTop: '1px solid rgba(242, 184, 75, 0.25)',
    borderRight: '1px solid rgba(242, 184, 75, 0.25)',
    borderBottom: '1px solid rgba(242, 184, 75, 0.25)',
    borderRadius: '2px',
    padding: '16px 18px',
    marginBottom: '18px',
  },
  summaryLabel: {
    fontSize: '11px',
    fontWeight: 800,
    color: '#f2b84b',
    letterSpacing: '0.08em',
    marginBottom: '6px',
  },
  summaryText: {
    fontSize: '16px',
    lineHeight: 1.65,
    color: '#f8fafc',
    fontWeight: 600,
    margin: 0,
  },
  specGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '12px',
  },
  specBox: {
    backgroundColor: '#020608',
    border: '1px solid rgba(37, 200, 255, 0.22)',
    borderRadius: '2px',
    padding: '12px 14px',
  },
  specTitle: {
    fontSize: '10.5px',
    fontWeight: 800,
    color: '#25c8ff',
    letterSpacing: '0.08em',
    marginBottom: '4px',
  },
  specValue: {
    fontSize: '13.5px',
    fontWeight: 600,
    color: '#e2e8f0',
    lineHeight: 1.45,
  },
  sectionPlate: {
    backgroundColor: '#101a20',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    borderRadius: '2px',
    padding: '24px',
    marginBottom: '22px',
  },
  h2: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 'clamp(17px, 2.3vw, 21px)',
    fontWeight: 700,
    color: '#ffffff',
    margin: '0 0 14px',
  },
  subLead: {
    fontSize: '14px',
    color: '#94a3b8',
    margin: '0 0 16px',
  },
  bulletList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gap: '12px',
  },
  bulletItem: {
    backgroundColor: '#020608',
    border: '1px solid rgba(37, 200, 255, 0.2)',
    borderRadius: '2px',
    padding: '14px 16px',
  },
  bulletIndex: {
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: 800,
    color: '#f2b84b',
    letterSpacing: '0.08em',
    marginBottom: '4px',
  },
  bulletText: {
    fontSize: '14.5px',
    lineHeight: 1.65,
    color: '#e2e8f0',
    margin: 0,
  },
  tierGrid: {
    display: 'grid',
    gap: '14px',
  },
  tierCard: {
    backgroundColor: '#020608',
    border: '1px solid rgba(242, 184, 75, 0.28)',
    borderRadius: '2px',
    padding: '16px 18px',
  },
  tierHeader: {
    fontSize: '15px',
    fontWeight: 800,
    color: '#f2b84b',
    marginBottom: '8px',
  },
  tierHandsBox: {
    backgroundColor: '#101a20',
    border: '1px solid rgba(37, 200, 255, 0.22)',
    borderRadius: '2px',
    padding: '8px 12px',
    marginBottom: '10px',
    fontSize: '13.5px',
  },
  tierHandsLabel: {
    color: '#25c8ff',
    fontWeight: 700,
  },
  tierHandsValue: {
    color: '#ffffff',
    fontWeight: 700,
  },
  tierAdvice: {
    fontSize: '14px',
    lineHeight: 1.6,
    color: '#cbd5e1',
    margin: 0,
  },
  diffGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '14px',
  },
  diffCard: {
    backgroundColor: '#020608',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    borderRadius: '2px',
    padding: '16px',
  },
  diffTag: {
    fontSize: '11px',
    fontWeight: 800,
    color: '#25c8ff',
    letterSpacing: '0.08em',
    marginBottom: '6px',
  },
  diffText: {
    fontSize: '14px',
    lineHeight: 1.6,
    color: '#e2e8f0',
    margin: 0,
  },
  twoColGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '18px',
    marginBottom: '22px',
  },
  colPlate: {
    backgroundColor: '#101a20',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    borderRadius: '2px',
    padding: '22px',
  },
  h2Small: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: '17px',
    fontWeight: 700,
    color: '#ffffff',
    margin: '0 0 8px',
  },
  smallNote: {
    fontSize: '13px',
    color: '#94a3b8',
    margin: '0 0 14px',
    lineHeight: 1.5,
  },
  linkStack: {
    display: 'grid',
    gap: '10px',
  },
  calcLinkCard: {
    backgroundColor: '#020608',
    border: '1px solid rgba(37, 200, 255, 0.28)',
    borderRadius: '2px',
    padding: '12px 14px',
    textDecoration: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  calcTag: {
    fontSize: '10px',
    fontWeight: 800,
    color: '#f2b84b',
    letterSpacing: '0.08em',
  },
  calcTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#25c8ff',
  },
  peerCard: {
    backgroundColor: '#020608',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    borderRadius: '2px',
    padding: '12px 14px',
    textDecoration: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  peerName: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#25c8ff',
  },
  peerMeta: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  allVariantsBtn: {
    backgroundColor: 'rgba(242, 184, 75, 0.14)',
    border: '1px solid #f2b84b',
    color: '#f2b84b',
    fontSize: '13px',
    fontWeight: 700,
    padding: '10px 14px',
    borderRadius: '2px',
    textDecoration: 'none',
    textAlign: 'center',
  },
  faqGrid: {
    display: 'grid',
    gap: '14px',
  },
  faqBox: {
    backgroundColor: '#020608',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    borderRadius: '2px',
    padding: '16px',
  },
  faqQ: {
    fontSize: '15px',
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
  bottomNavRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    marginTop: '24px',
  },
  backBtn: {
    backgroundColor: '#101a20',
    border: '1px solid #25c8ff',
    color: '#25c8ff',
    fontSize: '13.5px',
    fontWeight: 700,
    padding: '10px 16px',
    borderRadius: '2px',
    textDecoration: 'none',
  },
  rawIndexLink: {
    color: '#f2b84b',
    fontSize: '13px',
    fontWeight: 600,
    textDecoration: 'none',
  },
  complianceFooter: {
    fontSize: '12px',
    color: '#64748b',
    textAlign: 'center',
    marginTop: '32px',
  },
};
