#!/usr/bin/env node
/**
 * lighthouse-baseline.mjs - the same four pages, the same way, every time.
 *
 * Performance checklist audit, phase 6 (2026-09-17). Nothing on the platform
 * recorded real page timing, so a perf change could only ever be claimed, not
 * shown. This runs Lighthouse (performance category, mobile emulation, the
 * `perf` preset) against a fixed list of production pages and prints one row
 * each, so a before/after is two runs and a diff. It is run by a person, on
 * purpose, from a machine with Chrome; it is not a workflow, not a schedule
 * and not a check (CLAUDE.md 10.9 and the hardening standard both forbid a
 * scheduled watcher, and a Lighthouse score is not a release gate).
 *
 * Usage:
 *   node scripts/perf/lighthouse-baseline.mjs [--out=<dir>] [--url=<one url>]
 *
 * Needs `lighthouse` on PATH (npm i -g lighthouse) and a Chrome. Writes one
 * JSON per page into --out (default: ./lighthouse-<timestamp>/), which is
 * gitignored territory: keep the JSON with the audit record, not in the repo.
 *
 * Signed-in pages (/hub and below) render the login page for an anonymous
 * run, so their numbers describe the shell and the redirect, not the hub. A
 * signed-in baseline needs a browser profile; see the audit record for the
 * numbers taken that way.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const one = (args.find((a) => a.startsWith('--url=')) || '').slice(6);
const out = (args.find((a) => a.startsWith('--out=')) || `--out=./lighthouse-${Date.now()}`).slice(6);
const URLS = one
  ? [one]
  : [
      'https://smarter.poker/',
      'https://smarter.poker/hub',
      'https://smarter.poker/hub/poker-near-me',
      'https://smarter.poker/hub/commander',
      'https://smarter.poker/hub/club-arena/',
    ];

mkdirSync(out, { recursive: true });
const rows = [];
for (const url of URLS) {
  const name = url.replace(/^https:\/\/smarter\.poker\/?/, '').replace(/\//g, '_') || 'home';
  const file = join(out, `${name}.json`);
  try {
    execFileSync(
      'lighthouse',
      [
        url,
        '--quiet',
        '--chrome-flags=--headless=new --no-sandbox',
        '--preset=perf',
        '--form-factor=mobile',
        '--screenEmulation.mobile',
        '--only-categories=performance',
        '--output=json',
        `--output-path=${file}`,
      ],
      { stdio: 'ignore', timeout: 180_000 }
    );
  } catch (err) {
    rows.push({ name, url, error: String(err.message || err).split('\n')[0] });
    continue;
  }
  if (!existsSync(file)) {
    rows.push({ name, url, error: 'no report written' });
    continue;
  }
  const r = JSON.parse(readFileSync(file, 'utf8'));
  const a = r.audits;
  rows.push({
    name,
    url: r.finalDisplayedUrl,
    score: Math.round((r.categories.performance.score || 0) * 100),
    fcp: a['first-contentful-paint'].displayValue,
    lcp: a['largest-contentful-paint'].displayValue,
    tbt: a['total-blocking-time'].displayValue,
    cls: a['cumulative-layout-shift'].displayValue,
    bytes: a['total-byte-weight'].displayValue.replace('Total size was ', ''),
  });
}

console.log('page | final url | score | FCP | LCP | TBT | CLS | transfer');
for (const r of rows) {
  if (r.error) console.log(`${r.name} | ${r.url} | ERROR ${r.error}`);
  else console.log(`${r.name} | ${r.url} | ${r.score} | ${r.fcp} | ${r.lcp} | ${r.tbt} | ${r.cls} | ${r.bytes}`);
}
console.log(`reports: ${out}`);
