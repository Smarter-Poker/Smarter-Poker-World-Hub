// Bankroll Manager phone speed (bankroll-live suite): the throttling profile
// is the cited Lighthouse mobile reference, the disaster ceiling only catches
// a disaster, the receipt carries no query strings, and the workflow runs the
// measurement alone before the section walk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CEILING, PHONE_PROFILE, SPEED_RUNS, ceilingBreaches, summarise, supabaseLabel, toMarkdown } from '../e2e/fixtures/bankrollPhoneSpeed.mjs';

test('the phone is Lighthouse mobile: 4x CPU on Slow 4G at DevTools request-level values', () => {
  assert.equal(PHONE_PROFILE.cpuThrottlingRate, 4);
  assert.equal(PHONE_PROFILE.latencyMs, 562.5); // 150ms x 3.75
  assert.equal(PHONE_PROFILE.downloadBytesPerSecond, 180000); // 1.6 Mbps x 0.9
  assert.equal(PHONE_PROFILE.uploadBytesPerSecond, 84375); // 750 Kbps x 0.9
  assert.ok(SPEED_RUNS >= 3, 'a median needs at least three cold loads');
});

const healthy = { run: 1, tilesMs: 9000, chartMs: 11000, lcpMs: 7000, jsTransferredBytes: 1_200_000, supabaseRequests: 14 };

test('the ceiling passes an ordinary slow load and names every line a disaster crosses', () => {
  assert.deepEqual(ceilingBreaches(healthy), []);
  const breaches = ceilingBreaches({ ...healthy, tilesMs: null, chartMs: CEILING.chartMs + 1, jsTransferredBytes: CEILING.jsTransferredBytes + 1, supabaseRequests: CEILING.supabaseRequests + 1 });
  assert.equal(breaches.length, 4);
  assert.match(breaches[0], /never showed values/);
  assert.match(breaches[1], /trend chart took/);
});

test('the summary takes medians across runs and keeps the worst count per Supabase path', () => {
  const runs = [
    { ...healthy, run: 1, lcpMs: 5000, supabaseByPath: { 'GET /rest/v1/bankroll_ledger': 2 } },
    { ...healthy, run: 2, lcpMs: 9000, supabaseByPath: { 'GET /rest/v1/bankroll_ledger': 3, 'POST /rest/v1/rpc/get_my_full_profile': 1 } },
    { ...healthy, run: 3, lcpMs: 7000, supabaseByPath: {} },
  ];
  const s = summarise(runs, { sha: 'a'.repeat(40) });
  assert.equal(s.runs, 3);
  assert.equal(s.medians.lcpMs, 7000);
  assert.deepEqual(s.supabaseByPath, { 'GET /rest/v1/bankroll_ledger': 3, 'POST /rest/v1/rpc/get_my_full_profile': 1 });
  assert.deepEqual(s.breaches, []);
  const md = toMarkdown(s);
  assert.match(md, /\| Largest Contentful Paint \| 7\.00s \| 5\.00s \| 9\.00s \| 7\.00s \|/);
  assert.match(md, /Disaster ceiling held/);
  assert.match(md, /aaaaaaaaaaaa/);
  assert.match(md, /before the tiles had values \(a false "no data"\): 0 of 3 runs/);
  assert.match(toMarkdown(summarise([{ ...healthy, emptyBeforeTiles: true }])), /: 1 of 1 runs/);
});

test('a missing metric is n/a, never zero', () => {
  const s = summarise([{ ...healthy, lcpMs: null }]);
  assert.equal(s.medians.lcpMs, null);
  assert.match(toMarkdown(s), /\| Largest Contentful Paint \| n\/a \| n\/a \|/);
  assert.equal(s.breaches.length, 0);
});

test('Supabase labels carry method and path only', () => {
  assert.equal(supabaseLabel('get', 'https://kuklfnapbkmacvwxktbh.supabase.co/rest/v1/bankroll_ledger?user_id=eq.x&select=*'), 'GET /rest/v1/bankroll_ledger');
  assert.equal(supabaseLabel('POST', 'https://smarter.poker/api/x'), null);
  assert.equal(supabaseLabel('GET', 'not a url'), null);
  assert.equal(supabaseLabel('GET', 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/club-assets/club-logos/4796/2fd6.webp'), 'GET /storage/v1/object/public/club-assets/*');
});

test('the workflow measures alone, summarises always, then walks the sections', () => {
  const wf = readFileSync(new URL('../.github/workflows/e2e-tests.yml', import.meta.url), 'utf8');
  const job = wf.match(/^  bankroll-live:\n[\s\S]*?(?=^  [a-zA-Z0-9_-]+:\n)/m)?.[0] || '';
  const speed = job.indexOf('--project=bankroll-live-phone-speed --workers=1');
  const summary = job.indexOf('node scripts/ci/bankroll-phone-speed-summary.mjs');
  const walk = job.indexOf('--project=bankroll-live-mobile-375 --project=bankroll-live-desktop');
  assert.ok(speed > 0 && summary > speed && walk > summary, 'speed, then summary, then the section walk');
  assert.match(job.slice(summary - 200, summary), /if: \$\{\{ always\(\) \}\}/);
  assert.match(job.slice(walk - 300, walk), /if: \$\{\{ !cancelled\(\) \}\}/);
  const config = readFileSync(new URL('../playwright.bankroll-live.config.ts', import.meta.url), 'utf8');
  assert.equal((config.match(/grepInvert: \/phone speed:\//g) || []).length, 2, 'the section walk never runs the speed test');
  assert.match(config, /name: 'bankroll-live-phone-speed',[\s\S]*?grep: \/phone speed:\//);
  const spec = readFileSync(new URL('../e2e/bankroll-live.spec.ts', import.meta.url), 'utf8');
  assert.match(spec, /Emulation\.setCPUThrottlingRate', \{ rate: PHONE_PROFILE\.cpuThrottlingRate \}/);
  assert.match(spec, /Network\.emulateNetworkConditions/);
  assert.match(spec, /Network\.setCacheDisabled', \{ cacheDisabled: true \}/);
  assert.match(spec, /test\(`phone speed: cold dashboard load/);
  // The chart counts as drawn only from Recharts' surface: the header icon is an SVG path too.
  assert.doesNotMatch(spec, /locator\('svg path\[d\]/);
});
