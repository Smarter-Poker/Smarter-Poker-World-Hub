/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER STAKE LEVEL & MOVE-UP READINESS AUTHORITY HUB (/learn/stakes)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive directory covering all 7 canonical live and online poker stake
 * tiers ($1/$2-$1/$3, $2/$5, $5/$10+, Online Micros, Online Low-Mid, Live PLO,
 * and Live MTTs) with an interactive Move-Up Readiness Checklist.
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../../src/components/seo/AiPromptLauncher';
import {
  POKER_STAKES,
  MOVE_UP_READINESS_CHECKLIST,
  STAKES_AS_OF,
  STAKES_BASE_PATH,
  STAKES_URL,
  stakePath,
} from '../../../src/content/learn/stakes';

const DIRECTORY_FAQS = [
  {
    q: 'How Many Buy-Ins Do I Need Before Moving Up Stakes In Poker?',
    a: 'For Live And Online No-Limit Hold\'em Cash Games, Hold 25 To 40 Full 100BB Buy-Ins For The Target Stake With A 3-To-5 Buy-In Shot-Taking Stop-Loss. For High-Variance Live Pot-Limit Omaha, Maintain 40 To 50 Buy-Ins, And For Live Multi-Table Tournaments Maintain 100 To 150 Average Buy-Ins.',
  },
  {
    q: 'Why Is $2/$5 Live Often More Profitable In BB/100 Than $1/$2 Live?',
    a: 'At $1/$2, A $6 Casino Rake Cap Removes 3.0 Full Big Blinds From Every Pot. At $2/$5, The Same $6 Cap Removes Only 1.2 Big Blinds, Instantly Saving Regulars 4 To 6 BB/100 In Rake Drag.',
  },
  {
    q: 'How Many Hours Or Hands Prove I Am A Winning Player At My Current Stake?',
    a: 'In Live Cash Games, 400 To 600 Tracked Hours At +8 To +12 BB/Hr Provides High Statistical Confidence. In Online Cash Games, Track At Least 50,000 To 75,000 Hands At +4 To +8 BB/100 Before Permanently Stepping Up.',
  },
  {
    q: 'Where Can I Calculate My Exact Risk Of Ruin And Bankroll Requirements?',
    a: 'Launch The Free Smarter.Poker Bankroll And Risk Of Ruin Calculator At /tools/bankroll-calculator To Compute Your Exact Variance Buffers.',
  },
];

export default function PokerStakesIndexPage() {
  const [checkedItems, setCheckedItems] = useState({
    'bankroll-30bi': true,
    'proven-sample': false,
    'three-bet-comfort': false,
    'stop-loss-plan': true,
    'zero-scared-money': false,
  });

  const toggleChecklist = (id) => {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const completedCount = Object.values(checkedItems).filter(Boolean).length;
  const totalChecklist = MOVE_UP_READINESS_CHECKLIST.length;

  const jsonLd = [
    {
      '@type': 'CollectionPage',
      '@id': `${STAKES_URL}#collection`,
      name: 'Poker Stake Levels, Bankroll Rules & Move-Up Readiness Hub',
      description:
        'Complete Strategy, Bankroll, Rake, And Winrate Guide Across 7 Poker Stake Tiers: $1/$2-$1/$3 Live, $2/$5 Live, $5/$10+ High Stakes, Online Micros, Online Low-Mid, Live PLO, And Live MTTs.',
      url: STAKES_URL,
      inLanguage: 'en-US',
      dateModified: STAKES_AS_OF,
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'header p:first-of-type'],
      },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: POKER_STAKES.length,
        itemListElement: POKER_STAKES.map((s, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: s.title,
          url: `https://smarter.poker${stakePath(s.slug)}`,
        })),
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${STAKES_URL}#faq`,
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
      '@id': `${STAKES_URL}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Learn Poker', item: 'https://smarter.poker/learn' },
        { '@type': 'ListItem', position: 3, name: 'Stake Levels & Move-Up Hub', item: STAKES_URL },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Poker Stake Levels, Bankroll Rules & Move-Up Readiness Hub"
        description="Complete Strategy, Bankroll, Rake, And Winrate Guide Across 7 Poker Stake Tiers: $1/$2-$1/$3 Live, $2/$5 Live, $5/$10+ High Stakes, Online Micros, Online Low-Mid, Live PLO, And Live MTTs."
        canonical={STAKES_BASE_PATH}
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
          <span style={styles.crumbCurrent}>Stake Levels &amp; Move-Up Hub</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>7 CANONICAL STAKE TIERS</span>
            <span style={styles.emeraldBadge}>INCLUDES INTERACTIVE MOVE-UP CHECKLIST</span>
          </div>

          <h1 style={styles.h1}>
            Poker Stake Levels, Bankroll Requirements &amp; Move-Up Readiness Authority Hub
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Moving Up Poker Stakes Successfully Requires Mastering Both
            <strong> Bankroll Variance Buffers (25 To 40 Buy-Ins For NLH, 45+ For PLO, 100+ For MTTs)</strong> And
            <strong> Ecosystem Inflection Points</strong>. While $1/$3 And Online Micros Reward Pure Linear Value Betting Against Loose-Passive Callers, Stepping Into $2/$5, $5/$10+, And Online NL100+ Demands 3-Bet/4-Bet Fluency, Capped-Range Protection, And Aggressive Game Selection.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/tools/bankroll-calculator" style={styles.crossBtnCyan}>
              Launch Bankroll &amp; Risk Of Ruin Calculator
            </Link>
            <Link href="/tools/rake-calculator" style={styles.crossBtnEmerald}>
              Live Cash Rake Impact Calculator
            </Link>
            <Link href="/learn/roadmaps" style={styles.crossBtnOutline}>
              5 Player Progression Roadmaps
            </Link>
            <Link href="/learn/positions" style={styles.crossBtnOutline}>
              9-Seat Position Encyclopedia
            </Link>
            <Link href="/learn/online-vs-live-poker" style={styles.crossBtnOutline}>
              Online Vs Live Transition Guide
            </Link>
            <Link href="/poker-rooms/states" style={styles.crossBtnOutline}>
              US State Poker Legality &amp; Rake
            </Link>
          </div>
        </header>

        {/* Interactive Move-Up Readiness Checklist */}
        <section aria-label="Interactive Move Up Readiness Checklist" style={styles.sectionPlate}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.h2}>
              Interactive Move-Up Readiness Checklist ({completedCount} Of {totalChecklist} Verified)
            </h2>
            <span style={styles.readinessBadge}>
              {completedCount === totalChecklist
                ? 'READY FOR CONTROLLED SHOT-TAKING'
                : `${totalChecklist - completedCount} CRITERIA REMAINING`}
            </span>
          </div>
          <p style={styles.sectionSub}>
            Check Off Each Criterion Below Before Taking A 3-To-5 Buy-In Shot At The Next Stake Level Up:
          </p>

          <div style={styles.checklistGrid}>
            {MOVE_UP_READINESS_CHECKLIST.map((item) => {
              const isChecked = Boolean(checkedItems[item.id]);
              return (
                <div
                  key={item.id}
                  onClick={() => toggleChecklist(item.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') toggleChecklist(item.id);
                  }}
                  style={isChecked ? styles.checkCardActive : styles.checkCard}
                >
                  <div style={styles.checkHeader}>
                    <span style={isChecked ? styles.checkBoxOn : styles.checkBoxOff}>
                      {isChecked ? 'VERIFIED' : 'PENDING'}
                    </span>
                    <h3 style={styles.h3}>{item.label}</h3>
                  </div>
                  <p style={styles.checkDetail}>{item.detail}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Master Comparison Table */}
        <section aria-label="Master Stake Level Comparison Table" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Master Comparison Of 7 Live &amp; Online Poker Stake Tiers</h2>
          <div style={{ overflowX: 'auto', marginTop: '14px' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Stake Tier</th>
                  <th style={styles.th}>Environment</th>
                  <th style={styles.th}>100BB Buy-In</th>
                  <th style={styles.th}>Recommended Bankroll</th>
                  <th style={styles.th}>Target Winrate / ROI</th>
                  <th style={styles.th}>Full Blueprint</th>
                </tr>
              </thead>
              <tbody>
                {POKER_STAKES.map((s) => (
                  <tr key={s.slug} style={styles.trBody}>
                    <td style={styles.tdTitle}>
                      <Link href={stakePath(s.slug)} style={styles.stakeLink}>
                        {s.name}
                      </Link>
                    </td>
                    <td style={styles.tdCell}>{s.environment}</td>
                    <td style={styles.tdCyan}>{s.typicalBuyIn}</td>
                    <td style={styles.tdEmerald}>{s.recommendedBankroll}</td>
                    <td style={styles.tdCell}>{s.targetWinrate}</td>
                    <td style={styles.tdAction}>
                      <Link href={stakePath(s.slug)} style={styles.guideLink}>
                        Read Playbook
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Detailed Stake Cards */}
        <section aria-label="Detailed Stake Level Strategy Cards" style={styles.cardsSection}>
          <h2 style={styles.h2}>Stake-By-Stake Ecosystem Profiles &amp; Exploitative Adjustments</h2>
          <div style={styles.cardGrid}>
            {POKER_STAKES.map((s) => (
              <article key={s.slug} style={styles.cardPlate}>
                <div>
                  <div style={styles.cardTopMeta}>
                    <span style={styles.cardCatBadge}>{s.environment}</span>
                    <span style={styles.cardWinBadge}>{s.targetWinrate}</span>
                  </div>

                  <h3 style={styles.h3Card}>
                    <Link href={stakePath(s.slug)} style={styles.cardTitleLink}>
                      {s.name}
                    </Link>
                  </h3>

                  <div style={styles.metaList}>
                    <div>
                      <strong>Buy-In:</strong> {s.typicalBuyIn}
                    </div>
                    <div>
                      <strong>Bankroll:</strong> {s.recommendedBankroll}
                    </div>
                    <div>
                      <strong>Rake Profile:</strong> {s.rakeProfile}
                    </div>
                  </div>

                  <p style={styles.cardSummary}>{s.summary}</p>
                </div>

                <div style={styles.cardFooter}>
                  <Link href={stakePath(s.slug)} style={styles.readGuideLink}>
                    View Pool Tendencies &amp; Move-Up Guide
                  </Link>
                  <Link href="/tools/bankroll-calculator" style={styles.toolLink}>
                    Bankroll Tool
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section style={styles.sectionPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions On Poker Stakes &amp; Bankroll Management</h2>
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
          title="Poker Stake Levels, Bankroll Rules & Move-Up Readiness Hub"
          canonicalUrl={STAKES_URL}
          badgeType="gto"
          badgeLabel="Stake Progression Hub"
          badgeValue="7 Live & Online Tiers"
          summary="Complete Strategy, Bankroll, Rake, And Winrate Guide Across 7 Poker Stake Tiers: $1/$2-$1/$3 Live, $2/$5 Live, $5/$10+ High Stakes, Online Micros, Online Low-Mid, Live PLO, And Live MTTs."
          publishedYear="2026"
          slug="poker-stake-levels-directory"
        />

        <AiPromptLauncher
          title="Poker Stake Levels, Bankroll Rules & Move-Up Readiness Hub"
          canonicalUrl={STAKES_URL}
          canonicalPath={STAKES_BASE_PATH}
          markdownUrl="/learn/stakes.md"
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
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '8px',
  },
  h2: {
    fontSize: '21px',
    fontWeight: 800,
    color: '#f8fafc',
    margin: 0,
  },
  readinessBadge: {
    fontSize: '11.5px',
    fontWeight: 700,
    color: '#10b981',
    border: '1px solid #10b981',
    padding: '4px 10px',
    borderRadius: '4px',
  },
  sectionSub: {
    fontSize: '14px',
    color: '#cbd5e1',
    margin: '0 0 16px',
  },
  checklistGrid: {
    display: 'grid',
    gap: '12px',
  },
  checkCard: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '16px',
    cursor: 'pointer',
  },
  checkCardActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    border: '1px solid #10b981',
    borderRadius: '6px',
    padding: '16px',
    cursor: 'pointer',
  },
  checkHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '6px',
    flexWrap: 'wrap',
  },
  checkBoxOn: {
    backgroundColor: '#10b981',
    color: '#0a0f18',
    fontSize: '11px',
    fontWeight: 800,
    padding: '3px 8px',
    borderRadius: '4px',
  },
  checkBoxOff: {
    backgroundColor: '#1e293b',
    color: '#94a3b8',
    fontSize: '11px',
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: '4px',
  },
  h3: {
    fontSize: '15.5px',
    fontWeight: 700,
    color: '#f8fafc',
    margin: 0,
  },
  checkDetail: {
    fontSize: '13.5px',
    color: '#cbd5e1',
    margin: 0,
    lineHeight: 1.55,
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
  stakeLink: {
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
  cardWinBadge: {
    fontSize: '11.5px',
    fontWeight: 700,
    color: '#10b981',
  },
  h3Card: {
    fontSize: '18px',
    fontWeight: 700,
    margin: '0 0 12px',
    lineHeight: 1.35,
  },
  cardTitleLink: {
    color: '#f8fafc',
    textDecoration: 'none',
  },
  metaList: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '10px 12px',
    fontSize: '12.5px',
    color: '#cbd5e1',
    lineHeight: 1.65,
    marginBottom: '12px',
  },
  cardSummary: {
    fontSize: '13.5px',
    lineHeight: 1.55,
    color: '#cbd5e1',
    margin: '0 0 16px',
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
