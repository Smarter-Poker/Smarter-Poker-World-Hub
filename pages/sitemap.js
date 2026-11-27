/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CATEGORIZED HTML SITEMAP DIRECTORY (/sitemap)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Fast, statically generated human and crawler directory connecting every core
 * hub, all 51 US state poker guides, all 12 regional market guides, all 52 free
 * poker calculators, all 40 strategy lessons, all 30 official rules, all 15 game
 * variants, all 30 comparison pages, and all 15 open research studies within two
 * clicks of the Smarter.Poker homepage.
 *
 * House style: Title Case, zero em dashes.
 */
import Link from 'next/link';
import SEOHead from '../src/components/seo/SEOHead';
import UniversalHeader from '../src/components/ui/UniversalHeader';
import { US_POKER_STATES, stateGuidePath } from '../src/content/guides/states';
import { POKER_MARKET_GUIDES, marketGuidePath } from '../src/content/guides/markets';
import { LESSONS } from '../src/content/learn/lessons';
import { RESEARCH_REPORTS, researchPath } from '../src/content/research/reports';
import { POKER_RULES, rulePath } from '../src/content/rules/rules';
import { POKER_VARIANTS, variantPath } from '../src/content/games/variants';
import { COMPARE_PAGES, comparePath } from '../src/content/compare/pages';
import { SITE_URL, ORGANIZATION_ID } from '../src/lib/learn/learnSite.js';

const CANONICAL_PATH = '/sitemap';
const CANONICAL_URL = `${SITE_URL}${CANONICAL_PATH}`;

const CORE_HUB_LINKS = [
  { href: '/', label: 'Smarter.Poker Home' },
  { href: '/hub', label: 'World Hub' },
  { href: '/hub/poker-near-me/lobby', label: 'Poker Near Me Live Venue Directory' },
  { href: '/hub/daily-tournaments', label: 'Daily Poker Tournaments' },
  { href: '/hub/tournaments/this-weekend', label: 'This Weekend Poker Tournaments' },
  { href: '/hub/events-calendar', label: 'Poker Events Calendar' },
  { href: '/hub/poker-series', label: 'Live Poker Series Schedules' },
  { href: '/hub/poker-tours', label: 'Major Poker Tours (WSOP, WPT, RGPS, MSPT)' },
  { href: '/freerolls', label: 'Daily Free Poker Freerolls' },
  { href: '/hub/home-games', label: 'Local Poker Home Games' },
  { href: '/hub/home-games/in', label: 'Poker Home Games By US State' },
  { href: '/hub/training', label: 'GTO Poker Training Platform' },
  { href: '/hub/preflop-charts', label: 'Interactive Preflop Charts' },
  { href: '/hub/bankroll-manager', label: 'Bankroll & Tax Manager' },
  { href: '/hub/video-library', label: 'Poker Video Library' },
  { href: '/hub/news', label: 'Live Poker News' },
  { href: '/hub/commander', label: 'Club Commander Room Management' },
  { href: '/tools', label: 'All 52 Free Poker Calculators' },
  { href: '/learn', label: 'Poker Strategy Encyclopedia' },
  { href: '/learn/best-poker-players', label: 'Best Poker Players Of All Time' },
  { href: '/learn/hands', label: 'All 169 Starting Hand Guides' },
  { href: '/learn/matchups', label: 'Poker Hand Matchup Equity Guides' },
  { href: '/learn/famous-hands', label: 'Famous Poker Hands Analyzed' },
  { href: '/learn/positions', label: 'Poker Positions Strategy Guides' },
  { href: '/learn/board-textures', label: 'Flop Board Texture Guides' },
  { href: '/learn/formulas', label: 'Poker Math Formulas Directory' },
  { href: '/glossary', label: 'Poker Glossary & Definitions' },
  { href: '/poker-rooms', label: 'US Poker Rooms & Law Directory' },
  { href: '/poker-rooms/states', label: 'All 50 US States & DC Poker Guides' },
  { href: '/poker-rooms/guides', label: '12 US Regional Market Guides' },
  { href: '/poker-rooms/international', label: 'International Poker Destinations' },
  { href: '/research', label: 'Open Poker Industry Research & Datasets' },
  { href: '/compare', label: 'Poker Platform & Room Comparisons' },
  { href: '/rules', label: 'Official Poker Rules Directory' },
  { href: '/games', label: 'Poker Game Variants Guide' },
  { href: '/features', label: 'Platform Features Directory' },
  { href: '/about', label: 'About Smarter.Poker' },
  { href: '/facts', label: 'Verified Platform Facts & Clarifications' },
  { href: '/search', label: 'Sitewide Poker Search' },
];

const FEATURED_TOOL_LINKS = [
  { href: '/tools/poker-odds-calculator', label: 'Poker Odds & Multiway Equity Calculator' },
  { href: '/tools/pot-odds-calculator', label: 'Pot Odds & MDF Calculator' },
  { href: '/tools/icm-calculator', label: 'Tournament ICM & Bubble Factor Calculator' },
  { href: '/tools/bankroll-calculator', label: 'Bankroll & Risk Of Ruin Calculator' },
  { href: '/tools/push-fold-calculator', label: 'Nash Push/Fold Shove Chart Calculator' },
  { href: '/tools/preflop-ranges', label: '13x13 GTO Preflop Range Matrix' },
  { href: '/tools/spr-calculator', label: 'SPR & Geometric Bet Sizing Calculator' },
  { href: '/tools/rake-calculator', label: 'Live Cash Rake & Time Impact Calculator' },
  { href: '/tools/plo-bet-calculator', label: 'PLO Pot-Limit Bet Sizing Calculator' },
  { href: '/tools/plo-outs-calculator', label: 'PLO Wrap & Nut-Out Calculator' },
  { href: '/tools/variance-calculator', label: 'Poker Variance & Downswing Simulator' },
  { href: '/tools/poker-winrate-calculator', label: 'BB/100 To Hourly Winrate Converter' },
  { href: '/tools/poker-tax-calculator', label: 'US Poker W-2G Tax Calculator' },
  { href: '/tools/bounty-calculator', label: 'PKO & Mystery Bounty Equity Calculator' },
  { href: '/tools/chop-calculator', label: 'Final Table ICM & Chip Chop Calculator' },
  { href: '/tools/blind-structure-calculator', label: 'Home Game Blind Structure Builder' },
  { href: '/tools/side-pot-calculator', label: 'Multiway All-In Side Pot Calculator' },
  { href: '/tools/3bet-calculator', label: '3-Bet & 4-Bet Fold Equity Calculator' },
  { href: '/tools/staking-calculator', label: 'Tournament Staking & Markup Calculator' },
  { href: '/tools/payout-calculator', label: 'Tournament Payout Structure Calculator' },
  { href: '/tools/outs-calculator', label: 'Rule Of 2 And 4 Outs Calculator' },
  { href: '/tools/board-texture-analyzer', label: 'Flop Board Texture Analyzer' },
  { href: '/tools/m-ratio-calculator', label: 'Harrington M-Ratio & Zone Calculator' },
  { href: '/tools/embeds', label: 'Free Webmaster Calculator Embeds' },
];

export async function getStaticProps() {
  return {
    props: {
      states: US_POKER_STATES.map((s) => ({ href: stateGuidePath(s.slug), label: `${s.name} (${s.code})` })),
      markets: POKER_MARKET_GUIDES.map((m) => ({ href: marketGuidePath(m.slug), label: `${m.regionName} (${m.stateCode})` })),
      lessons: LESSONS.map((l) => ({ href: `/learn/${l.slug}`, label: l.title })),
      reports: RESEARCH_REPORTS.map((r) => ({ href: researchPath(r.slug), label: r.shortTitle })),
      rules: POKER_RULES.map((r) => ({ href: rulePath(r.slug), label: r.shortTitle || r.title })),
      variants: POKER_VARIANTS.map((v) => ({ href: variantPath(v.slug), label: v.name || v.title })),
      comparisons: COMPARE_PAGES.map((c) => ({ href: comparePath(c.slug), label: c.title })),
    },
  };
}

function SitemapSection({ title, items }) {
  return (
    <section style={{ marginBottom: 32, padding: 22, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10 }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, color: '#f8fafc', margin: '0 0 14px 0' }}>
        {title} ({items.length})
      </h2>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '8px 16px',
        }}
      >
        {items.map((item) => (
          <li key={item.href} style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            <Link href={item.href} style={{ color: '#38bdf8', textDecoration: 'none' }}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function HtmlSitemapPage({
  states = [],
  markets = [],
  lessons = [],
  reports = [],
  rules = [],
  variants = [],
  comparisons = [],
}) {
  const title = 'HTML Sitemap: Complete Smarter.Poker Directory';
  const description =
    'Browse all Smarter.Poker hubs, 51 US state poker guides, 52 free poker calculators, 40 GTO lessons, 30 rules, 15 research studies, and live venue directories.';

  const jsonLd = [
    {
      '@type': 'CollectionPage',
      '@id': `${CANONICAL_URL}#collection`,
      name: title,
      description,
      url: CANONICAL_URL,
      inLanguage: 'en-US',
      isAccessibleForFree: true,
      publisher: { '@id': ORGANIZATION_ID },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', '#sitemap-intro'],
      },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${CANONICAL_URL}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'HTML Sitemap', item: CANONICAL_URL },
      ],
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#070b14', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="HTML Sitemap: Complete Smarter.Poker Directory"
        description={description}
        canonical={CANONICAL_PATH}
        jsonLd={jsonLd}
      />

      <UniversalHeader />

      <main style={{ maxWidth: 1120, margin: '0 auto', padding: '36px 20px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
          <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none' }}>Smarter.Poker</Link>
          {' / '}
          <span>HTML Sitemap</span>
        </nav>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 12px 0' }}>
          Smarter.Poker Complete HTML Sitemap Directory
        </h1>

        <p id="sitemap-intro" style={{ fontSize: 15, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
          Navigate Every Major Smarter.Poker Hub, All 51 US State &amp; DC Poker Legality Guides, Regional Market Briefs, Free Poker Calculators, GTO Strategy Lessons, Official Rules, Game Variants, Platform Comparisons, And Open Industry Research Studies. Machine-Readable XML Sitemaps Are Published At{' '}
          <a href="https://smarter.poker/sitemap_index.xml" style={{ color: '#38bdf8' }}>XML Sitemap Index</a>.
        </p>

        <SitemapSection title="Core Platform & Live Directory Hubs" items={CORE_HUB_LINKS} />
        <SitemapSection title="All 50 US States & DC Poker Law & Tax Guides" items={states} />
        <SitemapSection title="US Regional Live Poker Market Guides" items={markets} />
        <SitemapSection title="Featured Free Poker Calculators & Tools" items={FEATURED_TOOL_LINKS} />
        <SitemapSection title="GTO Poker Strategy Lessons" items={lessons} />
        <SitemapSection title="Open Poker Industry Research & Data Studies" items={reports} />
        <SitemapSection title="Official Poker Rules & Floor Rulings" items={rules} />
        <SitemapSection title="Poker Game Variants & Formats" items={variants} />
        <SitemapSection title="Poker Platform & Room Comparisons" items={comparisons} />
      </main>
    </div>
  );
}
