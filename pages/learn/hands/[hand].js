/* ═══════════════════════════════════════════════════════════════════════════
   /learn/hands/[hand] - INDIVIDUAL STARTING HAND STRATEGY GUIDE
   ═══════════════════════════════════════════════════════════════════════════
   Statically generated Article + FAQPage + Quiz + BreadcrumbList +
   SpeakableSpecification page for each canonical Texas Hold'em starting hand.

   House style: Title Case, no em dashes.
   ═══════════════════════════════════════════════════════════════════════════ */

import Link from 'next/link';
import SEOHead from '../../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../../src/components/seo/AiPromptLauncher';
import {
  SITE_URL,
  LEARN_URL,
  ORGANIZATION_ID,
  LEARN_MODIFIED,
} from '../../../src/lib/learn/learnSite.js';
import { STARTING_HANDS, HANDS_BASE_PATH, handPath, getStartingHand } from '../../../src/content/learn/hands.js';

export async function getStaticPaths() {
  return {
    paths: STARTING_HANDS.map((h) => ({ params: { hand: h.slug } })),
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  const hand = getStartingHand(params?.hand);
  if (!hand) return { notFound: true };
  return { props: { hand } };
}

function handJsonLd(hand) {
  const path = handPath(hand.slug);
  const url = `${SITE_URL}${path}`;
  return [
    {
      '@type': 'Article',
      '@id': `${url}#article`,
      headline: `How To Play ${hand.name} (${hand.code}) In Texas Hold'em`,
      description: hand.summary,
      url,
      inLanguage: 'en-US',
      datePublished: '2026-10-01',
      dateModified: LEARN_MODIFIED,
      isAccessibleForFree: true,
      publisher: { '@id': ORGANIZATION_ID },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'main p:first-of-type'],
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: `What Is The Preflop Equity Of ${hand.name} (${hand.code})?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: `${hand.name} (${hand.code}) Ranks ${hand.preflopRank} Out Of 169 Starting Hands With ${hand.vsRandomEquity} Preflop Equity Against A Random Hand Across ${hand.combinations} Deck Combinations (${hand.probability}).`,
          },
        },
        {
          '@type': 'Question',
          name: `How Should I Play ${hand.name} (${hand.code}) Facing A 3-Bet?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: hand.vs3Bet,
          },
        },
      ],
    },
    {
      '@type': 'Quiz',
      name: `${hand.name} (${hand.code}) GTO Strategy Assessment`,
      about: {
        '@type': 'Thing',
        name: `${hand.name} (${hand.code}) Poker Strategy`,
      },
      hasPart: [
        {
          '@type': 'Question',
          eduQuestionType: 'Multiple choice',
          text: `How Many Deck Combinations Of ${hand.name} (${hand.code}) Exist In A 52-Card Deck?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: `${hand.combinations} Combinations (${hand.probability}).`,
          },
        },
      ],
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Poker Strategy Lessons', item: LEARN_URL },
        { '@type': 'ListItem', position: 3, name: 'Starting Hand Encyclopedia', item: `${SITE_URL}${HANDS_BASE_PATH}` },
        { '@type': 'ListItem', position: 4, name: `${hand.name} (${hand.code})`, item: url },
      ],
    },
  ];
}

export default function StartingHandDetailPage({ hand }) {
  const path = handPath(hand.slug);
  const url = `${SITE_URL}${path}`;

  return (
    <div style={{ minHeight: '100vh', background: '#070b14', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title={`How To Play ${hand.name} (${hand.code}): GTO Poker Strategy`}
        description={hand.summary}
        canonical={path}
        jsonLd={handJsonLd(hand)}
      />

      <main style={{ maxWidth: 880, margin: '0 auto', padding: '40px 20px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
          <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none' }}>Smarter.Poker</Link>
          {' / '}
          <Link href="/learn" style={{ color: '#38bdf8', textDecoration: 'none' }}>Poker Strategy Lessons</Link>
          {' / '}
          <Link href="/learn/hands" style={{ color: '#38bdf8', textDecoration: 'none' }}>Starting Hand Encyclopedia</Link>
          {' / '}
          <span>{hand.name} ({hand.code})</span>
        </nav>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          How To Play {hand.name} ({hand.code}) In No-Limit Texas Hold&apos;Em
        </h1>

        <p style={{ fontSize: 17, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 26px 0' }}>
          {hand.summary}
        </p>

        <section style={{ marginBottom: 32, padding: 20, background: '#0f172a', borderRadius: 12, border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', margin: '0 0 14px 0' }}>
            Combinatoric Fact Sheet For {hand.name} ({hand.code})
          </h2>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8, color: '#cbd5e1' }}>
            <li><strong>Hand Notation:</strong> {hand.code} ({hand.nickname})</li>
            <li><strong>Category:</strong> {hand.category}</li>
            <li><strong>Combinations In 52-Card Deck:</strong> {hand.combinations} Out Of 1,326 ({hand.probability})</li>
            <li><strong>Preflop Rank:</strong> {hand.preflopRank}</li>
            <li><strong>Heads-Up Equity Vs. Random Hand:</strong> {hand.vsRandomEquity}</li>
          </ul>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            6-Max 100BB GTO Opening Strategy By Position
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#0f172a', borderRadius: 10 }}>
            <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
              Solver Raise-First-In (RFI) Action By Seat For {hand.code}
            </caption>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', color: '#38bdf8', textAlign: 'left' }}>
                <th scope="col" style={{ padding: '10px 14px' }}>Table Position</th>
                <th scope="col" style={{ padding: '10px 14px' }}>100BB GTO Action</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(hand.rfiByPosition).map(([pos, act]) => (
                <tr key={pos} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{pos}</td>
                  <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{act}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            3-Bet Response And Postflop Execution Playbook
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 12px 0' }}>
            <strong>Facing A 3-Bet:</strong> {hand.vs3Bet}
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: '#cbd5e1', margin: 0 }}>
            <strong>Postflop Strategy:</strong> {hand.postflopPlaybook}
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Head-To-Head Preflop Equity Matchups
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#0f172a', borderRadius: 10 }}>
            <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
              All-In Preflop Equity Benchmarks For {hand.code}
            </caption>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', color: '#38bdf8', textAlign: 'left' }}>
                <th scope="col" style={{ padding: '10px 14px' }}>Opposing Hand</th>
                <th scope="col" style={{ padding: '10px 14px' }}>{hand.code} Equity</th>
                <th scope="col" style={{ padding: '10px 14px' }}>Opponent Equity</th>
                <th scope="col" style={{ padding: '10px 14px' }}>Tie Frequency</th>
              </tr>
            </thead>
            <tbody>
              {hand.matchups.map((m) => (
                <tr key={m.villain} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: '#f8fafc' }}>{m.villain}</td>
                  <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{m.heroEquity}</td>
                  <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{m.villainEquity}</td>
                  <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{m.tie}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Practice {hand.name} On Smarter.Poker
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Link
              href={`/tools/poker-odds-calculator?hand1=${encodeURIComponent(hand.code)}`}
              style={{ padding: '10px 16px', background: '#0284c7', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}
            >
              Simulate {hand.code} In Odds Calculator
            </Link>
            <Link
              href="/tools/preflop-ranges"
              style={{ padding: '10px 16px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}
            >
              Open Full 13x13 GTO Range Matrix
            </Link>
            <Link
              href="/learn/hands"
              style={{ padding: '10px 16px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}
            >
              Browse All 20 Starting Hands
            </Link>
          </div>
        </section>

        <AiPromptLauncher
          title={`How To Play ${hand.name} (${hand.code})`}
          canonicalUrl={url}
          markdownUrl={`${url}.md`}
        />
      </main>
    </div>
  );
}
