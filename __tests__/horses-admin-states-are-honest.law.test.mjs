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
  assert.match(page, /'Unavailable'/, 'a failed read must not render as a dash');
  assert.match(page, /'Reading'/, 'loading must be distinguishable');
  assert.match(page, /'Not Read'/, 'a read that never happened must be distinguishable');
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
      .filter(([, line]) => line.includes('\u2014') && !line.trim().startsWith('//') && !line.trim().startsWith('*'));
    assert.equal(offenders.length, 0, `${file} has an em dash in copy: ${JSON.stringify(offenders)}`);
  }
});

/* ───────────────────────────────────────────────────────────────────────────────
 * 2026-09-23 production audit. Six more places where these two surfaces either
 * asserted a state they had never read, or told the operator the wrong story
 * about what had just gone wrong. Each test below names the defect it pins so a
 * future edit that quietly undoes one fails here with the reason attached.
 * ─────────────────────────────────────────────────────────────────────────────── */

test('DEFECT 1: the System Controls card never asserts a setting it did not read', async () => {
  // The Content Engine toggle rendered settings.engine_enabled raw, with no
  // settingsLoaded guard, so a failed read painted the hardcoded component default
  // as a confident accent-green "Running" on the same screen where the header three
  // hundred lines above already read "Content Engine Unknown".
  const page = await read('pages/horses/index.js');
  assert.doesNotMatch(
    page,
    /\{settings\.engine_enabled \? 'Running' : 'Stopped'\}/,
    'the unguarded Content Engine state must not come back'
  );
  assert.doesNotMatch(
    page,
    /\{settings\.auto_publish \? 'Active' : 'Manual'\}/,
    'the unguarded Auto-Publish state must not come back'
  );
  assert.match(
    page,
    /\{!settingsLoaded \? 'Unknown' : settings\.engine_enabled \? 'Running' : 'Stopped'\}/,
    'Content Engine must read Unknown until the row is actually read'
  );
  assert.match(
    page,
    /\{!settingsLoaded \? 'Unknown' : settings\.auto_publish \? 'Active' : 'Manual'\}/,
    'Auto-Publish must read Unknown until the row is actually read'
  );
  assert.match(
    page,
    /These Controls Are Locked\./,
    'an operator looking at defaults must be told they are defaults'
  );
});

test('DEFECT 1: no settings control is writable while the row is unread', async () => {
  // flushSettings POSTs the WHOLE settings object, so one toggle flipped from an
  // unread state would have written every hardcoded default over the live row.
  const page = await read('pages/horses/index.js');
  const start = page.indexOf("{activeTab === 'settings' && (");
  const end = page.indexOf("{activeTab === 'stats' && (", start);
  assert.ok(start > 0 && end > start, 'the settings view must still be locatable');
  const settingsView = page.slice(start, end);

  // Split on element openers so each chunk is one control, then demand the guard on
  // every chunk that can queue a write. A new control added without it fails here.
  const controls = settingsView.split(/<(?=input|select|textarea)/).slice(1);
  const writable = controls.filter((chunk) => chunk.includes('updateSetting('));
  assert.ok(
    writable.length >= 5,
    `expected at least the five writable settings controls, found ${writable.length}`
  );
  for (const chunk of writable) {
    assert.ok(
      chunk.includes('disabled={!settingsLoaded}'),
      `a settings control queues a write with no settingsLoaded guard: ${chunk.slice(0, 140)}`
    );
  }
});

test('DEFECT 1: updateSetting refuses to queue a write the page never read', async () => {
  const page = await read('pages/horses/index.js');
  const start = page.indexOf('const updateSetting = useCallback(');
  assert.ok(start > -1, 'updateSetting must still be here');
  const body = page.slice(start, page.indexOf('}, [flushSettings', start));

  const guardAt = body.indexOf('if (!settingsLoaded)');
  const writeAt = body.indexOf('pendingSettings.current = next');
  assert.ok(guardAt > -1, 'updateSetting must refuse when settings were never read');
  assert.ok(writeAt > guardAt, 'the refusal must precede the queued write, not follow it');
  // Fail closed AND say why: a control that drops the change in silence is the same
  // lie as one that writes the defaults over the live row.
  assert.ok(
    body.slice(guardAt, writeAt).includes('showNotification('),
    'the refusal must be surfaced to the operator, not dropped silently'
  );
  assert.match(
    page,
    /\}, \[flushSettings, settingsLoaded, showNotification\]\);/,
    'settingsLoaded must be in the dependency list or the guard reads a stale flag'
  );
});

test('DEFECT 2: a failed settings read is not reported as a failed save', async () => {
  // settingsError was written by BOTH the read path and the save path and rendered
  // as "Settings Not Saved", so an operator whose read failed was told their edits
  // were lost when nothing had ever been written.
  const page = await read('pages/horses/index.js');
  assert.match(
    page,
    /const \[settingsReadError, setSettingsReadError\] = useState\(null\);/,
    'the read failure needs its own state'
  );
  assert.match(page, /Settings Not Read: \{settingsReadError\}/, 'a read failure must say it was a read');
  assert.match(page, /Settings Not Saved: \{settingsError\}/, 'a save failure must still say it was a save');

  const readStart = page.indexOf('if (settingsRes.error) {');
  assert.ok(readStart > -1, 'the settings read path must still be locatable');
  const readEnd = page.indexOf('setPipelineRuns(', readStart);
  assert.ok(readEnd > readStart, 'the settings read path must still be bounded');
  assert.doesNotMatch(
    page.slice(readStart, readEnd),
    /setSettingsError\(/,
    'the settings read must never write to the save-error channel'
  );
});

test('DEFECT 3: the newsletter body read happens inside the armed abort window', async () => {
  // The timeout used to bound only the headers. A server that answered 200 and then
  // stalled the body hung response.json() forever with the timer already cleared,
  // pinning loading true and disabling Refresh for the rest of the session.
  const page = await read('pages/admin/newsletter.js');
  const armed = page.indexOf('setTimeout(() => controller.abort(), 15000)');
  assert.ok(armed > -1, 'the abort timer must still be armed');
  const bodyRead = page.indexOf('await response.json()', armed);
  const cleared = page.indexOf('clearTimeout(timer)', armed);
  assert.ok(bodyRead > -1, 'the body must still be parsed');
  assert.ok(cleared > -1, 'the timer must still be cleared');
  assert.ok(
    bodyRead < cleared,
    'the body read must happen before clearTimeout, or the timeout bounds only the headers'
  );
});

test('DEFECT 4: a counter that was read keeps reporting through an unrelated failure', async () => {
  // statValue tested `error` before `data`, so a failed subscriber PATCH or a failed
  // digest run flipped counters that had loaded perfectly well to "Unavailable".
  const page = await read('pages/admin/newsletter.js');
  const start = page.indexOf('const statValue = (value) => {');
  assert.ok(start > -1, 'statValue must still be here');
  // Reason about the code only: a comment naming a state is not the state.
  const body = page
    .slice(start, page.indexOf('\n    };', start))
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  assert.doesNotMatch(body, /if \(error\)/, 'the counters must not read the page-wide banner error');
  const dataAt = body.indexOf('if (data)');
  const unavailableAt = body.indexOf("'Unavailable'");
  assert.ok(dataAt > -1, 'a successful read must be checked first');
  assert.ok(unavailableAt > dataAt, 'Unavailable must be reachable only with no successful read');
  assert.ok(body.includes('loadError'), 'Unavailable must be decided by the counter read alone');
  assert.match(
    page,
    /const \[loadError, setLoadError\] = useState\(''\);/,
    'the counter read needs an error channel of its own'
  );
});

test('DEFECT 5: the Last Dispatch tile is as honest as the counters beside it', async () => {
  // formatDate returns the same '-' for null and for an unparseable value, so while
  // loading, after a failure and when nothing had ever been dispatched this tile
  // rendered one identical dash beside three neighbours that told the truth.
  const page = await read('pages/admin/newsletter.js');
  assert.doesNotMatch(
    page,
    /formatDate\(data\?\.stats\?\.last_sent_at\)/,
    'the tile must not go back to the three-states-one-dash formatter'
  );
  const start = page.indexOf('const lastDispatchValue = () => {');
  assert.ok(start > -1, 'the tile needs a state-aware renderer of its own');
  const body = page.slice(start, page.indexOf('\n    };', start));
  for (const state of ["'Reading'", "'Unavailable'", "'Not Read'", "'Never Dispatched'"]) {
    assert.ok(body.includes(state), `Last Dispatch must distinguish ${state}`);
  }
  assert.match(body, /toLocaleString\(\)/, 'a real timestamp must still render as a timestamp');
  assert.match(
    page,
    /<strong className=\{styles\.dateValue\}>\{lastDispatchValue\(\)\}<\/strong>/,
    'the tile must actually call the state-aware renderer'
  );
});

test('DEFECT 6: no unguarded err.message can strand a rejection inside a catch', async () => {
  // err?.name was already optional-chained on the line directly above. A non-Error
  // rejection made the next line throw a TypeError inside the catch, so no message
  // was ever set and the rejection escaped load() unhandled at both call sites.
  const page = await read('pages/admin/newsletter.js');
  const offenders = page
    .split('\n')
    .map((line, index) => [index + 1, line])
    .filter(([, line]) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .filter(([, line]) => /\berr\.message\b/.test(line));
  assert.equal(offenders.length, 0, `unguarded err.message: ${JSON.stringify(offenders)}`);
  assert.match(
    page,
    /err\?\.message \|\| 'Unable to load newsletter operations'/,
    'the load failure must fall back to a sane string when err carries no message'
  );
});
