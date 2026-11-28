/**
 * Phone speed for the published Bankroll Manager (bankroll-live suite).
 *
 * How long /hub/bankroll-manager takes to become usable on a mid-range phone
 * over cellular, measured on the real production deployment, signed in as the
 * platform service account, cold (no HTTP cache, no service worker).
 *
 * The phone is Lighthouse's mobile reference: 4x CPU slowdown on a "Slow 4G"
 * radio. Lighthouse documents the radio as 150ms latency, 1.6 Mbps down and
 * 750 Kbps up, and the CPU as "a constant 4x CPU multiplier"
 * (github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md). Chrome
 * applies those to whole requests, not packets, so DevTools' own "Slow 4G"
 * preset scales them the way Lighthouse's devtools throttling does: latency
 * x3.75 and throughput x0.9. Those are the values below, in the units
 * Network.emulateNetworkConditions takes (milliseconds, bytes per second).
 *
 * The numbers are evidence, not a gate. CEILING only catches a disaster: see
 * its comment for why each line sits where it does.
 *
 * Plain .mjs so __tests__/bankroll-phone-speed.test.mjs can unit-test it.
 */

export const PHONE_PROFILE = Object.freeze({
  name: 'Lighthouse mobile: Slow 4G radio, 4x CPU (DevTools request-level values)',
  cpuThrottlingRate: 4,
  latencyMs: 150 * 3.75,
  downloadBytesPerSecond: Math.round((1.6 * 1000 * 1000) / 8 * 0.9),
  uploadBytesPerSecond: Math.round((750 * 1000) / 8 * 0.9),
});

// A cold load that crosses any line here is broken for a phone user, not
// merely slow. The first measurement (production 1e44d834, 2026-11-28,
// three cold loads) gave medians of LCP 7.4s, stat tiles 10.2s, trend chart
// 8.3s, 738 KB of JavaScript on the wire and 30 Supabase requests. Each line
// sits three to four times above that, so ordinary drift and runner noise
// never trip it, while a page that has really broken does:
//  - 3,000,000 bytes of JavaScript is about 17s of this radio (180,000 B/s)
//    before a single script runs, four times today's first load;
//  - 45s to the first value on screen, or to the trend chart, is over four
//    times today's median and far past the point a phone user gives up;
//  - 90 Supabase requests on one first load (three times today's 30) means a
//    read is looping or the page has gone row by row.
// Tighten these once the page split and database totals land; never loosen.
export const CEILING = Object.freeze({
  jsTransferredBytes: 3_000_000,
  tilesMs: 45_000,
  chartMs: 45_000,
  supabaseRequests: 90,
});

export const SPEED_RUNS = 3;

function median(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// What a run is held to. Returns the lines it crossed, worded for a person.
export function ceilingBreaches(run, ceiling = CEILING) {
  const out = [];
  if (!Number.isFinite(run.tilesMs)) out.push('the stat tiles never showed values');
  else if (run.tilesMs > ceiling.tilesMs) out.push(`stat tiles took ${Math.round(run.tilesMs)}ms (ceiling ${ceiling.tilesMs}ms)`);
  if (!Number.isFinite(run.chartMs)) out.push('the trend chart never finished drawing');
  else if (run.chartMs > ceiling.chartMs) out.push(`trend chart took ${Math.round(run.chartMs)}ms (ceiling ${ceiling.chartMs}ms)`);
  if (run.jsTransferredBytes > ceiling.jsTransferredBytes) out.push(`${run.jsTransferredBytes} bytes of JavaScript (ceiling ${ceiling.jsTransferredBytes})`);
  if (run.supabaseRequests > ceiling.supabaseRequests) out.push(`${run.supabaseRequests} Supabase requests (ceiling ${ceiling.supabaseRequests})`);
  return out;
}

const METRICS = [
  ['lcpMs', 'Largest Contentful Paint', 'ms'],
  ['tilesMs', 'Stat tiles show values', 'ms'],
  ['chartMs', 'Trend chart drawn (default period)', 'ms'],
  ['allTimeChartMs', 'Choose All Time to plot drawn', 'ms'],
  ['domContentLoadedMs', 'DOMContentLoaded', 'ms'],
  ['loadMs', 'Load event', 'ms'],
  ['longTaskMs', 'Main-thread long tasks (total)', 'ms'],
  ['jsTransferredBytes', 'JavaScript transferred', 'bytes'],
  ['jsDecodedBytes', 'JavaScript decoded', 'bytes'],
  ['jsRequests', 'JavaScript requests', 'count'],
  ['totalTransferredBytes', 'All bytes transferred', 'bytes'],
  ['supabaseRequests', 'Supabase requests', 'count'],
  ['supabaseExactDuplicates', 'Supabase exact repeats', 'count'],
];

export function summarise(runs, { sha = null, profile = PHONE_PROFILE, ceiling = CEILING } = {}) {
  const ok = runs.filter((r) => r && typeof r === 'object');
  const medians = {};
  for (const [key] of METRICS) medians[key] = median(ok.map((r) => r[key]));
  // Supabase paths across runs: the most a single run made of each, so a
  // repeated read is visible at a glance.
  const supabaseByPath = {};
  for (const run of ok) {
    for (const [p, n] of Object.entries(run.supabaseByPath || {})) supabaseByPath[p] = Math.max(supabaseByPath[p] || 0, n);
  }
  return {
    route: '/hub/bankroll-manager?view=dashboard',
    sha,
    profile,
    ceiling,
    runs: ok.length,
    medians,
    supabaseByPath: Object.fromEntries(Object.entries(supabaseByPath).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    breaches: ok.flatMap((r, i) => ceilingBreaches(r, ceiling).map((line) => `run ${r.run ?? i + 1}: ${line}`)),
    each: ok,
  };
}

function fmt(value, unit) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a';
  if (unit === 'ms') return `${(value / 1000).toFixed(2)}s`;
  if (unit === 'bytes') return `${Math.round(value / 1024).toLocaleString('en-US')} KB`;
  return String(Math.round(value));
}

export function toMarkdown(summary) {
  const lines = [];
  lines.push('## Bankroll Manager phone speed (cold load, signed in)');
  lines.push('');
  lines.push(`Route \`${summary.route}\` on production${summary.sha ? ` \`${summary.sha.slice(0, 12)}\`` : ''}. Profile: ${summary.profile.name}: CPU ${summary.profile.cpuThrottlingRate}x, latency ${summary.profile.latencyMs}ms, ${summary.profile.downloadBytesPerSecond.toLocaleString('en-US')} B/s down, ${summary.profile.uploadBytesPerSecond.toLocaleString('en-US')} B/s up. 375px, no cache, no service worker.`);
  lines.push('');
  const header = ['Metric', `Median of ${summary.runs}`, ...summary.each.map((r, i) => `Run ${r.run ?? i + 1}`)];
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`|${header.map(() => '---').join('|')}|`);
  for (const [key, label, unit] of METRICS) {
    lines.push(`| ${label} | ${fmt(summary.medians[key], unit)} | ${summary.each.map((r) => fmt(r[key], unit)).join(' | ')} |`);
  }
  lines.push('');
  const outcomes = summary.each.map((r) => r.chartOutcome || 'not drawn');
  lines.push(`Trend chart outcome per run (default period): ${outcomes.join(', ')}. After choosing All Time: ${summary.each.map((r) => r.allTimeChartOutcome || 'not measured').join(', ')}.`);
  lines.push('');
  const flashes = summary.each.filter((r) => r.emptyBeforeTiles).length;
  lines.push(`Trend showed an empty state before the tiles had values (a false "no data"): ${flashes} of ${summary.runs} runs.`);
  lines.push('');
  const paths = Object.entries(summary.supabaseByPath);
  if (paths.length) {
    lines.push('| Supabase path (method + path only) | Most in one run |');
    lines.push('|---|---|');
    for (const [p, n] of paths) lines.push(`| \`${p}\` | ${n} |`);
    lines.push('');
  }
  lines.push(summary.breaches.length
    ? `**Disaster ceiling crossed:** ${summary.breaches.join('; ')}.`
    : `Disaster ceiling held (JS ${fmt(summary.ceiling.jsTransferredBytes, 'bytes')}, tiles and chart ${fmt(summary.ceiling.tilesMs, 'ms')}, ${summary.ceiling.supabaseRequests} Supabase requests). These numbers are evidence, not a gate.`);
  lines.push('');
  return lines.join('\n');
}

// Supabase request label: method, kind and name only. Query strings carry
// filters (and the account id), so they never reach a receipt; a short hash
// of the full URL is what tells an exact repeat from a different read.
export function supabaseLabel(method, rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { return null; }
  if (!/\.supabase\.co$/.test(url.hostname)) return null;
  let p = url.pathname.replace(/\/+$/, '');
  // A Storage object path names a club, a user or a file: keep the bucket.
  const object = p.match(/^(\/storage\/v1\/object(?:\/(?:public|sign|authenticated))?\/[^/]+)\//);
  if (object) p = `${object[1]}/*`;
  return `${String(method || 'GET').toUpperCase()} ${p}`;
}
