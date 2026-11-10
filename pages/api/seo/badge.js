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
    label: 'Verified Poker Room',
    value: 'Smarter.Poker Directory',
    accent: '#10b981',
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
    label: 'Official Poker Rules',
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
  const preset = PRESETS[type] || PRESETS.venue;
  const leftText = String(label || preset.label).slice(0, 48);
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

export function renderOgCardSvg({
  title = 'Smarter.Poker GTO & Quantitative Poker Intelligence',
  subtitle = '24 Free Interactive Calculators • 169 Hand Guides • 500+ Live Rooms',
  stat = '100% Free - Zero Login Required',
} = {}) {
  const safeTitle = escapeXml(String(title || 'Smarter.Poker GTO & Quantitative Poker Intelligence').slice(0, 86));
  const safeSubtitle = escapeXml(
    String(subtitle || '24 Free Interactive Calculators • 169 Hand Guides • 500+ Live Rooms').slice(0, 110)
  );
  const safeStat = escapeXml(
    String(stat || '100% Free - Zero Login Required')
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
    <text x="108" y="518" fill="#64748b" font-size="20" font-weight="700">smarter.poker • Open Quantitative Poker Intelligence &amp; 30-Tool MCP Server</text>
  </g>
</svg>`;
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const {
    type = 'venue',
    mode = '',
    label = '',
    value = '',
    theme = '',
    title = '',
    subtitle = '',
    stat = '',
  } = req.query || {};

  const isOg =
    String(mode || '').toLowerCase() === 'og' ||
    String(type || '').toLowerCase() === 'og-card';

  const svg = isOg
    ? renderOgCardSvg({
        title: title || 'Smarter.Poker GTO & Quantitative Poker Intelligence',
        subtitle: subtitle || '24 Free Interactive Calculators • 169 Hand Guides • 500+ Live Rooms',
        stat: stat || '100% Free - Zero Login Required',
      })
    : renderBadgeSvg({ type, label, value, theme });

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).send(svg);
}
