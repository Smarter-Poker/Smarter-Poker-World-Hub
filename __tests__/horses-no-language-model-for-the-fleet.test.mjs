/**
 * THE HORSES RUN A DETERMINISTIC ENGINE. THE CONSOLE MUST NEVER SAY OTHERWISE.
 *
 * Dan, 2026-09-03, on the Grinder Settings card: the horses "run off their own
 * deterministic engine and programming, not off Chat GPT, so remove that as the
 * first thing you do".
 *
 * What was there. `/horses` offered an operator a select labelled "AI Model"
 * with the options "GPT-4o (Best)" and "GPT-4o Mini (Faster)", writing
 * `content_settings.grinder_ai_model`. It sat beside three more controls in the
 * same card: Max Tables Per Horse, Daily Play Hours and Starting Chips.
 *
 * Why it was false, measured rather than assumed, 2026-09-04:
 *
 *   1. `grep -rl "openai\|OpenAI\|gpt-4\|anthropic" server/src` in the Club
 *      Arena repo returns NOTHING. The engine carries no LLM dependency.
 *   2. `grep -rn "content_settings" server/src src` in that repo returns
 *      NOTHING. The engine has never read the table this control writes.
 *   3. Every action a horse takes is decided by HorseLogic, HorseBehavior,
 *      HorseEvEngine and HorseEval, whose own tests assert determinism for a
 *      given seed.
 *   4. In this repo the four keys appeared in exactly two shipped files: the
 *      write allowlist in pages/api/horses/stable-admin.js and the controls in
 *      pages/horses/index.js. Nothing read one back, here or anywhere.
 *
 * So all four were deleted: one because it stated something untrue about the
 * platform, three because a control that steers nothing is a promise the page
 * cannot keep. An operator who set "Daily Play Hours 8" was told the fleet now
 * plays eight hours; it played whatever the engine chose, and the console
 * reported the operator's own number back to them as if it had landed.
 *
 * WHAT THIS FILE IS FOR. This exact control has been described in three
 * separate documents as "the thing to remove next", which means the next agent
 * to add a settings card has every chance of adding it back. The hamburger
 * revert war in the Club Arena repo ran for two days on precisely that
 * mechanism: a claim written down in the repo, re-enforced by whoever read the
 * repo next. A test is the only form of a rule that argues back.
 *
 * IF THIS FILE GOES RED, YOUR CHANGE IS THE BUG. Do not loosen an assertion to
 * land a card. The legitimate place to say "model" in this console is the AI
 * Settings card, which steers the SOCIAL CONTENT engine
 * (src/content-engine/pipeline/PipelineCommander.js reads that row to write
 * posts and stories) and has nothing to do with poker. The legitimate place to
 * steer how many horses take seats is Fleet Command, which writes
 * ca_horse_fleet_policy and which the engine genuinely reads once per club per
 * cycle.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const at = (p) => path.join(HERE, '..', p);

const read = (p) => readFile(at(p), 'utf8');

/** Every file that renders or accepts a /horses setting. */
const CONSOLE_SOURCES = [
  'pages/horses/index.js',
  'pages/horses/sql-console.js',
  'pages/horses/hg-moderation.js',
  'pages/horses/hand-reviews.js',
  'src/components/horses/FleetPanel.jsx',
  'src/components/horses/StaffPanel.jsx',
  'src/components/horses/ApprovalsPanel.jsx',
];

const FLEET_ROUTES = [
  'pages/api/horses/stable-admin.js',
  'pages/api/horses/fleet-admin.js',
];

/**
 * Strip block and line comments before searching for a claim.
 *
 * The deletion is DOCUMENTED in these files, at length, and that documentation
 * names the strings it removed. A test that searched raw bytes would go red on
 * the explanation of its own subject, and the obvious way to quieten it would
 * be to delete the explanation - leaving the next agent with a bare rule and no
 * reason, which is how this control came back twice already.
 */
function code(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

test('no /horses source offers a language model choice for the poker fleet', async () => {
  for (const file of CONSOLE_SOURCES) {
    const body = code(await read(file));

    assert.equal(
      /grinder_ai_model/.test(body),
      false,
      `${file} still references grinder_ai_model. The horses do not run on a language model; `
        + 'the setting steers nothing and says something untrue about the platform.',
    );

    // The model names themselves. AI Settings (the social content engine) uses
    // `ai_model` and lives in the same file, so the names alone are not the
    // test - but a fleet control would have to name one of these to offer it,
    // and index.js is where both cards live. Assert on the pairing instead: a
    // model name must not appear within a card that talks about horses.
    const cards = body.split(/<div className=\{styles\.settingCard/);
    for (const card of cards.slice(1)) {
      const mentionsModel = /gpt-4|gpt-3|claude-|llama|mistral/i.test(card);
      const mentionsFleet = /\bhorse|\bgrinder|\bfleet\b/i.test(card);
      assert.equal(
        mentionsModel && mentionsFleet,
        false,
        `${file} has a settings card naming both a language model and the horses. `
          + 'HorseLogic is deterministic. A model choice for the fleet is a false control.',
      );
    }
  }
});

test('the settings route refuses every grinder_* key', async () => {
  const body = await read('pages/api/horses/stable-admin.js');

  const allowlist = body.match(/const SETTINGS_FIELDS = \[([\s\S]*?)\];/);
  assert.ok(allowlist, 'SETTINGS_FIELDS is gone or has been renamed');
  assert.equal(
    /grinder_/.test(allowlist[1]),
    false,
    'SETTINGS_FIELDS accepts a grinder_* key again. Nothing on the platform reads one; '
      + 'the route must not let an operator believe a write to it has an effect.',
  );

  const ranges = body.match(/const SETTING_RANGES = \{([\s\S]*?)\};/);
  assert.ok(ranges, 'SETTING_RANGES is gone or has been renamed');
  assert.equal(
    /grinder_/.test(ranges[1]),
    false,
    'SETTING_RANGES still validates a grinder_* key that the allowlist no longer accepts',
  );
});

test('the settings route still owns the social content engine keys', async () => {
  // The negative above must not be satisfied by deleting the whole card. The
  // content engine genuinely reads these, in
  // src/content-engine/pipeline/PipelineCommander.js.
  const body = await read('pages/api/horses/stable-admin.js');
  const allowlist = body.match(/const SETTINGS_FIELDS = \[([\s\S]*?)\];/)[1];

  for (const key of [
    'posts_per_day',
    'min_delay_minutes',
    'max_delay_minutes',
    'ai_model',
    'temperature',
    'engine_enabled',
    'auto_publish',
    'peak_hours',
  ]) {
    assert.ok(
      allowlist.includes(`'${key}'`),
      `SETTINGS_FIELDS lost ${key}. That one is real: the content pipeline reads it.`,
    );
  }
});

test('the Settings tab points an operator at the control that does work', async () => {
  const body = await read('pages/horses/index.js');

  assert.ok(
    /HorseLogic Is A Deterministic Engine/.test(body),
    'the Horse Fleet card no longer states that the engine is deterministic. '
      + 'An operator arriving where four controls used to be needs to be told why they went.',
  );
  assert.ok(
    /Open Fleet Command/.test(body),
    'the Horse Fleet card no longer routes to Fleet Command, which is where seating is '
      + 'actually governed',
  );
  assert.ok(
    /navTabs\.some\(\(t\) => t\.id === 'fleet'\)/.test(body),
    'the Fleet Command button is no longer gated on the operator holding fleet.read. '
      + 'A settings.write account need not hold it, and a button that lands on a hidden '
      + 'panel is worse than no button.',
  );
});

test('no fleet route reaches for a language model', async () => {
  for (const file of FLEET_ROUTES) {
    const body = code(await read(file));
    assert.equal(
      /openai|anthropic|gpt-4|gpt-3|completions?\s*\(/i.test(body),
      false,
      `${file} references a language model. Horse decisions are made by the deterministic `
        + 'engine in the Club Arena repo, and no /horses route may imply otherwise.',
    );
  }
});
