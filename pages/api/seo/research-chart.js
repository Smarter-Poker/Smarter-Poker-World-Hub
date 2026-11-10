/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GET /api/seo/research-chart
 *  Dynamic Publication-Grade Vector SVG Benchmark Chart Generator
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Generates an embeddable, downloadable 880x460 vector SVG chart for any of
 * Smarter.Poker's 15 empirical research studies (?slug=...), complete with
 * proportional data bars, exact benchmark figures, Zenodo DOI archival tag,
 * and canonical CC BY 4.0 attribution footer.
 *
 * Query Parameters:
 *   - slug     : Research study slug (defaults to first study if omitted)
 *   - download : '1' or 'true' to trigger file download Content-Disposition
 *   - partner  : Optional partner domain for telemetry attribution
 */

import {
  RESEARCH_REPORTS,
  RESEARCH_DATASET_DOI,
  getResearchReport,
} from '../../../src/content/research/reports.js';
import { recordSeoTelemetryEvent } from './referral-stats.js';

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncateText(str, maxLen = 40) {
  const clean = String(str || '').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1).trim()}...`;
}

function extractNumericMetric(row) {
  const cells = Array.isArray(row) ? row.slice(1) : [];
  // Prefer cells containing %, BB/100, x, or $ numbers
  for (let i = cells.length - 1; i >= 0; i -= 1) {
    const cell = String(cells[i] || '');
    const rangeMatch = cell.match(/(\d+(?:\.\d+)?)\s*(?:To|-)\s*(\d+(?:\.\d+)?)/i);
    if (rangeMatch) {
      const avg = (parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2;
      if (Number.isFinite(avg) && avg > 0) {
        return { value: avg, display: truncateText(cell, 30) };
      }
    }
    const pctMatch = cell.match(/(\d+(?:\.\d+)?)\s*%/);
    if (pctMatch) {
      const val = parseFloat(pctMatch[1]);
      if (Number.isFinite(val) && val > 0) {
        return { value: val, display: truncateText(cell, 30) };
      }
    }
  }
  for (let i = 0; i < cells.length; i += 1) {
    const cell = String(cells[i] || '');
    const numMatch = cell.match(/(\d+(?:,\d{3})*(?:\.\d+)?)/);
    if (numMatch) {
      const val = parseFloat(numMatch[1].replace(/,/g, ''));
      if (Number.isFinite(val) && val > 0) {
        return { value: val, display: truncateText(cell, 30) };
      }
    }
  }
  return {
    value: 50,
    display: truncateText(cells[0] || 'Benchmark', 30),
  };
}

export function buildResearchChartSvg(report) {
  const target = report || RESEARCH_REPORTS[0];
  const rows = (target.table?.rows || []).slice(0, 6);
  const parsedRows = rows.map((row, idx) => {
    const label = truncateText(row[0] || `Row ${idx + 1}`, 34);
    const subLabel = truncateText(row[1] || '', 26);
    const metric = extractNumericMetric(row);
    return {
      label,
      subLabel,
      value: metric.value,
      display: metric.display,
    };
  });

  const maxValue = Math.max(...parsedRows.map((r) => r.value), 1);
  const width = 880;
  const height = 460;
  const chartLeft = 275;
  const maxBarWidth = 370;
  const startY = 128;
  const rowGap = 46;

  const barColors = ['#38bdf8', '#10b981', '#f59e0b', '#60a5fa', '#34d399', '#a78bfa'];

  const barsSvg = parsedRows
    .map((item, idx) => {
      const y = startY + idx * rowGap;
      const ratio = Math.min(1, Math.max(0.14, item.value / maxValue));
      const barWidth = Math.round(maxBarWidth * ratio);
      const color = barColors[idx % barColors.length];
      return `
    <g transform="translate(0, ${y})">
      <text x="28" y="15" fill="#f8fafc" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="13" font-weight="700">${escapeXml(item.label)}</text>
      <text x="28" y="31" fill="#94a3b8" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11">${escapeXml(item.subLabel)}</text>
      <rect x="${chartLeft}" y="4" width="${maxBarWidth}" height="24" rx="5" fill="#111c33" stroke="#1e293b" stroke-width="1"/>
      <rect x="${chartLeft}" y="4" width="${barWidth}" height="24" rx="5" fill="${color}" fill-opacity="0.88"/>
      <text x="${chartLeft + maxBarWidth + 14}" y="20" fill="${color}" font-family="JetBrains Mono, monospace, sans-serif" font-size="12.5" font-weight="700">${escapeXml(item.display)}</text>
    </g>`;
    })
    .join('\n');

  const keyFinding = truncateText(
    (target.keyFindings && target.keyFindings[0]) || target.summary || '',
    118
  );
  const doiText = target.doi || RESEARCH_DATASET_DOI;
  const canonicalUrl = `https://smarter.poker/research/${target.slug}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(target.title)}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#070b14"/>
      <stop offset="55%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#070b14"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="12" fill="url(#bgGrad)" stroke="#1e293b" stroke-width="2"/>

  <!-- Header Bar -->
  <text x="28" y="36" fill="#f59e0b" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="12" font-weight="800" letter-spacing="1.2">SMARTER.POKER QUANTITATIVE RESEARCH BENCHMARK</text>
  <rect x="652" y="18" width="200" height="24" rx="12" fill="#06281e" stroke="#10b981" stroke-width="1"/>
  <text x="752" y="34" text-anchor="middle" fill="#34d399" font-family="JetBrains Mono, monospace, sans-serif" font-size="10.5" font-weight="700">DOI: ${escapeXml(doiText)}</text>

  <text x="28" y="66" fill="#f8fafc" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="19" font-weight="800">${escapeXml(truncateText(target.title, 76))}</text>
  <text x="28" y="88" fill="#38bdf8" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="12.5" font-weight="600">${escapeXml(truncateText(target.table?.caption || target.category, 92))}</text>
  <line x1="28" y1="104" x2="852" y2="104" stroke="#1e293b" stroke-width="1"/>

  <!-- Benchmark Rows -->
  ${barsSvg}

  <!-- Key Finding Callout -->
  <rect x="28" y="400" width="824" height="26" rx="5" fill="#0b1324" stroke="#1e293b" stroke-width="1"/>
  <text x="40" y="417" fill="#cbd5e1" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11.5"><tspan fill="#38bdf8" font-weight="700">Primary Finding: </tspan>${escapeXml(keyFinding)}</text>

  <!-- Attribution Footer -->
  <text x="28" y="444" fill="#94a3b8" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11">Source: Smarter.Poker Research (${escapeXml(canonicalUrl)})</text>
  <text x="852" y="444" text-anchor="end" fill="#64748b" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11">License: CC BY 4.0 • Updated ${escapeXml(target.modifiedDate || '2026-11-10')}</text>
</svg>`;
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { slug = '', download = '', partner = '' } = req.query || {};
  const report = getResearchReport(String(slug || '').trim()) || RESEARCH_REPORTS[0];
  const svg = buildResearchChartSvg(report);

  recordSeoTelemetryEvent({
    category: 'research_charts',
    item: report.slug,
    partner: partner || req.headers?.referer || '',
    source: download ? 'svg-download' : 'svg-embed',
  });

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  if (download === '1' || String(download).toLowerCase() === 'true') {
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="smarter-poker-${report.slug}-chart.svg"`
    );
  }

  return res.status(200).send(svg);
}
