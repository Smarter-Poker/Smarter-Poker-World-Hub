/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  MTT TOURNAMENT STAGE STRATEGY PLAYBOOKS INDEX (/learn/tournament-stages)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Complete 8-stage Multi-Table Tournament progression blueprint from Level 1
 * Deepstack through Late-Reg, Bubble, Laddering, Final Table ICM, and Heads-Up.
 *
 * House style: Title Case, zero em dashes.
 */

import React from 'react';
import Link from 'next/link';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import GeoCitationCapsule, { geoClaimSchema } from '../../../src/components/seo/GeoCitationCapsule';
import GeoFollowUpChain from '../../../src/components/seo/GeoFollowUpChain';
import CitationBacklinkBox from '../../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../../src/components/seo/AiPromptLauncher';
import SmarterAccountUnlockGate from '../../../src/components/seo/SmarterAccountUnlockGate';
import {
  TOURNAMENT_STAGES,
  TOURNAMENT_STAGES_AS_OF,
  TOURNAMENT_STAGES_BASE_PATH,
  TOURNAMENT_STAGES_URL,
  TOURNAMENT_STAGES_DOI,
  tournamentStagePath,
  renderTournamentStagesIndexMarkdown,
} from '../../../src/content/learn/tournamentStages';

const INDEX_FAQS = [
  {
    q: 'How Does The ICM Bubble Factor Shift Across The 8 Stages Of A Poker Tournament?',
    a: 'Bubble Factor Starts Near 1.01 In Stage 1 (Early Deepstack), Rises To 1.10 In Stage 2 (Late-Reg Close), Peaks At 1.85 To 2.45 On The Stage 4 Direct Money Bubble, Drops Briefly To 1.12 Immediately In The Money (Stage 5), Surges Back To 1.60 To 2.30 At The Final Table (Stage 7), And Resets To Exactly 1.00 Heads-Up For The Title (Stage 8).',
  },
  {
    q: 'At What Stack Depth Should I Shift From Open-Raising To First-In All-In Shoving?',
    a: 'Under A 1BB Big Blind Ante Structure (2.5BB Orbit Cost), The Universal Inflection Point Is 14BB To 15BB (Harrington Effective M = 5.5 To 6.0), With Some Mixed 2.0x Opens Retained On The Button And Cutoff Down To 12BB.',
  },
  {
    q: 'Why Is Late-Registration Mathematically Profitable In Freezeout And Re-Entry MTTs?',
    a: 'Under Malmuth-Harville ICM Math, Early Eliminations Increase Every Remaining Player Share Of The Fixed Prize Pool, Giving A Fresh Late-Reg Stack An Immediate +5% To +14% Dollar Equity Boost On Entry.',
  },
];

export default function TournamentStagesIndexPage() {
  const claimText =
    'Tournament ICM Bubble Factors Follow A Bimodal Curve: Peaking At 1.85-2.45 On The Direct Money Bubble And 1.60-2.30 At The 9-Handed Final Table, Before Dropping To Exactly 1.00 Heads-Up.';
  const quoteText =
    'The Single Costliest Tournament Error Is Playing Static Chip-EV Ranges Across Changing ICM Phases: A +EV 22BB Coinflip In Stage 2 Becomes A Catastrophic -$EV Punt For A Medium Stack In Stage 4 Or Stage 7.';

  const jsonLd = [
    {
      '@type': 'CollectionPage',
      '@id': `${TOURNAMENT_STAGES_URL}#collection`,
      name: 'MTT Tournament Stage Strategy Playbooks (8 Phases From Level 1 To Heads-Up)',
      description:
        'Master All 8 Multi-Table Tournament Stages: Early Deepstack, Late-Registration, Pre-Bubble, Direct Money Bubble, ITM Laddering, Final Two Tables, Final Table ICM, And Heads-Up.',
      url: TOURNAMENT_STAGES_URL,
      inLanguage: 'en-US',
      dateModified: TOURNAMENT_STAGES_AS_OF,
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: TOURNAMENT_STAGES.length,
        itemListElement: TOURNAMENT_STAGES.map((s, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: s.name,
          url: `https://smarter.poker${tournamentStagePath(s.slug)}`,
        })),
      },
    },
    ...geoClaimSchema({
      claim: claimText,
      quoteText,
      quoteAuthor: 'Smarter.Poker Tournament & ICM Research Group',
      doi: TOURNAMENT_STAGES_DOI,
      canonicalPath: TOURNAMENT_STAGES_BASE_PATH,
    }),
    {
      '@type': 'FAQPage',
      '@id': `${TOURNAMENT_STAGES_URL}#faq`,
      mainEntity: INDEX_FAQS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${TOURNAMENT_STAGES_URL}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Learn Poker', item: 'https://smarter.poker/learn' },
        { '@type': 'ListItem', position: 3, name: 'MTT Tournament Stage Playbooks', item: TOURNAMENT_STAGES_URL },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="MTT Tournament Stage Playbooks"
        description="Master All 8 Multi-Table Tournament Stages: Early Deepstack, Late-Registration, Pre-Bubble, Direct Money Bubble, ITM Laddering, Final Two Tables, Final Table ICM, And Heads-Up."
        canonical={TOURNAMENT_STAGES_BASE_PATH}
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
          <span style={styles.crumbCurrent}>MTT Tournament Stage Playbooks</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>8 CHRONOLOGICAL MTT PHASES</span>
            <span style={styles.emeraldBadge}>ICM BUBBLE FACTORS &amp; VPIP/PFR TARGETS</span>
          </div>

          <h1 style={styles.h1}>
            MTT Tournament Stage Strategy Playbooks: From Level 1 Deepstack To Heads-Up Title
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Winning Multi-Table Tournaments Requires Shifting Your Preflop And Postflop Strategy Across <strong>Eight Distinct Chronological Phases</strong> As Effective Stack Depths Compress From 200BB Down To 12BB And ICM Bubble Factors Surge From 1.01 Up To 2.45. Select Any Tournament Stage Below For Its Complete Solver Playbook.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/tools/icm-calculator" style={styles.crossBtnCyan}>
              Open Malmuth-Harville ICM Calculator
            </Link>
            <Link href="/tools/late-reg-calculator" style={styles.crossBtnEmerald}>
              Late-Registration ICM Calculator
            </Link>
            <Link href="/tools/push-fold-calculator" style={styles.crossBtnOutline}>
              Nash Push/Fold Range Calculator
            </Link>
            <Link href="/tools/mtt-grind-planner" style={styles.crossBtnOutline}>
              MTT Grind &amp; ABI Session Planner
            </Link>
          </div>
        </header>

        <GeoCitationCapsule
          title="MTT 8-Stage ICM Bubble Factor & Stack Compression Benchmark"
          claim={claimText}
          metricLabel="Peak Bubble Factor"
          metricValue="BF = 1.85 To 2.45 (65% - 71% Equity Required)"
          formulaText="Required ICM Equity (%) = Bubble Factor / (Bubble Factor + 1)"
          ifThenBecause="If Advancing Into A High-Bubble-Factor Phase (Direct Money Bubble Or Final Table) -> Then Widen Covering-Stack Aggression And Tighten Covered Medium-Stack Calling Ranges -> Because Elimination Risk Imposes A +15% To +21% Equity Tax On Covered Stacks."
          quoteText={quoteText}
          quoteAuthor="Smarter.Poker Tournament & ICM Research Group"
          doi={TOURNAMENT_STAGES_DOI}
          canonicalPath={TOURNAMENT_STAGES_BASE_PATH}
        />

        {/* Master 8-Stage Comparison Matrix */}
        <section aria-label="Master 8-Stage MTT Comparison Matrix" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            All 8 MTT Tournament Stages: Stack Depth, Bubble Factor &amp; VPIP/PFR Matrix
          </h2>
          <div style={{ overflowX: 'auto', maxWidth: '100%', WebkitOverflowScrolling: 'touch' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Tournament Stage</th>
                  <th style={styles.th}>Effective BB Range</th>
                  <th style={styles.th}>ICM Bubble Factor</th>
                  <th style={styles.th}>Target VPIP / PFR</th>
                  <th style={styles.th}>Playbook</th>
                </tr>
              </thead>
              <tbody>
                {TOURNAMENT_STAGES.map((s) => (
                  <tr key={s.slug} style={styles.trBody}>
                    <td style={styles.tdTitle}>
                      <Link href={tournamentStagePath(s.slug)} style={styles.tableLink}>
                        {s.name}
                      </Link>
                    </td>
                    <td style={styles.td}>{s.effectiveBbRange}</td>
                    <td style={styles.tdCyan}>{s.averageBubbleFactor}</td>
                    <td style={styles.tdEmerald}>{s.optimalVpipPfr}</td>
                    <td style={styles.td}>
                      <Link href={tournamentStagePath(s.slug)} style={styles.smallActionLink}>
                        Open Stage Playbook
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 8 Stage Cards */}
        <section aria-label="Browse All 8 MTT Stage Playbooks" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Step-By-Step Tournament Stage Strategy Playbooks</h2>
          <div style={styles.cardGrid}>
            {TOURNAMENT_STAGES.map((s) => (
              <article key={s.slug} style={styles.card}>
                <div>
                  <div style={styles.cardHeaderRow}>
                    <span style={styles.cardCodeBadge}>{s.code}</span>
                    <span style={styles.cardCatBadge}>BF: {s.averageBubbleFactor}</span>
                  </div>
                  <h3 style={styles.cardTitle}>
                    <Link href={tournamentStagePath(s.slug)} style={styles.cardTitleLink}>
                      {s.name}
                    </Link>
                  </h3>
                  <p style={styles.cardSummary}>{s.summary}</p>
                  <div style={styles.ruleBox}>
                    <strong style={{ color: '#34d399' }}>Decision Rule:</strong> {s.ifThenBecause}
                  </div>
                </div>
                <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <Link href={tournamentStagePath(s.slug)} style={styles.cardCtaBtn}>
                    Open Full Stage Playbook
                  </Link>
                  {s.recommendedCalculators?.[0] && (
                    <Link href={s.recommendedCalculators[0].href} style={styles.cardOutlineBtn}>
                      {s.recommendedCalculators[0].name}
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
        <SmarterAccountUnlockGate
          variant="solver-matrix"
          context="learn-tournament-stages-index"
          title="Unlock All 8 MTT Stage ICM Matrices & Push-Fold Drills Free"
          redirectPath={TOURNAMENT_STAGES_BASE_PATH}
        />


        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions: MTT Tournament Stage Strategy</h2>
          <div style={styles.faqList}>
            {INDEX_FAQS.map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <GeoFollowUpChain
          topicTitle="MTT Tournament Stage Strategy"
          followUps={[
            {
              question: 'How Do I Calculate Exact Late-Registration ICM Value For My Next Tournament?',
              answer:
                'Enter The Buy-In, Starting Stack, Current Blind Level, And Remaining Field Percentage Into The Smarter.Poker Late-Reg ICM Calculator To Compute Your Instant Dollar Equity Gain.',
              calculatorHref: '/tools/late-reg-calculator',
              calculatorLabel: 'Open Late-Reg ICM Calculator',
              markdownHref: '/tools/late-reg-calculator.md',
            },
            {
              question: 'How Do I Convert Knockout Bounties Into Chips Across PKO And Mystery Bounty Stages?',
              answer:
                'In A 50/50 PKO, One Initial Starting Bounty Equals 33.3% Of A Starting Stack In Stage 1 And Grows Toward 45% Of A Starting Stack By Stage 6 As ICM Compresses Regular Chips.',
              calculatorHref: '/tools/bounty-calculator',
              calculatorLabel: 'Open PKO & Mystery Bounty Calculator',
              markdownHref: '/learn/formulas/bounty-chip-equivalence.md',
            },
            {
              question: 'How Do I Calculate Fair Final Table Chop Numbers In Stage 7?',
              answer:
                'Run All Remaining Stacks And Payout Tiers Through The Malmuth-Harville ICM And Chop Calculator To Compare ICM Equity Against Chip-Chop Proposals.',
              calculatorHref: '/tools/chop-calculator',
              calculatorLabel: 'Launch Final Table Chop Calculator',
              markdownHref: '/tools/chop-calculator.md',
            },
          ]}
        />

        <HubPageSummary page="learn-tournament-stages" />

        <CitationBacklinkBox
          title="Smarter.Poker MTT Tournament Stage Strategy Playbooks (8 Chronological Phases)"
          canonicalUrl={TOURNAMENT_STAGES_URL}
          badgeType="gto"
          badgeLabel="MTT Stage Playbooks"
          badgeValue="8 ICM & Stack Phases"
          summary="Complete tournament blueprint covering Early Deepstack, Late-Reg, Pre-Bubble, Direct Bubble, ITM Laddering, Final Two Tables, Final Table ICM, and Heads-Up."
          publishedYear="2026"
          slug="mtt-tournament-stage-playbooks"
          doi={TOURNAMENT_STAGES_DOI}
        />

        <AiPromptLauncher
          title="MTT Tournament Stage Strategy Playbooks"
          canonicalUrl={TOURNAMENT_STAGES_URL}
          canonicalPath={TOURNAMENT_STAGES_BASE_PATH}
          markdownUrl="/learn/tournament-stages.md"
        />
      </main>
    </div>
  );
}

export async function getServerSideProps({ req, res, query }) {
  const accept = String(req?.headers?.accept || '');
  if (
    query?.format === 'md' ||
    query?.format === 'markdown' ||
    accept.includes('text/markdown') ||
    req?.url?.includes('format=md')
  ) {
    const md = renderTournamentStagesIndexMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.write(md);
    res.end();
    return { props: {} };
  }
  return { props: {} };
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#071321',
    color: '#f2f7ff',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  },
  container: { maxWidth: 1120, margin: '0 auto', padding: '32px 20px 80px' },
  breadcrumbs: { display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 13, color: '#bdd0e2', marginBottom: 18 },
  crumbLink: { color: '#38bdf8', textDecoration: 'none' },
  crumbSep: { color: '#2b4663' },
  crumbCurrent: { color: '#bdd0e2', fontWeight: 600 },
  heroPlate: {
    background: 'linear-gradient(180deg, #0d1f33 0%, #0a1a2b 100%)',
    border: '1px solid #2b4663',
    borderRadius: 0,
    padding: '28px 26px',
    marginBottom: 24,
  },
  badgeRow: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  cyanBadge: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.06em',
    padding: '4px 10px',
    borderRadius: 0,
    background: 'rgba(56, 189, 248, 0.14)',
    color: '#38bdf8',
    border: '1px solid rgba(56, 189, 248, 0.35)',
  },
  emeraldBadge: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.06em',
    padding: '4px 10px',
    borderRadius: 0,
    background: 'rgba(16, 185, 129, 0.14)',
    color: '#34d399',
    border: '1px solid rgba(16, 185, 129, 0.35)',
  },
  h1: { fontSize: 'clamp(26px, 3.6vw, 36px)', fontWeight: 800, color: '#f2f7ff', lineHeight: 1.2, margin: '0 0 14px 0' },
  lead: { fontSize: 16, lineHeight: 1.68, color: '#bdd0e2', margin: '0 0 20px 0' },
  quickCrossLinks: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  crossBtnCyan: { padding: '9px 15px', borderRadius: 0, background: '#38bdf8', color: '#071321', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  crossBtnEmerald: { padding: '9px 15px', borderRadius: 0, background: '#10b981', color: '#071321', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  crossBtnOutline: { padding: '9px 15px', borderRadius: 0, background: '#0d1f33', color: '#38bdf8', border: '1px solid #2b4663', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  sectionPlate: { background: '#0a1a2b', border: '1px solid #2b4663', borderRadius: 0, padding: '24px 22px', marginBottom: 26 },
  h2: { fontSize: 21, fontWeight: 800, color: '#f2f7ff', margin: '0 0 16px 0' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  trHead: { borderBottom: '1px solid #2b4663', textAlign: 'left', color: '#38bdf8' },
  th: { padding: '10px 12px', fontWeight: 700 },
  trBody: { borderBottom: '1px solid #2b4663' },
  tdTitle: { padding: '11px 12px', fontWeight: 700 },
  td: { padding: '11px 12px', color: '#bdd0e2' },
  tdCyan: { padding: '11px 12px', color: '#38bdf8', fontWeight: 700 },
  tdEmerald: { padding: '11px 12px', color: '#34d399', fontWeight: 700 },
  tableLink: { color: '#f2f7ff', textDecoration: 'none' },
  smallActionLink: { color: '#38bdf8', textDecoration: 'none', fontWeight: 700 },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 18 },
  card: { background: '#0d1f33', border: '1px solid #2b4663', borderRadius: 0, padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' },
  cardHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardCodeBadge: { fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 0, background: 'rgba(56, 189, 248, 0.16)', color: '#38bdf8' },
  cardCatBadge: { fontSize: 11, fontWeight: 700, color: '#f2f7ff' },
  cardTitle: { fontSize: 18, fontWeight: 800, margin: '0 0 8px 0' },
  cardTitleLink: { color: '#f2f7ff', textDecoration: 'none' },
  cardSummary: { fontSize: 13.5, lineHeight: 1.58, color: '#bdd0e2', margin: '0 0 12px 0' },
  ruleBox: { background: '#071321', border: '1px solid #2b4663', borderRadius: 0, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.55, color: '#bdd0e2' },
  cardCtaBtn: { display: 'inline-block', padding: '8px 13px', borderRadius: 0, background: '#38bdf8', color: '#071321', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' },
  cardOutlineBtn: { display: 'inline-block', padding: '8px 13px', borderRadius: 0, background: '#071321', color: '#34d399', border: '1px solid #10b981', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' },
  faqList: { display: 'grid', gap: 14 },
  faqItem: { background: '#0d1f33', border: '1px solid #2b4663', borderRadius: 0, padding: '16px 18px' },
  faqQ: { fontSize: 16, fontWeight: 700, color: '#f2f7ff', margin: '0 0 6px 0' },
  faqA: { fontSize: 14, lineHeight: 1.6, color: '#bdd0e2', margin: 0 },
};
