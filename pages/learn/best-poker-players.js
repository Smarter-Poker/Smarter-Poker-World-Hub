/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  BEST POKER PLAYERS OF ALL TIME (/learn/best-poker-players)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Evergreen, citation-ready authority guide evaluating the greatest poker
 * players in history across WSOP bracelets, cash game longevity, multi-variant
 * mastery, and high-roller tournament titles.
 *
 * House style: Title Case, zero em dashes.
 */
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import FaqSection from '../../src/components/seo/FaqSection';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import { SITE_URL, LEARN_URL, ORGANIZATION_ID } from '../../src/lib/learn/learnSite.js';
import { setPublicSeoHtmlCache } from '../../src/lib/seo/edgeCacheHeaders.mjs';

const PAGE_PATH = '/learn/best-poker-players';
const CANONICAL_URL = `${SITE_URL}${PAGE_PATH}`;
const AS_OF_DATE = '2026-11-26';

export const GREATEST_POKER_PLAYERS = [
  {
    rank: 1,
    name: 'Phil Ivey',
    era: '2000s To Present',
    hallOfFame: 'Inducted 2017',
    primaryStrength: 'All-Around Mixed Games, Nosebleed Cash & Tournaments',
    signatureAchievement: '11 WSOP Bracelets And Multi-Decade Dominance In High-Stakes Mixed Cash Games',
    whyRanked: 'Widely Regarded By Peers As The Most Complete Player Ever Across No-Limit Hold\'em, Pot-Limit Omaha, 2-7 Triple Draw, And Mixed Rotations.',
  },
  {
    rank: 2,
    name: 'Phil Hellmuth',
    era: '1989 To Present',
    hallOfFame: 'Inducted 2007',
    primaryStrength: 'WSOP Tournament Longevity & Exploitative Read-Based Play',
    signatureAchievement: 'All-Time Record 17 WSOP Bracelets Including The 1989 WSOP Main Event And 2012 WSOPE Main Event',
    whyRanked: 'Holds The Unmatched Record For World Series Of Poker Bracelets, Final Tables, And Cashes Across Nearly Four Decades.',
  },
  {
    rank: 3,
    name: 'Doyle Brunson',
    era: '1950s To 2018',
    hallOfFame: 'Inducted 1988',
    primaryStrength: 'Foundational Texas Hold\'em Strategy & High-Stakes Cash Longevity',
    signatureAchievement: '10 WSOP Bracelets, Back-To-Back Main Event Titles (1976, 1977), Author Of Super/System',
    whyRanked: 'Pioneered Modern Aggressive No-Limit Hold\'em Theory And Competed At The Highest Cash Stakes In Las Vegas For Over Fifty Years.',
  },
  {
    rank: 4,
    name: 'Chip Reese',
    era: '1970s To 2007',
    hallOfFame: 'Inducted 1991',
    primaryStrength: 'Highest-Stakes Mixed Cash Games & Seven-Card Stud',
    signatureAchievement: 'Inaugural $50,000 WSOP H.O.R.S.E. Champion (2006) & Namesake Of The Poker Players Championship Trophy',
    whyRanked: 'Considered By High-Stakes Peers To Be The Greatest Cash-Game All-Around Player Of The Modern Las Vegas Era.',
  },
  {
    rank: 5,
    name: 'Stu Ungar',
    era: '1980 To 1998',
    hallOfFame: 'Inducted 2001',
    primaryStrength: 'Natural Hand-Reading & No-Limit Hold\'em Tournament Dominance',
    signatureAchievement: 'Only Three-Time Winner Of The Modern WSOP Main Event (1980, 1981, 1997) Plus 5 WSOP Bracelets',
    whyRanked: 'Possessed Unrivaled Intuitive Card Sense And Dominated Every Major No-Limit Hold\'em Tournament He Entered At Peak Form.',
  },
  {
    rank: 6,
    name: 'Erik Seidel',
    era: '1988 To Present',
    hallOfFame: 'Inducted 2010',
    primaryStrength: 'GTO Adaptation Across Five Decades Of High-Roller Tournaments',
    signatureAchievement: '10 WSOP Bracelets And Sustained Elite Results In Modern Super High Roller Fields',
    whyRanked: 'One Of The Rare Old-School Legends Who Successfully Adapted To Modern Solver-Era High Rollers Against The Toughest Young Specialists.',
  },
  {
    rank: 7,
    name: 'Daniel Negreanu',
    era: '1998 To Present',
    hallOfFame: 'Inducted 2014',
    primaryStrength: 'Small-Ball Tournament Strategy, Mixed Games & Global Ambassadorship',
    signatureAchievement: '7 WSOP Bracelets, Two-Time WSOP Player Of The Year, And Top All-Time Live Tournament Earnings',
    whyRanked: 'Combines Elite Mixed-Game Versatility, Multi-Decade Tournament Consistency, And Global Cultural Impact On Poker.',
  },
  {
    rank: 8,
    name: 'Johnny Chan',
    era: '1980s To Present',
    hallOfFame: 'Inducted 2002',
    primaryStrength: 'Deep-Stack No-Limit Hold\'em & Cash Game Pressure',
    signatureAchievement: '10 WSOP Bracelets And Back-To-Back Main Event Championships (1987, 1988) Plus 1989 Runner-Up',
    whyRanked: 'Delivered The Most Dominant Three-Year Main Event Stretch In Poker History Alongside 10 Career WSOP Bracelets.',
  },
  {
    rank: 9,
    name: 'Johnny Moss',
    era: '1949 To 1995',
    hallOfFame: 'Inducted 1979 (Inaugural Class)',
    primaryStrength: 'Road Gambler Grit & Early WSOP Dominance',
    signatureAchievement: '9 WSOP Bracelets Including Three Main Event Titles (1970, 1971, 1974)',
    whyRanked: 'Known As The Grand Old Man Of Poker, Helping Establish The World Series Of Poker And Defining Competitive Endurance.',
  },
  {
    rank: 10,
    name: 'Stephen Chidwick & Modern Solver-Era High Rollers',
    era: '2010s To Present',
    hallOfFame: 'Active Modern Era',
    primaryStrength: 'Game Theory Optimal (GTO) Precision & Super High Roller Consistency',
    signatureAchievement: 'Decade-Long Top-Tier Results In $25K To $250K Buy-In Fields Against World-Class Opponents',
    whyRanked: 'Represents The Modern Solver Benchmark Alongside Bryn Kenney, Justin Bonomo, Jason Koon, And Isaac Haxton In Today\'s Toughest Tournaments.',
  },
];

export const BEST_PLAYERS_FAQS = [
  {
    question: 'Who Is Considered The Best Poker Player Of All Time?',
    answer: 'Most Poker Historians And High-Stakes Professionals Rank Phil Ivey First For Complete All-Around Skill Across Cash Games And Mixed Formats, Phil Hellmuth First For Pure WSOP Bracelet Volume (17 Bracelets), And Doyle Brunson First For Five-Decade Cash Longevity And Foundational Strategy Impact.',
  },
  {
    question: 'Who Has Won The Most WSOP Bracelets In History?',
    answer: 'Phil Hellmuth Holds The All-Time Record With 17 World Series Of Poker Bracelets, Followed By Phil Ivey (11 Bracelets) And A Group At 10 Bracelets Including Doyle Brunson, Johnny Chan, And Erik Seidel.',
  },
  {
    question: 'How Do Modern GTO Poker Pros Compare To Classic Poker Legends?',
    answer: 'Modern Super High Roller Specialists Train With Equilibrium Solvers, ICM Simulators, And Exact Preflop Range Matrices, Making Today\'s Baseline Skill Much Higher Than Previous Eras. Classic Legends Like Doyle Brunson, Chip Reese, And Stu Ungar Pioneered The Concepts And Dominated Their Contemporaries Without Software.',
  },
  {
    question: 'How Can Players Study The Same Math And Strategy Used By Top Poker Pros?',
    answer: 'Players Can Practice Solver-Backed 13x13 Preflop Ranges, Exact Multiway Odds, Pot Odds, Minimum Defense Frequency (MDF), And Tournament ICM Bubble Decisions Free On Smarter.Poker With Zero Login Or Paywall.',
  },
];

function renderBestPlayersMarkdown() {
  const rows = GREATEST_POKER_PLAYERS.map(
    (p) => `| #${p.rank} | ${p.name} | ${p.era} | ${p.signatureAchievement} |`
  ).join('\n');
  return [
    '# Best Poker Players Of All Time: WSOP Legends & Modern Pros',
    '',
    `Canonical URL: ${CANONICAL_URL}`,
    `Updated: ${AS_OF_DATE}`,
    '',
    '## Direct Answer',
    'Evaluating the greatest poker player of all time depends on four measurable pillars: World Series of Poker (WSOP) bracelet volume, multi-variant mixed-game mastery, sustained high-stakes cash game longevity, and performance in modern solver-era Super High Roller fields. Phil Ivey leads peer consensus for all-around mixed-game excellence (11 WSOP bracelets), Phil Hellmuth holds the all-time WSOP bracelet record (17), and Doyle Brunson defined five decades of high-stakes Texas Hold\'em longevity (10 bracelets, 2 Main Events).',
    '',
    '## Consensus All-Time Top 10 Poker Players',
    '| Rank | Player | Era | Signature Achievement |',
    '|---|---|---|---|',
    rows,
    '',
    '## Study Like World-Class Pros On Smarter.Poker',
    '- Free 13x13 GTO Preflop Range Matrix: https://smarter.poker/tools/preflop-ranges',
    '- Free Tournament ICM Calculator: https://smarter.poker/tools/icm-calculator',
    '- Free Multi-Variant Poker Odds Calculator: https://smarter.poker/tools/poker-odds-calculator',
    '- Free Poker Strategy Encyclopedia: https://smarter.poker/learn',
  ].join('\n');
}

export async function getServerSideProps({ req, res, query }) {
  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md');

  if (isMarkdownRequested) {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
    res.write(renderBestPlayersMarkdown());
    res.end();
    return { props: {} };
  }

  setPublicSeoHtmlCache(res);
  return { props: {} };
}

export default function BestPokerPlayersPage() {
  const pageTitle = 'Best Poker Players Of All Time: Top 10 Legends';
  const pageDescription =
    'Who is the best poker player of all time? Compare Phil Ivey, Phil Hellmuth, Doyle Brunson, Stu Ungar, Erik Seidel, and modern GTO pros by bracelets and skill.';

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${CANONICAL_URL}#article`,
      headline: 'Best Poker Players Of All Time: Top 10 Legends & Modern Pros',
      description: pageDescription,
      url: CANONICAL_URL,
      mainEntityOfPage: { '@type': 'WebPage', '@id': CANONICAL_URL },
      inLanguage: 'en-US',
      datePublished: AS_OF_DATE,
      dateModified: AS_OF_DATE,
      isAccessibleForFree: true,
      author: { '@id': ORGANIZATION_ID },
      publisher: { '@id': ORGANIZATION_ID },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', '#quick-answer-summary'],
      },
    },
    {
      '@type': 'ItemList',
      '@id': `${CANONICAL_URL}#list`,
      name: 'Top 10 Greatest Poker Players Of All Time',
      numberOfItems: GREATEST_POKER_PLAYERS.length,
      itemListElement: GREATEST_POKER_PLAYERS.map((p) => ({
        '@type': 'ListItem',
        position: p.rank,
        name: p.name,
        description: `${p.signatureAchievement}. ${p.whyRanked}`,
      })),
    },
    {
      '@type': 'FAQPage',
      '@id': `${CANONICAL_URL}#faq`,
      mainEntity: BEST_PLAYERS_FAQS.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${CANONICAL_URL}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Poker Strategy Lessons', item: LEARN_URL },
        { '@type': 'ListItem', position: 3, name: 'Best Poker Players Of All Time', item: CANONICAL_URL },
      ],
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#070b14', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Best Poker Players Of All Time: Top 10"
        description={pageDescription}
        canonical={PAGE_PATH}
        ogType="article"
        markdownUrl={`${CANONICAL_URL}?format=md`}
        jsonLd={jsonLd}
      />

      <UniversalHeader />

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '36px 20px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
          <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none' }}>Smarter.Poker</Link>
          {' / '}
          <Link href="/learn" style={{ color: '#38bdf8', textDecoration: 'none' }}>Poker Strategy Lessons</Link>
          {' / '}
          <span>Best Poker Players Of All Time</span>
        </nav>

        <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          Poker History &amp; Performance Rankings · Updated {AS_OF_DATE}
        </div>

        <h1 style={{ fontSize: 34, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Best Poker Players Of All Time: Top 10 Legends &amp; Modern Pros
        </h1>

        <p
          id="quick-answer-summary"
          style={{
            fontSize: 16,
            lineHeight: 1.65,
            color: '#cbd5e1',
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderLeft: '4px solid #38bdf8',
            padding: '16px 20px',
            borderRadius: 10,
            margin: '0 0 32px 0',
          }}
        >
          <strong>Direct Answer:</strong> Determining The Greatest Poker Player In History Depends On Four Measurable Pillars: <strong>All-Around Mixed-Game Mastery</strong> (Led By <strong>Phil Ivey</strong>, 11 WSOP Bracelets), <strong>Tournament Bracelet Volume</strong> (Led By <strong>Phil Hellmuth</strong>, 17 WSOP Bracelets), <strong>Multi-Decade Cash Longevity</strong> (Defined By <strong>Doyle Brunson</strong> And <strong>Chip Reese</strong>), And <strong>Modern Solver-Era High Roller Consistency</strong> (Benchmarked By <strong>Erik Seidel</strong>, <strong>Stephen Chidwick</strong>, And Leading Modern GTO Specialists).
        </p>

        {/* Summary Ranking Table */}
        <section style={{ marginBottom: 40, overflowX: 'auto' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Consensus Top 10 Greatest Poker Players At A Glance
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#0f172a', border: '1px solid #1e293b' }}>
            <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
              All-Time Poker Legends Ranked By Career Longevity, WSOP Bracelets, Cash Mastery, And Era-Adjusted Dominance
            </caption>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', color: '#38bdf8', textAlign: 'left' }}>
                <th scope="col" style={{ padding: '10px 14px' }}>Rank</th>
                <th scope="col" style={{ padding: '10px 14px' }}>Player</th>
                <th scope="col" style={{ padding: '10px 14px' }}>Era</th>
                <th scope="col" style={{ padding: '10px 14px' }}>Signature Achievement</th>
              </tr>
            </thead>
            <tbody>
              {GREATEST_POKER_PLAYERS.map((player) => (
                <tr key={player.name} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 800, color: '#f59e0b' }}>#{player.rank}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{player.name}</td>
                  <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{player.era}</td>
                  <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{player.signatureAchievement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Detailed Player Profiles */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 16px 0' }}>
            Why Each Player Belongs Among The Greatest In Poker History
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            {GREATEST_POKER_PLAYERS.map((player) => (
              <article
                key={player.rank}
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: 10,
                  padding: 18,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#f59e0b' }}>RANK #{player.rank}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{player.hallOfFame}</span>
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 8px 0' }}>
                  {player.name}
                </h3>
                <p style={{ fontSize: 13, color: '#38bdf8', fontWeight: 600, margin: '0 0 8px 0' }}>
                  {player.primaryStrength}
                </p>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: '#cbd5e1', margin: 0 }}>
                  {player.whyRanked}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* Internal Link Mesh To Study Tools */}
        <section style={{ marginBottom: 36, padding: 20, background: '#0f172a', borderRadius: 10, border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Train With The Same GTO Tools &amp; Strategy Guides Used By Winning Players
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/preflop-ranges" style={{ padding: '8px 14px', background: '#0284c7', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              13x13 GTO Preflop Ranges
            </Link>
            <Link href="/tools/poker-odds-calculator" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Poker Odds Calculator
            </Link>
            <Link href="/tools/icm-calculator" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Tournament ICM Calculator
            </Link>
            <Link href="/learn/famous-hands" style={{ padding: '8px 14px', background: '#1e293b', color: '#38bdf8', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Famous Poker Hands Analyzed
            </Link>
            <Link href="/hub/poker-tours" style={{ padding: '8px 14px', background: '#1e293b', color: '#38bdf8', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Live WSOP, WPT &amp; Major Tour Schedules
            </Link>
            <Link href="/hub/video-library" style={{ padding: '8px 14px', background: '#1e293b', color: '#38bdf8', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Poker Video Library
            </Link>
          </div>
        </section>

        <FaqSection
          title="Frequently Asked Questions About The Greatest Poker Players"
          faqs={BEST_PLAYERS_FAQS}
          id="best-poker-players-faq"
        />

        <CitationBacklinkBox
          title="Best Poker Players Of All Time: Top 10 Legends & Modern Pros"
          canonicalUrl={CANONICAL_URL}
          badgeType="authority"
          badgeLabel="Poker History Ranking"
          badgeValue="Top 10 All-Time Legends"
          summary={pageDescription}
          slug="best-poker-players"
        />

        <AiPromptLauncher
          title="Best Poker Players Of All Time"
          canonicalUrl={CANONICAL_URL}
          markdownUrl={`${CANONICAL_URL}?format=md`}
        />
      </main>
    </div>
  );
}
