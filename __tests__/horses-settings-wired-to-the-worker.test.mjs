/**
 * THE SETTINGS TAB SHOWS WHAT THE WORKER READS, AND NOTHING ELSE.
 *
 * Phase 10 of the Fleet Content Programme, 2026-10-06. The live content engine
 * is the workers repo, and it reads exactly two things from the settings
 * surfaces (workers src/lib/content-engine/Fleet.ts):
 *
 *   1. content_settings.engine_enabled, the master switch, read fresh per
 *      horse and failing closed;
 *   2. horse_post_modes.enabled per mode, one row per WAY a horse can post,
 *      failing closed, a new row starting disabled.
 *
 * Until this phase the Settings tab offered seven more controls (a posting
 * schedule, a "GPT-4o (Best)" model select, a temperature slider, an
 * Auto-Publish switch, and a peak_hours key the route accepted with no
 * control at all) that nothing live ever read, and exposed the sixteen mode
 * switches nowhere. A control that steers nothing is a promise the page
 * cannot keep (horses-no-language-model-for-the-fleet.test.mjs), so the seven
 * are gone and the modes are on the page.
 *
 * THE OWNER'S HOLD. A mode row starts disabled and turning it on is Dan's.
 * The route may only UPDATE an existing row, never INSERT one, never flip
 * anything on its own, must stamp approved_by/approved_at when it enables and
 * leave them alone when it disables, and must audit every flip. The panel may
 * show the switches, must not auto-flip anything on load, and flips one row
 * per call with no debounce: one switch, one audited write.
 *
 * The handler behaviour (permissions, update-only, the 404, the audit row, the
 * approval stamp) is exercised against the fake database in
 * horses-routes-group-a.test.mjs beside the other stable-admin cases. This file
 * reads the route and the panel as SOURCE and pins the shape that the handler
 * tests cannot see: what the page offers, what it refuses to offer, and how
 * the two switches are wired.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

import { auditPrefixesForGroup } from '../src/components/horses/auditFilters.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFile(path.join(HERE, '..', p), 'utf8');

const ROUTE = 'pages/api/horses/stable-admin.js';
const PANEL = 'src/components/horses/SettingsPanel.jsx';

/** The content_settings keys nothing live reads. None may be offered or accepted. */
const DEAD_KEYS = ['posts_per_day', 'min_delay_minutes', 'max_delay_minutes', 'ai_model', 'temperature', 'auto_publish', 'peak_hours'];

/**
 * Source with comments removed. The removal is DOCUMENTED in both files by
 * name, and a test that searched raw bytes would go red on the explanation of
 * its own subject.
 */
function code(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

test('the route accepts exactly engine_enabled and nothing numeric', async () => {
  const route = await read(ROUTE);
  const allowlist = route.match(/const SETTINGS_FIELDS = \[([\s\S]*?)\];/);
  assert.ok(allowlist, 'SETTINGS_FIELDS is gone or renamed');
  assert.deepEqual([...allowlist[1].matchAll(/'([^']+)'/g)].map((m) => m[1]), ['engine_enabled']);
  const ranges = route.match(/const SETTING_RANGES = \{([\s\S]*?)\};/);
  assert.ok(ranges, 'SETTING_RANGES is gone or renamed');
  assert.equal(ranges[1].trim(), '', 'no numeric setting survives: there is nothing left to bound');
  // Refused, not trimmed: a stale tab must learn the key is dead.
  assert.match(code(route), /Unknown Setting: \$\{unknown\.join\(', '\)\}/);
  for (const key of DEAD_KEYS) {
    assert.equal(
      new RegExp(`['"]${key}['"]`).test(code(route)),
      false,
      `${ROUTE} still names ${key} in code: nothing live reads it`,
    );
  }
});

test('the route reads and writes the one live key by name, never *', async () => {
  const route = code(await read(ROUTE));
  assert.match(route, /export const SETTINGS_READ_COLUMNS = \['id', \.\.\.SETTINGS_FIELDS, 'updated_at'\]\.join\(', '\);/);
  const settingsCalls = route.split(/\.from\('content_settings'\)/).slice(1);
  assert.ok(settingsCalls.length >= 4, 'the save reads, inserts, updates and the read reads');
  for (const call of settingsCalls) {
    const select = call.match(/\.select\(([^)]*)\)/);
    assert.ok(select, 'every content_settings call names its select');
    assert.equal(select[1], 'SETTINGS_READ_COLUMNS', `a content_settings call selects ${select[1]}: the dead columns must not travel`);
  }
});

test('the route serves the mode list and the mode switch through the operator wrapper', async () => {
  const route = code(await read(ROUTE));
  const actions = route.match(/const ACTIONS = \[([\s\S]*?)\];/)[1];
  assert.ok(actions.includes("'read_post_modes'") && actions.includes("'set_post_mode'"), 'both actions are in the allowlist');
  assert.match(route, /read_post_modes: PERMISSIONS\.CONSOLE_READ/, 'reading the modes is console floor');
  assert.match(route, /set_post_mode: PERMISSIONS\.CONTENT_WRITE/, 'flipping a mode is a content write');
  assert.match(route, /if \(action === 'read_post_modes'\) return readPostModes\(db\);/);
  assert.match(route, /if \(action === 'set_post_mode'\) return setPostMode\(db, op, req, body\);/);
  assert.match(route, /export const POST_MODE_COLUMNS = 'mode, enabled, description, approved_by, approved_at';/);
  assert.match(route, /\.from\('horse_post_modes'\)\s*\.select\(POST_MODE_COLUMNS\)\s*\.order\('mode', \{ ascending: true \}\)/, 'every row, by mode');
});

test('the mode switch is an UPDATE of one existing row: never an insert, never a flip on its own', async () => {
  const route = code(await read(ROUTE));
  const start = route.indexOf('async function setPostMode(');
  const end = route.indexOf('\n}\n', start);
  assert.ok(start > -1 && end > start, 'setPostMode must still be here');
  const body = route.slice(start, end);

  assert.doesNotMatch(body, /\.insert\(/, 'a mode nobody seeded is not created by a switch');
  assert.doesNotMatch(body, /\.upsert\(/, 'and not upserted either');
  assert.match(body, /if \(!before\) throw notFound\('That Posting Mode Does Not Exist'\);/, 'an unknown mode is a 404');
  assert.ok(body.indexOf('throw notFound(') < body.indexOf('.update('), 'the existence check precedes the write');
  assert.match(body, /\.update\(patch\)\s*\.eq\('mode', mode\)/, 'one row, by its primary key');
  assert.match(body, /if \(typeof body\.enabled !== 'boolean'\) throw badRequest/, 'enabled must be a boolean');
  assert.doesNotMatch(body, /\.single\(/, 'no .single() in a hub route');

  // The approval stamp is inside the `if (enabled)` branch and nowhere else.
  const stampStart = body.indexOf('if (enabled) {');
  const stampEnd = body.indexOf('}', stampStart);
  assert.ok(stampStart > -1, 'enabling stamps the approval');
  const stamp = body.slice(stampStart, stampEnd);
  assert.match(stamp, /patch\.approved_by = op\?\.user\?\.email \|\| op\?\.user\?\.id/, 'approved_by is the operator the wrapper resolved');
  assert.match(stamp, /patch\.approved_at = new Date\(\)\.toISOString\(\)/);
  const outside = body.slice(0, stampStart) + body.slice(stampEnd);
  assert.doesNotMatch(outside, /approved_(by|at) =/, 'disabling leaves the approval record alone');

  assert.match(body, /action: 'postmode\.set'/, 'every flip is audited under postmode.set');
  assert.match(body, /targetType: 'horse_post_modes'/);
  assert.match(body, /before: pick\(before, \['enabled', 'approved_by', 'approved_at'\]\)/);
  assert.match(body, /after: pick\(data, \['enabled', 'approved_by', 'approved_at'\]\)/);
});

test('the panel offers the master switch and the mode switches, and nothing that steers nothing', async () => {
  const raw = await read(PANEL);
  const panel = code(raw);

  assert.match(panel, /const DEFAULTS = Object\.freeze\(\{ engine_enabled: false \}\);/, 'one default, and it is false');
  assert.match(panel, /authFetch\('\/api\/horses\/stable-admin\?action=read_settings'\)/);
  assert.match(panel, /action: 'save_settings'/);
  assert.match(panel, /authFetch\('\/api\/horses\/stable-admin\?action=read_post_modes'\)/);
  assert.match(panel, /action: 'set_post_mode', mode, enabled/);

  for (const key of DEAD_KEYS) {
    assert.equal(new RegExp(`\\b${key}\\b`).test(panel), false, `${PANEL} still writes or renders ${key}`);
  }
  for (const gone of ['Posting Schedule', 'AI Settings', 'Auto-Publish', 'setting-publish', 'setting-model', 'setting-temperature', 'Min Delay', 'Max Delay', 'Posts Per Day']) {
    assert.equal(panel.includes(gone), false, `${PANEL} still shows "${gone}"`);
  }
  assert.equal(/gpt-|GPT-/.test(panel), false, 'no model name on the page: the engine calls none');
  assert.equal(/<select\b|type="number"|type="range"/.test(panel), false, 'two kinds of switch, no select, no number, no slider');

  // The wording that keeps the page honest.
  assert.match(panel, /\{!loaded \? 'Unknown' : settings\.engine_enabled \? 'Running' : 'Stopped'\}/);
  assert.match(panel, /The Master Content Engine Switch Above Gates Every Mode\./, 'one line says the master switch gates every mode');
  assert.match(panel, /Posting Modes<\/h3>/, 'the card is named');
  assert.match(panel, /Not Yet Approved/, 'an unapproved row says so');
  assert.match(panel, /Approved By \$\{row\.approved_by \|\| 'Unknown'\} On \$\{when\(row\.approved_at, true\)\}/, 'an approved row names who and when');
  assert.match(panel, /modeTitle\(row\.mode\)/, 'the mode name is rendered in Title Case words, not as a snake_case key');
  assert.match(panel, /\.split\('_'\)[\s\S]*?word\.charAt\(0\)\.toUpperCase\(\) \+ word\.slice\(1\)/, 'modeTitle title-cases every word of the key');
});

test('every switch on the panel carries the read-and-permission guard, and a mode flip is one immediate call', async () => {
  const panel = code(await read(PANEL));
  const inputs = panel.split(/<input\b/).slice(1);
  assert.equal(inputs.length, 2, 'exactly two switches: the master switch and the mode switch the map renders per row');
  for (const chunk of inputs) {
    const tag = chunk.slice(0, chunk.indexOf('/>'));
    assert.match(tag, /type="checkbox"/, 'every control is a switch');
    assert.ok(tag.includes('disabled={!loaded || !canWrite}'), `a switch without the guard: ${tag.slice(0, 120)}`);
  }
  const [master, mode] = inputs;
  assert.match(master.slice(0, master.indexOf('/>')), /onChange=\{\(event\) => update\('engine_enabled', event\.target\.checked\)\}/);
  assert.match(mode.slice(0, mode.indexOf('/>')), /onChange=\{\(event\) => flipMode\(row\.mode, event\.target\.checked\)\}/);

  // flipMode: no timer, no pending queue, one authFetch, then a re-read.
  const start = panel.indexOf('const flipMode = useCallback(');
  const end = panel.indexOf('}, [authFetch, canWrite, loadModes, loaded, showNotification]);', start);
  assert.ok(start > -1 && end > start, 'flipMode must still be here with its dependency list');
  const body = panel.slice(start, end);
  assert.doesNotMatch(body, /setTimeout|pendingRef|timerRef/, 'a mode flip is not debounced or batched');
  assert.equal((body.match(/authFetch\(/g) || []).length, 1, 'one switch, one call');
  assert.ok(body.indexOf('if (!loaded || !canWrite)') < body.indexOf('authFetch('), 'the guard precedes the call');
  // The list shown after a flip is the table's: the route re-reads it after
  // its write and sends it back, and the panel re-reads it itself when that
  // list is missing or the write failed.
  assert.match(body, /if \(Array\.isArray\(body\?\.modes\)\) \{\s*setModes\(body\.modes\);/, 'the list the route re-read is what the page shows');
  assert.ok(body.indexOf('authFetch(') < body.indexOf('await loadModes()'), 'otherwise the list is re-read after the write');
  assert.match(body, /if \(flippingRef\.current\) return;/, 'a second click while one is in flight is dropped, not queued');
  // This tab's own broadcast is not a reason to re-read what it already holds.
  assert.match(panel, /tabId: BROADCAST_TAB_ID/, 'the panel tags its broadcasts with its tab id');
  assert.match(panel, /if \(message\.tabId && message\.tabId === BROADCAST_TAB_ID\) return;/, 'and skips its own echo');

  // Nothing flips on load: the mount effect reads, and only reads.
  const mount = panel.match(/useEffect\(\(\) => \{\s*mountedRef\.current = true;([\s\S]*?)\}, \[load, loadModes\]\);/);
  assert.ok(mount, 'the mount effect must still be here');
  assert.doesNotMatch(mount[1], /flipMode|update\(|save_settings|set_post_mode/, 'the page never writes on load');
});

test('the modes are null until read, and a failed read is an error state rather than an empty list', async () => {
  const panel = code(await read(PANEL));
  assert.match(panel, /const \[modes, setModes\] = useState\(null\);/);
  const start = panel.indexOf('const loadModes = useCallback(');
  const end = panel.indexOf('}, [authFetch]);', start);
  assert.ok(start > -1 && end > start, 'loadModes must still be here');
  const body = panel.slice(start, end);
  assert.match(body, /Array\.isArray\(body\?\.modes\) \? body\.modes : null/, 'a 200 without the list is not a read');
  assert.match(body, /if \(result\.error\) \{\s*setModes\(null\);\s*setModesError\(/, 'a failed read clears the list and says so');
  assert.doesNotMatch(body, /setModes\(\[\]\)/, 'a failed read never renders as "no modes"');
  assert.match(panel, /modes === null \? <div className=\{styles\.warnBanner\} role="status">/, 'an unread list is a status banner, not a list');
  assert.match(panel, /Posting Modes Not Read: \{modesError\}/);
});

test('the Audit tab finds a mode flip under Engine Settings', () => {
  const prefixes = auditPrefixesForGroup('settings');
  assert.ok(prefixes.includes('settings.'), 'the master switch');
  assert.ok(prefixes.includes('postmode.'), 'and the mode switches, which file postmode.set');
});

test('house rules: no em dash, no emoji, no bots, and only CSS module classes on the panel', async () => {
  for (const file of [ROUTE, PANEL]) {
    const text = await read(file);
    assert.equal(/[\u{2012}-\u{2015}]/u.test(text), false, `${file} contains a dash the house bans`);
    assert.equal(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(text), false, `${file} contains emoji`);
    assert.doesNotMatch(text, /\bbots?\b/i, `${file} says bot: horses are players`);
  }
  // Title Case on every JSX text node is enforced by scripts/ci/check-title-case.mjs
  // (the TypeScript parser, not a regex); this file pins the sentences it needs by
  // name above. Colours come from the module or the T tokens, never a literal.
  const panel = code(await read(PANEL));
  assert.doesNotMatch(panel, /#[0-9a-fA-F]{3,8}\b|\brgba?\(/, 'no raw colour on the panel');
  assert.doesNotMatch(panel, /className="/, 'CSS modules only: every class comes from styles.*');
  // The classes the Posting Modes card introduced exist in the module, and the
  // mode switch is the same .toggleSwitch the master switch uses.
  const css = await read('pages/horses/horses.module.css');
  for (const cls of ['settingNote', 'modeList', 'modeRow', 'modeText', 'modeMeta', 'toggleSwitch', 'slider', 'controlItem']) {
    assert.ok(panel.includes(`styles.${cls}`), `the panel no longer uses styles.${cls}`);
    assert.ok(new RegExp(`\\.${cls}\\b`).test(css), `styles.${cls} is used on the panel but horses.module.css has no .${cls}`);
  }
});
