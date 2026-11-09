/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  /api/seo/badge - Dynamic SVG Authority & Backlink Badge Generator
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Serves crisp, zero-dependency SVG badges for poker rooms, Club Commander
 * venues, strategy blogs, journalists, and GitHub repositories to embed
 * alongside canonical dofollow attribution links back to Smarter.Poker.
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
  'award-top50': {
    label: '2026 Top 50 US Poker Room',
    value: 'Smarter.Poker Official Award',
    accent: '#f59e0b',
  },
  'award-texas': {
    label: '2026 Top Texas Card Club',
    value: 'Smarter.Poker Verified Index',
    accent: '#10b981',
  },
  'award-vegas': {
    label: '2026 Top Las Vegas Room',
    value: 'Smarter.Poker Verified Index',
    accent: '#f59e0b',
  },
  'award-florida': {
    label: '2026 Top Florida Room',
    value: 'Smarter.Poker Verified Index',
    accent: '#38bdf8',
  },
  'award-california': {
    label: '2026 Top California Cardroom',
    value: 'Smarter.Poker Verified Index',
    accent: '#3b82f6',
  },
  'award-cpa': {
    label: 'Form W-2G Tax Resource',
    value: 'Smarter.Poker Toke Tracker',
    accent: '#10b981',
  },
  'award-dealer': {
    label: 'Certified Dealer Resource',
    value: 'Smarter.Poker Academy',
    accent: '#a855f7',
  },
  'award-edu': {
    label: 'Quantitative Game Theory',
    value: 'Smarter.Poker Open Dataset',
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

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { type = 'venue', label = '', value = '', theme = '' } = req.query || {};
  const svg = renderBadgeSvg({ type, label, value, theme });

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).send(svg);
}
