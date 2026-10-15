/**
 * GUARD: __tests__/pokernews-videos-stays-retired.test.mjs
 * ---------------------------------------------------------------------------
 * /api/cron/pokernews-videos (workers /cron/pokernews-videos) answered HTTP
 * 500 every 3 hours from 2026-09-30: no PokerNews content_author exists, the
 * importer correctly refuses to attribute official items to a horse, and its
 * RSS source answers 404. PokerNews is an active content_sources registry
 * source (handle @PokerNews), so the job only duplicated that work. It was
 * retired from the dispatcher on 2026-10-15 and recorded in Club Arena's
 * ca_retired_cron_jobs (migration 20261015035957), which the silence alerts
 * read. Scheduling it again would page on a job the registry calls retired.
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

test('pokernews-videos is not scheduled', () => {
  assert.doesNotMatch(block('ALL_CRONS', '[', ']'), /pokernews-videos/);
});

test('pokernews-videos is not routed to the workers service', () => {
  assert.doesNotMatch(block('WORKERS_PREFERRED', '{', '}'), /pokernews-videos/);
});

test('no executable dispatcher line names the retired job', () => {
  assert.doesNotMatch(code, /pokernews-videos/);
});

test('the retirement says why, in the dispatcher', () => {
  assert.match(src, /# RETIRED 2026-10-15: \/api\/cron\/pokernews-videos/);
  assert.match(src, /ca_retired_cron_jobs \(migration 20261015035957\)/);
});

test('the PokerNews feed itself is still scheduled', () => {
  assert.match(block('ALL_CRONS', '[', ']'), /'\/api\/cron\/poker-news',\s*dict\(/);
});
