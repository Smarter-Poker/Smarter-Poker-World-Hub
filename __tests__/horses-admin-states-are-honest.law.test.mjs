/**
 * A status light that cannot tell "I read this" from "I never read this" is not
 * reporting, it is guessing on the operator's behalf. Two surfaces were doing that.
 *
 * 1. Stable Admin's header rendered content_settings.engine_enabled as "Engine
 *    Running" / "Engine Stopped". That flag is the Social Content Engine toggle,
 *    not the poker engine and not the horse fleet. While it read false, the header
 *    said "Engine Stopped" in red beside "Smarter.Poker Staff Console" even though
 *    engine.smarter.poker was serving hundreds of active tables. It also defaulted
 *    to true in component state and never inspected the read error, so a failed or
 *    missing read reported a confident "Engine Running" it had never established.
 *
 * 2. Newsletter Operations rendered a bare "-" for loading, for a failed request
 *    and for a genuine zero alike, behind a fetch with no timeout, so a hung
 *    request left the counters blank forever with nothing surfaced.
 *
 * These are read as source because neither surface has a DOM harness here.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(repo, relative), 'utf8');

test('the stable admin header names the engine it actually read', async () => {
  const page = await read('pages/horses/index.js');
  assert.doesNotMatch(
    page,
    /'Engine Running' : 'Engine Stopped'/,
    'the content engine toggle must not be labelled as the engine'
  );
  assert.match(page, /Content Engine Running/, 'the label must name the content engine');
  assert.match(page, /Content Engine Stopped/, 'the label must name the content engine');
  assert.match(
    page,
    /Content Engine Unknown/,
    'a state that was never read must render as unknown, not as a default'
  );
});

test('a failed content settings read never reports a default as fact', async () => {
  const page = await read('pages/horses/index.js');
  assert.match(
    page,
    /if \(settingsRes\.error\)/,
    'the settings read error must be inspected, not discarded'
  );
  assert.match(page, /setSettingsLoaded\(false\)/, 'an unread setting must not count as loaded');
  assert.doesNotMatch(
    page,
    /^\s*if \(settingsRes\.data\) setSettings\(\(prev\) => \(\{ \.\.\.prev, \.\.\.settingsRes\.data \}\)\);$/m,
    'the fail-open settings read must not come back'
  );
});

test('newsletter counters distinguish reading, failed and genuinely empty', async () => {
  const page = await read('pages/admin/newsletter.js');
  assert.match(page, /const statValue = \(value\) => \{/, 'the counters need a state-aware renderer');
  assert.match(page, /if \(error\) return 'Unavailable';/, 'a failed read must not render as a dash');
  assert.match(page, /return loading \? 'Reading' : 'Not Read';/, 'loading must be distinguishable');
  assert.doesNotMatch(
    page,
    /data\?\.stats\?\.(active|inactive|campaigns) \?\? '-'/,
    'the three-way-ambiguous dash must not come back'
  );
});

test('the newsletter fetch is bounded so a hang cannot strand the counters', async () => {
  const page = await read('pages/admin/newsletter.js');
  assert.match(page, /new AbortController\(\)/, 'the request must be abortable');
  assert.match(page, /setTimeout\(\(\) => controller\.abort\(\), 15000\)/, 'the abort must be on a timer');
  assert.match(page, /signal: controller\.signal/, 'the signal must actually reach fetch');
  assert.match(page, /clearTimeout\(timer\)/, 'the timer must be cleared');
  assert.match(page, /AbortError/, 'a timeout must be reported as its own outcome');
});

test('no em dash reaches operator copy on either repaired surface', async () => {
  for (const file of ['pages/admin/newsletter.js', 'src/components/horses/IntegrityPanel.jsx']) {
    const text = await read(file);
    const offenders = text
      .split('\n')
      .map((line, index) => [index + 1, line])
      .filter(([, line]) => line.includes('—') && !line.trim().startsWith('//') && !line.trim().startsWith('*'));
    assert.equal(offenders.length, 0, `${file} has an em dash in copy: ${JSON.stringify(offenders)}`);
  }
});
