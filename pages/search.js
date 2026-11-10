/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  UNIVERSAL POKER SEARCH & COMMAND DIRECTORY (/search)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Real-time search engine across Smarter.Poker's entire structured corpus:
 * 24 Interactive Calculators, 25 Hand Matchups, 30 Official Rules, 15 Game
 * Variants, 12 Regional Markets, 10 Major Series Guides, 15 Research Reports,
 * plus Top Starting Hands and Product/Venue Comparisons.
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import SEOHead from '../src/components/seo/SEOHead';
import UniversalHeader from '../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../src/components/seo/CitationBacklinkBox';
import { HAND_MATCHUPS, matchupPath } from '../src/content/learn/matchups';
import { POKER_RULES, rulePath } from '../src/content/rules/rules';
import { POKER_VARIANTS, gameVariantPath } from '../src/content/games/variants';
import { POKER_MARKET_GUIDES, marketGuidePath } from '../src/content/guides/markets';
import { SERIES_GUIDES, seriesGuidePath } from '../src/content/guides/seriesGuides';
import { RESEARCH_REPORTS, researchPath } from '../src/content/research/reports';
import { STARTING_HANDS, handPath } from '../src/content/learn/hands';
import { COMPARE_PAGES, comparePath } from '../src/content/compare/pages';

export const POKER_GAMES = POKER_VARIANTS;
export const POKER_MARKETS = POKER_MARKET_GUIDES;

const CALCULATOR_ITEMS = [
  {
    title: 'Multiway Poker Odds & Equity Calculator',
    href: '/tools/poker-odds-calculator',
    badge: 'Equity Engine',
    summary: 'Exact Combinatorial And Monte Carlo Hand-Vs-Hand Equity Calculator For Hold\'em, PLO4/5/6, And Short Deck.',
  },
  {
    title: 'Tournament ICM & Final Table Deal Calculator',
    href: '/tools/icm-calculator',
    badge: 'MTT ICM Solver',
    summary: 'Malmuth-Harville Independent Chip Model Calculator Converting Chip Stacks Into Real Dollar Prize Equity ($EV).',
  },
  {
    title: '13x13 GTO Preflop Range Matrix & Position Hub',
    href: '/tools/preflop-ranges',
    badge: '100BB 6-Max GTO',
    summary: 'Interactive 169-Hand 13x13 GTO Preflop Charts Covering Raise First In (RFI), 3-Bet, And 4-Bet Frequencies.',
  },
  {
    title: 'Pot Odds, Required Equity & MDF Calculator',
    href: '/tools/pot-odds-calculator',
    badge: 'Postflop Math',
    summary: 'Instant Pot Odds Ratio, Break-Even Calling Equity Percentage, And Minimum Defense Frequency (MDF) Solver.',
  },
  {
    title: 'Bankroll Management & Risk Of Ruin Calculator',
    href: '/tools/bankroll-calculator',
    badge: 'Variance & RoR',
    summary: 'Risk Of Ruin Probability Calculator Computing Buy-In Requirements Based On Winrate And Standard Deviation.',
  },
  {
    title: 'Short-Stack Push/Fold Nash Equilibrium Chart',
    href: '/tools/push-fold-calculator',
    badge: '5BB-20BB Jam',
    summary: 'Unexploitable Short-Stack Tournament All-In Shove And Call Ranges From 5BB To 20BB With Big Blind Antes.',
  },
  {
    title: 'PKO & Mystery Bounty Chip Equity Calculator',
    href: '/tools/bounty-calculator',
    badge: 'PKO & Mystery',
    summary: 'Converts Progressive Knockout Cash Bounties And Mystery Envelopes Into Tournament Chip Equivalents.',
  },
  {
    title: 'Live & Online Winrate (BB/100 To $/Hr) Calculator',
    href: '/tools/poker-winrate-calculator',
    badge: 'Winrate & EV',
    summary: 'Translates Big-Blinds-Per-100-Hands (BB/100) Into Live Hourly Dollar Winrates And Confidence Intervals.',
  },
  {
    title: 'Multi-Way All-In Main & Side Pot Calculator',
    href: '/tools/side-pot-calculator',
    badge: 'All-In Side Pots',
    summary: 'Slices Multi-Way All-In Confrontations For Up To 9 Players Into Exact Main Pot And Sequential Side Pots.',
  },
  {
    title: 'Tournament Blind Structure & Clock Generator',
    href: '/tools/blind-structure-calculator',
    badge: 'Tournament Clock',
    summary: 'Generates Home Game And Club Tournament Blind Schedules, Big Blind Antes, And Color-Up Levels.',
  },
  {
    title: 'Stack-To-Pot Ratio (SPR) & Geometric Sizing Calculator',
    href: '/tools/spr-calculator',
    badge: 'Geometric Sizing',
    summary: 'Calculates Effective Stack-To-Pot Ratio (SPR), Commitment Zones, And 1/2/3-Street Geometric Bet Sizes.',
  },
  {
    title: 'Pot-Limit Omaha (PLO) Max Bet & Bomb Pot Calculator',
    href: '/tools/plo-bet-calculator',
    badge: 'Pot-Limit & Bomb Pot',
    summary: 'Computes Exact Pot-Limit Maximum Raises Using The 3x Plus Trail Formula And Double-Board Bomb Pot Splits.',
  },
  {
    title: 'Tournament Payout & Prize Pool Distribution Calculator',
    href: '/tools/payout-calculator',
    badge: 'TDA Prize Pool',
    summary: 'Generates TDA-Compliant Tournament Prize Pool Distributions Across Top 10%, Top 15%, And Top 20% Structures.',
  },
  {
    title: 'Live Cash Game Rake & Time-Charge Calculator',
    href: '/tools/rake-calculator',
    badge: 'Rake Economics',
    summary: 'Compares Casino Percentage Pot Drop Rake Plus Jackpot Drops Against Timed Seat Collection In BB/100.',
  },
  {
    title: 'GTO Preflop 3-Bet, Squeeze, 4-Bet & MDF Calculator',
    href: '/tools/3bet-calculator',
    badge: '3-Bet & 4-Bet Math',
    summary: 'Calculates Solver-Approved In-Position And Out-Of-Position 3-Bet, Multiway Squeeze, And 4-Bet Sizing.',
  },
  {
    title: 'Expected Value (EV) & Fold Equity Decision Calculator',
    href: '/tools/ev-calculator',
    badge: 'All-In & Bluff EV',
    summary: 'Computes Dollar And Big Blind Expected Value Across Calling, Bluffing, And Semi-Bluffing Lines.',
  },
  {
    title: 'Hand Combinatorics & Card Removal Blocker Calculator',
    href: '/tools/combinatorics-calculator',
    badge: '1,326 Combos',
    summary: 'Counts Exact Pocket Pair, Suited, And Offsuit Hand Combinations After Dead Board And Blocker Removal.',
  },
  {
    title: 'Outs, Rule Of 4 And 2 & Draw Odds Calculator',
    href: '/tools/outs-calculator',
    badge: 'Draw Math',
    summary: 'Calculates Turn, River, And Combined Flop-To-River Hit Probabilities For Any Number Of Clean Outs.',
  },
  {
    title: 'Implied Odds & Required River Payoff Calculator',
    href: '/tools/implied-odds-calculator',
    badge: 'Set-Mining & Draws',
    summary: 'Computes The Minimum Future Turn And River Value Required To Profitably Call Out-Of-Odds Flop Bets.',
  },
  {
    title: 'Multi-Table Tournament (MTT) Variance & ROI Simulator',
    href: '/tools/variance-calculator',
    badge: 'Downswing Sim',
    summary: 'Models Tournament Downswings, Confidence Intervals, And Bankroll Swings Across 1,000+ MTT Samples.',
  },
  {
    title: 'Tournament Staking, Markup & Swap Settlement Calculator',
    href: '/tools/staking-calculator',
    badge: 'Backing & Swaps',
    summary: 'Calculates Fair Markup Pricing, Investor Share Payouts, Piece Swaps, And Tax Withholding Splits.',
  },
  {
    title: 'M-Ratio, Effective Big Blinds & Tourney Zone Calculator',
    href: '/tools/m-ratio-calculator',
    badge: 'Harrington M-Zone',
    summary: 'Computes Effective Big Blinds And True Orbit Cost (M-Ratio) Taking Into Account Blinds And Antes.',
  },
  {
    title: 'Home Game Chip Breakdown & Starting Stack Calculator',
    href: '/tools/chip-distribution-calculator',
    badge: 'Chip Set Planner',
    summary: 'Builds Optimal Per-Player Chip Counts From Your Physical 300, 500, Or 1,000-Piece Poker Chip Set.',
  },
  {
    title: 'Embeddable Webmaster Poker Widgets Suite',
    href: '/tools/embeds',
    badge: 'Free HTML5 Iframes',
    summary: 'Copy-And-Paste Responsive Calculator Iframe Embeds For Poker Blogs, Study Discords, And Cardroom Sites.',
  },
];

const CATEGORIES = [
  'All Categories',
  'Interactive Calculators',
  'Hand Matchups',
  'Official Poker Rules',
  'Game Variants',
  'Regional Poker Markets',
  'Major Series Guides',
  'Research Studies',
  'Starting Hands',
  'Comparisons',
];

export default function UniversalPokerSearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All Categories');

  useEffect(() => {
    if (router.isReady && typeof router.query.q === 'string') {
      setQuery(router.query.q);
    }
  }, [router.isReady, router.query.q]);

  const handleQueryChange = (val) => {
    setQuery(val);
    if (router.isReady) {
      const nextQuery = val.trim() ? { q: val.trim() } : {};
      router.replace({ pathname: '/search', query: nextQuery }, undefined, { shallow: true });
    }
  };

  const allGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchText = (text) => !q || String(text || '').toLowerCase().includes(q);

    const calculators = CALCULATOR_ITEMS.filter(
      (item) => matchText(item.title) || matchText(item.badge) || matchText(item.summary)
    ).map((item) => ({
      title: item.title,
      href: item.href,
      badge: item.badge,
      summary: item.summary,
    }));

    const matchups = HAND_MATCHUPS.filter(
      (m) =>
        matchText(m.title) ||
        matchText(m.handA) ||
        matchText(m.handB) ||
        matchText(m.category) ||
        matchText(m.summary)
    ).map((m) => ({
      title: m.title,
      href: matchupPath(m.slug),
      badge: `${m.handA} (${m.handAEquity}%) Vs ${m.handB} (${m.handBEquity}%)`,
      summary: m.summary,
    }));

    const rules = POKER_RULES.filter(
      (r) => matchText(r.title) || matchText(r.category) || matchText(r.tdaRef) || matchText(r.summary)
    ).map((r) => ({
      title: r.title,
      href: rulePath(r.slug),
      badge: r.tdaRef,
      summary: r.summary,
    }));

    const games = POKER_GAMES.filter(
      (g) => matchText(g.name) || matchText(g.title) || matchText(g.category) || matchText(g.summary)
    ).map((g) => ({
      title: g.title,
      href: gameVariantPath(g.slug),
      badge: g.category,
      summary: g.summary,
    }));

    const markets = POKER_MARKETS.filter(
      (m) => matchText(m.regionName) || matchText(m.title) || matchText(m.stateCode) || matchText(m.summary)
    ).map((m) => ({
      title: m.title,
      href: marketGuidePath(m.slug),
      badge: `${m.stateCode} Market`,
      summary: m.summary,
    }));

    const series = SERIES_GUIDES.filter(
      (s) =>
        matchText(s.name) ||
        matchText(s.shortName) ||
        matchText(s.hostVenue) ||
        matchText(s.cityState) ||
        matchText(s.registrationStrategy)
    ).map((s) => ({
      title: s.name,
      href: seriesGuidePath(s.slug),
      badge: s.cityState,
      summary: `${s.hostVenue} (${s.buyInRange} Buy-Ins, ${s.mainEventBuyIn}).`,
    }));

    const research = RESEARCH_REPORTS.filter(
      (r) => matchText(r.title) || matchText(r.category) || matchText(r.summary)
    ).map((r) => ({
      title: r.title,
      href: researchPath(r.slug),
      badge: r.category,
      summary: r.summary,
    }));

    const handsSubset = (q ? STARTING_HANDS : STARTING_HANDS.slice(0, 24))
      .filter(
        (h) =>
          matchText(h.code) ||
          matchText(h.name) ||
          matchText(h.nickname) ||
          matchText(h.category) ||
          matchText(h.summary)
      )
      .slice(0, 24)
      .map((h) => ({
        title: `${h.code} - ${h.name} (${h.nickname})`,
        href: handPath(h.slug),
        badge: `Rank ${h.preflopRank}`,
        summary: h.summary,
      }));

    const comparisons = COMPARE_PAGES.filter(
      (c) => matchText(c.title) || matchText(c.h1) || matchText(c.description)
    ).map((c) => ({
      title: c.h1 || c.title,
      href: comparePath(c.slug),
      badge: c.kind === 'best-of' ? 'Best-Of Guide' : 'Side-By-Side Comparison',
      summary: c.description,
    }));

    return [
      { category: 'Interactive Calculators', items: calculators },
      { category: 'Hand Matchups', items: matchups },
      { category: 'Official Poker Rules', items: rules },
      { category: 'Game Variants', items: games },
      { category: 'Regional Poker Markets', items: markets },
      { category: 'Major Series Guides', items: series },
      { category: 'Research Studies', items: research },
      { category: 'Starting Hands', items: handsSubset },
      { category: 'Comparisons', items: comparisons },
    ];
  }, [query]);

  const visibleGroups = useMemo(() => {
    if (activeCategory === 'All Categories') {
      return allGroups.filter((g) => g.items.length > 0);
    }
    return allGroups.filter((g) => g.category === activeCategory);
  }, [allGroups, activeCategory]);

  const totalMatches = useMemo(
    () => visibleGroups.reduce((sum, g) => sum + g.items.length, 0),
    [visibleGroups]
  );

  const canonicalUrl = 'https://smarter.poker/search';

  const jsonLd = [
    {
      '@type': 'SearchResultsPage',
      '@id': `${canonicalUrl}#search`,
      name: 'Universal Poker Search & Command Directory',
      description:
        'Search Across 24 Interactive Poker Calculators, 169 Starting Hands, 25 Hand Matchups, 30 Official Rules, 15 Game Variants, And 15 Research Studies.',
      url: canonicalUrl,
      inLanguage: 'en-US',
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${canonicalUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Universal Poker Search', item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Universal Poker Search And Command Directory"
        description="Search Across 24 Interactive Poker Calculators, 169 Starting Hands, 25 Hand Matchups, 30 Official Rules, 15 Game Variants, And 15 Research Studies."
        canonical="/search"
        jsonLd={jsonLd}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': jsonLd,
          }),
        }}
      />

      <UniversalHeader pageDepth={1} />

      <main style={styles.container}>
        <nav aria-label="Breadcrumb" style={styles.breadcrumbs}>
          <Link href="/" style={styles.crumbLink}>
            Smarter.Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>Universal Poker Search &amp; Command Directory</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>UNIFIED KNOWLEDGE GRAPH SEARCH</span>
            <span style={styles.emeraldBadge}>300+ INDEXED CALCULATORS, HANDS, RULES &amp; GUIDES</span>
          </div>

          <h1 style={styles.h1}>
            Universal Poker Search &amp; Command Directory
          </h1>

          <p style={styles.lead}>
            Instantly Search Across <strong>24 Interactive Poker Calculators</strong>, <strong>169 GTO Starting Hands</strong>, <strong>25 Head-To-Head Matchups</strong>, <strong>30 Official TDA &amp; RROP Rules</strong>, <strong>15 Game Variants</strong>, <strong>12 US Regional Markets</strong>, <strong>10 Major Series Guides</strong>, And <strong>15 Empirical Research Studies</strong>.
          </p>

          <div style={styles.searchBoxWrap}>
            <label htmlFor="universal-search-input" style={styles.searchLabel}>
              Enter Hand Code, Rule, Calculator, Venue, Or Strategy Topic
            </label>
            <input
              id="universal-search-input"
              type="search"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Search ICM, AA Vs KK, Showdown Order, PLO, Las Vegas, WSOP, Rake..."
              style={styles.searchInput}
            />
          </div>

          <div style={styles.categoryPills}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                style={activeCategory === cat ? styles.pillActive : styles.pill}
              >
                {cat}
              </button>
            ))}
          </div>
        </header>

        <div style={styles.resultsSummaryBar}>
          <span style={styles.resultsCountText}>
            Showing {totalMatches} Indexed Resources Across {visibleGroups.length} Categories
          </span>
          {query && (
            <button
              type="button"
              onClick={() => handleQueryChange('')}
              style={styles.clearBtn}
            >
              Clear Filter
            </button>
          )}
        </div>

        {visibleGroups.map((group) => (
          <section key={group.category} style={styles.groupPlate}>
            <div style={styles.groupHeaderRow}>
              <h2 style={styles.h2}>{group.category}</h2>
              <span style={styles.groupBadge}>{group.items.length} Results</span>
            </div>

            <div style={styles.cardGrid}>
              {group.items.map((item) => (
                <Link key={item.href} href={item.href} style={styles.resultCard}>
                  <div style={styles.cardMetaRow}>
                    <span style={styles.itemBadge}>{item.badge}</span>
                    <span style={styles.itemPath}>{item.href}</span>
                  </div>
                  <h3 style={styles.h3}>{item.title}</h3>
                  <p style={styles.itemSummary}>{item.summary}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <CitationBacklinkBox
          title="Smarter.Poker Universal Poker Search & Command Directory"
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel="Master Knowledge Index"
          badgeValue="Smarter.Poker Directory"
          summary="Search Across 24 Interactive Poker Calculators, 169 Starting Hands, 25 Hand Matchups, 30 Official Rules, 15 Game Variants, And 15 Research Studies."
          publishedYear="2026"
          slug="smarter-poker-universal-search"
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
    marginBottom: '20px',
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
    margin: '0 0 12px',
    lineHeight: 1.2,
  },
  lead: {
    fontSize: '15.5px',
    lineHeight: 1.65,
    color: '#cbd5e1',
    margin: '0 0 20px',
  },
  searchBoxWrap: {
    marginBottom: '16px',
  },
  searchLabel: {
    display: 'block',
    fontSize: '12.5px',
    fontWeight: 700,
    color: '#00d4ff',
    marginBottom: '6px',
  },
  searchInput: {
    width: '100%',
    backgroundColor: '#0a0f18',
    border: '2px solid #00d4ff',
    borderRadius: '6px',
    padding: '13px 16px',
    color: '#f8fafc',
    fontSize: '15px',
    boxSizing: 'border-box',
  },
  categoryPills: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  pill: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    color: '#cbd5e1',
    fontSize: '12.5px',
    fontWeight: 600,
    padding: '7px 13px',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  pillActive: {
    backgroundColor: '#00d4ff',
    border: '1px solid #00d4ff',
    color: '#0a0f18',
    fontSize: '12.5px',
    fontWeight: 700,
    padding: '7px 13px',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  resultsSummaryBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '18px',
    padding: '0 4px',
  },
  resultsCountText: {
    fontSize: '13.5px',
    fontWeight: 700,
    color: '#10b981',
  },
  clearBtn: {
    backgroundColor: '#111a2a',
    border: '1px solid #00d4ff',
    color: '#00d4ff',
    fontSize: '12px',
    fontWeight: 700,
    padding: '5px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  groupPlate: {
    backgroundColor: '#111a2a',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '22px',
    marginBottom: '24px',
  },
  groupHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #1e293b',
    paddingBottom: '10px',
    marginBottom: '16px',
  },
  h2: {
    fontSize: '20px',
    fontWeight: 800,
    color: '#f8fafc',
    margin: 0,
  },
  groupBadge: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#00d4ff',
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '14px',
  },
  resultCard: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '16px',
    textDecoration: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  cardMetaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
  },
  itemBadge: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#10b981',
  },
  itemPath: {
    fontSize: '11px',
    color: '#64748b',
    fontFamily: 'monospace',
  },
  h3: {
    fontSize: '15.5px',
    fontWeight: 700,
    color: '#00d4ff',
    margin: 0,
    lineHeight: 1.35,
  },
  itemSummary: {
    fontSize: '13px',
    lineHeight: 1.55,
    color: '#cbd5e1',
    margin: 0,
  },
};
