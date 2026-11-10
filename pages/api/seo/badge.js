/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  /api/seo/badge - Dynamic SVG Authority & Backlink Badge Generator
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Serves crisp, zero-dependency SVG badges for poker rooms, Club Commander
 * venues, strategy blogs, journalists, and GitHub repositories to embed
 * alongside canonical attribution links back to Smarter.Poker.
 *
 * Query Parameters:
 * - type: 'venue' | 'commander' | 'research' | 'gto' | 'club' (default: 'venue')
 * - label: Custom left-side label (optional)
 * - value: Custom right-side value (optional)
 * - theme: 'dark' | 'blue' | 'emerald' | 'gold' (default: preset per type)
 */

export const BADGE_PRESETS = {
  venue: {
    label: 'Public Directory Listing',
    value: 'Smarter.Poker Directory',
    accent: '#38bdf8',
  },
  'directory-listing': {
    label: 'Public Directory Listing',
    value: 'Smarter.Poker Directory',
    accent: '#38bdf8',
  },
  commander: {
    label: 'Live Waitlist & Clocks',
    value: 'Powered By Club Commander',
    accent: '#3b82f6',
  },
  research: {
    label: 'Empirical Data Source',
    value: 'Smarter.Poker Research',
    accent: '#38bdf8',
  },
  gto: {
    label: 'GTO Math Verified',
    value: 'Smarter.Poker Solver',
    accent: '#f59e0b',
  },
  club: {
    label: 'Private Club Platform',
    value: 'Smarter.Poker Club Arena',
    accent: '#a855f7',
  },
  daily: {
    label: 'Daily GTO Challenge',
    value: 'Solver Verified On Smarter.Poker',
    accent: '#25c8ff',
  },
  rules: {
    label: 'Floor Rule Reference',
    value: 'Smarter.Poker TDA & RROP',
    accent: '#f2b84b',
  },
  'award-top50': {
    label: 'US Live Poker Room Index',
    value: 'Smarter.Poker Directory',
    accent: '#f59e0b',
  },
  'award-texas': {
    label: 'Texas Card Room Benchmark',
    value: 'Smarter.Poker Directory',
    accent: '#10b981',
  },
  'award-vegas': {
    label: 'Las Vegas Room Benchmark',
    value: 'Smarter.Poker Directory',
    accent: '#f59e0b',
  },
  'award-florida': {
    label: 'Florida Room Benchmark',
    value: 'Smarter.Poker Directory',
    accent: '#38bdf8',
  },
  'award-california': {
    label: 'California Room Benchmark',
    value: 'Smarter.Poker Directory',
    accent: '#3b82f6',
  },
  'award-cpa': {
    label: 'Form W-2G Tax Ledger',
    value: 'Smarter.Poker Bankroll Tool',
    accent: '#10b981',
  },
  'award-dealer': {
    label: 'Dealer Toke & Shift Tool',
    value: 'Smarter.Poker Toke Tracker',
    accent: '#a855f7',
  },
  'award-edu': {
    label: 'Poker Math & ICM Dataset',
    value: 'Smarter.Poker Research',
    accent: '#38bdf8',
  },
};

const PRESETS = BADGE_PRESETS;

const THEME_ACCENTS = {
  emerald: '#10b981',
  blue: '#3b82f6',
  sky: '#38bdf8',
  gold: '#f59e0b',
  purple: '#a855f7',
};

export function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function estimateTextWidth(text) {
  const clean = String(text || '');
  return Math.max(48, Math.round(clean.length * 6.7) + 22);
}

export function renderBadgeSvg({
  type = 'venue',
  label = '',
  value = '',
  theme = '',
} = {}) {
  const normalizedType = type === 'verified-venue' ? 'directory-listing' : type;
  const preset = PRESETS[normalizedType] || PRESETS.venue;
  // Prevent self-service venue badges from manufacturing "Verified Room" claims
  let rawLabel = String(label || preset.label).trim();
  if (
    (normalizedType === 'venue' || normalizedType === 'directory-listing') &&
    /verified/i.test(rawLabel)
  ) {
    rawLabel = rawLabel.replace(/verified/gi, 'Publicly Listed');
  }
  const leftText = rawLabel.slice(0, 48);
  const rightText = String(value || preset.value).slice(0, 56);
  const accentColor = THEME_ACCENTS[theme] || preset.accent;

  const leftWidth = estimateTextWidth(leftText) + 16;
  const rightWidth = estimateTextWidth(rightText);
  const totalWidth = leftWidth + rightWidth;
  const height = 28;

  const escapedLeft = escapeXml(leftText);
  const escapedRight = escapeXml(rightText);
  const ariaLabel = escapeXml(`${leftText}: ${rightText}`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}" role="img" aria-label="${ariaLabel}">
  <title>${ariaLabel}</title>
  <defs>
    <linearGradient id="bgLeft" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="bgRight" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#090d16"/>
    </linearGradient>
    <clipPath id="badgeClip">
      <rect width="${totalWidth}" height="${height}" rx="6" ry="6"/>
    </clipPath>
  </defs>
  <g clip-path="url(#badgeClip)">
    <rect width="${leftWidth}" height="${height}" fill="url(#bgLeft)"/>
    <rect x="${leftWidth}" width="${rightWidth}" height="${height}" fill="url(#bgRight)"/>
    <rect x="${leftWidth - 1}" width="2" height="${height}" fill="${accentColor}" opacity="0.85"/>
  </g>
  <rect x="0.5" y="0.5" width="${totalWidth - 1}" height="${height - 1}" rx="5.5" ry="5.5" fill="none" stroke="${accentColor}" stroke-opacity="0.45"/>
  <circle cx="13" cy="14" r="4" fill="${accentColor}"/>
  <g font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="11.5" text-rendering="geometricPrecision">
    <text x="23" y="18" fill="#e2e8f0" font-weight="600">${escapedLeft}</text>
    <text x="${leftWidth + Math.round(rightWidth / 2)}" y="18" fill="${accentColor}" font-weight="700" text-anchor="middle">${escapedRight}</text>
  </g>
</svg>`;
}

export const TOOL_OG_CATALOG = {
  'chop-calculator': {
    title: 'Tournament Deal & ICM Chop Calculator',
    subtitle: 'Compare ICM Chop, Chip Chop & 50/50 Hybrid Final Table Deals',
    stat: 'Exact Malmuth-Harville ICM - 100% Free',
  },
  'variance-calculator': {
    title: 'Poker Variance & Downswing Simulator',
    subtitle: '20-Run Brownian Sample Paths, 95% Confidence Intervals & Loss Probability',
    stat: 'Monte Carlo BB/100 Variance Engine',
  },
  'outs-calculator': {
    title: 'Poker Outs, Draw Equity & Rule of 4 and 2 Calculator',
    subtitle: 'Exact 47/46-Card Hypergeometric Turn & River Draw Probabilities',
    stat: '1 To 20 Clean Outs vs Rule Of 4 And 2',
  },
  'format-quiz': {
    title: 'Poker Format Recommender & Player Archetype Quiz',
    subtitle: 'Match Schedule, Bankroll & Risk Tolerance To Your Highest-EV Format',
    stat: 'Cash vs MTT vs PLO vs PKO Fit Score',
  },
  'poker-tax-calculator': {
    title: 'US Poker Tax & IRS Form W-2G Calculator',
    subtitle: 'Schedule A Session Loss Cap vs Schedule C Pro Filing & $5,000 W-2G Rules',
    stat: '2026 Federal & State Gambling Tax Estimator',
  },
  'staking-calculator': {
    title: 'Poker Tournament Staking & Markup Split Calculator',
    subtitle: 'Calculate Markup Share Cost, Breakeven ROI % & Net Investor/Horse Splits',
    stat: 'Instant Staking Package & Makeup Math',
  },
  'iso-calculator': {
    title: 'Pre-Flop Limper Isolation Raise Sizing Calculator',
    subtitle: 'Solver-Backed 3BB + 1BB/Limper + 1BB OOP Sizing & Postflop SPR',
    stat: 'Live & Online Cash Isolation Sizing',
  },
  'home-game-kit': {
    title: 'Home Poker Game Setup Kit & Chip Set Calculator',
    subtitle: 'Optimal Starting Chip Tubes, Case Breakdown & Printable House Rules',
    stat: 'Cash & Tournament Chip Distribution',
  },
  'poker-odds-calculator': {
    title: 'Multiway Poker Odds & Equity Calculator',
    subtitle: 'Texas Holdem, PLO4, PLO5, PLO6, 7-Card Stud & Razz Exact Equity Solver',
    stat: '6-Game Multiway Monte Carlo & Exact Solver',
  },
  'icm-calculator': {
    title: 'Malmuth-Harville Tournament ICM & Bubble Factor Calculator',
    subtitle: 'Final Table Dollar EV, Bubble Pressure & Risk Premium Matrix',
    stat: '2 To 9 Player Final Table ICM Solver',
  },
  'pot-odds-calculator': {
    title: 'Pot Odds, Implied Odds & Minimum Defense Frequency Calculator',
    subtitle: 'Required Equity %, MDF %, Bluff Breakeven % & Geometric Sizing',
    stat: 'Instant Street-By-Street EV Math',
  },
  'push-fold-calculator': {
    title: 'Short-Stack Push/Fold Nash Equilibrium Charts (5BB-20BB)',
    subtitle: '169-Hand Unexploitable Open-Shove & Call Matrices With Antes',
    stat: '5BB To 20BB Tournament Push/Fold Grids',
  },
  'bankroll-calculator': {
    title: 'Poker Bankroll & Risk-Of-Ruin Buy-In Calculator',
    subtitle: 'Required Buy-Ins For <1% Risk Of Ruin Across Cash, MTT & PLO',
    stat: 'Variance-Adjusted Bankroll Architecture',
  },
  'bounty-calculator': {
    title: 'PKO & Mystery Bounty Chip Equivalent Calculator',
    subtitle: 'Convert Knockout Bounties Into Starting-Stack Chips & Equity Drops',
    stat: 'Standard 50% PKO & Mystery Bounty Math',
  },
  'poker-winrate-calculator': {
    title: 'Poker Win-Rate (BB/100 & $/Hr) & Confidence Calculator',
    subtitle: 'True Hourly Rate, Standard Error & Required Sample Size Estimator',
    stat: 'Live & Online Win-Rate Analytics',
  },
  'side-pot-calculator': {
    title: 'Multi-Way All-In Side Pot & Chip Split Calculator',
    subtitle: 'Instant Main Pot & Side Pot Slices For Up To 9 All-In Players',
    stat: 'Zero-Error Casino Floor Side Pot Math',
  },
  'blind-structure-calculator': {
    title: 'Poker Tournament Blind Structure & Clock Generator',
    subtitle: 'Custom Starting Stacks, Ante Schedules & End-Time Pacing',
    stat: 'Turbo, Standard & Deepstack Structures',
  },
  'spr-calculator': {
    title: 'Stack-To-Pot Ratio (SPR) & Geometric Bet Sizing Calculator',
    subtitle: 'Compute Exact Equal-Percentage Flop, Turn & River Jam Sizings',
    stat: '1-Street, 2-Street & 3-Street Geometric Sizing',
  },
  'plo-bet-calculator': {
    title: 'Pot-Limit Omaha (PLO) Max Bet & Double-Board Bomb Pot Calculator',
    subtitle: 'Dealer 3x + Trail + Pot Formula & Preflop Pot Escalation',
    stat: 'Exact Pot-Limit Raise & Bomb Pot Math',
  },
  'payout-calculator': {
    title: 'Poker Tournament Prize Pool & Payout Structure Calculator',
    subtitle: ' balanced 10%, 15% & 20% ITM Prize Tables For Any Field Size',
    stat: 'Home Game & Cardroom Payout Generator',
  },
  'rake-calculator': {
    title: 'Live Cash Game Rake Cap vs Timed Seat Charge Calculator',
    subtitle: 'Compare Percentage Pot Drop vs Hourly Time Collection In BB/100',
    stat: 'True Annual & Hourly Rake Drag Analysis',
  },
  '3bet-calculator': {
    title: 'Pre-Flop 3-Bet, Squeeze & 4-Bet Sizing Calculator',
    subtitle: 'Solver-Approved IP/OOP Multipliers, Cold-Caller Tax & Villain MDF',
    stat: '100BB Cash & Tournament 3-Bet Matrix',
  },
  'preflop-ranges': {
    title: '100BB 6-Max GTO Preflop Range Explorer',
    subtitle: 'Interactive 169-Hand RFI, 3-Bet & 4-Bet Equilibrium Grids',
    stat: 'Solver-Verified 6-Max Preflop Charts',
  },
  embeds: {
    title: 'Free Embeddable Poker Calculators, Widgets & Streamer Bot',
    subtitle: 'Copy-Paste Iframe Tools, Nightbot Commands & Authority SVG Badges',
    stat: '18 Streamer Commands & Webmaster Embeds',
  },
};

export function renderOgCardSvg({
  slug = '',
  title = '',
  subtitle = '',
  stat = '',
} = {}) {
  const cleanSlug = String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/^tools\//, '');
  const toolPreset = TOOL_OG_CATALOG[cleanSlug] || null;

  const resolvedTitle =
    title ||
    toolPreset?.title ||
    'Smarter.Poker GTO & Quantitative Poker Intelligence';
  const resolvedSubtitle =
    subtitle ||
    toolPreset?.subtitle ||
    '24 Free Interactive Calculators • 169 Hand Guides • 500+ Live Rooms';
  const resolvedStat =
    stat ||
    toolPreset?.stat ||
    '100% Free - Zero Login Required';

  const safeTitle = escapeXml(String(resolvedTitle).slice(0, 86));
  const safeSubtitle = escapeXml(String(resolvedSubtitle).slice(0, 110));
  const safeStat = escapeXml(
    String(resolvedStat)
      .replace(/\u2014/g, '-')
      .slice(0, 72)
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${safeTitle}">
  <title>${safeTitle}</title>
  <defs>
    <linearGradient id="ogBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0f18"/>
      <stop offset="55%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#0a0f18"/>
    </linearGradient>
    <linearGradient id="cyanBar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#00d4ff"/>
      <stop offset="50%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#10b981"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#0a0f18"/>
  <rect width="1200" height="630" fill="url(#ogBg)"/>
  <rect x="0" y="0" width="1200" height="12" fill="#00d4ff"/>
  <rect x="64" y="64" width="1072" height="502" rx="24" ry="24" fill="#0d1524" stroke="#00d4ff" stroke-opacity="0.35" stroke-width="2"/>
  <g font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" text-rendering="geometricPrecision">
    <rect x="108" y="114" width="290" height="40" rx="20" ry="20" fill="#00d4ff" fill-opacity="0.14" stroke="#00d4ff" stroke-opacity="0.55"/>
    <circle cx="132" cy="134" r="6" fill="#00d4ff"/>
    <text x="150" y="140" fill="#00d4ff" font-size="16" font-weight="800" letter-spacing="1.5">SMARTER.POKER OFFICIAL</text>
    <text x="108" y="255" fill="#f8fafc" font-size="44" font-weight="800">${safeTitle}</text>
    <text x="108" y="325" fill="#94a3b8" font-size="25" font-weight="600">${safeSubtitle}</text>
    <rect x="108" y="388" width="560" height="64" rx="14" ry="14" fill="#071e2e" stroke="#00d4ff" stroke-width="2"/>
    <text x="138" y="429" fill="#00d4ff" font-size="24" font-weight="800">${safeStat}</text>
    <text x="108" y="518" fill="#64748b" font-size="20" font-weight="700">smarter.poker • Open Quantitative Poker Intelligence &amp; 35-Tool MCP Server</text>
  </g>
</svg>`;
}

export function renderToolOgCard(req, res) {
  const { slug = '', title = '', subtitle = '', stat = '' } = req?.query || {};
  const svg = renderOgCardSvg({ slug, title, subtitle, stat });
  if (res) {
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(svg);
  }
  return svg;
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const {
    type = 'venue',
    mode = '',
    slug = '',
    label = '',
    value = '',
    theme = '',
    title = '',
    subtitle = '',
    stat = '',
  } = req.query || {};

  const isOg =
    String(mode || '').toLowerCase() === 'og' ||
    String(type || '').toLowerCase() === 'og-card' ||
    Boolean(slug);

  if (isOg) {
    return renderToolOgCard(req, res);
  }

  const svg = renderBadgeSvg({ type, label, value, theme });

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).send(svg);
}
