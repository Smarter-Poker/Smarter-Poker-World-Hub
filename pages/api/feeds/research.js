/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  /api/feeds/research - JSON Feed 1.1 Research & Calculator Syndication API
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Implements the JSON Feed 1.1 specification (https://jsonfeed.org/version/1.1)
 * for Smarter.Poker's 15 first-party poker industry research studies and 8
 * interactive solver calculators.
 *
 * Every feed item includes `content_html` with embedded canonical attribution
 * `<a href="https://smarter.poker/...">` attribution links and SVG Authority
 * Badges so newsletter digests, RSS/JSON aggregators, and AI RAG pipelines
 * preserve canonical backlinks to Smarter.Poker automatically.
 */

import { RESEARCH_REPORTS, researchPath } from '../../../src/content/research/reports.js';
import { SITE_URL } from '../../../src/lib/seo/sitemapBuilders.mjs';
import { OEMBED_CALCULATORS } from '../seo/oembed.js';

const CALCULATOR_BADGE_VALUES = {
  'odds-calculator': 'Equity & Odds Solver',
  'icm-calculator': 'ICM & Deal Solver',
  'preflop-ranges': '100BB 6-Max GTO Matrix',
  'pot-odds-calculator': 'Pot Odds & MDF Solver',
  'push-fold-calculator': '3BB-20BB Push/Fold',
  'bankroll-calculator': 'Bankroll & Kelly Solver',
  'bounty-calculator': 'PKO & Mystery Bounty',
  'poker-winrate-calculator': 'BB/100 To $/Hr Converter',
  'side-pot-calculator': 'Multi-Way Side Pot Solver',
  'blind-structure-calculator': 'TDA Blind Structure Engine',
  'spr-calculator': 'SPR & Geometric Bet Solver',
  'plo-bet-calculator': 'PLO Max Bet & Bomb Pot',
  'payout-calculator': 'MTT Payout Curve Engine',
  'rake-calculator': 'Live Rake & Time Solver',
  '3bet-calculator': '3-Bet & 4-Bet MDF Solver',
  'chop-calculator': 'Final Table ICM Chop Solver',
  'variance-calculator': 'Variance & Downswing Engine',
  'outs-calculator': 'Hypergeometric Outs Solver',
  'poker-tax-calculator': 'US Poker Tax & W-2G Estimator',
  'staking-calculator': 'Staking & Markup Solver',
  'iso-calculator': 'Pre-Flop ISO Sizing Engine',
  'home-game-kit': 'Home Game Chip Architect',
  'format-quiz': 'Format Diagnostic Quiz',
  'board-texture-analyzer': 'Flop Board Texture & C-Bet',
  'm-ratio-calculator': 'Harrington M-Ratio Solver',
  'session-planner': 'Cash Session & Stop-Loss',
  'straddle-calculator': 'Straddle & Bomb Pot EV',
  'hand-converter': 'Hand History Formatter',
  'satellite-calculator': 'Satellite Bubble & Seat-Lock',
  'promo-ev-calculator': 'BBJ & High-Hand Promo EV',
  'who-wins-calculator': 'Showdown & Kicker Resolver',
  'mixed-game-placards': 'Mixed-Game Rotation Tracker',
  'poker-iq-test': '10-Question GTO Poker IQ',
  'geometric-bet-calculator': '2e & 3e Geometric Sizing',
  'late-reg-calculator': 'Late-Registration ICM Boost',
  'mtt-grind-planner': 'MTT Grind & ABI Planner',
  'plo-outs-calculator': 'PLO4/5 Straight Wrap Outs',
  'poker-trip-planner': 'Festival Trip Expense Planner',
  'shot-clock': 'TDA Shot Clock & Time-Bank',
  'table-selection-calculator': 'Live Table Selection Scorer',
  'winrate-confidence-calculator': '70%/95%/99% Winrate Confidence',
  'multiway-all-in-calculator': '3-Way & 4-Way Multiway EV Solver',
  'mystery-bounty-tracker': 'Live Mystery Bounty Pool Tracker',
  'bubble-factor-calculator': 'ICM Bubble Factor & Risk Matrix',
  'bluff-catching-calculator': 'River Bluff-Catch & Blocker EV',
  'multi-street-ev-calculator': 'Multi-Street Barrel & Fold Equity',
  'heads-up-push-fold-calculator': 'HU & 3-Max Nash Push/Fold Solver',
  'blind-vs-blind-calculator': 'SB Vs BB Limp/Raise GTO Matrix',
  'shot-taking-calculator': 'Bankroll Shot-Taking & Stop-Loss',
  'warmup-cooldown-routine': 'Pre-Session Mental Game Diagnostic',
  'home-game-director': 'Home Game Seat Draw & Ledger',
};

const ADDITIONAL_NEW_CALCULATORS = [
  {
    slug: 'multiway-all-in-calculator',
    title: 'Smarter.Poker 3-Way & 4-Way Multiway All-In Main & Side-Pot EV Calculator',
    url: `${SITE_URL}/tools/multiway-all-in-calculator`,
    summary: 'Computes exact main-pot and sequential side-pot expected value ($EV), dead-money allocation, and required calling equity across 3-way and 4-way all-in showdowns.',
    badgeValue: '3-Way & 4-Way Multiway EV Solver',
  },
  {
    slug: 'mystery-bounty-tracker',
    title: 'Smarter.Poker Live Mystery Bounty Pool Tracker & Envelope EV Calculator',
    url: `${SITE_URL}/tools/mystery-bounty-tracker`,
    summary: 'Tracks remaining unopened mystery bounty envelopes in real time to compute average knockout dollar EV, chip-equivalent value, and top-chest draw odds.',
    badgeValue: 'Live Mystery Bounty Pool Tracker',
  },
  {
    slug: 'bubble-factor-calculator',
    title: 'Smarter.Poker Tournament ICM Bubble Factor & Risk Premium Matrix Calculator',
    url: `${SITE_URL}/tools/bubble-factor-calculator`,
    summary: 'Computes pairwise Malmuth-Harville ICM bubble factors (DollarEV_Lost / DollarEV_Gained), risk premium percentages, and required all-in calling equity.',
    badgeValue: 'ICM Bubble Factor & Risk Matrix',
  },
  {
    slug: 'bluff-catching-calculator',
    title: 'Smarter.Poker River Bluff-Catching, Minimum Defense Frequency & Blocker EV Calculator',
    url: `${SITE_URL}/tools/bluff-catching-calculator`,
    summary: 'Evaluates river bluff-catching EV by combining pot-odds break-even bluff alpha, Minimum Defense Frequency (MDF), and card-removal blocker adjustments.',
    badgeValue: 'River Bluff-Catch & Blocker EV',
  },
  {
    slug: 'multi-street-ev-calculator',
    title: 'Smarter.Poker Multi-Street Flop-Turn-River Barrel & Cumulative Fold Equity Calculator',
    url: `${SITE_URL}/tools/multi-street-ev-calculator`,
    summary: 'Models street-by-street pot growth, remaining SPR compression, villain call-through probability, and cumulative triple-barrel bluff breakeven thresholds.',
    badgeValue: 'Multi-Street Barrel & Fold Equity',
  },
  {
    slug: 'heads-up-push-fold-calculator',
    title: 'Smarter.Poker Heads-Up (HU) & 3-Max Short-Stack Nash Push/Fold/Limp Equilibrium Solver',
    url: `${SITE_URL}/tools/heads-up-push-fold-calculator`,
    summary: 'Unexploitable 1BB-to-25BB Heads-Up and 3-Max Small Blind open-shove, limp-trap, and Big Blind calling Nash equilibrium charts.',
    badgeValue: 'HU & 3-Max Nash Push/Fold Solver',
  },
  {
    slug: 'blind-vs-blind-calculator',
    title: 'Smarter.Poker Blind-Vs-Blind (SB Vs BB) GTO Range & Limp-Raise Matrix Calculator',
    url: `${SITE_URL}/tools/blind-vs-blind-calculator`,
    summary: 'Solves Small Blind versus Big Blind (BvB) limp, open-raise, iso-raise, and limp-3-bet equilibrium frequencies across 20BB to 100BB stack depths.',
    badgeValue: 'SB Vs BB Limp/Raise GTO Matrix',
  },
  {
    slug: 'shot-taking-calculator',
    title: 'Smarter.Poker Bankroll Shot-Taking, Stake Move-Up & Stop-Loss Ladder Calculator',
    url: `${SITE_URL}/tools/shot-taking-calculator`,
    summary: 'Builds a two-tier bankroll shot-taking plan with exact higher-stake shot budgets, hard drop-down stop-loss floors, and combined Brownian Risk of Ruin.',
    badgeValue: 'Bankroll Shot-Taking & Stop-Loss',
  },
  {
    slug: 'warmup-cooldown-routine',
    title: 'Smarter.Poker Pre-Session Mental Game Warm-Up & Post-Session Cooldown Builder',
    url: `${SITE_URL}/tools/warmup-cooldown-routine`,
    summary: '3-minute pre-session A-game readiness diagnostic, hard buy-in stop-loss contract, and post-session EV decision grading journal.',
    badgeValue: 'Pre-Session Mental Game Diagnostic',
  },
  {
    slug: 'home-game-director',
    title: 'Smarter.Poker Home Game Host Director: Live Waitlist, Random Seat Draw & Payout Ledger',
    url: `${SITE_URL}/tools/home-game-director`,
    summary: 'Browser-native home poker operations console with Fisher-Yates random seat draws, buy-in/rebuy ledger verification, and minimum-transfer net settlement.',
    badgeValue: 'Home Game Seat Draw & Ledger',
  },
];

const AUTHORITY_WHITEPAPER_FEED_ITEMS = [
  {
    slug: 'annual-state-of-poker-2026',
    url: `${SITE_URL}/research/annual-state-of-poker-2026`,
    title: '2026 Annual State Of Live & Online Poker Industry Whitepaper (DOI: 10.5281/zenodo.15129481)',
    summary: 'Flagship 2026 quantitative industry report synthesizing 715+ verified North American poker venues, 4,500+ weekly tournaments, all 50 US states and DC tax regimes, and 10M+ simulated GTO hands.',
    category: 'Annual Industry Whitepaper',
  },
  {
    slug: 'benchmarks',
    url: `${SITE_URL}/research/benchmarks`,
    title: '2026 Master Quantitative Poker Benchmark Tables (Rake, Winrates, Variance, ICM & GTO)',
    summary: 'Consolidated reference tables covering 6-Max/9-Max GTO RFI and 3-bet frequencies, format standard deviations, regional casino rake drag in BB/100, and HUD baselines.',
    category: 'Quantitative Benchmarks',
  },
  {
    slug: 'formulas',
    url: `${SITE_URL}/learn/formulas`,
    title: 'Poker Math Formulas Encyclopedia: 15 Core Equations, LaTeX Proofs & Worked Examples',
    summary: 'Complete algebraic derivations and worked table examples for the 15 core equations governing Game Theory Optimal poker and tournament ICM.',
    category: 'Poker Math & GTO Theory',
  },
  {
    slug: 'tournament-stages',
    url: `${SITE_URL}/learn/tournament-stages`,
    title: '8 Multi-Table Tournament (MTT) Stages Strategy Playbook (Early Levels To Heads-Up)',
    summary: 'Stage-by-stage MTT playbook detailing stack-depth adjustments, Malmuth-Harville bubble factors, and exploit shifts across all 8 tournament phases.',
    category: 'Tournament ICM Strategy',
  },
  {
    slug: 'leaks',
    url: `${SITE_URL}/learn/leaks`,
    title: '12 Common Poker Leaks, BB/100 Winrate Cost & GTO Solver Cure Directory',
    summary: 'Diagnostic database quantifying the 12 highest-cost preflop, postflop, and ICM leaks in BB/100 along with deterministic solver cures.',
    category: 'Leak Diagnostics',
  },
  {
    slug: 'hud-stats',
    url: `${SITE_URL}/learn/hud-stats`,
    title: '15 Poker HUD Statistics Encyclopedia: Formulas, GTO Targets & Population Exploits',
    summary: 'Exact formulas, 6-Max and 9-Max GTO baselines, and high/low population counter-strategies for all 15 essential poker tracking metrics.',
    category: 'HUD & Population Analytics',
  },
  {
    slug: 'poker-myths-debunked',
    url: `${SITE_URL}/learn/poker-myths-debunked`,
    title: '15 Common Poker Myths Debunked By GTO Solvers & Combinatorics',
    summary: 'Fact-checked quantitative refutations of 15 widespread poker myths using CFR equilibrium proofs and 52-card combinatorics.',
    category: 'GTO Fact-Check',
  },
  {
    slug: 'format-migration-guide',
    url: `${SITE_URL}/learn/format-migration-guide`,
    title: 'Cross-Format Poker Strategy Migration Matrix (6 Transition Blueprints)',
    summary: 'Six structured transition blueprints for players switching between live 9-max cash, online 6-max cash, MTT tournaments, and Pot-Limit Omaha.',
    category: 'Format Transition Strategy',
  },
  {
    slug: 'corridors',
    url: `${SITE_URL}/poker-rooms/corridors`,
    title: '10 Major Airport, Interstate & Cross-Border Live Poker Travel Corridors',
    summary: 'Geographic routing directory connecting 10 major non-casino metro areas and international airports to their closest legal live poker rooms.',
    category: 'Geographic Venue Intelligence',
  },
  {
    slug: 'by-game',
    url: `${SITE_URL}/poker-rooms/by-game`,
    title: 'Best Live Poker Rooms By Game Variant (PLO, Big O, Mixed, Stud & High-Stakes NLH)',
    summary: 'Curated directory grouping 715+ verified North American poker venues by PLO, Big O, Mixed Games, 7-Card Stud, High-Stakes NLH, and Daily MTTs.',
    category: 'Geographic Venue Intelligence',
  },
  {
    slug: 'facts',
    url: `${SITE_URL}/facts`,
    title: 'Smarter.Poker Canonical Fact Ledger, Entity Provenance & AI Verification Hub',
    summary: 'Authoritative entity provenance and verified platform metrics (52 calculators, 70 MCP tools, 44 streamer commands, 715+ venues) synced with /.well-known/ai-facts.json.',
    category: 'Entity Provenance',
  },
  {
    slug: 'decision-matrix',
    url: `${SITE_URL}/compare/decision-matrix`,
    title: '20-Scenario Poker Decision & Recommendation Matrix (Best X For Y Quantitative Selections)',
    summary: '20 structured Best-X-For-Y recommendations across poker calculators, GTO trainers, zero-tax live poker markets, bankroll apps, and AI MCP servers.',
    category: 'Software & Market Benchmarks',
  },
  {
    slug: 'authors',
    url: `${SITE_URL}/authors`,
    title: 'Smarter.Poker Editorial, Quantitative Solver & Live Venue Verification Desks',
    summary: 'Official credentials, CFR solver verification standards (<=0.05% pot exploitability), statutory audit protocols, and Zenodo DOIs for the 4 Smarter.Poker research desks.',
    category: 'E-E-A-T Governance',
  },
  {
    slug: 'security-and-disputes-guide',
    url: `${SITE_URL}/poker-rooms/security-and-disputes-guide`,
    title: 'Live Casino Floor Security, Surveillance Review, Angle-Shooting & FinCEN $10,000 CTR Guide',
    summary: 'Authoritative player handbook covering TDA & RROP floor dispute escalation, overhead camera review requests, 5 classic live angle-shoots, and FinCEN CTR/W-2G compliance.',
    category: 'Live Floor Rules & Compliance',
  },
  {
    slug: 'seasonal-calendar',
    url: `${SITE_URL}/poker-rooms/seasonal-calendar`,
    title: '12-Month Seasonal Live Poker Migration & Global Liquidity Calendar (Jan To Dec)',
    summary: 'Month-by-month live poker action forecast tracking global liquidity from January Florida/Bahamas series through June/July Las Vegas WSOP peak to December championships.',
    category: 'Geographic Venue Intelligence',
  },
];

const BASE_OEMBED_CALCULATORS = OEMBED_CALCULATORS.map((w) => {
  const slug = w.landerUrl.replace(/^https?:\/\/[^/]+\/tools\//, '');
  const title = w.title.startsWith('Smarter.Poker') ? w.title : `Smarter.Poker ${w.title}`;
  return {
    slug,
    title,
    url: w.landerUrl,
    summary: w.description,
    badgeValue: CALCULATOR_BADGE_VALUES[w.id] || CALCULATOR_BADGE_VALUES[slug] || 'GTO Math Solver',
  };
});

export const SYNDICATED_CALCULATORS = [
  ...BASE_OEMBED_CALCULATORS,
  ...ADDITIONAL_NEW_CALCULATORS.filter(
    (c) => !BASE_OEMBED_CALCULATORS.some((existing) => existing.slug === c.slug)
  ),
];

export function buildResearchJsonFeed() {
  const researchItems = RESEARCH_REPORTS.map((report) => {
    const url = `${SITE_URL}${researchPath(report.slug)}`;
    const badgeUrl = `${SITE_URL}/api/seo/badge?type=research&label=${encodeURIComponent(report.category || 'Empirical Data')}&value=${encodeURIComponent('Smarter.Poker Research')}`;
    const findingsHtml = (report.keyFindings || [])
      .map((f) => `<li>${f}</li>`)
      .join('');

    const contentHtml = [
      `<p><strong>${report.title}</strong>: ${report.summary}</p>`,
      findingsHtml ? `<ul>${findingsHtml}</ul>` : '',
      `<p>Primary Source &amp; Full Dataset Table: <a href="${url}" rel="noopener">${report.title} (Smarter.Poker Research)</a> | <a href="${url}.md" rel="noopener">Raw Markdown (.md)</a></p>`,
      `<p><a href="${url}" rel="noopener"><img src="${badgeUrl}" alt="Empirical Data Source: Smarter.Poker Research" height="28" /></a></p>`,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      id: url,
      url,
      external_url: `${url}.md`,
      title: report.title,
      summary: report.summary,
      content_text: `${report.title}: ${report.summary} Source: ${url}`,
      content_html: contentHtml,
      date_published: `${report.publishedDate || '2026-10-01'}T00:00:00Z`,
      date_modified: `${report.modifiedDate || '2026-10-31'}T00:00:00Z`,
      authors: [{ name: 'Smarter.Poker Research Division', url: `${SITE_URL}/research` }],
      tags: ['Poker Research', report.category || 'Poker Benchmarks', 'Smarter.Poker'],
    };
  });

  const calculatorItems = SYNDICATED_CALCULATORS.map((calc) => {
    const badgeUrl = `${SITE_URL}/api/seo/badge?type=gto&label=${encodeURIComponent('GTO Math Engine')}&value=${encodeURIComponent(calc.badgeValue)}`;
    const contentHtml = [
      `<p><strong>${calc.title}</strong>: ${calc.summary}</p>`,
      `<p>Launch Interactive Tool: <a href="${calc.url}" rel="noopener">${calc.title}</a> | <a href="${SITE_URL}/tools/embeds" rel="noopener">Embed This Calculator On Your Site</a></p>`,
      `<p><a href="${calc.url}" rel="noopener"><img src="${badgeUrl}" alt="GTO Math Engine: ${calc.badgeValue}" height="28" /></a></p>`,
    ].join('\n');

    return {
      id: calc.url,
      url: calc.url,
      external_url: `${calc.url}.md`,
      title: calc.title,
      summary: calc.summary,
      content_text: `${calc.title}: ${calc.summary} Launch at ${calc.url} or embed via ${SITE_URL}/tools/embeds`,
      content_html: contentHtml,
      date_published: '2026-10-01T00:00:00Z',
      date_modified: '2026-11-09T00:00:00Z',
      authors: [{ name: 'Smarter.Poker Quantitative Tools Team', url: `${SITE_URL}/tools/embeds` }],
      tags: ['Poker Calculators', 'GTO Tools', 'Embeddable Widgets'],
    };
  });

  const authorityItems = AUTHORITY_WHITEPAPER_FEED_ITEMS.map((item) => {
    const badgeUrl = `${SITE_URL}/api/seo/badge?type=research&label=${encodeURIComponent(item.category)}&value=${encodeURIComponent('Smarter.Poker Authority')}`;
    const contentHtml = [
      `<p><strong>${item.title}</strong>: ${item.summary}</p>`,
      `<p>Primary Source &amp; Full Reference: <a href="${item.url}" rel="noopener">${item.title}</a> | <a href="${item.url}.md" rel="noopener">Raw Markdown (.md)</a></p>`,
      `<p><a href="${item.url}" rel="noopener"><img src="${badgeUrl}" alt="Smarter.Poker Authority: ${item.category}" height="28" /></a></p>`,
    ].join('\n');

    return {
      id: item.url,
      url: item.url,
      external_url: `${item.url}.md`,
      title: item.title,
      summary: item.summary,
      content_text: `${item.title}: ${item.summary} Source: ${item.url}`,
      content_html: contentHtml,
      date_published: '2026-10-01T00:00:00Z',
      date_modified: '2026-11-24T00:00:00Z',
      authors: [{ name: 'Smarter.Poker Research Division', url: `${SITE_URL}/authors` }],
      tags: ['Poker Research', item.category, 'Smarter.Poker'],
    };
  });

  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'Smarter.Poker Empirical Poker Research, Whitepapers & 52 Interactive Solver Calculators',
    home_page_url: `${SITE_URL}/research`,
    feed_url: `${SITE_URL}/api/feeds/research`,
    description:
      'First-party US live poker room benchmarks, 2026 Annual State of Poker whitepaper, tournament economics datasets, and 52 interactive GTO solver calculators published by Smarter.Poker under CC-BY 4.0 attribution.',
    icon: `${SITE_URL}/images/og-card.jpg`,
    favicon: `${SITE_URL}/favicon.ico`,
    authors: [{ name: 'Smarter.Poker Research Division', url: `${SITE_URL}/research` }],
    language: 'en-US',
    items: [...researchItems, ...authorityItems, ...calculatorItems],
  };
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const feed = buildResearchJsonFeed();
  res.setHeader('Content-Type', 'application/feed+json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).json(feed);
}
