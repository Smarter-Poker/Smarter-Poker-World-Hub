/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GET /api/stream/cmd
 *  Twitch / YouTube Streamer Chatbot (Nightbot / StreamElements / Fossabot)
 *  & OBS Browser-Source Overlay Endpoint
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Returns concise single-line text/plain responses (< 380 chars) for live
 * stream chat bots with canonical https://smarter.poker/tools/... attribution
 * links, or structured JSON when ?format=json is requested.
 *
 * Supported Commands (?cmd=...):
 * - odds     : Preflop matchup & draw equity (!odds AA vs KK)
 * - potodds  : Pot odds & Minimum Defense Frequency (!potodds 100 50)
 * - pushfold : Short-stack Nash equilibrium push/fold (!pushfold 10bb BTN)
 * - icm      : Final table ICM bubble factor & risk premium (!icm)
 * - bounty   : PKO & Mystery Bounty chip equivalent (!bounty)
 * - winrate  : Bankroll Risk of Ruin & win-rate variance (!winrate)
 * - help     : Command summary & setup link
 */

import { HAND_MATCHUPS, getMatchupBySlug } from '../../../src/content/learn/matchups.js';
import { SERIES_GUIDES, getSeriesGuideBySlug } from '../../../src/content/guides/seriesGuides.js';
import { recordSeoTelemetryEvent } from '../seo/referral-stats.js';

export const STREAMER_BOT_COMMANDS = [
  {
    command: '!odds',
    description: 'Preflop All-In Equity & Postflop Draw Odds With Canonical Calculator Link',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=odds&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=odds&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/tools/poker-odds-calculator',
  },
  {
    command: '!potodds',
    description: 'Instant Pot Odds Required Equity (%) & Minimum Defense Frequency (MDF %)',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=potodds&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=potodds&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/tools/pot-odds-calculator',
  },
  {
    command: '!pushfold',
    description: 'Short-Stack (5BB To 20BB) Nash Equilibrium Push/Fold Guidance By Position',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=pushfold&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=pushfold&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/tools/push-fold-calculator',
  },
  {
    command: '!icm',
    description: 'Tournament ICM Bubble Factor & Final Table Risk Premium Reference',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=icm&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=icm&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/tools/icm-calculator',
  },
  {
    command: '!bounty',
    description: 'PKO & Mystery Bounty Starting-Stack Chip Conversion Formula',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=bounty&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=bounty&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/tools/bounty-calculator',
  },
  {
    command: '!winrate',
    description: 'Poker Win-Rate Confidence Interval & Risk-Of-Ruin Bankroll Calculator',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=winrate&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=winrate&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/tools/poker-winrate-calculator',
  },
  {
    command: '!plo',
    description: 'Pot-Limit Omaha (PLO) Maximum Raise Formula (3x + Trail + Pot) & Bomb Pot Math',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=plo&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=plo&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/tools/plo-bet-calculator',
  },
  {
    command: '!rake',
    description: 'Live Cash Game Rake Cap Vs. Timed Seat Rental BB/100 Drag Comparison',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=rake&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=rake&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/tools/rake-calculator',
  },
  {
    command: '!3bet',
    description: 'Solver-Approved IP/OOP Preflop 3-Bet, Squeeze & 4-Bet Sizing With MDF',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=3bet&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=3bet&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/tools/3bet-calculator',
  },
  {
    command: '!rule',
    description: 'Official Poker TDA & Robert\'s Rules Of Poker (RROP) Floor Rulings Lookup',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=rule&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=rule&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/rules',
  },
  {
    command: '!chop',
    description: 'Final Table ICM Chop Vs. Chip Chop Deal Payouts (!chop 50000,30000,20000 5000,3000,2000)',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=chop&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=chop&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/tools/chop-calculator',
  },
  {
    command: '!outs',
    description: 'Exact Hypergeometric Turn %, River % & Flop-To-River Draw Odds (!outs 9)',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=outs&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=outs&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/tools/outs-calculator',
  },
  {
    command: '!variance',
    description: 'Poker Win-Rate EV, 95% Confidence Interval & Loss Probability (!variance 5 85 100000)',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=variance&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=variance&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/tools/variance-calculator',
  },
  {
    command: '!matchup',
    description: 'Exact Preflop Hand-Vs-Hand Win/Tie/Loss Equity (!matchup aa-vs-kk or !matchup AKs QQ)',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=matchup&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=matchup&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/learn/matchups',
  },
  {
    command: '!tax',
    description: 'US Poker Tax Estimator (Schedule A Session Cap Vs Schedule C Pro & $5,000 IRS Form W-2G)',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=tax&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=tax&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/tools/poker-tax-calculator',
  },
  {
    command: '!stake',
    description: 'Tournament Staking & Markup Split Calculator (Share Cost, Breakeven ROI & Payout Splits)',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=stake&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=stake&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/tools/staking-calculator',
  },
  {
    command: '!iso',
    description: 'Pre-Flop Limper Isolation Raise Sizing (3BB + 1BB/Limper + 1BB OOP) & Flop SPR',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=iso&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=iso&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/tools/iso-calculator',
  },
  {
    command: '!series',
    description: 'Major Poker Series Strategy & Structure Guide (!series wsop-las-vegas or !series wpt)',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=series&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=series&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/poker-series/guides',
  },
  {
    command: '!board',
    description: 'Flop Board Texture, Range Advantage & GTO C-Bet Sizing (!board AsKh7d or !board QsJsTs)',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=board&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=board&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/tools/board-texture-analyzer',
  },
  {
    command: '!mratio',
    description: 'Harrington Tournament M-Ratio, Effective M & Zone Classification (!mratio 25000 500 1000 1000)',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=mratio&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=mratio&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/tools/m-ratio-calculator',
  },
  {
    command: '!straddle',
    description: 'Live Cash Game Straddle & Double-Board Bomb Pot EV Math (!straddle 1/3)',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=straddle&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=straddle&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/tools/straddle-calculator',
  },
  {
    command: '!sat',
    description: 'Satellite Bubble Factor, Seat-Lock Stack & Fold-AA Threshold (!sat 12 10)',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=sat&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=sat&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/tools/satellite-calculator',
  },
  {
    command: '!bbj',
    description: 'Bad Beat Jackpot Breakeven Pool & High-Hand Promo EV Math (!bbj 250000)',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=bbj&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=bbj&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/tools/promo-ev-calculator',
  },
  {
    command: '!position',
    description: 'Table Seat Position GTO RFI %, 3-Bet % & BB/100 Winrate (!position btn or !pos utg)',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=position&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=position&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/learn/positions',
  },
  {
    command: '!math',
    description: 'Instant Quantitative Poker Formula Lookup (!math mdf, !math spr, !math ev, !math kelly)',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=math&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=math&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/learn/poker-math',
  },
  {
    command: '!iq',
    description: '10-Question Interactive GTO Poker IQ Diagnostic Test & Percentile Challenge (!iq)',
    nightbotSyntax: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=iq&q=$(querystring))',
    streamElementsSyntax: '${customapi.https://smarter.poker/api/stream/cmd?cmd=iq&q=${queryencode}}',
    canonicalToolUrl: 'https://smarter.poker/tools/poker-iq-test',
  },
];

const PREFLOP_MATCHUPS = [
  { pattern: /aa\s*(?:v|vs)\s*kk/i, label: 'AA vs KK', equity: '81.9% vs 18.1% (Overpair vs Underpair)' },
  { pattern: /aa\s*(?:v|vs)\s*aks/i, label: 'AA vs AKs', equity: '87.9% vs 12.1%' },
  { pattern: /aa\s*(?:v|vs)\s*ako/i, label: 'AA vs AKo', equity: '93.2% vs 6.8%' },
  { pattern: /(?:qq|jj|tt)\s*(?:v|vs)\s*aks/i, label: 'Pocket Pair vs AKs', equity: '53.9% vs 46.1% (Classic Coinflip)' },
  { pattern: /(?:qq|jj|tt)\s*(?:v|vs)\s*ako/i, label: 'Pocket Pair vs AKo', equity: '56.8% vs 43.2% (Preflop Race)' },
  { pattern: /ak\s*(?:v|vs)\s*aq/i, label: 'AK vs AQ', equity: '73.5% vs 26.5% (Dominated Ace)' },
  { pattern: /flush\s*draw/i, label: '9-Out Flush Draw vs Top Pair', equity: '35.0% Flop To River (19.6% Turn Only)' },
  { pattern: /open\s*ended|oesd/i, label: '8-Out Open-Ended Straight Draw', equity: '31.5% Flop To River (17.4% Turn Only)' },
  { pattern: /combo\s*draw/i, label: '15-Out Flush + Straight Combo Draw', equity: '54.1% Flop To River (Favorite Over Top Pair!)' },
];

export function evaluateStreamCommand({ cmd = 'help', q = '', pot = '', bet = '' } = {}) {
  const normalizedCmd = String(cmd || 'help').trim().toLowerCase().replace(/^!/, '');
  const queryText = String(q || '').trim();

  if (normalizedCmd === 'odds') {
    const matched = PREFLOP_MATCHUPS.find((m) => m.pattern.test(queryText));
    if (matched) {
      return {
        command: '!odds',
        text: `[Smarter.Poker Odds] ${matched.label}: ${matched.equity} | Run Any 6-Game Matchup Free: https://smarter.poker/tools/poker-odds-calculator`,
        canonicalUrl: 'https://smarter.poker/tools/poker-odds-calculator',
      };
    }
    return {
      command: '!odds',
      text: `[Smarter.Poker Odds] Classic Preflop Equivalents: Pair vs 2 Overcards = 55% vs 45% | Overpair vs Underpair = 81% vs 19% | Dominated Hand = 73% vs 27% | Full Calculator: https://smarter.poker/tools/poker-odds-calculator`,
      canonicalUrl: 'https://smarter.poker/tools/poker-odds-calculator',
    };
  }

  if (normalizedCmd === 'potodds') {
    const nums = `${pot} ${bet} ${queryText}`
      .match(/\d+(?:\.\d+)?/g)
      ?.map((n) => parseFloat(n))
      .filter((n) => n > 0);
    const potSize = nums && nums.length >= 1 ? nums[0] : 100;
    const betSize = nums && nums.length >= 2 ? nums[1] : 50;
    const totalPotAfterCall = potSize + betSize * 2;
    const reqEquity = ((betSize / totalPotAfterCall) * 100).toFixed(1);
    const mdf = ((potSize / (potSize + betSize)) * 100).toFixed(1);

    return {
      command: '!potodds',
      text: `[Smarter.Poker Math] Facing ${betSize} Into ${potSize}: Required Equity = ${reqEquity}% | Minimum Defense Frequency (MDF) = ${mdf}% | Interactive Tool: https://smarter.poker/tools/pot-odds-calculator`,
      canonicalUrl: 'https://smarter.poker/tools/pot-odds-calculator',
    };
  }

  if (normalizedCmd === 'pushfold') {
    return {
      command: '!pushfold',
      text: `[Smarter.Poker Push/Fold] 10BB Nash Equilibrium Open-Shove Frequencies (Ante): BTN ~44%, SB ~62%, CO ~29%, HJ ~21% | Interactive 5BB-20BB Charts: https://smarter.poker/tools/push-fold-calculator`,
      canonicalUrl: 'https://smarter.poker/tools/push-fold-calculator',
    };
  }

  if (normalizedCmd === 'icm') {
    return {
      command: '!icm',
      text: `[Smarter.Poker ICM] Final Table Bubble Factor: Medium Stacks Facing Chip Leader Experience 1.65x-2.40x Risk Premium (Need ~63%+ Equity vs 50% Chip EV) | Solve Payouts Free: https://smarter.poker/tools/icm-calculator`,
      canonicalUrl: 'https://smarter.poker/tools/icm-calculator',
    };
  }

  if (normalizedCmd === 'bounty') {
    return {
      command: '!bounty',
      text: `[Smarter.Poker Bounty Math] 1 Starting Knock-Out Bounty In Standard 50% PKO = 33% Of Starting Stack In Chips (Drops ~8-11% Required All-In Equity) | PKO & Mystery Calculator: https://smarter.poker/tools/bounty-calculator`,
      canonicalUrl: 'https://smarter.poker/tools/bounty-calculator',
    };
  }

  if (normalizedCmd === 'winrate') {
    return {
      command: '!winrate',
      text: `[Smarter.Poker Bankroll Math] At 5 BB/100 Win Rate (85 BB/100 StdDev), A 5% Risk-Of-Ruin Requires ~22 Buy-Ins | Simulate Your Variance Free: https://smarter.poker/tools/poker-winrate-calculator`,
      canonicalUrl: 'https://smarter.poker/tools/poker-winrate-calculator',
    };
  }

  if (normalizedCmd === 'plo') {
    return {
      command: '!plo',
      text: `[Smarter.Poker PLO Math] Dealer Pot-Limit Max Raise = (3 x Last Bet) + Trail Calls + Center Pot | Preflop Pot Progression: 3.5BB -> 12BB -> 41BB -> 140BB | PLO & Bomb Pot Tool: https://smarter.poker/tools/plo-bet-calculator`,
      canonicalUrl: 'https://smarter.poker/tools/plo-bet-calculator',
    };
  }

  if (normalizedCmd === 'rake') {
    return {
      command: '!rake',
      text: `[Smarter.Poker Rake Math] $1/$3 (10% To $5 Cap + $1 Drop) = ~15.3 BB/100 Drag (~$13.80/Hr) | Texas $13/Hr Time Charge Taxes 0% Of Individual Pots | Compare Live Rake: https://smarter.poker/tools/rake-calculator`,
      canonicalUrl: 'https://smarter.poker/tools/rake-calculator',
    };
  }

  if (normalizedCmd === '3bet') {
    return {
      command: '!3bet',
      text: `[Smarter.Poker 3-Bet Math] 100BB Optimal Sizing: IP 3-Bet = 3.0x Open (~7.5BB, 65% Break-Even Fold Eq) | OOP 3-Bet = 4.0x-4.4x (~10.5BB) | +1x Per Caller | Solver Tool: https://smarter.poker/tools/3bet-calculator`,
      canonicalUrl: 'https://smarter.poker/tools/3bet-calculator',
    };
  }

  if (normalizedCmd === 'rule') {
    return {
      command: '!rule',
      text: `[Smarter.Poker Floor Rules] TDA & RROP Quick Rulings: Last River Aggressor Shows First (Left Of Button If Checked) | Single Oversized Chip Without "Raise" = Call | 30 Official Rules: https://smarter.poker/rules`,
      canonicalUrl: 'https://smarter.poker/rules',
    };
  }

  if (normalizedCmd === 'chop') {
    const groups = queryText.split(/\s+/).filter(Boolean);
    const stacks = (groups[0] ? groups[0].split(',') : [50000, 30000, 20000])
      .map((n) => parseFloat(n))
      .filter((n) => Number.isFinite(n) && n > 0);
    const payouts = (groups[1] ? groups[1].split(',') : [5000, 3000, 2000])
      .map((n) => parseFloat(n))
      .filter((n) => Number.isFinite(n) && n > 0);
    const useStacks = stacks.length >= 2 ? stacks : [50000, 30000, 20000];
    const usePayouts = payouts.length >= 2 ? payouts.slice(0, useStacks.length) : [5000, 3000, 2000].slice(0, useStacks.length);
    const totalChips = useStacks.reduce((a, b) => a + b, 0);
    const totalPool = usePayouts.reduce((a, b) => a + b, 0);
    const minPrize = usePayouts[usePayouts.length - 1] || 0;
    const surplus = Math.max(0, totalPool - minPrize * useStacks.length);
    const chipChopStr = useStacks
      .map((s, idx) => `P${idx + 1}: $${Math.round(minPrize + surplus * (s / totalChips))}`)
      .join(', ');
    const icmApproxStr = useStacks
      .map((s, idx) => {
        const share = s / totalChips;
        const icmWeight = Math.pow(share, 0.82);
        return icmWeight;
      });
    const weightSum = icmApproxStr.reduce((a, b) => a + b, 0);
    const icmStr = icmApproxStr
      .map((w, idx) => `P${idx + 1}: $${Math.round(minPrize + surplus * (w / weightSum))}`)
      .join(', ');

    return {
      command: '!chop',
      text: `[Smarter.Poker Chop] ICM Chop (${icmStr}) vs Chip Chop (${chipChopStr}) | Full Deal Calculator: https://smarter.poker/tools/chop-calculator`,
      canonicalUrl: 'https://smarter.poker/tools/chop-calculator',
    };
  }

  if (normalizedCmd === 'outs') {
    const numMatch = queryText.match(/\d+/);
    const outs = numMatch ? Math.min(Math.max(parseInt(numMatch[0], 10), 1), 21) : 9;
    const turnPct = ((outs / 47) * 100).toFixed(1);
    const riverPct = ((outs / 46) * 100).toFixed(1);
    const flopToRiverPct = ((1 - ((47 - outs) / 47) * ((46 - outs) / 46)) * 100).toFixed(1);
    const reqOdds = ((100 - parseFloat(flopToRiverPct)) / parseFloat(flopToRiverPct)).toFixed(2);

    return {
      command: '!outs',
      text: `[Smarter.Poker Outs] ${outs} Clean Outs: Turn = ${turnPct}% | River = ${riverPct}% | Flop-To-River = ${flopToRiverPct}% (Break-Even Pot Odds ${reqOdds}:1) | Full Chart: https://smarter.poker/tools/outs-calculator`,
      canonicalUrl: 'https://smarter.poker/tools/outs-calculator',
    };
  }

  if (normalizedCmd === 'variance') {
    const nums = queryText
      .match(/-?\d+(?:\.\d+)?/g)
      ?.map((n) => parseFloat(n))
      .filter((n) => Number.isFinite(n));
    const wr = nums && nums.length >= 1 ? nums[0] : 5;
    const sd = nums && nums.length >= 2 ? Math.max(nums[1], 10) : 85;
    const hands = nums && nums.length >= 3 ? Math.max(nums[2], 1000) : 100000;
    const chunks = hands / 100;
    const evBb = Math.round(wr * chunks);
    const sampleSd = sd * Math.sqrt(chunks);
    const low95 = Math.round(evBb - 1.96 * sampleSd);
    const high95 = Math.round(evBb + 1.96 * sampleSd);
    const z = sampleSd > 0 ? -evBb / sampleSd : 0;
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp((-z * z) / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    const lossPct = ((z > 0 ? 1 - p : p) * 100).toFixed(1);

    return {
      command: '!variance',
      text: `[Smarter.Poker Variance] ${wr} BB/100 (${sd} SD) Over ${hands.toLocaleString()} Hands: EV = +${evBb} BB | 95% CI = [${low95} BB, +${high95} BB] | Loss Prob = ${lossPct}% | Simulator: https://smarter.poker/tools/variance-calculator`,
      canonicalUrl: 'https://smarter.poker/tools/variance-calculator',
    };
  }

  if (normalizedCmd === 'matchup' || normalizedCmd === 'matchups') {
    const cleanQ = queryText.toLowerCase().replace(/\s+/g, '-');
    const canonicalMatchup =
      getMatchupBySlug(cleanQ) ||
      HAND_MATCHUPS.find(
        (m) =>
          m.slug === cleanQ ||
          m.title.toLowerCase().includes(queryText.toLowerCase()) ||
          `${m.handA.toLowerCase()}-vs-${m.handB.toLowerCase()}` === cleanQ
      );
    if (canonicalMatchup && queryText) {
      return {
        command: '!matchup',
        text: `[Smarter.Poker Matchups] ${canonicalMatchup.handA} vs ${canonicalMatchup.handB}: ${canonicalMatchup.handAWinPct}% Win vs ${canonicalMatchup.handBWinPct}% Win (${canonicalMatchup.tiePct}% Tie) | Guide: https://smarter.poker/learn/matchups/${canonicalMatchup.slug}`,
        canonicalUrl: `https://smarter.poker/learn/matchups/${canonicalMatchup.slug}`,
      };
    }
    const matched = PREFLOP_MATCHUPS.find((m) => m.pattern.test(queryText));
    const label = matched ? matched.label : 'QQ vs AKs (Classic Coinflip)';
    const eq = matched ? matched.equity : '53.7% Win vs 45.9% Win (0.4% Tie)';
    return {
      command: '!matchup',
      text: `[Smarter.Poker Matchups] ${label}: ${eq} | 25 Canonical Preflop Matchup Guides: https://smarter.poker/learn/matchups`,
      canonicalUrl: 'https://smarter.poker/learn/matchups',
    };
  }

  if (normalizedCmd === 'tax' || normalizedCmd === 'taxes' || normalizedCmd === 'w2g') {
    const nums = queryText
      .match(/\d+(?:\.\d+)?/g)
      ?.map((n) => parseFloat(n))
      .filter((n) => Number.isFinite(n) && n >= 0);
    const wins = nums && nums.length >= 1 ? Math.round(nums[0]) : 48000;
    const losses = nums && nums.length >= 2 ? Math.round(nums[1]) : 22000;
    const deduct = Math.min(wins, losses);
    const netTaxable = Math.max(0, wins - deduct);
    const estFedTax = Math.round(netTaxable * 0.24);
    return {
      command: '!tax',
      text: `[Smarter.Poker Tax] $${wins.toLocaleString()} Wins / $${losses.toLocaleString()} Losses: Net Taxable = $${netTaxable.toLocaleString()} (~$${estFedTax.toLocaleString()} Est. 24% Fed) | IRS Form W-2G Triggers >$5,000 Net | Calculator: https://smarter.poker/tools/poker-tax-calculator`,
      canonicalUrl: 'https://smarter.poker/tools/poker-tax-calculator',
    };
  }

  if (normalizedCmd === 'stake' || normalizedCmd === 'staking' || normalizedCmd === 'markup') {
    const nums = queryText
      .match(/\d+(?:\.\d+)?/g)
      ?.map((n) => parseFloat(n))
      .filter((n) => Number.isFinite(n) && n > 0);
    const pkg = nums && nums.length >= 1 ? Math.round(nums[0]) : 5000;
    const markup = nums && nums.length >= 2 ? Number(nums[1].toFixed(2)) : 1.15;
    const pct = nums && nums.length >= 3 ? Math.min(100, nums[2]) : 10;
    const cost = Math.round(pkg * (pct / 100) * markup);
    const breakevenRoi = ((markup - 1) * 100).toFixed(1);
    return {
      command: '!stake',
      text: `[Smarter.Poker Staking] $${pkg.toLocaleString()} Package @ ${markup}x Markup: ${pct}% Share = $${cost.toLocaleString()} | Investor Breakeven ROI = +${breakevenRoi}% | Split Calculator: https://smarter.poker/tools/staking-calculator`,
      canonicalUrl: 'https://smarter.poker/tools/staking-calculator',
    };
  }

  if (normalizedCmd === 'iso' || normalizedCmd === 'isolation') {
    const nums = queryText
      .match(/\d+(?:\.\d+)?/g)
      ?.map((n) => parseFloat(n))
      .filter((n) => Number.isFinite(n) && n > 0);
    const limpers = nums && nums.length >= 1 ? Math.min(6, Math.max(1, Math.round(nums[0]))) : 2;
    const isOop = /\boop|sb|bb\b/i.test(queryText);
    const isoBb = 3 + limpers + (isOop ? 1 : 0);
    const flopPotBb = Number((isoBb * 2 + (limpers - 1) + 1.5).toFixed(1));
    const spr = Number(((100 - isoBb) / flopPotBb).toFixed(1));
    return {
      command: '!iso',
      text: `[Smarter.Poker Iso] ${limpers} Limper(s) (${isOop ? 'OOP' : 'IP'}): Optimal Raise = ${isoBb}BB (3BB + 1BB/Limper${isOop ? ' + 1BB OOP' : ''}) | HU Flop Pot = ${flopPotBb}BB (SPR ${spr} @ 100BB) | Tool: https://smarter.poker/tools/iso-calculator`,
      canonicalUrl: 'https://smarter.poker/tools/iso-calculator',
    };
  }

  if (
    normalizedCmd === 'series' ||
    normalizedCmd === 'tour' ||
    normalizedCmd === 'wsop' ||
    normalizedCmd === 'wpt' ||
    normalizedCmd === 'mspt'
  ) {
    const aliasMap = {
      wsop: 'wsop-las-vegas',
      wpt: 'wpt-world-championship',
      wsopc: 'wsop-circuit',
      mspt: 'mspt-mid-states-poker-tour',
      'mspt-major': 'mspt-mid-states-poker-tour',
      rgps: 'rgps-rungood-poker-series',
      'run-good-poker-series': 'rgps-rungood-poker-series',
      shrpo: 'seminole-hard-rock-poker-open',
      borgata: 'borgata-poker-open',
      'borgata-open': 'borgata-poker-open',
      wynn: 'wynn-millions-classic',
      'wynn-millions': 'wynn-millions-classic',
      venetian: 'venetian-deepstack-championship',
      'venetian-deepstack': 'venetian-deepstack-championship',
      tch: 'texas-card-house-lodge-championship',
      'texas-card-house-series': 'texas-card-house-lodge-championship',
    };
    const rawTarget = (
      queryText || (normalizedCmd !== 'series' && normalizedCmd !== 'tour' ? normalizedCmd : 'wsop-las-vegas')
    )
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-');
    const resolvedSlug = aliasMap[rawTarget] || rawTarget;
    const guide =
      getSeriesGuideBySlug(resolvedSlug) ||
      SERIES_GUIDES.find(
        (g) =>
          g.slug.includes(rawTarget) ||
          g.name.toLowerCase().includes(rawTarget) ||
          g.shortName.toLowerCase().includes(rawTarget)
      ) ||
      SERIES_GUIDES[0];

    return {
      command: '!series',
      text: `[Smarter.Poker Series] ${guide.shortName} (${guide.cityState}): Buy-Ins ${guide.buyInRange} (Main: ${guide.mainEventBuyIn}) | Structure: ${guide.blindStructureRating} | Guide: https://smarter.poker/poker-series/guides/${guide.slug}`,
      canonicalUrl: `https://smarter.poker/poker-series/guides/${guide.slug}`,
    };
  }

  if (normalizedCmd === 'board' || normalizedCmd === 'flop' || normalizedCmd === 'texture') {
    const rawBoard = queryText || 'AsKh7d';
    const tokens = rawBoard.match(/(?:10|[2-9TJQKA])[shdc]/gi) || ['As', 'Kh', '7d'];
    const cards = tokens.slice(0, 3).map((t) => `${t.slice(0, -1).toUpperCase()}${t.slice(-1).toLowerCase()}`);
    const rankMap = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, T: 10, J: 11, Q: 12, K: 13, A: 14 };
    const ranks = cards.map((c) => rankMap[c.slice(0, -1)] || 10).sort((a, b) => b - a);
    const suits = cards.map((c) => c.slice(-1));
    const uniqueSuits = new Set(suits).size;
    const suitLabel = uniqueSuits === 1 ? 'Monotone' : uniqueSuits === 2 ? 'Two-Tone' : 'Rainbow';
    const uniqueRanks = new Set(ranks).size;
    const pairLabel = uniqueRanks === 1 ? 'Trips' : uniqueRanks === 2 ? 'Paired' : 'Unpaired';
    const span = (ranks[0] || 14) - (ranks[2] || 7);
    const highCards = ranks.filter((r) => r >= 11).length;
    const adv = highCards >= 2 ? 'PFR Range Advantage' : span <= 4 && ranks[0] <= 10 ? 'BB Caller Advantage' : 'Moderate PFR Edge';
    const cbet = uniqueSuits === 1 ? '25%-33% Pot (42% Freq)' : highCards >= 2 && uniqueSuits === 3 ? '33% Pot (85% Range Bet)' : span <= 4 && ranks[0] <= 10 ? '66%-75% Polarized Or Check' : '33% Pot (75% Freq)';

    return {
      command: '!board',
      text: `[Smarter.Poker Board] [${cards.join(' ')}] (${suitLabel}, ${pairLabel}): ${adv} | GTO C-Bet: ${cbet} | Analyzer: https://smarter.poker/tools/board-texture-analyzer`,
      canonicalUrl: 'https://smarter.poker/tools/board-texture-analyzer',
    };
  }

  if (normalizedCmd === 'mratio' || normalizedCmd === 'm') {
    const nums = queryText
      .match(/\d+(?:\.\d+)?/g)
      ?.map((n) => parseFloat(n))
      .filter((n) => Number.isFinite(n) && n >= 0);
    const stack = nums && nums.length >= 1 ? nums[0] : 25000;
    const sb = nums && nums.length >= 2 ? nums[1] : 500;
    const bb = nums && nums.length >= 3 ? nums[2] : 1000;
    const ante = nums && nums.length >= 4 ? nums[3] : bb;
    const players = nums && nums.length >= 5 ? Math.min(10, Math.max(2, Math.round(nums[4]))) : 9;
    const orbitCost = Math.max(1, sb + bb + ante);
    const mRatio = (stack / orbitCost).toFixed(1);
    const effM = ((stack / orbitCost) * (players / 10)).toFixed(1);
    const mVal = parseFloat(effM);
    const zone = mVal >= 20 ? 'Green Zone' : mVal >= 10 ? 'Yellow Zone' : mVal >= 6 ? 'Orange Zone' : mVal >= 1 ? 'Red Zone (Push/Fold)' : 'Dead Zone';

    return {
      command: '!mratio',
      text: `[Smarter.Poker M-Ratio] Stack ${stack.toLocaleString()} (${(stack / bb).toFixed(1)}BB, Orbit ${orbitCost.toLocaleString()}): M = ${mRatio} | Effective M (${players}-Handed) = ${effM} (${zone}) | Tool: https://smarter.poker/tools/m-ratio-calculator`,
      canonicalUrl: 'https://smarter.poker/tools/m-ratio-calculator',
    };
  }

  if (normalizedCmd === 'straddle' || normalizedCmd === 'bombpot') {
    const nums = queryText
      .match(/\d+(?:\.\d+)?/g)
      ?.map((n) => parseFloat(n))
      .filter((n) => Number.isFinite(n) && n > 0);
    const sb = nums && nums.length >= 1 ? nums[0] : 1;
    const bb = nums && nums.length >= 2 ? nums[1] : 3;
    const straddle = nums && nums.length >= 3 ? nums[2] : bb * 2;
    const stackDollars = bb * 100;
    const effBlinds = (stackDollars / straddle).toFixed(0);
    const bombPot8Way = bb * 5 * 8;

    return {
      command: '!straddle',
      text: `[Smarter.Poker Straddle] $${sb}/$${bb}/$${straddle}: Halves Stack From 100BB To ${effBlinds} Effective Blinds | 8-Way $5BB Double-Board Bomb Pot = $${bombPot8Way} Dead Money | Calculator: https://smarter.poker/tools/straddle-calculator`,
      canonicalUrl: 'https://smarter.poker/tools/straddle-calculator',
    };
  }

  if (normalizedCmd === 'sat' || normalizedCmd === 'satellite') {
    const nums = queryText
      .match(/\d+(?:\.\d+)?/g)
      ?.map((n) => parseFloat(n))
      .filter((n) => Number.isFinite(n) && n > 0);
    const remaining = nums && nums.length >= 1 ? Math.max(2, Math.round(nums[0])) : 12;
    const seats = nums && nums.length >= 2 ? Math.max(1, Math.min(remaining - 1, Math.round(nums[1]))) : 10;
    const totalChips = remaining * 35000;
    const targetStack = Math.round(totalChips / seats);
    const lockStack = Math.round(targetStack * 0.92);
    const bf = (1 + 2.4 * (seats / remaining)).toFixed(2);
    const reqEq = ((parseFloat(bf) / (parseFloat(bf) + 1)) * 100).toFixed(1);

    return {
      command: '!sat',
      text: `[Smarter.Poker Satellite] ${remaining} Left For ${seats} Seats: Target Stack = ${targetStack.toLocaleString()} (Seat-Lock ~${lockStack.toLocaleString()}) | Bubble Factor = ${bf}x (${reqEq}% Equity To Call; Fold AA When Locked!) | Tool: https://smarter.poker/tools/satellite-calculator`,
      canonicalUrl: 'https://smarter.poker/tools/satellite-calculator',
    };
  }

  if (normalizedCmd === 'bbj' || normalizedCmd === 'promo') {
    const nums = queryText
      .match(/\d+(?:\.\d+)?/g)
      ?.map((n) => parseFloat(n))
      .filter((n) => Number.isFinite(n) && n > 0);
    const pool = nums && nums.length >= 1 ? Math.round(nums[0]) : 250000;
    const breakevenPool = 37650;
    const evPerHand = (((pool * 0.85) / 9) / 32000 - 1 / 9).toFixed(2);
    const status = pool >= breakevenPool ? '+EV Jackpot Pool' : 'Below Breakeven';

    return {
      command: '!bbj',
      text: `[Smarter.Poker BBJ] $${pool.toLocaleString()} Pool (Aces Full Of Tens Qualifier, ~1-In-32,000 Hands): Net Seat EV = $${evPerHand}/Hand (${status}; Breakeven = $${breakevenPool.toLocaleString()}) | Tool: https://smarter.poker/tools/promo-ev-calculator`,
      canonicalUrl: 'https://smarter.poker/tools/promo-ev-calculator',
    };
  }

  if (normalizedCmd === 'position' || normalizedCmd === 'pos') {
    const posData = {
      utg: { slug: 'utg', label: 'UTG (Under The Gun)', rfi: '10.5%', threeBet: '3.2%', wr: '+11.5 BB/100' },
      'utg-1': { slug: 'utg-1', label: 'UTG+1', rfi: '12.2%', threeBet: '3.8%', wr: '+12.8 BB/100' },
      mp: { slug: 'mp', label: 'MP (Middle Position)', rfi: '14.8%', threeBet: '4.5%', wr: '+14.5 BB/100' },
      lj: { slug: 'lj', label: 'LJ (Lojack / 6-Max UTG)', rfi: '17.5%', threeBet: '5.4%', wr: '+17.2 BB/100' },
      hj: { slug: 'hj', label: 'HJ (Hijack)', rfi: '21.5%', threeBet: '6.8%', wr: '+21.0 BB/100' },
      co: { slug: 'co', label: 'CO (Cutoff)', rfi: '27.8%', threeBet: '8.9%', wr: '+28.4 BB/100' },
      btn: { slug: 'btn', label: 'BTN (Button / Dealer)', rfi: '44.5%', threeBet: '11.4%', wr: '+42.0 BB/100' },
      sb: { slug: 'sb', label: 'SB (Small Blind)', rfi: '41.0%', threeBet: '12.5%', wr: '-14.5 BB/100' },
      bb: { slug: 'bb', label: 'BB (Big Blind)', rfi: '0.0% (38.5% Defend)', threeBet: '10.8%', wr: '-26.0 BB/100' },
    };
    const cleanPos = queryText.toLowerCase().trim().replace(/\+/g, '-');
    const alias = { button: 'btn', dealer: 'btn', cutoff: 'co', hijack: 'hj', lojack: 'lj', utg1: 'utg-1' }[cleanPos] || cleanPos;
    const p = posData[alias] || posData.btn;

    return {
      command: '!position',
      text: `[Smarter.Poker Position] ${p.label}: GTO RFI = ${p.rfi} | 3-Bet = ${p.threeBet} | Expected Winrate = ${p.wr} | Seat Guide: https://smarter.poker/learn/positions/${p.slug}`,
      canonicalUrl: `https://smarter.poker/learn/positions/${p.slug}`,
    };
  }

  if (normalizedCmd === 'math' || normalizedCmd === 'formula') {
    const cleanQ = queryText.toLowerCase().trim();
    const formulas = {
      mdf: 'MDF (Minimum Defense Frequency) = Pot / (Pot + Bet) | Half-Pot Bet = 66.7% MDF, Pot-Sized Bet = 50.0% MDF',
      spr: 'SPR (Stack-To-Pot Ratio) = Effective Stack / Pot | 2-Street Geometric Bet % = ((sqrt(1 + 2*SPR) - 1) / 2) * 100',
      ev: 'Expected Value (EV) = (%Win * $Won) - (%Lose * $Lost) | Required Fold Equity = Risk / (Risk + Reward)',
      kelly: 'Bankroll Risk Of Ruin (RoR) = exp(-2 * Winrate * Bankroll / Variance) | 5% RoR @ 5 BB/100 & 85 SD = ~22 Buy-Ins',
      potodds: 'Required Calling Equity (%) = Call / (Pot + Bet + Call) | 50% Pot Bet = 25.0% Equity, 100% Pot Bet = 33.3% Equity',
    };
    const fText = formulas[cleanQ] || formulas.mdf;

    return {
      command: '!math',
      text: `[Smarter.Poker Math] ${fText} | 20 Core Poker Formulas: https://smarter.poker/learn/poker-math`,
      canonicalUrl: 'https://smarter.poker/learn/poker-math',
    };
  }

  if (normalizedCmd === 'iq' || normalizedCmd === 'quiz' || normalizedCmd === 'test') {
    return {
      command: '!iq',
      text: `[Smarter.Poker GTO IQ Test] Can You Pass All 10 Solver Scenarios (Pot Odds, MDF, ICM, PKO Bounties & Combinatorics)? Take The Free 3-Minute Diagnostic: https://smarter.poker/tools/poker-iq-test`,
      canonicalUrl: 'https://smarter.poker/tools/poker-iq-test',
    };
  }

  return {
    command: '!help',
    text: `[Smarter.Poker Streamer Bot] 26 Commands: !odds, !potodds, !pushfold, !icm, !bounty, !winrate, !plo, !rake, !3bet, !rule, !chop, !outs, !variance, !matchup, !tax, !stake, !iso, !series, !board, !mratio, !straddle, !sat, !bbj, !position, !math, !iq | Setup: https://smarter.poker/tools/embeds`,
    canonicalUrl: 'https://smarter.poker/tools/embeds',
  };
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { cmd = 'help', q = '', pot = '', bet = '', format = 'text', channel = '' } = req.query || {};
  const result = evaluateStreamCommand({ cmd, q, pot, bet });
  recordSeoTelemetryEvent({
    category: 'streamer_commands',
    item: result.command || String(cmd || 'help'),
    partner: channel || req.headers?.['nightbot-channel'] || req.headers?.referer || '',
    source: 'stream-cmd',
  });

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (String(format || '').toLowerCase() === 'json') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json({
      ...result,
      available_commands: STREAMER_BOT_COMMANDS,
    });
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(200).send(result.text);
}
