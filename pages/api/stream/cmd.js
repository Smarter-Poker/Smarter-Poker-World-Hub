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

  return {
    command: '!help',
    text: `[Smarter.Poker Streamer Bot] Commands: !odds, !potodds <pot> <bet>, !pushfold, !icm, !bounty, !winrate | Add To Nightbot Or StreamElements Free: https://smarter.poker/tools/embeds`,
    canonicalUrl: 'https://smarter.poker/tools/embeds',
  };
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { cmd = 'help', q = '', pot = '', bet = '', format = 'text' } = req.query || {};
  const result = evaluateStreamCommand({ cmd, q, pot, bet });

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
