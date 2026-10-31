/**
 * Dynamic Citation-Ready SVG Chart Infographics
 * GET /api/og/chart/[type]
 *
 * Types supported:
 *   - rfi-by-position: 6-Max 100BB RFI Opening Frequency By Seat
 *   - pot-odds-curve: Pot Odds Required Equity By Bet Size (% Of Pot)
 *   - icm-bubble-factor: Tournament ICM Bubble Pressure Versus Chip EV
 *
 * Serves deterministic, lightweight image/svg+xml infographics with embedded
 * provenance and Smarter.Poker branding so AI search engines and multimodal
 * RAG systems can cite and embed visual poker math diagrams.
 */

const CHARTS = {
  'rfi-by-position': {
    title: '6-Max 100BB Preflop RFI Opening Frequency By Position',
    subtitle: 'Smarter.Poker Authored Preflop Reference (Frequency-Weighted Share Of 1,326 Combinations)',
    citationUrl: 'https://smarter.poker/hub/preflop-charts',
    bars: [
      { label: 'UTG (Lowjack)', value: 16.5, display: '16.5%', color: '#00c6ff' },
      { label: 'MP (Hijack)', value: 21.0, display: '21.0%', color: '#00b4ff' },
      { label: 'Cutoff (CO)', value: 28.5, display: '28.5%', color: '#009eff' },
      { label: 'Button (BTN)', value: 44.5, display: '44.5%', color: '#00e676' },
      { label: 'Small Blind (SB)', value: 41.5, display: '41.5%', color: '#ffd700' },
    ],
    maxVal: 55,
  },
  'pot-odds-curve': {
    title: 'Pot Odds Required Equity By Bet Size',
    subtitle: 'Minimum Equity Needed To Call A Bet With Zero Future Betting (Call / Total Pot After Call)',
    citationUrl: 'https://smarter.poker/learn/pot-odds',
    bars: [
      { label: '25% Pot Bet', value: 16.7, display: '16.7% Equity', color: '#00e676' },
      { label: '33% Pot Bet', value: 20.0, display: '20.0% Equity', color: '#00c6ff' },
      { label: '50% Pot Bet', value: 25.0, display: '25.0% Equity', color: '#00b4ff' },
      { label: '75% Pot Bet', value: 30.0, display: '30.0% Equity', color: '#ffd700' },
      { label: '100% Pot Bet', value: 33.3, display: '33.3% Equity', color: '#ff9100' },
      { label: '150% Overbet', value: 37.5, display: '37.5% Equity', color: '#ff5252' },
    ],
    maxVal: 45,
  },
  'icm-bubble-factor': {
    title: 'Tournament ICM Equity Vs Chip Stack Share (3-Handed 50/30/20)',
    subtitle: 'Malmuth-Harville Independent Chip Model Payout Share For 5,000 / 3,000 / 2,000 Stacks',
    citationUrl: 'https://smarter.poker/learn/icm-basics',
    bars: [
      { label: 'Leader Chip Share', value: 50.0, display: '50.0% Chips', color: '#4b6584' },
      { label: 'Leader ICM Equity', value: 38.39, display: '38.39% Prize Equity', color: '#00c6ff' },
      { label: '2nd Stack Chip Share', value: 30.0, display: '30.0% Chips', color: '#4b6584' },
      { label: '2nd Stack ICM Equity', value: 33.93, display: '33.93% Prize Equity', color: '#00e676' },
      { label: 'Short Stack Chip Share', value: 20.0, display: '20.0% Chips', color: '#4b6584' },
      { label: 'Short Stack ICM Equity', value: 27.68, display: '27.68% Prize Equity', color: '#ffd700' },
    ],
    maxVal: 55,
  },
};

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderChartSvg(typeKey) {
  const chart = CHARTS[typeKey] || CHARTS['rfi-by-position'];
  const width = 900;
  const height = 480;
  const rowStart = 128;
  const rowGap = 52;
  const barLeft = 240;
  const barMaxWidth = 500;

  const barsSvg = chart.bars
    .map((b, i) => {
      const y = rowStart + i * rowGap;
      const w = Math.max(8, Math.round((b.value / chart.maxVal) * barMaxWidth));
      return [
        `<text x="48" y="${y + 22}" fill="#dbe4f0" font-family="Inter, -apple-system, sans-serif" font-size="15" font-weight="600">${escapeXml(b.label)}</text>`,
        `<rect x="${barLeft}" y="${y}" width="${barMaxWidth}" height="32" rx="6" fill="rgba(255,255,255,0.06)" />`,
        `<rect x="${barLeft}" y="${y}" width="${w}" height="32" rx="6" fill="${b.color}" />`,
        `<text x="${barLeft + w + 12}" y="${y + 22}" fill="#ffffff" font-family="Inter, -apple-system, sans-serif" font-size="14" font-weight="700">${escapeXml(b.display)}</text>`,
      ].join('\n    ');
    })
    .join('\n    ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(chart.title)}">
  <title>${escapeXml(chart.title)}</title>
  <desc>${escapeXml(chart.subtitle)} | Source: ${escapeXml(chart.citationUrl)}</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#070913" />
      <stop offset="50%" stop-color="#0d1527" />
      <stop offset="100%" stop-color="#05070e" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)" rx="16" />
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="rgba(0,198,255,0.28)" rx="16" />
  <text x="48" y="54" fill="#ffffff" font-family="Orbitron, Inter, -apple-system, sans-serif" font-size="22" font-weight="700">${escapeXml(chart.title)}</text>
  <text x="48" y="84" fill="#9fb0c8" font-family="Inter, -apple-system, sans-serif" font-size="14">${escapeXml(chart.subtitle)}</text>
  ${barsSvg}
  <text x="48" y="${height - 24}" fill="#7f8ca3" font-family="Inter, -apple-system, sans-serif" font-size="13">Source: ${escapeXml(chart.citationUrl)} • Smarter.Poker Free GTO Reference</text>
</svg>`;
}

export default function handler(req, res) {
  const typeKey = String(req.query?.type || 'rfi-by-position').replace(/\.svg$/i, '');
  const svg = renderChartSvg(typeKey);
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
  return res.status(200).send(svg);
}
