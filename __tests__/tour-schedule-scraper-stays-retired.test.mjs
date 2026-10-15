/**
 * GUARD: __tests__/tour-schedule-scraper-stays-retired.test.mjs
 * ---------------------------------------------------------------------------
 * /api/cron/tour-schedule-scraper (workers /cron/tour-schedule-scraper) read
 * its tours from tour_schedule_sources and tour_schedule_registry, which have
 * never held a row: the on-disk JSONs they replaced on 2026-04-26 were never
 * migrated. Every run scraped zero tours and paged ScraperCritical "produced
 * no output - possible config error" (every third day, 10 pages from
 * 2026-09-16 to 2026-10-13); its output table tour_event_details was last
 * written 2026-04-08. Tour stops are scraped by the local tours runtime
 * (scripts/tour_stealth_scraper.py: tour_source_registry -> tour_stop_events).
 * Retired from the dispatcher on 2026-10-15 and recorded in Club Arena's
 * ca_retired_cron_jobs (migration 20261015095255), which the silence alerts
 * read. Scheduling it again would page on a job with no configuration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(root, 'scripts', 'openclaw-cron-dispatcher.py'), 'utf8');
const code = src.split('\n').filter((line) => !line.trim().startsWith('#')).join('\n');

function block(name, open, close) {
  const at = code.search(new RegExp(`^${name}\\s*=\\s*\\${open}`, 'm'));
  assert.ok(at > -1, `${name} is not defined in the dispatcher`);
  const start = code.indexOf(open, at);
  let depth = 0;
  for (let i = start; i < code.length; i += 1) {
    if (code[i] === open) depth += 1;
    if (code[i] === close) depth -= 1;
    if (depth === 0) return code.slice(start, i + 1);
  }
  throw new Error(`${name} is never closed`);
}

test('tour-schedule-scraper is not scheduled', () => {
  assert.doesNotMatch(block('ALL_CRONS', '[', ']'), /tour-schedule-scraper/);
});

test('tour-schedule-scraper is not routed to the workers service', () => {
  assert.doesNotMatch(block('WORKERS_PREFERRED', '{', '}'), /tour-schedule-scraper/);
});

test('no executable dispatcher line names the retired job', () => {
  assert.doesNotMatch(code, /tour-schedule-scraper/);
});

test('the retirement says why, in the dispatcher', () => {
  assert.match(src, /# RETIRED 2026-10-15: \/api\/cron\/tour-schedule-scraper/);
  assert.match(src, /ca_retired_cron_jobs \(migration 20261015095255\)/);
});

test('the charity schedule scraper beside it is still scheduled', () => {
  assert.match(block('ALL_CRONS', '[', ']'), /'\/api\/cron\/scrape-charity-schedules',\s*dict\(/);
});
