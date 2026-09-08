/**
 * LAW: AN RPC CALL NAMES A SIGNATURE THAT EXISTS.
 *
 * PostgREST resolves a function overload by its ARGUMENT NAMES. A call carrying
 * a name no signature declares is not a wrong value - it is PGRST202, "no
 * function matches", a 404. So a mistyped parameter name does not degrade a
 * feature, it deletes it, silently, from the day it is written.
 *
 * Four of these were live on 2026-09-08, found when the phase 7 deep dive
 * widened the money-door scanner from one directory to the whole World Hub
 * server side. The worst had been refusing to let players lock themselves out.
 *
 * Each expectation below is a call that was broken in production. The live
 * signatures are quoted beside them; they were read from pg_proc on 2026-09-08.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('self-exclusion sends hours, because that is what the function takes', () => {
  // live: fn_rg_self_exclude(p_user_id uuid, p_duration_hours integer)
  const src = read('pages/api/rg/self-exclude.js');
  assert.match(src, /p_duration_hours:/, 'must send p_duration_hours');
  assert.doesNotMatch(
    src,
    /p_until:\s*parsed/,
    'p_until matched no signature - every self-exclusion 404d'
  );
});

test('a self-exclusion the database refuses is not reported as success', () => {
  // fn_rg_self_exclude RETURNS {ok:false, error:'cannot_shorten_exclusion'};
  // it does not raise, so `error` is null and the route used to send HTTP 200.
  const src = read('pages/api/rg/self-exclude.js');
  assert.match(src, /data\.ok === false/, 'must inspect the returned ok flag');
  assert.match(src, /409/, 'a refused shortening is a conflict, not a success');
});

test('permanent exclusion is sent as the encoding the function understands', () => {
  // p_duration_hours <= 0 -> 'infinity'::timestamptz
  const src = read('pages/api/rg/self-exclude.js');
  assert.match(src, /permanent/, 'permanent must be handled explicitly');
  assert.match(src, /Math\.ceil/, 'hours round UP so an exclusion is never shortened');
});

test('the reality check sends only the argument that exists', () => {
  // live: fn_rg_should_show_reality_check(p_user_id uuid) - one argument. The
  // function appends now() to reality_check_shown_at itself.
  const src = read('pages/api/rg/session/reality-check.js');
  assert.doesNotMatch(src, /p_ack:/, 'p_ack matched no signature');
  assert.match(src, /p_user_id: user\.id/, 'still identifies the player');
});

test('the admin auth lookup names p_email', () => {
  // live: get_auth_users_by_email(p_email text)
  const src = read('pages/api/admin/check-auth-uuid.js');
  assert.match(src, /p_email:/);
  assert.doesNotMatch(src, /email_pattern:/);
});

test('level stats keep the contract the caller actually needs', () => {
  /* The opposite case, and the reason this law is about signatures rather than
     about calls: get_user_level_stats(p_user_id) existed, but returned a
     hard-coded {xp, level, xp_to_next, progress_pct} - an XP shape from a
     function named for level statistics. Renaming the call to match the stub
     would have turned an honest 404 into four fields nobody reads. The
     DATABASE was corrected instead, so this call must keep both arguments. */
  const src = read('lib/game-engine-service.ts');
  assert.match(src, /p_level_id: levelId/, 'the caller states the real contract');
  assert.match(src, /p_user_id: userId/);
});
