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
};

export const SYNDICATED_CALCULATORS = OEMBED_CALCULATORS.map((w) => {
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
