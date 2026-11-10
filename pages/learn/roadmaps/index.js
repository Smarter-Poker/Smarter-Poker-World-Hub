/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  5 POKER PLAYER PROGRESSION ROADMAPS DIRECTORY (/learn/roadmaps)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive curriculum hub covering 5 step-by-step poker progression tracks:
 * Beginner to $1/$3 Live, $1/$3 Reg to $2/$5-$5/$10 Pro, Weekend MTT to Circuit
 * Grinder, NLH to PLO Specialist, and Home Game Host to Club Commander Director.
 *
 * House style: Title Case, zero em dashes.
 */

import React from 'react';
import Link from 'next/link';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../../src/components/seo/AiPromptLauncher';
import {
  POKER_ROADMAPS,
  ROADMAPS_AS_OF,
  ROADMAPS_BASE_PATH,
  ROADMAPS_URL,
  roadmapPath,
} from '../../../src/content/learn/roadmaps';

const DIRECTORY_FAQS = [
  {
    q: 'Which Poker Progression Roadmap Should I Start With?',
    a: 'If You Are New To Live Casinos Or Currently Break Even At Low Stakes, Start With Track 01 (90-Day Beginner To Winning $1/$3 Live Cash). If You Already Beat $1/$3 Over 400+ Hours, Jump Directly To Track 02 ($1/$3 Regular To $2/$5 & $5/$10 Pro).',
  },
  {
    q: 'How Do I Transition From No-Limit Hold\'em To Pot-Limit Omaha Without Blowing My Bankroll?',
    a: 'Follow Track 04 (Hold\'em Player To Winning PLO4 & PLO5 Specialist): Hold A Dedicated 40-To-50 Buy-In Bankroll, Never Draw To Non-Nut Flushes Multiway, And Replace Bare AAxx Over-Valuing With Double-Suited Connected Hands.',
  },
  {
    q: 'How Can I Upgrade My Weekly Home Game Into A Professional Club?',
    a: 'Follow Track 05 (Home Game Host To Club Commander Director) To Standardize Your 4-Denomination Chip Breakdown, Adopt Official TDA Floor Rules, And Launch Your Digital Club Arena And Club Commander Ecosystem.',
  },
];

export default function PokerRoadmapsIndexPage() {
  const jsonLd = [
    {
      '@type': 'CollectionPage',
      '@id': `${ROADMAPS_URL}#collection`,
      name: 'Poker Player Progression Roadmaps: Beginner To High-Stakes & Circuit Pro',
      description:
        '5 Step-By-Step Poker Progression Roadmaps: 90-Day Beginner To $1/$3 Live Winner, $1/$3 Reg To $2/$5-$5/$10 Pro, Weekend MTT To Circuit Grinder, NLH To PLO Specialist, And Home Game Host To Club Director.',
      url: ROADMAPS_URL,
      inLanguage: 'en-US',
      dateModified: ROADMAPS_AS_OF,
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'header p:first-of-type'],
      },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: POKER_ROADMAPS.length,
        itemListElement: POKER_ROADMAPS.map((r, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: r.name,
          url: `https://smarter.poker${roadmapPath(r.slug)}`,
        })),
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${ROADMAPS_URL}#faq`,
      mainEntity: DIRECTORY_FAQS.map((f) => ({
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
      '@id': `${ROADMAPS_URL}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Learn Poker', item: 'https://smarter.poker/learn' },
        { '@type': 'ListItem', position: 3, name: 'Player Progression Roadmaps', item: ROADMAPS_URL },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Poker Player Progression Roadmaps Guide"
        description="5 Step-By-Step Poker Progression Roadmaps: 90-Day Beginner To $1/$3 Live Winner, $1/$3 Reg To $2/$5-$5/$10 Pro, Weekend MTT To Circuit Grinder, NLH To PLO Specialist, And Home Game Host To Club Director."
        canonical={ROADMAPS_BASE_PATH}
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
          <span style={styles.crumbCurrent}>Player Progression Roadmaps</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>5 STRUCTURED PROGRESSION TRACKS</span>
            <span style={styles.emeraldBadge}>PHASE-BY-PHASE MILESTONES &amp; TOOLS</span>
          </div>

          <h1 style={styles.h1}>
            Poker Player Progression Roadmaps: Step-By-Step Curriculum From Beginner To Pro
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Random Poker Study Produces Random Results. Choose One Of Our
            <strong> 5 Structured Player Progression Roadmaps</strong> Below To Follow A Phase-By-Phase Blueprint Combining Preflop Range Mastery, Combinatoric Math, Bankroll Milestones, And Interactive Solver Tools.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/learn/stakes" style={styles.crossBtnCyan}>
              Stake Level &amp; Move-Up Hub
            </Link>
            <Link href="/learn/positions" style={styles.crossBtnEmerald}>
              9-Seat Position Encyclopedia
            </Link>
            <Link href="/learn/poker-math" style={styles.crossBtnOutline}>
              Poker Math Formulas Reference
            </Link>
            <Link href="/learn/cheat-sheets" style={styles.crossBtnOutline}>
              Printable Poker Cheat Sheets
            </Link>
            <Link href="/tools" style={styles.crossBtnOutline}>
              24 Free Poker Calculators
            </Link>
          </div>
        </header>

        {/* Master Roadmap Table */}
        <section aria-label="Master Player Progression Roadmaps Table" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Master Overview Of All 5 Poker Progression Tracks</h2>
          <div style={{ overflowX: 'auto', marginTop: '14px' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Progression Track</th>
                  <th style={styles.th}>Timeline</th>
                  <th style={styles.th}>Starting Point</th>
                  <th style={styles.th}>Graduation Goal</th>
                  <th style={styles.th}>Open Curriculum</th>
                </tr>
              </thead>
              <tbody>
                {POKER_ROADMAPS.map((r) => (
                  <tr key={r.slug} style={styles.trBody}>
                    <td style={styles.tdTitle}>
                      <Link href={roadmapPath(r.slug)} style={styles.trackLink}>
                        {r.name}
                      </Link>
                    </td>
                    <td style={styles.tdCyan}>{r.duration}</td>
                    <td style={styles.tdCell}>{r.startingPoint}</td>
                    <td style={styles.tdEmerald}>{r.graduationGoal}</td>
                    <td style={styles.tdAction}>
                      <Link href={roadmapPath(r.slug)} style={styles.guideLink}>
                        Start Track
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Detailed Roadmap Cards */}
        <section aria-label="Detailed Roadmap Cards" style={styles.cardsSection}>
          <h2 style={styles.h2}>Phase-By-Phase Curriculum Cards</h2>
          <div style={styles.cardGrid}>
            {POKER_ROADMAPS.map((r) => (
              <article key={r.slug} style={styles.cardPlate}>
                <div>
                  <div style={styles.cardTopMeta}>
                    <span style={styles.cardCatBadge}>{r.code}</span>
                    <span style={styles.cardTimeBadge}>{r.duration}</span>
                  </div>

                  <h3 style={styles.h3}>
                    <Link href={roadmapPath(r.slug)} style={styles.cardTitleLink}>
                      {r.name}
                    </Link>
                  </h3>

                  <div style={styles.metaBox}>
                    <div>
                      <strong>Starting Point:</strong> {r.startingPoint}
                    </div>
                    <div>
                      <strong>Target Goal:</strong> {r.graduationGoal}
                    </div>
                  </div>

                  <p style={styles.cardSummary}>{r.summary}</p>

                  <div style={styles.phasePreviewList}>
                    {r.milestones.map((m) => (
                      <div key={m.phase} style={styles.phasePill}>
                        {m.phase}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={styles.cardFooter}>
                  <Link href={roadmapPath(r.slug)} style={styles.readGuideLink}>
                    Open Full 3-Phase Roadmap
                  </Link>
                  <Link href="/learn/stakes" style={styles.toolLink}>
                    Stake Hub
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section style={styles.sectionPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions On Poker Progression Roadmaps</h2>
          <div style={styles.faqList}>
            {DIRECTORY_FAQS.map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title="Poker Player Progression Roadmaps: Beginner To High-Stakes & Circuit Pro"
          canonicalUrl={ROADMAPS_URL}
          badgeType="gto"
          badgeLabel="5 Progression Tracks"
          badgeValue="90-Day & 6-Month Blueprints"
          summary="5 Step-By-Step Poker Progression Roadmaps: 90-Day Beginner To $1/$3 Live Winner, $1/$3 Reg To $2/$5-$5/$10 Pro, Weekend MTT To Circuit Grinder, NLH To PLO Specialist, And Home Game Host To Club Director."
          publishedYear="2026"
          slug="poker-player-progression-roadmaps"
        />

        <AiPromptLauncher
          title="Poker Player Progression Roadmaps"
          canonicalUrl={ROADMAPS_URL}
          canonicalPath={ROADMAPS_BASE_PATH}
          markdownUrl="/learn/roadmaps.md"
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
    maxWidth: '1160px',
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
    fontSize: '32px',
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
  tdTitle: {
    padding: '12px',
    fontWeight: 700,
  },
  trackLink: {
    color: '#00d4ff',
    textDecoration: 'none',
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
  },
  tdAction: {
    padding: '12px',
  },
  guideLink: {
    color: '#10b981',
    textDecoration: 'none',
    fontWeight: 700,
    fontSize: '12.5px',
  },
  cardsSection: {
    marginBottom: '32px',
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: '16px',
    marginTop: '16px',
  },
  cardPlate: {
    backgroundColor: '#111a2a',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  cardTopMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  cardCatBadge: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#00d4ff',
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    padding: '3px 8px',
    borderRadius: '4px',
  },
  cardTimeBadge: {
    fontSize: '11.5px',
    fontWeight: 700,
    color: '#10b981',
  },
  h3: {
    fontSize: '18px',
    fontWeight: 700,
    margin: '0 0 12px',
    lineHeight: 1.35,
  },
  cardTitleLink: {
    color: '#f8fafc',
    textDecoration: 'none',
  },
  metaBox: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '10px 12px',
    fontSize: '12.5px',
    color: '#cbd5e1',
    lineHeight: 1.6,
    marginBottom: '12px',
  },
  cardSummary: {
    fontSize: '13.5px',
    lineHeight: 1.55,
    color: '#cbd5e1',
    margin: '0 0 12px',
  },
  phasePreviewList: {
    display: 'grid',
    gap: '6px',
    marginBottom: '16px',
  },
  phasePill: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '4px',
    padding: '6px 10px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#00d4ff',
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '1px solid #1e293b',
    paddingTop: '12px',
  },
  readGuideLink: {
    color: '#00d4ff',
    fontSize: '12.5px',
    fontWeight: 700,
    textDecoration: 'none',
  },
  toolLink: {
    color: '#10b981',
    fontSize: '12.5px',
    fontWeight: 700,
    textDecoration: 'none',
  },
  faqList: {
    display: 'grid',
    gap: '14px',
    marginTop: '16px',
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
