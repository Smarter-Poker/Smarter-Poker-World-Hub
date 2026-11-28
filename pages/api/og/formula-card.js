/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  GET /api/og/formula-card
 *  Dynamic 1200x630 Vector SVG Infographic Card For Poker Formulas & Benchmarks
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Renders a publication-grade 1200x630 SVG infographic card
 * (`Content-Type: image/svg+xml; charset=utf-8`) for any canonical poker formula
 * or benchmark (`?slug=pot-odds` or `?title=...&equation=...&rule=...`).
 *
 * House style: Title Case, zero em dashes.
 */

export const FORMULA_CARD_PRESETS = {
  'pot-odds': {
    badge: 'FOUNDATIONAL POT MATH',
    title: 'Pot Odds & Required Calling Equity Formula',
    equation: 'Required Equity (%) = Call / (Pot Before Bet + Bet + Call)',
    benchmark: '50% Pot Bet -> 25.00% Equity | 75% Pot Bet -> 30.00% Equity | 100% Pot Bet -> 33.33% Equity',
    rule: 'If Your Hand Or Draw Equity Exceeds Required Equity (Adjusted For Rake And Implied Odds), Call Because EV > 0.',
    url: 'https://smarter.poker/tools/pot-odds-calculator',
  },
  mdf: {
    badge: 'GTO SOLVER EQUILIBRIUM',
    title: 'Minimum Defense Frequency (MDF) Formula',
    equation: 'MDF (%) = Pot / (Pot + Bet) = 1 - Alpha',
    benchmark: '33% Bet -> 75.0% MDF | 50% Bet -> 66.7% MDF | 75% Bet -> 57.1% MDF | 100% Bet -> 50.0% MDF',
    rule: 'If Villain Can Bluff Profitably With Any Two Cards, Defend At Least MDF Of Your Range Via Calls And Raises.',
    url: 'https://smarter.poker/tools/pot-odds-calculator',
  },
  alpha: {
    badge: 'GTO SOLVER EQUILIBRIUM',
    title: 'Alpha Pure Bluff Breakeven Percentage',
    equation: 'Alpha (%) = Bet / (Pot + Bet) = 1 - MDF',
    benchmark: '33% Bluff -> 25.0% Folds | 50% Bluff -> 33.3% Folds | 75% Bluff -> 42.9% Folds | 100% Bluff -> 50.0% Folds',
    rule: 'If Population Folds More Frequently Than Alpha On A Scare-Card Runout, A Zero-Equity Bluff Prints Immediate Profit.',
    url: 'https://smarter.poker/tools/pot-odds-calculator',
  },
  'bluff-to-value': {
    badge: 'POLARIZED RIVER EQUILIBRIUM',
    title: 'Optimal Polarized River Bluff-To-Value Ratio',
    equation: 'Bluff Share Of Betting Range = Bet / (Pot + 2 * Bet)',
    benchmark: '50% Bet -> 25.0% Bluffs (1:3) | 75% Bet -> 30.0% Bluffs | 100% Bet -> 33.3% Bluffs (1:2) | 150% Overbet -> 37.5% Bluffs',
    rule: 'Balance Every River Value Bet With Bet / (Pot + 2*Bet) Bluff Share To Make Villain Bluff-Catchers Indifferent.',
    url: 'https://smarter.poker/learn/poker-math',
  },
  ev: {
    badge: 'EXPECTED VALUE MATHEMATICS',
    title: 'Expected Value (EV) Of Any Call, Bet Or All-In Shove',
    equation: 'EV = (P_Win * Net_Pot_Won) - (P_Lose * Risk_Amount)',
    benchmark: '40% Equity Call Of $100 Into $200 Pot -> EV = (0.40 * $200) - (0.60 * $100) = +$20.00',
    rule: 'Always Select The Legal Decision Branch With The Highest Positive Expected Value Across Large Hand Samples.',
    url: 'https://smarter.poker/learn/poker-math',
  },
  'geometric-sizing': {
    badge: 'MULTI-STREET OVERBET ENGINE',
    title: 'Multi-Street Geometric Bet Sizing (2e & 3e)',
    equation: 'g = 0.5 * (((2 * Stack + Pot) / Pot)^(1 / n) - 1)',
    benchmark: '100BB Single-Raised Pot (Pot 6.5BB, Stack 97BB, 3 Streets) -> Constant 79.4% Pot Bet Per Street',
    rule: 'When Holding A Nut Advantage, Bet Equal Geometric Fraction g On Each Street To Put Stacks All-In Smoothly On The River.',
    url: 'https://smarter.poker/tools/geometric-bet-calculator',
  },
  spr: {
    badge: 'POSTFLOP COMMITMENT MATH',
    title: 'Stack-To-Pot Ratio (SPR) Commitment Formula',
    equation: 'SPR = Effective_Remaining_Stack / Flop_Pot',
    benchmark: '3-Bet Pot SPR: 2.5 - 4.5 (Overpair Commitment) | Single-Raised Pot SPR: 12 - 15 (Implied Odds Zone)',
    rule: 'If Flop SPR <= 3.5, Commit With Top-Pair Top-Kicker And Overpairs; If SPR >= 12, Prioritize Nut-Drawing Hands.',
    url: 'https://smarter.poker/tools/spr-calculator',
  },
  icm: {
    badge: 'TOURNAMENT PAYOUT SOLVER',
    title: 'Malmuth-Harville Independent Chip Model (ICM) & Bubble Factor',
    equation: 'Bubble_Factor = Dollar_EV_Lost / Dollar_EV_Gained | Req_Eq = BF / (BF + 1)',
    benchmark: 'Medium-Stack Bubble Factor 1.75 -> Requires 63.64% Calling Equity (+13.64% ICM Risk Premium Over Chip-EV)',
    rule: 'On Tournament Final-Table And Money Bubbles, Tighten All-In Calling Ranges By Your Exact ICM Risk Premium.',
    url: 'https://smarter.poker/tools/icm-calculator',
  },
  'risk-of-ruin': {
    badge: 'BANKROLL & VARIANCE ENGINE',
    title: 'Brownian Motion Risk Of Ruin (RoR) & Sample Size',
    equation: 'RoR = exp((-2 * Winrate * Bankroll) / Variance) | N_95 = ((1.96 * SD) / WR)^2 * 100',
    benchmark: '5.0 BB/100 Winrate & 85 BB/100 StdDev -> 21.7 Buy-Ins For 5% RoR & 111,023 Hands For 95% Winrate Proof',
    rule: 'Scale Your Bankroll Proportionally To Format Variance (StdDev Squared) And Never Judge Winrate Under 50,000 Hands.',
    url: 'https://smarter.poker/tools/bankroll-calculator',
  },
  hypergeometric: {
    badge: 'COMBINATORIAL DRAW ENGINE',
    title: 'Exact Two-Card Hypergeometric Draw Probability',
    equation: 'P_Flop_To_River = 1 - (((47 - Outs) / 47) * ((46 - Outs) / 46))',
    benchmark: '8 Outs (OESD) -> 31.45% | 9 Outs (Flush Draw) -> 34.97% | 15 Outs (Combo Draw) -> 54.12%',
    rule: 'Use Exact Hypergeometric Combinatorics For 12+ Out Combo And PLO Wrap Draws Where Rule Of 4 Overestimates Equity.',
    url: 'https://smarter.poker/tools/outs-calculator',
  },
};

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(str, max = 96) {
  const clean = String(str || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 3).trim()}...`;
}

export function buildFormulaCardSvg({
  slug = 'pot-odds',
  title = '',
  equation = '',
  rule = '',
  benchmark = '',
  badge = '',
} = {}) {
  const normalizedSlug = String(slug || 'pot-odds').trim().toLowerCase();
  const preset = FORMULA_CARD_PRESETS[normalizedSlug] || FORMULA_CARD_PRESETS['pot-odds'];

  const effectiveBadge = truncate(badge || preset.badge, 48).toUpperCase();
  const effectiveTitle = truncate(title || preset.title, 68);
  const effectiveEquation = truncate(equation || preset.equation, 78);
  const effectiveBenchmark = truncate(benchmark || preset.benchmark, 108);
  const effectiveRule = truncate(rule || preset.rule, 114);
  const effectiveUrl = preset.url || 'https://smarter.poker/learn/poker-math';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapeXml(effectiveTitle)}">
  <defs>
    <linearGradient id="cardBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#050811"/>
      <stop offset="50%" stop-color="#0d1629"/>
      <stop offset="100%" stop-color="#050811"/>
    </linearGradient>
    <linearGradient id="eqBoxBg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#091326"/>
      <stop offset="100%" stop-color="#0f213d"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" rx="18" fill="url(#cardBg)" stroke="#1e293b" stroke-width="3"/>

  <!-- Top Branding Header -->
  <text x="56" y="64" fill="#FFD700" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="24" font-weight="900" letter-spacing="2">SMARTER.POKER</text>
  <rect x="285" y="40" width="340" height="32" rx="8" fill="#082438" stroke="#38bdf8" stroke-width="1.5"/>
  <text x="455" y="61" text-anchor="middle" fill="#38bdf8" font-family="JetBrains Mono, monospace, sans-serif" font-size="13" font-weight="800" letter-spacing="1">${escapeXml(effectiveBadge)}</text>

  <rect x="860" y="40" width="284" height="32" rx="16" fill="#06281e" stroke="#10b981" stroke-width="1.5"/>
  <text x="1002" y="61" text-anchor="middle" fill="#34d399" font-family="JetBrains Mono, monospace, sans-serif" font-size="12.5" font-weight="700">DOI: 10.5281/zenodo.24115647</text>

  <!-- Formula Title -->
  <text x="56" y="136" fill="#f8fafc" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="36" font-weight="900">${escapeXml(effectiveTitle)}</text>

  <!-- Central Mathematical Equation Plate -->
  <rect x="56" y="172" width="1088" height="128" rx="14" fill="url(#eqBoxBg)" stroke="#38bdf8" stroke-width="2"/>
  <text x="84" y="206" fill="#38bdf8" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="13" font-weight="800" letter-spacing="1.4">CANONICAL DETERMINISTIC EQUATION</text>
  <text x="84" y="258" fill="#ffffff" font-family="JetBrains Mono, Menlo, monospace, sans-serif" font-size="27" font-weight="800">${escapeXml(effectiveEquation)}</text>

  <!-- Quantitative Benchmark Strip -->
  <rect x="56" y="326" width="1088" height="86" rx="12" fill="#091120" stroke="#1e293b" stroke-width="1.5"/>
  <text x="84" y="356" fill="#34d399" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="13" font-weight="800" letter-spacing="1.2">SOLVER &amp; COMBINATORIAL BENCHMARK THRESHOLDS</text>
  <text x="84" y="388" fill="#e2e8f0" font-family="JetBrains Mono, monospace, sans-serif" font-size="17.5" font-weight="700">${escapeXml(effectiveBenchmark)}</text>

  <!-- If / Then / Because Decision Rule Box -->
  <rect x="56" y="436" width="1088" height="96" rx="12" fill="#0b1526" stroke="#f59e0b" stroke-width="1.5"/>
  <text x="84" y="468" fill="#f59e0b" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="13" font-weight="800" letter-spacing="1.2">IF / THEN / BECAUSE STRATEGIC DECISION RULE</text>
  <text x="84" y="502" fill="#f8fafc" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="17" font-weight="600">${escapeXml(effectiveRule)}</text>

  <!-- Footer Attribution -->
  <line x1="56" y1="560" x2="1144" y2="560" stroke="#1e293b" stroke-width="1.5"/>
  <text x="56" y="592" fill="#94a3b8" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="15" font-weight="600">Interactive Solver: ${escapeXml(effectiveUrl)} • 52 Free Calculators &amp; 70 MCP Tools</text>
  <text x="1144" y="592" text-anchor="end" fill="#38bdf8" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="15" font-weight="700">CC BY 4.0 • Verified 2026-11-24</text>
</svg>`;
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const {
    slug = 'pot-odds',
    title = '',
    equation = '',
    rule = '',
    benchmark = '',
    badge = '',
  } = req.query || {};

  const svg = buildFormulaCardSvg({
    slug,
    title,
    equation,
    rule,
    benchmark,
    badge,
  });

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).send(svg);
}
