/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GET /api/seo/outreach-generator
 *  Automated Backlink Outreach, 404 Replacement & Multilingual Snippet API
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Query Parameters:
 * - campaign: 'unlinked-brand' | 'competitor-404' | 'cardroom-awards' |
 *             'cpa-tax-w2g' | 'dealer-schools' | 'edu-quant-clubs' |
 *             'podcast-show-notes' | 'multilingual' (optional, returns all if omitted)
 * - lang: 'en' | 'es' | 'pt' | 'de' | 'fr' | 'it' | 'ja' (default: 'en')
 * - target: Target site/room/publication name for template personalization
 */

import { generateOutreachPackage } from '../../../src/lib/seo/outreachEngine.mjs';

export const INDEXNOW_PRIORITY_URLS = [
  'https://smarter.poker/tools',
  'https://smarter.poker/tools/poker-odds-calculator',
  'https://smarter.poker/tools/icm-calculator',
  'https://smarter.poker/tools/pot-odds-calculator',
  'https://smarter.poker/tools/push-fold-calculator',
  'https://smarter.poker/tools/bankroll-calculator',
  'https://smarter.poker/tools/bounty-calculator',
  'https://smarter.poker/tools/poker-winrate-calculator',
  'https://smarter.poker/tools/side-pot-calculator',
  'https://smarter.poker/tools/blind-structure-calculator',
  'https://smarter.poker/tools/spr-calculator',
  'https://smarter.poker/tools/plo-bet-calculator',
  'https://smarter.poker/tools/payout-calculator',
  'https://smarter.poker/tools/rake-calculator',
  'https://smarter.poker/tools/3bet-calculator',
  'https://smarter.poker/tools/preflop-ranges',
  'https://smarter.poker/tools/chop-calculator',
  'https://smarter.poker/tools/variance-calculator',
  'https://smarter.poker/tools/outs-calculator',
  'https://smarter.poker/tools/poker-tax-calculator',
  'https://smarter.poker/tools/staking-calculator',
  'https://smarter.poker/tools/iso-calculator',
  'https://smarter.poker/tools/home-game-kit',
  'https://smarter.poker/tools/format-quiz',
  'https://smarter.poker/tools/embeds',
  'https://smarter.poker/learn',
  'https://smarter.poker/learn/hands',
  'https://smarter.poker/learn/hands/aa',
  'https://smarter.poker/learn/hands/kk',
  'https://smarter.poker/learn/hands/aks',
  'https://smarter.poker/learn/matchups',
  'https://smarter.poker/learn/matchups/aa-vs-kk',
  'https://smarter.poker/learn/matchups/qq-vs-aks',
  'https://smarter.poker/learn/matchups/jj-vs-ako',
  'https://smarter.poker/learn/matchups/55-vs-kts',
  'https://smarter.poker/learn/poker-hand-rankings',
  'https://smarter.poker/rules',
  'https://smarter.poker/rules/showdown-order-who-shows-first',
  'https://smarter.poker/rules/oversized-chip-one-chip-call-rule',
  'https://smarter.poker/rules/string-bet-and-forward-motion-rule',
  'https://smarter.poker/rules/short-all-in-reopening-the-betting-rule',
  'https://smarter.poker/games',
  'https://smarter.poker/games/texas-holdem',
  'https://smarter.poker/games/pot-limit-omaha-plo4',
  'https://smarter.poker/games/5-card-plo-plo5',
  'https://smarter.poker/games/double-board-plo-bomb-pots',
  'https://smarter.poker/games/short-deck-6-plus-holdem',
  'https://smarter.poker/poker-rooms/guides',
  'https://smarter.poker/poker-rooms/guides/las-vegas-nevada',
  'https://smarter.poker/poker-rooms/guides/los-angeles-california',
  'https://smarter.poker/poker-rooms/guides/texas-austin-houston-dallas',
  'https://smarter.poker/poker-rooms/guides/south-florida-miami-hollywood',
  'https://smarter.poker/poker-rooms/first-time-guide',
  'https://smarter.poker/poker-series/guides',
  'https://smarter.poker/poker-series/guides/wsop-las-vegas',
  'https://smarter.poker/poker-series/guides/wpt-world-championship',
  'https://smarter.poker/poker-series/guides/mspt-mid-states-poker-tour',
  'https://smarter.poker/research',
  'https://smarter.poker/research/us-live-poker-room-rake-and-jackpot-benchmark',
  'https://smarter.poker/research/mtt-icm-bubble-factor-and-final-table-risk-premium-study',
  'https://smarter.poker/research/pko-and-mystery-bounty-chip-equivalence-study',
  'https://smarter.poker/compare',
  'https://smarter.poker/compare/best-gto-poker-trainers',
  'https://smarter.poker/compare/smarter-poker-vs-equilab',
  'https://smarter.poker/compare/smarter-poker-vs-icmizer',
  'https://smarter.poker/press',
  'https://smarter.poker/search',
];

export const OPENSEARCH_SUGGESTION_INDEX = [
  { title: 'Poker Odds & Equity Calculator', desc: 'Exact 6-game Holdem, PLO4/5/6, Stud & Razz equity calculator', url: 'https://smarter.poker/tools/poker-odds-calculator' },
  { title: 'Tournament ICM Calculator', desc: 'Malmuth-Harville ICM payouts, bubble factor & risk premium solver', url: 'https://smarter.poker/tools/icm-calculator' },
  { title: 'Tournament Chop & Deal Calculator', desc: 'Compare ICM Chop, Chip Chop, and Save-Amount final table deals', url: 'https://smarter.poker/tools/chop-calculator' },
  { title: 'Poker Variance & Downswing Simulator', desc: 'Simulate EV, 95% confidence intervals, and probability of loss', url: 'https://smarter.poker/tools/variance-calculator' },
  { title: 'Poker Outs & Rule of 4 and 2 Calculator', desc: 'Exact hypergeometric Turn, River, and Flop-to-River draw odds', url: 'https://smarter.poker/tools/outs-calculator' },
  { title: 'Pot Odds & Minimum Defense Frequency (MDF) Calculator', desc: 'Required calling equity, MDF %, and polarized river bluff ratio', url: 'https://smarter.poker/tools/pot-odds-calculator' },
  { title: 'Short-Stack Push/Fold Nash Equilibrium Charts', desc: '5BB to 20BB open-shove and call ranges by position', url: 'https://smarter.poker/tools/push-fold-calculator' },
  { title: 'Poker Bankroll & Risk of Ruin Calculator', desc: 'Brownian motion Risk of Ruin and buy-in buffer calculator', url: 'https://smarter.poker/tools/bankroll-calculator' },
  { title: 'PKO & Mystery Bounty Chip Calculator', desc: 'Convert knockout bounties into starting-stack chip equivalents', url: 'https://smarter.poker/tools/bounty-calculator' },
  { title: 'Multi-Way All-In Side Pot Calculator', desc: 'Exact Main Pot, Side Pots, and uncalled bet returns for 2-9 players', url: 'https://smarter.poker/tools/side-pot-calculator' },
  { title: 'Tournament Blind Structure & Clock Generator', desc: 'TDA-compliant blind schedules and chip color distributions', url: 'https://smarter.poker/tools/blind-structure-calculator' },
  { title: 'Stack-to-Pot Ratio (SPR) & Geometric Sizing Calculator', desc: '1-street, 2-street, and 3-street geometric bet sizing', url: 'https://smarter.poker/tools/spr-calculator' },
  { title: 'Pot-Limit Omaha (PLO) Max Bet & Bomb Pot Calculator', desc: 'Dealer 3x + trail + pot formula and double-board bomb pot math', url: 'https://smarter.poker/tools/plo-bet-calculator' },
  { title: 'Tournament Payout Structure Calculator', desc: 'Top 10%, 15%, and 20% field prize pool payout table generator', url: 'https://smarter.poker/tools/payout-calculator' },
  { title: 'Live Cash Game Rake vs Time Charge Calculator', desc: 'Compare pot-rake caps vs hourly seat rental in BB/100 drag', url: 'https://smarter.poker/tools/rake-calculator' },
  { title: 'Preflop 3-Bet, Squeeze & 4-Bet Sizing Calculator', desc: 'Solver-approved IP/OOP 3-bet and 4-bet sizing with MDF', url: 'https://smarter.poker/tools/3bet-calculator' },
  { title: 'US Poker Tax & Form W-2G Calculator', desc: 'IRS $5,000 Form W-2G threshold & Recreational vs Professional session taxes', url: 'https://smarter.poker/tools/poker-tax-calculator' },
  { title: 'Tournament Staking & Markup Split Calculator', desc: 'Staking markup breakeven ROI, share costs & post-series payout splits', url: 'https://smarter.poker/tools/staking-calculator' },
  { title: 'Pre-Flop Isolation Raise (ISO) Calculator', desc: 'Optimal 3x + 1x per limper + OOP tax isolation sizing', url: 'https://smarter.poker/tools/iso-calculator' },
  { title: 'Home Game Chip Set & Denomination Breakdown Calculator', desc: 'Optimal chip counts per player for cash games and tournaments', url: 'https://smarter.poker/tools/home-game-kit' },
  { title: 'Poker Format Selector & 7-Day Study Roadmap Quiz', desc: 'Match your schedule, bankroll & risk tolerance to your ideal poker format', url: 'https://smarter.poker/tools/format-quiz' },
  { title: '169 Starting Hands GTO Encyclopedia', desc: 'Combinatorics and 100BB 6-Max positional ranges for all 169 hands', url: 'https://smarter.poker/learn/hands' },
  { title: '25 Preflop Hand-Vs-Hand Matchup Guides', desc: 'AA vs KK, QQ vs AKs, 55 vs KTs exact equities and flop shifts', url: 'https://smarter.poker/learn/matchups' },
  { title: '30 Official Poker Rules & TDA Floor Rulings', desc: 'Showdown order, oversized chip call rule, string bets, and RROP', url: 'https://smarter.poker/rules' },
  { title: '15 Poker Game Variants & Mixed Games Hub', desc: 'NLH, PLO4/5/6, Big O, Short Deck 6+, Bomb Pots, Stud, Razz, Badugi', url: 'https://smarter.poker/games' },
  { title: '12 US Regional Live Poker Market Guides', desc: 'Las Vegas, Los Angeles, Texas, Florida rake and venue strategy guides', url: 'https://smarter.poker/poker-rooms/guides' },
  { title: '10 Major Poker Tournament Series Strategy Guides', desc: 'WSOP, WPT, MSPT, RGPS, WSOPC, SHRPO, Borgata, Venetian, Wynn, TCH/Lodge', url: 'https://smarter.poker/poker-series/guides' },
  { title: 'First-Time Live Casino Poker Room Etiquette Guide', desc: 'Step-by-step check-in, buying chips, posting blinds, and tipping', url: 'https://smarter.poker/poker-rooms/first-time-guide' },
  { title: 'Smarter.Poker Press Kit & 2026 Industry Benchmarks', desc: 'Quotable 2026 poker industry facts, brand boilerplates & citation snippets', url: 'https://smarter.poker/press' },
];

export function buildIndexNowPayload() {
  return {
    host: 'smarter.poker',
    key: 'smarterpoker2026indexnowkey',
    keyLocation: 'https://smarter.poker/api/seo/indexnow',
    urlCount: INDEXNOW_PRIORITY_URLS.length,
    urlList: INDEXNOW_PRIORITY_URLS,
  };
}

export function buildOpenSearchSuggestPayload(q = '') {
  const queryStr = String(q || '').trim();
  const cleanQ = queryStr.toLowerCase();
  const matched = cleanQ
    ? OPENSEARCH_SUGGESTION_INDEX.filter(
        (item) =>
          item.title.toLowerCase().includes(cleanQ) ||
          item.desc.toLowerCase().includes(cleanQ) ||
          item.url.toLowerCase().includes(cleanQ)
      ).slice(0, 10)
    : OPENSEARCH_SUGGESTION_INDEX.slice(0, 10);

  return [
    queryStr,
    matched.map((m) => m.title),
    matched.map((m) => m.desc),
    matched.map((m) => m.url),
  ];
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { mode = '', q = '', campaign = '', lang = 'en', target = 'Your Publication' } = req.query || {};
  const normalizedMode = String(mode || '').trim().toLowerCase();

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (normalizedMode === 'indexnow') {
    return res.status(200).json({
      host: 'smarter.poker',
      key: 'smarterpoker2026indexnowkey',
      keyLocation: 'https://smarter.poker/api/seo/indexnow',
      urlCount: INDEXNOW_PRIORITY_URLS.length,
      urlList: INDEXNOW_PRIORITY_URLS,
    });
  }

  if (normalizedMode === 'suggest') {
    const queryStr = String(q || '').trim();
    const cleanQ = queryStr.toLowerCase();
    const matched = cleanQ
      ? OPENSEARCH_SUGGESTION_INDEX.filter(
          (item) =>
            item.title.toLowerCase().includes(cleanQ) ||
            item.desc.toLowerCase().includes(cleanQ) ||
            item.url.toLowerCase().includes(cleanQ)
        ).slice(0, 10)
      : OPENSEARCH_SUGGESTION_INDEX.slice(0, 10);

    return res.status(200).json([
      queryStr,
      matched.map((m) => m.title),
      matched.map((m) => m.desc),
      matched.map((m) => m.url),
    ]);
  }

  const payload = generateOutreachPackage({ campaign, lang, target });
  return res.status(200).json(payload);
}
