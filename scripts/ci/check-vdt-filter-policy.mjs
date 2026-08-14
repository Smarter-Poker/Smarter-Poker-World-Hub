#!/usr/bin/env node
/**
 * CI guard: every API reader of venue_daily_tournaments must apply the shared
 * visibility contract — .in('data_quality', ['scraped_verified','scraped_inferred'])
 * — or carry an explicit `vdt-filter-exempt: <reason>` comment.
 *
 * Why: rows are retired by setting data_quality='stale' (venue-scraper/receive.js)
 * and suppressed via is_suppressed. Readers that skip the filter resurface retired
 * rows publicly; that bug shipped twice (public/venue/[id].js, late-reg-cron.js,
 * both fixed 2026-08-14). This check stops the third time.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = new URL('../..', import.meta.url).pathname;
const API_DIR = join(ROOT, 'pages', 'api');
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|ts)$/.test(f)) files.push(p);
  }
})(API_DIR);

const QUALITY_RE = /\.in\(\s*['"]data_quality['"]/;
const EXEMPT_RE = /vdt-filter-exempt:/;
const WRITER_HINT = /\.(insert|upsert|update|delete)\(/;

let failures = [];
for (const p of files) {
  const src = readFileSync(p, 'utf8');
  if (!src.includes("from('venue_daily_tournaments')")) continue;
  if (EXEMPT_RE.test(src)) continue;
  // Writers (receive.js etc.) manage lifecycle; the contract binds READ paths.
  // A file that both reads and writes must still pass the read check.
  const reads = src.split("from('venue_daily_tournaments')").length - 1;
  const qualityFiltered = QUALITY_RE.test(src);
  const isPureWriter = WRITER_HINT.test(src) && !/\.select\(/.test(src);
  if (!qualityFiltered && !isPureWriter) {
    failures.push(`${p.replace(ROOT, '')} — ${reads} vdt read(s), no data_quality IN-filter and no vdt-filter-exempt comment`);
  }
}
if (failures.length) {
  console.error('venue_daily_tournaments filter-policy violations:');
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log(`vdt filter policy OK across ${files.length} API files`);
