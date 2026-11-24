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
import { LESSONS } from '../../../src/content/learn/lessons.js';
import { GLOSSARY_TERMS } from '../../../src/content/glossary/terms.js';

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
  'https://smarter.poker/tools/board-texture-analyzer',
  'https://smarter.poker/tools/m-ratio-calculator',
  'https://smarter.poker/tools/session-planner',
  'https://smarter.poker/tools/straddle-calculator',
  'https://smarter.poker/tools/hand-converter',
  'https://smarter.poker/tools/satellite-calculator',
  'https://smarter.poker/tools/promo-ev-calculator',
  'https://smarter.poker/tools/who-wins-calculator',
  'https://smarter.poker/tools/mixed-game-placards',
  'https://smarter.poker/tools/poker-iq-test',
  'https://smarter.poker/tools/plo-outs-calculator',
  'https://smarter.poker/tools/late-reg-calculator',
  'https://smarter.poker/tools/winrate-confidence-calculator',
  'https://smarter.poker/tools/poker-trip-planner',
  'https://smarter.poker/tools/shot-clock',
  'https://smarter.poker/tools/geometric-bet-calculator',
  'https://smarter.poker/tools/table-selection-calculator',
  'https://smarter.poker/tools/mtt-grind-planner',
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
  'https://smarter.poker/learn/positions',
  'https://smarter.poker/learn/stakes',
  'https://smarter.poker/learn/famous-hands',
  'https://smarter.poker/learn/roadmaps',
  'https://smarter.poker/learn/player-types',
  'https://smarter.poker/learn/board-textures',
  'https://smarter.poker/learn/mental-game',
  'https://smarter.poker/learn/poker-as-a-business',
  'https://smarter.poker/learn/poker-math',
  'https://smarter.poker/learn/cheat-sheets',
  'https://smarter.poker/learn/online-vs-live-poker',
  'https://smarter.poker/learn/live-poker-tells',
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
  'https://smarter.poker/poker-rooms/states',
  'https://smarter.poker/poker-rooms/international',
  'https://smarter.poker/poker-rooms/comps-and-tipping-guide',
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
  { title: 'Master Poker Tools & Calculators Directory (42 Free Tools)', desc: 'All 42 interactive GTO poker calculators, ICM solvers, range matrices & utilities', url: 'https://smarter.poker/tools' },
  { title: 'Poker Odds & Equity Calculator', desc: 'Exact 6-game Holdem, PLO4/5/6, Stud & Razz equity calculator', url: 'https://smarter.poker/tools/poker-odds-calculator' },
  { title: 'Tournament ICM Calculator', desc: 'Malmuth-Harville ICM payouts, bubble factor & risk premium solver', url: 'https://smarter.poker/tools/icm-calculator' },
  { title: '13x13 GTO Preflop Range Matrix & Position Hub', desc: '100BB 6-Max GTO Raise First In (RFI), 3-bet, and 4-bet preflop charts', url: 'https://smarter.poker/tools/preflop-ranges' },
  { title: 'Live & Online Poker Winrate (BB/100 To $/Hr) Calculator', desc: 'Translate BB/100 into live hourly dollar winrates and confidence intervals', url: 'https://smarter.poker/tools/poker-winrate-calculator' },
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
  { title: 'Flop Board Texture & GTO C-Bet Analyzer', desc: 'Analyze 3-card flops for suit texture, connectedness & optimal C-bet sizing', url: 'https://smarter.poker/tools/board-texture-analyzer' },
  { title: 'Harrington Tournament M-Ratio & Zone Calculator', desc: 'Compute M-Ratio, short-handed Effective M, Q-Ratio & push/fold zones', url: 'https://smarter.poker/tools/m-ratio-calculator' },
  { title: 'Live Cash Game Session & Net Hourly EV Planner', desc: 'Project hourly winrate, casino comps, expenses, stop-loss & 5% RoR bankroll', url: 'https://smarter.poker/tools/session-planner' },
  { title: 'Live Straddle & Double-Board Bomb Pot EV Calculator', desc: 'UTG vs Mississippi Button straddle stack reduction & 8-way bomb pot SPR', url: 'https://smarter.poker/tools/straddle-calculator' },
  { title: 'Poker Hand History Formatter (Reddit & Discord)', desc: 'Convert raw hand details into suit-symbol markdown with street-by-street SPR', url: 'https://smarter.poker/tools/hand-converter' },
  { title: 'Tournament Satellite Bubble Factor & Seat-Lock Calculator', desc: 'Target seat stack, survival thresholds & fold-AA satellite bubble math', url: 'https://smarter.poker/tools/satellite-calculator' },
  { title: 'Bad Beat Jackpot (BBJ) & High-Hand Promo EV Calculator', desc: 'Qualifier hit odds, breakeven jackpot pool & hourly high-hand seat EV', url: 'https://smarter.poker/tools/promo-ev-calculator' },
  { title: 'What Beats What? 7-Card Hold\'em Showdown Resolver', desc: 'Best 5-card hand, kicker tie-breakers & counterfeited two-pair rulings', url: 'https://smarter.poker/tools/who-wins-calculator' },
  { title: 'Mixed Game (HORSE / 8-Game) Rotation Tracker & Placards', desc: '8-hand orbit counter, betting structures & printable table cards', url: 'https://smarter.poker/tools/mixed-game-placards' },
  { title: '10-Question Interactive GTO Poker IQ Diagnostic Test', desc: 'Pot odds, MDF, ICM, PKO bounties, combinatorics & TDA rules assessment', url: 'https://smarter.poker/tools/poker-iq-test' },
  { title: 'PLO Straight Wrap & Flush Redraw Outs Calculator', desc: '13, 16, 17 & 20-out Omaha wraps, nut vs dirty outs & turn+river equity %', url: 'https://smarter.poker/tools/plo-outs-calculator' },
  { title: 'Tournament Late-Registration ICM Equity Calculator', desc: 'Instant ICM chip appreciation entering at 15BB-30BB vs Level 1', url: 'https://smarter.poker/tools/late-reg-calculator' },
  { title: 'Poker Winrate Confidence Interval & Sample Size Calculator', desc: '70%, 95% & 99% BB/100 confidence bands & probability of true loss', url: 'https://smarter.poker/tools/winrate-confidence-calculator' },
  { title: 'Poker Festival & Vegas Trip Expense Overhead Calculator', desc: 'Flights, hotel, dining, effective expense rake % & breakeven series target', url: 'https://smarter.poker/tools/poker-trip-planner' },
  { title: 'Live Poker Tournament Shot Clock & Time-Bank Timer', desc: '15s/30s action countdown, audio alerts & printable time-bank cards', url: 'https://smarter.poker/tools/shot-clock' },
  { title: 'Multi-Street 2e & 3e Geometric Bet Sizing Calculator', desc: 'Equal pot-fraction flop, turn & river bet sizing to smoothly jam stacks', url: 'https://smarter.poker/tools/geometric-bet-calculator' },
  { title: 'Live Cash Game Table Selection & Profitability Scorer', desc: 'Grade any live table (S-Tier to F) by VPIP whales, stack depth & rake cap', url: 'https://smarter.poker/tools/table-selection-calculator' },
  { title: 'MTT Tournament Grind Session & ABI Bankroll Planner', desc: 'Total session exposure, ABI buy-in ratio & 0-ITM brick probability', url: 'https://smarter.poker/tools/mtt-grind-planner' },
  { title: 'Embeddable Webmaster Poker Widgets & Streamer Bot Suite', desc: 'Responsive HTML5 calculator iframe embeds & 34 Nightbot/StreamElements commands', url: 'https://smarter.poker/tools/embeds' },
  { title: '8 Poker Player Archetypes & Exploitative Strategy Hub', desc: 'Counter OMC, Calling Station, Maniac, TAG, LAG, Short-Stack, Trapper & GTO', url: 'https://smarter.poker/learn/player-types' },
  { title: '12 Canonical Flop Board Textures & GTO C-Bet Guide', desc: 'Solver C-bet frequency, sizing, check-raise % & turn barrel plans', url: 'https://smarter.poker/learn/board-textures' },
  { title: 'Poker Mental Game, Tilt Control & Peak Performance Guide', desc: '7 types of tilt, Tendler logic injection, pre-session warmup & stop-loss rules', url: 'https://smarter.poker/learn/mental-game' },
  { title: 'Poker As A Business: Professional Bankroll & Tax Guide', desc: 'Risk capital vs living reserves, Schedule C vs Schedule A & staking contracts', url: 'https://smarter.poker/learn/poker-as-a-business' },
  { title: '10 International Live Poker Destinations & Global Tax Guide', desc: 'London, Barcelona, Rozvadov, Monte Carlo, Prague, Manila, Macau, Melbourne, Montreal & Nassau', url: 'https://smarter.poker/poker-rooms/international' },
  { title: '9-Seat Poker Position Strategy Encyclopedia', desc: 'UTG to Button & Blinds GTO RFI %, 3-Bet % and BB/100 winrates', url: 'https://smarter.poker/learn/positions' },
  { title: 'Poker Stake Level & Move-Up Readiness Hub (7 Stakes)', desc: 'Bankroll cushions, rake drag & shot-taking checklists across 7 stake tiers', url: 'https://smarter.poker/learn/stakes' },
  { title: 'Famous Historic Poker Hands & GTO Solver Archive (12 Iconic Hands)', desc: 'Street-by-street pot odds, blockers & solver verdicts on 12 iconic televised hands', url: 'https://smarter.poker/learn/famous-hands' },
  { title: '90-Day Poker Player Progression & Study Roadmaps (4 Structured 90-Day Roadmaps)', desc: 'Structured 90-day curriculums for cash, MTT, PLO & club grinders', url: 'https://smarter.poker/learn/roadmaps' },
  { title: 'Complete Poker Math Formulas, Equations & Solver Proofs Hub', desc: 'Pot odds, EV, MDF, Alpha, geometric sizing, SPR, ICM, Risk of Ruin & draws', url: 'https://smarter.poker/learn/poker-math' },
  { title: 'Printable One-Page Poker Cheat Sheets & Reference Cards Hub', desc: 'Print-ready reference cards for hand rankings, Rule of 4 and 2, RFI ranges & push/fold', url: 'https://smarter.poker/learn/cheat-sheets' },
  { title: 'Online Vs. Live Poker Strategy Transition Authority Guide', desc: 'Side-by-side adjustments for open sizing, hands/hr, multiway pots & rake caps', url: 'https://smarter.poker/learn/online-vs-live-poker' },
  { title: 'Live Poker Tells, Betting Timing & Anti-Angle-Shooting Encyclopedia', desc: 'Behavioral tells, action-timing clues, chip mechanics & TDA angle-shot defense', url: 'https://smarter.poker/learn/live-poker-tells' },
  { title: 'Official Poker Hand Rankings Chart & Kicker Tie-Breaker Guide', desc: 'Royal Flush to High Card combinatorics, 5-card showdown rules & short deck', url: 'https://smarter.poker/learn/poker-hand-rankings' },
  { title: 'Live Casino Poker Comps, Rewards Cards & Dealer Tipping Guide', desc: 'Hourly comp rates, tier multipliers, dealer tipping standards & comp offset math', url: 'https://smarter.poker/poker-rooms/comps-and-tipping-guide' },
  { title: '15 US State Poker Legality, Tax & Live Room Guides', desc: 'Nevada, Texas, California, Florida, New Jersey, Pennsylvania & more', url: 'https://smarter.poker/poker-rooms/states' },
  { title: '169 Starting Hands GTO Encyclopedia', desc: 'Combinatorics and 100BB 6-Max positional ranges for all 169 hands', url: 'https://smarter.poker/learn/hands' },
  { title: '25 Preflop Hand-Vs-Hand Matchup Guides', desc: 'AA vs KK, QQ vs AKs, 55 vs KTs exact equities and flop shifts', url: 'https://smarter.poker/learn/matchups' },
  { title: '30 Official Poker Rules & TDA Floor Rulings', desc: 'Showdown order, oversized chip call rule, string bets, and RROP', url: 'https://smarter.poker/rules' },
  { title: '15 Poker Game Variants & Mixed Games Hub', desc: 'NLH, PLO4/5/6, Big O, Short Deck 6+, Bomb Pots, Stud, Razz, Badugi', url: 'https://smarter.poker/games' },
  { title: '12 US Regional Live Poker Market Guides', desc: 'Las Vegas, Los Angeles, Texas, Florida rake and venue strategy guides', url: 'https://smarter.poker/poker-rooms/guides' },
  { title: '10 Major Poker Tournament Series Strategy Guides', desc: 'WSOP, WPT, MSPT, RGPS, WSOPC, SHRPO, Borgata, Venetian, Wynn, TCH/Lodge', url: 'https://smarter.poker/poker-series/guides' },
  { title: 'First-Time Live Casino Poker Room Etiquette Guide', desc: 'Step-by-step check-in, buying chips, posting blinds, and tipping', url: 'https://smarter.poker/poker-rooms/first-time-guide' },
  { title: 'First-Party Poker Industry Research & Data Benchmarks (15 Studies)', desc: 'Empirical studies on live room rake, ICM bubble factors, PKO bounties & GTO leaks', url: 'https://smarter.poker/research' },
  { title: 'Poker Software & Live Cardroom Comparisons (30 Verified Comparisons)', desc: 'Source-cited comparisons against ICMIZER, Equilab, PioSolver, Bellagio, Aria & more', url: 'https://smarter.poker/compare' },
  { title: 'Official Poker Strategy & Floor Rules Glossary (80+ Terms)', desc: 'Quantitative definitions for GTO, ICM, MDF, SPR, VPIP, PFR & TDA rulings', url: 'https://smarter.poker/glossary' },
  { title: 'Universal Poker Search & Command Directory (680+ Indexed Pages)', desc: 'Instant search across 42 calculators, 169 hands, 25 matchups, 30 rules & all guides', url: 'https://smarter.poker/search' },
  { title: 'Smarter.Poker Press Kit & 2026 Industry Benchmarks', desc: 'Quotable 2026 poker industry facts, brand boilerplates & citation snippets', url: 'https://smarter.poker/press' },
  ...LESSONS.slice(0, 15).map((l) => ({
    title: `${l.title || l.question || l.slug} (GTO Strategy Lesson)`,
    desc: String(l.summary || l.category || 'Answer-first GTO poker strategy lesson').slice(0, 120),
    url: `https://smarter.poker/learn/${l.slug}`,
  })),
  ...GLOSSARY_TERMS.slice(0, 15).map((t) => ({
    title: `${t.term} (Poker Glossary Definition)`,
    desc: String(t.definition || t.category || 'Official Smarter.Poker glossary definition').slice(0, 120),
    url: `https://smarter.poker/glossary/${t.slug}`,
  })),
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
