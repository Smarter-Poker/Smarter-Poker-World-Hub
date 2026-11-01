/* ═══════════════════════════════════════════════════════════════════════════
   /learn/hands - TEXAS HOLD'EM STARTING HAND ENCYCLOPEDIA INDEX
   ═══════════════════════════════════════════════════════════════════════════
   Canonical index for all 20 starting hand strategy guides with exact
   combinatoric probabilities, preflop ranks, positional GTO actions, and
   head-to-head equity matchups.

   House style: Title Case, no em dashes.
   ═══════════════════════════════════════════════════════════════════════════ */

import Link from 'next/link';
import SEOHead from '../../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../../src/components/seo/AiPromptLauncher';
import {
  SITE_URL,
  LEARN_URL,
  LEARN_COLLECTION_ID,
  ORGANIZATION_ID,
  LEARN_MODIFIED,
} from '../../../src/lib/learn/learnSite.js';
import { STARTING_HANDS, HANDS_BASE_PATH, handPath } from '../../../src/content/learn/hands.js';

const PAGE_URL = `${SITE_URL}${HANDS_BASE_PATH}`;

function handsIndexSchema() {
  return [
    {
      '@type': 'CollectionPage',
      '@id': `${PAGE_URL}#collection`,
      name: 'Poker Starting Hand Encyclopedia And GTO Matrix Guide',
      description:
        'Thirty Canonical Texas Hold\'em Starting Hand Strategy Guides Covering Exact Deal Probabilities, Preflop Rankings, Positional GTO Actions, And Matchup Equities.',
      url: PAGE_URL,
      inLanguage: 'en-US',
      dateModified: LEARN_MODIFIED,
      isAccessibleForFree: true,
      isPartOf: { '@id': LEARN_COLLECTION_ID },
      publisher: { '@id': ORGANIZATION_ID },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'main p:first-of-type'],
      },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: STARTING_HANDS.length,
        itemListElement: STARTING_HANDS.map((h, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          url: `${SITE_URL}${handPath(h.slug)}`,
          name: `${h.name} (${h.code}) Strategy Guide`,
        })),
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Poker Strategy Lessons', item: LEARN_URL },
        { '@type': 'ListItem', position: 3, name: 'Starting Hand Encyclopedia', item: PAGE_URL },
      ],
    },
  ];
}

export default function StartingHandsIndexPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#070b14', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Poker Starting Hand Encyclopedia"
        description="Complete Texas Hold'em Starting Hand Encyclopedia: Combinatorics, Preflop Rank, Equity Vs. Random Hands, And 6-Max 100BB GTO Opening Strategy."
        canonical={HANDS_BASE_PATH}
        jsonLd={handsIndexSchema()}
      />

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '40px 20px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
          <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none' }}>Smarter.Poker</Link>
          {' / '}
          <Link href="/learn" style={{ color: '#38bdf8', textDecoration: 'none' }}>Poker Strategy Lessons</Link>
          {' / '}
          <span>Starting Hand Encyclopedia</span>
        </nav>

        <h1 style={{ fontSize: 34, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Texas Hold&apos;Em Starting Hand Encyclopedia And GTO Strategy Matrix
        </h1>

        <p style={{ fontSize: 17, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 24px 0' }}>
          Explore Exact Combinatoric Probabilities, Preflop Percentile Rankings, 6-Max 100BB GTO Positional Opening Actions, And Head-To-Head Matchup Equities For The Thirty Most Important Starting Hands In No-Limit Texas Hold&apos;Em.
        </p>

        <div style={{ overflowX: 'auto', marginBottom: 32 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#0f172a', borderRadius: 10 }}>
            <caption style={{ textAlign: 'left', fontWeight: 700, padding: '12px 0', color: '#f8fafc', fontSize: 16 }}>
              Canonical Texas Hold&apos;Em Starting Hand Reference Table
            </caption>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', color: '#38bdf8', textAlign: 'left' }}>
                <th scope="col" style={{ padding: '12px 14px' }}>Starting Hand</th>
                <th scope="col" style={{ padding: '12px 14px' }}>Notation</th>
                <th scope="col" style={{ padding: '12px 14px' }}>Rank</th>
                <th scope="col" style={{ padding: '12px 14px' }}>Combos</th>
                <th scope="col" style={{ padding: '12px 14px' }}>Equity Vs Random</th>
                <th scope="col" style={{ padding: '12px 14px' }}>UTG 100BB</th>
                <th scope="col" style={{ padding: '12px 14px' }}>BTN 100BB</th>
              </tr>
            </thead>
            <tbody>
              {STARTING_HANDS.map((h) => (
                <tr key={h.slug} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                    <Link href={handPath(h.slug)} style={{ color: '#60a5fa', textDecoration: 'none' }}>
                      {h.name} ({h.nickname})
                    </Link>
                  </td>
                  <td style={{ padding: '12px 14px', color: '#f8fafc', fontWeight: 700 }}>{h.code}</td>
                  <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>{h.preflopRank}</td>
                  <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>{h.combinations}</td>
                  <td style={{ padding: '12px 14px', color: '#34d399', fontWeight: 600 }}>{h.vsRandomEquity}</td>
                  <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>{h.rfiByPosition.UTG}</td>
                  <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>{h.rfiByPosition.BTN}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <AiPromptLauncher
          title="Smarter.Poker Starting Hand Encyclopedia"
          canonicalUrl={PAGE_URL}
          markdownUrl={`${PAGE_URL}.md`}
        />
      </main>
    </div>
  );
}
