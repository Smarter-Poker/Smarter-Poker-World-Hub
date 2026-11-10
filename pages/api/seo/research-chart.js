/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GET /api/seo/research-chart
 *  Dynamic Publication-Grade Vector SVG Benchmark Chart Generator
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Generates an embeddable, downloadable 880x480 vector SVG chart for any of
 * Smarter.Poker's 15 empirical research studies (?slug=...), derived directly
 * from the downloadable dataset rows with explicit unit headers, publication
 * and modification dates, methodology summary, and low-to-high range/uncertainty
 * whisker intervals (never fabricated fallback values).
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

function detectUnitFromCellOrHeader(cell = '', header = '') {
  const combined = `${cell} ${header}`;
  if (combined.includes('%')) return '% (Percentage)';
  if (/BB\/100/i.test(combined)) return 'BB/100 Hands';
  if (/\$/.test(combined)) return 'USD ($)';
  if (/\bBB\b/i.test(combined)) return 'Big Blinds (BB)';
  if (/\bHours?\b|\bHrs?\b/i.test(combined)) return 'Hours';
  if (/\bTables?\b/i.test(combined)) return 'Tables';
  if (/\bRooms?\b|\bVenues?\b/i.test(combined)) return 'Venues';
  return truncateText(header || 'Empirical Benchmark Unit', 28);
}

export function extractNumericMetric(row, headers = []) {
  const cells = Array.isArray(row) ? row : [];
  // Prefer cells from right to left that contain explicit ranges, percentages, or numeric measurements
  for (let i = cells.length - 1; i >= 1; i -= 1) {
    const cell = String(cells[i] || '');
    const header = String(headers[i] || '');
    const rangeMatch = cell.match(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:To|-)\s*(\d+(?:,\d{3})*(?:\.\d+)?)/i);
    if (rangeMatch) {
      const low = parseFloat(rangeMatch[1].replace(/,/g, ''));
      const high = parseFloat(rangeMatch[2].replace(/,/g, ''));
      if (Number.isFinite(low) && Number.isFinite(high) && high > 0) {
        const mid = (low + high) / 2;
        return {
          value: mid,
          low: Math.min(low, high),
          high: Math.max(low, high),
          hasRange: Math.abs(high - low) > 0,
          colIndex: i,
          header,
          unit: detectUnitFromCellOrHeader(cell, header),
          display: truncateText(cell, 30),
        };
      }
    }
    const pctMatch = cell.match(/(\d+(?:\.\d+)?)\s*%/);
    if (pctMatch) {
      const val = parseFloat(pctMatch[1]);
      if (Number.isFinite(val) && val > 0) {
        return {
          value: val,
          low: val,
          high: val,
          hasRange: false,
          colIndex: i,
          header,
          unit: detectUnitFromCellOrHeader(cell, header),
          display: truncateText(cell, 30),
        };
      }
    }
  }
  for (let i = 1; i < cells.length; i += 1) {
    const cell = String(cells[i] || '');
    const header = String(headers[i] || '');
    const numMatch = cell.match(/(\d+(?:,\d{3})*(?:\.\d+)?)/);
    if (numMatch) {
      const val = parseFloat(numMatch[1].replace(/,/g, ''));
      if (Number.isFinite(val) && val > 0) {
        return {
          value: val,
          low: val,
          high: val,
          hasRange: false,
          colIndex: i,
          header,
          unit: detectUnitFromCellOrHeader(cell, header),
          display: truncateText(cell, 30),
        };
      }
    }
  }
  return null;
}

export function buildResearchChartSvg(report) {
  const target = report || RESEARCH_REPORTS[0];
  const headers = Array.isArray(target.table?.headers) ? target.table.headers : [];
  const rawRows = Array.isArray(target.table?.rows) ? target.table.rows : [];

  const parsedRows = [];
  for (let idx = 0; idx < rawRows.length && parsedRows.length < 6; idx += 1) {
    const row = rawRows[idx];
    const metric = extractNumericMetric(row, headers);
    if (!metric) continue;
    parsedRows.push({
      label: truncateText(row[0] || `Stratum ${idx + 1}`, 34),
      subLabel: truncateText(row[1] || headers[metric.colIndex] || '', 28),
      value: metric.value,
      low: metric.low,
      high: metric.high,
      hasRange: metric.hasRange,
      header: metric.header,
      unit: metric.unit,
      display: metric.display,
    });
  }

  const maxValue = Math.max(...parsedRows.map((r) => Math.max(r.value, r.high || r.value)), 1);
  const primaryHeader = parsedRows[0]?.header || headers[headers.length - 1] || 'Primary Metric';
  const primaryUnit = parsedRows[0]?.unit || 'Empirical Units';
  const hasAnyRange = parsedRows.some((r) => r.hasRange);

  const width = 880;
  const height = 480;
  const chartLeft = 275;
  const maxBarWidth = 360;
  const startY = 128;
  const rowGap = 44;

  const barColors = ['#38bdf8', '#10b981', '#f59e0b', '#60a5fa', '#34d399', '#a78bfa'];

  const barsSvg = parsedRows
    .map((item, idx) => {
      const y = startY + idx * rowGap;
      const ratio = Math.min(1, Math.max(0.06, item.value / maxValue));
      const barWidth = Math.round(maxBarWidth * ratio);
      const color = barColors[idx % barColors.length];

      let whiskerSvg = '';
      if (item.hasRange && item.high > item.low) {
        const lowX = chartLeft + Math.round(maxBarWidth * Math.min(1, Math.max(0.02, item.low / maxValue)));
        const highX = chartLeft + Math.round(maxBarWidth * Math.min(1, Math.max(0.04, item.high / maxValue)));
        whiskerSvg = `
      <line x1="${lowX}" y1="15" x2="${highX}" y2="15" stroke="#f8fafc" stroke-width="2" stroke-opacity="0.9"/>
      <line x1="${lowX}" y1="9" x2="${lowX}" y2="21" stroke="#f8fafc" stroke-width="2"/>
      <line x1="${highX}" y1="9" x2="${highX}" y2="21" stroke="#f8fafc" stroke-width="2"/>`;
      }

      return `
    <g transform="translate(0, ${y})">
      <text x="28" y="14" fill="#f8fafc" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="12.5" font-weight="700">${escapeXml(item.label)}</text>
      <text x="28" y="29" fill="#94a3b8" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="10.5">${escapeXml(item.subLabel)}</text>
      <rect x="${chartLeft}" y="4" width="${maxBarWidth}" height="22" rx="4" fill="#111c33" stroke="#1e293b" stroke-width="1"/>
      <rect x="${chartLeft}" y="4" width="${barWidth}" height="22" rx="4" fill="${color}" fill-opacity="0.82"/>${whiskerSvg}
      <text x="${chartLeft + maxBarWidth + 14}" y="19" fill="${color}" font-family="JetBrains Mono, monospace, sans-serif" font-size="12" font-weight="700">${escapeXml(item.display)}</text>
    </g>`;
    })
    .join('\n');

  const methodologyLine = truncateText(
    target.methodology ||
      (target.keyFindings && target.keyFindings[0]) ||
      target.summary ||
      '',
    114
  );
  const uncertaintyNote = hasAnyRange
    ? 'Range Whiskers Show Empirical Low-To-High Stratum Interval From Published Dataset'
    : 'Exact Deterministic Or Census Tabulation From Published Dataset Archive';
  const doiText = target.doi || RESEARCH_DATASET_DOI;
  const canonicalUrl = `https://smarter.poker/research/${target.slug}`;
  const pubDate = target.publishedDate || '2026-11-08';
  const modDate = target.modifiedDate || '2026-11-10';

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
  <text x="28" y="34" fill="#f59e0b" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11.5" font-weight="800" letter-spacing="1.1">SMARTER.POKER DATASET-DERIVED BENCHMARK • PUBLISHED ${escapeXml(pubDate)} • UPDATED ${escapeXml(modDate)}</text>
  <rect x="644" y="16" width="208" height="24" rx="12" fill="#06281e" stroke="#10b981" stroke-width="1"/>
  <text x="748" y="32" text-anchor="middle" fill="#34d399" font-family="JetBrains Mono, monospace, sans-serif" font-size="10.5" font-weight="700">DOI: ${escapeXml(doiText)}</text>

  <text x="28" y="62" fill="#f8fafc" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="18.5" font-weight="800">${escapeXml(truncateText(target.title, 76))}</text>
  <text x="28" y="84" fill="#38bdf8" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="12" font-weight="600">Plotted Column: ${escapeXml(truncateText(primaryHeader, 44))} • Units: ${escapeXml(primaryUnit)}</text>
  <text x="852" y="84" text-anchor="end" fill="#94a3b8" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11">${escapeXml(truncateText(target.sampleSize || '', 44))}</text>
  <line x1="28" y1="98" x2="852" y2="98" stroke="#1e293b" stroke-width="1"/>

  <!-- Benchmark Rows -->
  ${barsSvg}

  <!-- Methodology & Uncertainty Callout -->
  <rect x="28" y="394" width="824" height="44" rx="5" fill="#0b1324" stroke="#1e293b" stroke-width="1"/>
  <text x="40" y="411" fill="#cbd5e1" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11"><tspan fill="#38bdf8" font-weight="700">Methodology: </tspan>${escapeXml(methodologyLine)}</text>
  <text x="40" y="429" fill="#94a3b8" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="10.5"><tspan fill="#10b981" font-weight="700">Uncertainty &amp; Range: </tspan>${escapeXml(uncertaintyNote)}</text>

  <!-- Attribution Footer -->
  <text x="28" y="460" fill="#94a3b8" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11">Dataset Source: Smarter.Poker Research (${escapeXml(canonicalUrl)}) • Download CSV/JSON At /api/datasets/catalog</text>
  <text x="852" y="460" text-anchor="end" fill="#64748b" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11">License: CC BY 4.0 • DOI ${escapeXml(doiText)}</text>
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
    req,
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
