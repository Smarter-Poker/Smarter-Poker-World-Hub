import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Fleet Content Programme Phase 7 ("Interactive Poker Content"): the hourly
// dispatcher entry that reveals due puzzles and publishes per enabled mode,
// and the World Hub migration that installs the puzzle tables, the answer
// guard, the two service-role RPCs and the seven disabled mode rows.
// Companion of phase6-content-dispatch.test.mjs.

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');
const dispatcher = fs.readFileSync(path.join(REPO, 'scripts', 'openclaw-cron-dispatcher.py'), 'utf8');
const MIGRATION = 'supabase/migrations/20260930030000_phase7_puzzles_answer_once_and_reveal_once.sql';
const migration = fs.readFileSync(path.join(REPO, MIGRATION), 'utf8');

const PHASE7_MODES = [
  'puzzle_nuts',
  'puzzle_pot_odds',
  'puzzle_what_would_you_do',
  'human_thread',
  'throwback_hand',
  'rail_human',
  'live_tournament_story',
];

const assignmentBlock = (name, open = '{', close = '}') => {
  const escapedOpen = open.replace(/[[{]/g, '\\$&');
  const escapedClose = close.replace(/[\]}]/g, '\\$&');
  const match = dispatcher.match(new RegExp(`\\n${name} = ${escapedOpen}([\\s\\S]*?)\\n${escapedClose}`));
  assert.ok(match, `${name} must remain a literal registry`);
  return match[1];
};

test('Phase 7 content is scheduled hourly at :40 and routed to the workers service', () => {
  const allCrons = assignmentBlock('ALL_CRONS', '[', ']');
  assert.match(
    allCrons,
    /\('\/api\/cron\/phase7-content',\s*dict\(minute=40\)\)/,
    'the hourly fire must sit at :40, clear of :10, :25, :30 and the :55 Club Arena break',
  );
  assert.match(
    assignmentBlock('WORKERS_PREFERRED'),
    /'\/api\/cron\/phase7-content':\s+'\/cron\/phase7-content'/,
    'the job must be handed to the workers route, never to a pages/api/cron file',
  );
  assert.match(
    assignmentBlock('JOB_TIMEOUTS'),
    /'\/api\/cron\/phase7-content':\s+300/,
    'the dispatcher timeout must cover the route internal deadline of 240 s',
  );
});

test('Phase 7 content is not a critical job and not a script job in 7.1', () => {
  // A disabled mode is a measured no-op (Phase 6 precedent); paging on it
  // would page on nothing. Promotion to CRITICAL_JOBS is a later decision.
  assert.doesNotMatch(assignmentBlock('CRITICAL_JOBS'), /phase7-content/);
  assert.doesNotMatch(assignmentBlock('SCRIPT_JOBS'), /phase7-content/);
});

test('all Phase 7 modes are introduced disabled without overwriting approval', () => {
  for (const mode of PHASE7_MODES) {
    assert.match(migration, new RegExp(`\\('${mode}', false,`), `${mode} must ship disabled`);
  }
  assert.match(migration, /ON CONFLICT \(mode\) DO NOTHING/);
  assert.doesNotMatch(migration, /UPDATE public\.horse_post_modes/i, 'the migration never flips an existing approval');
  assert.doesNotMatch(migration, /content_settings/i, 'the migration never touches the engine switch');
});

test('the migration follows the safety template and its rollback removes exactly what it creates', () => {
  for (const field of ['TIER:', 'AUTHOR:', 'AFFECTS:', 'IRREVERSIBLE:', 'WHY:', 'HOW:', 'EVIDENCE']) {
    assert.ok(migration.includes(field), `header must carry ${field}`);
  }
  assert.match(migration, /\nBEGIN;\n/);
  assert.match(migration, /\nCOMMIT;\n/);
  assert.match(migration, /1\. PRE-FLIGHT/);
  assert.match(migration, /POST-APPLY ASSERTIONS/);

  const rollback = migration.slice(migration.indexOf('-- ROLLBACK'));
  assert.ok(rollback.length > 0, 'a Tier 3 migration carries a rollback block');
  for (const table of ['social_puzzle_answers', 'social_puzzle_solutions', 'social_puzzles']) {
    assert.match(migration, new RegExp(`CREATE TABLE public\\.${table} \\(`));
    assert.match(rollback, new RegExp(`DROP TABLE IF EXISTS public\\.${table};`));
  }
  assert.match(rollback, /DROP TRIGGER IF EXISTS trg_p7_answer_guard ON public\.social_puzzle_answers;/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.fn_p7_answer_guard\(\);/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.fn_p7_reveal_puzzle\(uuid\);/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.fn_p7_publish_puzzle\(uuid, text, uuid, bigint, text, jsonb, text, jsonb, text, text, text, jsonb, text, boolean, integer, jsonb\);/);
  for (const mode of PHASE7_MODES) {
    assert.ok(rollback.includes(`'${mode}'`), `rollback deletes the ${mode} row`);
  }
  // Every line of the rollback is a comment: it never runs by accident.
  for (const line of rollback.split('\n').filter((l) => l.trim().length > 0)) {
    assert.ok(line.startsWith('--'), `rollback line is commented out: ${line}`);
  }
});

test('the answer never reaches a public row before the reveal', () => {
  // The solution table has no anon or authenticated policy and no privilege.
  assert.match(migration, /ALTER TABLE public\.social_puzzle_solutions ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.social_puzzle_solutions FROM PUBLIC, anon, authenticated;/);
  const solutionPolicies = [...migration.matchAll(/CREATE POLICY "[^"]+" ON public\.social_puzzle_solutions\s+FOR (\w+) TO ([\w, ]+?) (?:USING|WITH)/g)];
  assert.equal(solutionPolicies.length, 1, 'exactly one policy on the solution table');
  assert.equal(solutionPolicies[0][2].trim(), 'service_role');

  // Both RPCs are service-role only, SECURITY DEFINER, with a pinned search_path.
  for (const fn of ['fn_p7_publish_puzzle', 'fn_p7_reveal_puzzle']) {
    const body = migration.slice(migration.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`));
    assert.match(body, /SECURITY DEFINER\nSET search_path = public, extensions/);
    assert.match(body, /IF COALESCE\(auth\.role\(\)::text, ''\) <> 'service_role' THEN/);
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([\\s\\S]*?\\) FROM PUBLIC, anon, authenticated;`));
    assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([\\s\\S]*?\\) TO service_role;`));
  }

  // The post row carries the key and the options, never the answer; the
  // publisher refuses a prompt or metadata that would leak the label.
  assert.match(migration, /'publication_key', v_key,/);
  assert.match(migration, /'puzzle', jsonb_build_object\(\s*'id', v_puzzle_id,\s*'kind', v_kind,\s*'reveal_at', v_reveal_at,\s*'options', p_options,\s*'rewardable', p_rewardable\s*\)/);
  assert.match(migration, /puzzle prompt must not contain the correct option label/);
  assert.match(migration, /puzzle metadata must not carry the solution/);
  assert.match(migration, /encode\(sha256\(convert_to\(v_key \|\| ':' \|\| v_correct \|\| ':' \|\| v_salt, 'UTF8'\)\), 'hex'\)/);

  // The reserved column stays NULL: the insert never names it.
  const insert = migration.slice(migration.indexOf('INSERT INTO public.social_posts ('), migration.indexOf('RETURNING id INTO v_post_id;'));
  assert.doesNotMatch(insert, /\bpublication_key\b\s*[,)]/, 'social_posts.publication_key is never set');

  // The reveal pays once through the shared money function, after the 24-hour gate,
  // and only when rewardable; the notification insert of design step 8 is out of 7.1.
  const reveal = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.fn_p7_reveal_puzzle('));
  assert.match(reveal, /'social_puzzle_' \|\| v_answer\.user_id::text \|\| '_' \|\| p_puzzle_id::text/);
  assert.match(reveal, /public\.award_diamonds_v2\(\s*v_answer\.user_id,\s*'social_post',\s*v_reference,\s*p_puzzle_id::text,/);
  assert.match(reveal, /interval '24 hours'/);
  assert.match(reveal, /IF v_puzzle\.rewardable IS NOT TRUE THEN/);
  assert.match(reveal, /FOR UPDATE;/);
  assert.doesNotMatch(reveal, /INSERT INTO public\.notifications/);
  assert.match(reveal, /'answer key ' \|\| v_solution\.salt/);
});

test('nothing in the migration carries an em dash, an en dash or an emoji', () => {
  // Mode descriptions and the reveal comment format are the horse- and
  // operator-visible strings this file ships.
  assert.doesNotMatch(migration, /[–—]/);
  assert.doesNotMatch(migration, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
});
