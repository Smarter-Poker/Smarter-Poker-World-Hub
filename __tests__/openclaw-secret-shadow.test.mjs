/**
 * GUARD: __tests__/openclaw-secret-shadow.test.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * On the Open Claw host, CRON_SECRET is defined in two files and read from
 * one. openclaw.service carries `EnvironmentFile=-/etc/openclaw.env`, so that
 * file becomes os.environ and wins; /opt/openclaw/.env is the deploy seed,
 * copied in once and never again. The precedence is silent.
 *
 * 2026-09-05 03:20:56 UTC the hub's CRON_SECRET was replaced in Vercel. At
 * 03:25 all ~89 routed jobs began 401ing and stayed dead 3.5 hours. The repair
 * found three different 64-char values live at once, wrote the correct one
 * into /opt/openclaw/.env, restarted, and watched the box keep 401ing - the
 * file it had just fixed is the shadowed one, and nothing said so.
 *
 * These pins keep the dispatcher saying so: at boot when the two disagree, and
 * in the drift page itself, which now names the file to edit. The functional
 * test in scripts/ci/test-openclaw-secret-shadow.py proves the behaviour.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(root, 'scripts', 'openclaw-cron-dispatcher.py'), 'utf8');

test('both env files are named, and which one systemd actually reads is written down', () => {
  assert.match(src, /ETC_ENV_FILE\s*=\s*Path\(os\.environ\.get\('OPENCLAW_ETC_ENV', '\/etc\/openclaw\.env'\)\)/);
  assert.match(src, /SEED_ENV_FILE\s*=\s*Path\(os\.environ\.get\('OPENCLAW_SEED_ENV', '\/opt\/openclaw\/\.env'\)\)/);
  assert.match(src, /EnvironmentFile=-\/etc\/openclaw\.env/);
});

test('both routed secrets are checked for a shadowed copy, not just CRON_SECRET', () => {
  assert.match(src, /_check_shadowed_secret\('CRON_SECRET', CRON_SECRET\)/);
  assert.match(src, /_check_shadowed_secret\('WORKERS_CRON_SECRET'/);
});

test('a finding pages once at startup and is never silent', () => {
  const body = src.slice(src.indexOf('def main():'));
  assert.match(body, /for finding in _SECRET_SHADOW_FINDINGS:[\s\S]*?log\.error/);
  assert.match(body, /SMARTER\.POKER SHADOWED SECRET/);
});

test('no secret value can reach an alert: findings carry fingerprints only', () => {
  const fn = src.slice(src.indexOf('def _check_shadowed_secret('), src.indexOf('def _load_cron_secret('));
  assert.match(fn, /_fingerprint\(effective\)/);
  assert.match(fn, /_fingerprint\(seed\)/);
  assert.doesNotMatch(fn, /\{effective\}|\{seed\}/, 'a raw secret must never be interpolated into the finding');
});

test('the functional python test passes (loud on disagreement, silent on agreement)', () => {
  const r = spawnSync('python3', [path.join(root, 'scripts', 'ci', 'test-openclaw-secret-shadow.py')], {
    encoding: 'utf8', timeout: 60_000,
  });
  assert.equal(r.status, 0, `python test failed:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /secret-shadow: OK/);
});
