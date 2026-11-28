/**
 * LAW: __tests__/openclaw-break-clear-ticks.law.test.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * /api/cron/club-stats-maintenance does none of its work while the engine
 * maintenance break row exists. On minute='*\/15' its :00 tick fell inside
 * every scheduled break (:58 announce, :03:42 thaw), the hand index went 35
 * minutes without a roll, and ClubArenaStatsIndexLag (30 min) fired ten
 * minutes after every cutover from 2026-11-14 on: eight a day under the
 * three-hourly schedule. The ticks now sit at :07/:22/:37/:52 and the
 * dispatcher refuses to start (preflight) if a break-clear job is scheduled
 * inside the break. scripts/ci/test-openclaw-break-clear-ticks.py proves the
 * pre-fix schedule is refused and the worst-case lag stays under 30 minutes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(root, 'scripts', 'openclaw-cron-dispatcher.py'), 'utf8');

test('club-stats-maintenance ticks are offset clear of the break', () => {
  assert.match(src, /\('\/api\/cron\/club-stats-maintenance',\s*dict\(minute='7,22,37,52'\)\)/);
  assert.doesNotMatch(src, /\('\/api\/cron\/club-stats-maintenance',\s*dict\(minute='\*\/15'\)\)/);
});

test('the dispatcher preflight enforces break-clear schedules before scheduling', () => {
  const main = src.slice(src.indexOf('def main():'));
  const validate = main.indexOf('_validate_break_clear_schedules()');
  const preflightReturn = main.indexOf("if sys.argv[1:] == ['--preflight-only']:");
  assert.ok(validate > 0, 'main() must call _validate_break_clear_schedules()');
  assert.ok(validate < preflightReturn, 'the check must run in --preflight-only as well');
});

test('the functional python test passes (shipped accepted, pre-fix refused, lag < 30 min)', () => {
  const r = spawnSync('python3', [path.join(root, 'scripts', 'ci', 'test-openclaw-break-clear-ticks.py')], {
    encoding: 'utf8', timeout: 60_000,
  });
  assert.equal(r.status, 0, `python test failed:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /break-clear-ticks: OK/);
});
