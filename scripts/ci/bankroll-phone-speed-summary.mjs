#!/usr/bin/env node
/**
 * Writes the Bankroll Manager phone-speed receipt: reads the per-run records
 * e2e/bankroll-live.spec.ts left in test-results/bankroll-live/speed/, writes
 * test-results/bankroll-live/phone-speed.json and appends a table to
 * $GITHUB_STEP_SUMMARY. It reports; it never fails the job (the disaster
 * ceiling is asserted in the test itself).
 *
 *   node scripts/ci/bankroll-phone-speed-summary.mjs [resultsDir] [sha]
 */
import fs from 'node:fs';
import path from 'node:path';
import { summarise, toMarkdown } from '../../e2e/fixtures/bankrollPhoneSpeed.mjs';

const dir = path.resolve(process.argv[2] || 'test-results/bankroll-live');
const sha = process.argv[3] || process.env.BANKROLL_LIVE_EXPECTED_SHA || null;
const speedDir = path.join(dir, 'speed');
const runs = fs.existsSync(speedDir)
  ? fs.readdirSync(speedDir).filter((f) => /^run-\d+\.json$/.test(f)).sort()
    .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(speedDir, f), 'utf8')); } catch { return null; } })
    .filter(Boolean)
  : [];
const summary = summarise(runs, { sha });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'phone-speed.json'), JSON.stringify(summary, null, 2));
const markdown = runs.length ? toMarkdown(summary) : '## Bankroll Manager phone speed\n\nNo phone-speed run recorded a result.\n';
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
process.stdout.write(markdown);
