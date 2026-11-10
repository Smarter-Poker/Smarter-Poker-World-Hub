/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  /api/feeds/research - JSON Feed 1.1 Research & Calculator Syndication API
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Implements the JSON Feed 1.1 specification (https://jsonfeed.org/version/1.1)
 * for Smarter.Poker's 15 first-party poker industry research studies and 8
 * interactive solver calculators.
 *
 * Every feed item includes `content_html` with embedded canonical dofollow
 * `<a href="https://smarter.poker/...">` attribution links and SVG Authority
 * Badges so newsletter digests, RSS/JSON aggregators, and AI RAG pipelines
 * preserve canonical backlinks to Smarter.Poker automatically.
 */

import { RESEARCH_REPORTS, researchPath } from '../../../src/content/research/reports.js';
import { SITE_URL } from '../../../src/lib/seo/sitemapBuilders.mjs';

const SYNDICATED_CALCULATORS = [
  {
    slug: 'poker-odds-calculator',
    title: 'Smarter.Poker Multiway Poker Odds & Equity Calculator',
    url: `${SITE_URL}/tools/poker-odds-calculator`,
    summary: 'Calculate Exact Texas Holdem And Omaha Hand Equity, Outs, And Pot Odds Instantly In Browser.',
    badgeValue: 'Equity & Odds Solver',
  },
  {
    slug: 'icm-calculator',
    title: 'Smarter.Poker Malmuth-Harville Tournament ICM Calculator',
    url: `${SITE_URL}/tools/icm-calculator`,
    summary: 'Compute Independent Chip Model Tournament Equity, Bubble Factors, And Final Table Deal Numbers.',
    badgeValue: 'ICM & Deal Solver',
  },
  {
    slug: 'preflop-ranges',
    title: 'Smarter.Poker 13x13 GTO Preflop Range Matrix (100BB 6-Max)',
    url: `${SITE_URL}/tools/preflop-ranges`,
    summary: 'Interactive 169-Hand GTO Opening, 3-Bet, And Defense Range Charts Across All 6-Max Positions.',
    badgeValue: '100BB 6-Max GTO Matrix',
  },
  {
    slug: 'pot-odds-calculator',
    title: 'Smarter.Poker Pot Odds, Required Equity & MDF Calculator',
    url: `${SITE_URL}/tools/pot-odds-calculator`,
    summary: 'Calculate Pot Odds Ratios, Break-Even Calling Equity, Minimum Defense Frequency (MDF), And Draw Outs.',
    badgeValue: 'Pot Odds & MDF Solver',
  },
  {
    slug: 'push-fold-calculator',
    title: 'Smarter.Poker Short-Stack Nash Push/Fold Chart Calculator (3BB-20BB)',
    url: `${SITE_URL}/tools/push-fold-calculator`,
    summary: 'Interactive 3BB To 20BB Nash Equilibrium Open-Shove And Big-Blind Call Ranges With Sklansky-Chubukov Thresholds.',
    badgeValue: '3BB-20BB Push/Fold',
  },
  {
    slug: 'bankroll-calculator',
    title: 'Smarter.Poker Bankroll Management & Risk Of Ruin Calculator',
    url: `${SITE_URL}/tools/bankroll-calculator`,
    summary: 'Compute Risk Of Ruin, Standard Deviation Variance Confidence Intervals, And Kelly Criterion Bankroll Sizing.',
    badgeValue: 'Bankroll & Kelly Solver',
  },
  {
    slug: 'bounty-calculator',
    title: 'Smarter.Poker PKO & Mystery Bounty Chip Equity Calculator',
    url: `${SITE_URL}/tools/bounty-calculator`,
    summary: 'Convert Progressive Knockout (PKO) And Mystery Bounty Envelopes Into Exact Tournament Chip Equivalents.',
    badgeValue: 'PKO & Mystery Bounty',
  },
  {
    slug: 'poker-winrate-calculator',
    title: 'Smarter.Poker Winrate (BB/100 To $/Hr) & Volume Variance Calculator',
    url: `${SITE_URL}/tools/poker-winrate-calculator`,
    summary: 'Convert Live And Online Poker Winrates Between BB/100 Hands And Hourly Dollar Winrates ($/Hr).',
    badgeValue: 'BB/100 To $/Hr Converter',
  },
  {
    slug: 'side-pot-calculator',
    title: 'Smarter.Poker Multi-Way All-In Main & Side Pot Calculator',
    url: `${SITE_URL}/tools/side-pot-calculator`,
    summary: 'Calculate Multi-Way All-In Main Pots, Side Pots, Dead Money, And Uncalled Bet Returns For 2 To 9 Players.',
    badgeValue: 'Multi-Way Side Pot Solver',
  },
  {
    slug: 'blind-structure-calculator',
    title: 'Smarter.Poker Tournament Blind Structure & Chip Distribution Generator',
    url: `${SITE_URL}/tools/blind-structure-calculator`,
    summary: 'Generate TDA-Compliant Tournament Blind Schedules, Color-Up Breaks, And Starting Chip Denomination Breakdowns.',
    badgeValue: 'TDA Blind Structure Engine',
  },
  {
    slug: 'spr-calculator',
    title: 'Smarter.Poker Stack-To-Pot Ratio (SPR) & Geometric Bet Sizing Calculator',
    url: `${SITE_URL}/tools/spr-calculator`,
    summary: 'Compute Exact Flop SPR, Commitment Thresholds, And 1-Street, 2-Street, And 3-Street Geometric Bet Sizing Percentages.',
    badgeValue: 'SPR & Geometric Bet Solver',
  },
  {
    slug: 'plo-bet-calculator',
    title: 'Smarter.Poker Pot-Limit Omaha (PLO) Max Bet & Double-Board Bomb Pot Calculator',
    url: `${SITE_URL}/tools/plo-bet-calculator`,
    summary: 'Calculate Exact Pot-Limit Maximum Raise Totals (3x + Trail + Pot) And Double-Board Bomb Pot Split Equity.',
    badgeValue: 'PLO Max Bet & Bomb Pot',
  },
  {
    slug: 'payout-calculator',
    title: 'Smarter.Poker Tournament Payout & Prize Pool Distribution Calculator',
    url: `${SITE_URL}/tools/payout-calculator`,
    summary: 'Generate WSOP And TDA Power-Law Tournament Payout Schedules, Pay Jumps, And Bubble Multipliers.',
    badgeValue: 'MTT Payout Curve Engine',
  },
  {
    slug: 'rake-calculator',
    title: 'Smarter.Poker Live Cash Game Rake, Promo Drop & Time-Charge Calculator',
    url: `${SITE_URL}/tools/rake-calculator`,
    summary: 'Compare Percentage Pot Rake, California Flat Flop Drop, And Texas Time-Charge Impact On Hourly Winrate.',
    badgeValue: 'Live Rake & Time Solver',
  },
  {
    slug: '3bet-calculator',
    title: 'Smarter.Poker Preflop 3-Bet, 4-Bet Sizing & Minimum Defense Calculator',
    url: `${SITE_URL}/tools/3bet-calculator`,
    summary: 'Calculate Solver-Backed IP/OOP 3-Bet And 4-Bet Sizing, Break-Even Fold Equity, And Value-To-Bluff Ratios.',
    badgeValue: '3-Bet & 4-Bet MDF Solver',
  },
  {
    slug: 'chop-calculator',
    title: 'Smarter.Poker Final Table Deal & ICM Chop Calculator',
    url: `${SITE_URL}/tools/chop-calculator`,
    summary: 'Compare Exact Malmuth-Harville ICM Chop, Linear Chip Chop, And Hybrid Save-Amount Final Table Deal Payouts.',
    badgeValue: 'Final Table ICM Chop Solver',
  },
  {
    slug: 'variance-calculator',
    title: 'Smarter.Poker Variance, Downswing & Confidence Interval Simulator',
    url: `${SITE_URL}/tools/variance-calculator`,
    summary: 'Calculate Poker Winrate Confidence Bands, Probability Of Loss, And Expected Downswings In Buy-Ins.',
    badgeValue: 'Variance & Downswing Engine',
  },
  {
    slug: 'outs-calculator',
    title: 'Smarter.Poker Postflop Poker Outs & Draw Probability Calculator',
    url: `${SITE_URL}/tools/outs-calculator`,
    summary: 'Compute Exact Hypergeometric Turn, River, And Flop-To-River Draw Equity Alongside Rule Of 4 And 2 Comparisons.',
    badgeValue: 'Hypergeometric Outs Solver',
  },
  {
    slug: 'poker-tax-calculator',
    title: 'Smarter.Poker US Poker Tax, Form W-2G & Session Deduction Calculator',
    url: `${SITE_URL}/tools/poker-tax-calculator`,
    summary: 'Estimate IRS Form W-2G Tournament Thresholds ($5,000) And Recreational Vs Professional Session Tax Deductions.',
    badgeValue: 'US Poker Tax & W-2G Estimator',
  },
  {
    slug: 'staking-calculator',
    title: 'Smarter.Poker Tournament Staking, Markup & Investor Split Calculator',
    url: `${SITE_URL}/tools/staking-calculator`,
    summary: 'Calculate Staking Markup Breakeven ROI, Investor Share Costs, And Post-Series Backing Payout Splits.',
    badgeValue: 'Staking & Markup Solver',
  },
  {
    slug: 'iso-calculator',
    title: 'Smarter.Poker Pre-Flop Isolation Raise (ISO) & Limper Sizing Calculator',
    url: `${SITE_URL}/tools/iso-calculator`,
    summary: 'Calculate Optimal Pre-Flop Isolation Raise Sizing Against Live And Online Open-Limpers With Flop SPR.',
    badgeValue: 'Pre-Flop ISO Sizing Engine',
  },
  {
    slug: 'home-game-kit',
    title: 'Smarter.Poker Home Game Chip Set Denomination & Setup Calculator',
    url: `${SITE_URL}/tools/home-game-kit`,
    summary: 'Compute Optimal 300, 500, And 1,000 Piece Chip Set Breakdowns And Printable Home Game House Rules.',
    badgeValue: 'Home Game Chip Architect',
  },
  {
    slug: 'format-quiz',
    title: 'Smarter.Poker Format Selector & 7-Day Study Roadmap Quiz',
    url: `${SITE_URL}/tools/format-quiz`,
    summary: 'Match Your Session Schedule, Bankroll Cushion, And Risk Tolerance To Your Optimal Poker Format And Study Plan.',
    badgeValue: 'Format Diagnostic Quiz',
  },
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

  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'Smarter.Poker Empirical Poker Research & Interactive Solver Calculators',
    home_page_url: `${SITE_URL}/research`,
    feed_url: `${SITE_URL}/api/feeds/research`,
    description:
      'First-party US live poker room benchmarks, tournament economics datasets, and interactive GTO solver calculators published by Smarter.Poker under CC-BY 4.0 attribution.',
    icon: `${SITE_URL}/images/og-card.jpg`,
    favicon: `${SITE_URL}/favicon.ico`,
    authors: [{ name: 'Smarter.Poker Research Division', url: `${SITE_URL}/research` }],
    language: 'en-US',
    items: [...researchItems, ...calculatorItems],
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
