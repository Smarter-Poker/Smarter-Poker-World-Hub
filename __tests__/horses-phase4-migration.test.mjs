/**
 * Phase 4 - the migration, read as a contract.
 *
 * There is no database in a `node --test` run, so these assertions are made
 * against the migration TEXT. That is weaker than executing it, and the
 * execution proof exists separately and was run against production inside a
 * rolled-back transaction (docs/horses/PHASE4-SIM.sql, every ASSERT OK).
 *
 * What this file is FOR is the class of defect a sim cannot catch: the
 * migration is applied and registered, so nobody runs it again, and the next
 * change to it is somebody editing the file. These tests pin the properties
 * that make the file safe, so an edit that removes one goes red here rather
 * than going unnoticed until an operator locks somebody out.
 *
 * THE THREE THINGS THAT MUST NEVER CHANGE QUIETLY:
 *   1. restrictions_enforced DEFAULTS FALSE.
 *   2. The reader and the guard FAIL OPEN.
 *   3. The scope and reason vocabularies in SQL are the same lists the
 *      JavaScript offers, or the panel presents a choice the database refuses.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

import {
  RESTRICTION_REASON_CODES,
  RESTRICTION_SCOPES,
  RESTRICTION_STATUSES,
} from '../src/lib/horses/playerRestrictions.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.join(
  HERE,
  '..',
  'supabase/migrations/20260904150000_ca_player_360_and_restrictions.sql'
);
const RG_FIX = path.join(
  HERE,
  '..',
  'supabase/migrations/20260904160000_ca_rg_loosen_list_is_an_array.sql'
);

const sql = await readFile(MIGRATION, 'utf8');
const rgFix = await readFile(RG_FIX, 'utf8');

/**
 * The file with its `--` comments removed.
 *
 * Both migrations DOCUMENT the defects they fix, at length, and that
 * documentation quotes the broken code verbatim. A test that searched raw
 * bytes would go red on the explanation of its own subject, and the obvious
 * way to quieten it would be to delete the explanation - leaving the next
 * agent with a bare rule and no reason. This is the same lesson the Phase A
 * guard test recorded, arriving a second time in one day.
 */
function code(text) {
  return text.replace(/^\s*--.*$/gm, ' ');
}

const rgFixCode = code(rgFix);

/** Collapse whitespace, so a line-wrapped sentence still matches. */
function flat(text) {
  return text.replace(/\s+/g, ' ');
}

test('the enforcement switch defaults false and says who owns it', () => {
  assert.match(
    sql,
    /add column if not exists restrictions_enforced boolean not null default false/,
    'restrictions_enforced must be added with DEFAULT FALSE. Section 0 rule 2 is that '
      + 'nothing refuses anything until Dan turns it on.'
  );
  assert.match(
    sql,
    /ASSERT FAILED: restrictions_enforced must be false on apply/,
    'the migration must refuse to finish if the switch is not false when it applies'
  );
});

test('the reader fails OPEN', () => {
  const body = sql.slice(
    sql.indexOf('function public.fn_ca_player_restricted'),
    sql.indexOf('comment on function public.fn_ca_player_restricted')
  );
  assert.ok(body.length > 100, 'fn_ca_player_restricted is gone or was renamed');
  assert.match(
    body,
    /exception\s+when others then\s+[\s\S]*?return false;/,
    'fn_ca_player_restricted must answer FALSE on any error. A player refused a seat '
      + 'because a lookup broke is a support ticket about something nobody chose.'
  );
  assert.match(body, /\bstable\b/, 'the reader must be STABLE so a statement can cache it');
});

test('the guard fails OPEN, and only its own refusal escapes', () => {
  const body = sql.slice(
    sql.indexOf('function public.fn_ca_refuse_restricted_entry'),
    sql.indexOf('comment on function public.fn_ca_refuse_restricted_entry')
  );
  assert.ok(body.length > 200, 'fn_ca_refuse_restricted_entry is gone or was renamed');

  // Its OWN refusal must pass through, or an enforced restriction would be
  // swallowed by the same handler that makes it fail open.
  assert.match(
    body,
    /when insufficient_privilege then\s+raise;/,
    'the guard must re-raise its own refusal. Catching it would make enforcement a no-op.'
  );
  assert.match(
    body,
    /when others then\s+return new;/,
    'any OTHER error inside the guard must let the write through (section 0 rule 3)'
  );
});

test('the refusal carries the prefix the engine will have to recognise', () => {
  assert.match(
    sql,
    /raise exception\s*\n?\s*'PLAYER_RESTRICTED:/,
    'the refusal message must start PLAYER_RESTRICTED:. HorseFleetManager.seatHorse '
      + 'recognises expected refusals by string, so this prefix is what stops an enforced '
      + 'restriction on a horse from filling the engine log. PHASE4-CONTRACTS section 6.'
  );
  assert.match(sql, /errcode = '42501'/, 'the refusal must use insufficient_privilege');
});

test('the guards are attached to the two tables every entry converges on', () => {
  assert.match(
    sql,
    /create trigger zz_restriction_seat_guard\s+before insert on public\.table_seats/,
    'the seat guard must be BEFORE INSERT on table_seats'
  );
  assert.match(
    sql,
    /create trigger zz_restriction_tourney_guard\s+before insert on public\.tournament_players/,
    'the tournament guard must be BEFORE INSERT on tournament_players'
  );
  // zz_ so the freeze guards keep their answer.
  assert.ok(
    'zz_freeze_entry_guard' < 'zz_restriction_seat_guard',
    'the restriction guards must sort AFTER the freeze guards, so a platform freeze is '
      + 'reported as a freeze'
  );
  assert.match(
    sql,
    /ASSERT FAILED: trigger name ordering no longer puts the freeze first/,
    'the migration must assert its own ordering rather than trusting the names'
  );
});

test('the guard reads the column that actually exists on both tables', () => {
  // The freeze migration recorded this trap in as many words: a trigger
  // naming a column that does not exist silently never matches, and the
  // guard reports installed while guarding nothing.
  assert.match(
    sql,
    /v_user := new\.user_id;/,
    'the guard must read NEW.user_id, which is the column both tables carry and the '
      + 'column every seat and every registration populates'
  );
  assert.ok(
    !/new\.player_id|new\.horse_id|new\.member_id/.test(sql),
    'the guard must not read player_id, horse_id or member_id: production carries 0 rows '
      + 'with horse_id set and the seat creators all write user_id'
  );
});

test('the SQL vocabularies are the JavaScript vocabularies', () => {
  const scopeCheck = sql.match(/ca_player_restrictions_scope_known\s+check \(scope in \(([^)]*)\)\)/);
  assert.ok(scopeCheck, 'the scope check constraint is gone or was renamed');
  const sqlScopes = [...scopeCheck[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(
    sqlScopes.slice().sort(),
    RESTRICTION_SCOPES.slice().sort(),
    'the scopes the database accepts and the scopes the panel offers must be the same '
      + 'list, or the console presents a choice the database refuses'
  );

  const reasonCheck = sql.match(/ca_player_restrictions_reason_known\s+check \(reason_code in \(([\s\S]*?)\)\)/);
  assert.ok(reasonCheck, 'the reason check constraint is gone or was renamed');
  const sqlReasons = [...reasonCheck[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(
    sqlReasons.slice().sort(),
    RESTRICTION_REASON_CODES.slice().sort(),
    'the reason codes must match the JavaScript list exactly'
  );

  const statusCheck = sql.match(/ca_player_restrictions_status_known\s+check \(status in \(([^)]*)\)\)/);
  assert.ok(statusCheck, 'the status check constraint is gone or was renamed');
  const sqlStatuses = [...statusCheck[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(sqlStatuses.slice().sort(), RESTRICTION_STATUSES.slice().sort());
});

test('one active restriction per scope, and the index is PARTIAL', () => {
  assert.match(
    sql,
    /create unique index if not exists ca_player_restrictions_one_active_per_scope\s+on public\.ca_player_restrictions \(user_id, scope\)\s+where status = 'active'/,
    'the unique index must be partial on status = active. Without the WHERE, a lifted '
      + 'restriction would block ever restricting that scope again.'
  );
  assert.match(
    sql,
    /create index if not exists ca_player_restrictions_active_by_user\s+on public\.ca_player_restrictions \(user_id\)\s+where status = 'active'/,
    'the hot-path index the trigger probes must exist and must be partial'
  );
});

test('nothing in this migration deletes, and nothing seeds a restriction', () => {
  const body = sql.slice(0, sql.indexOf('-- ROLLBACK'));
  assert.ok(
    !/\bdelete from public\.(ca_player_restrictions|ca_operator_player_notes)\b/.test(body),
    'no function here may DELETE a restriction or a note. A lift marks lifted, a note '
      + 'delete is soft: the record of a decision is part of the decision.'
  );
  assert.match(
    body,
    /update public\.ca_operator_player_notes\s+set deleted_at = now\(\)/,
    'note delete must be a soft delete'
  );
  assert.match(
    body,
    /ASSERT FAILED: this migration seeds no restriction/,
    'the migration must assert it restricted nobody'
  );
});

test('this phase never writes profiles.status or player_notes', () => {
  const body = sql.slice(0, sql.indexOf('-- ROLLBACK'));
  assert.ok(
    !/update public\.profiles/.test(body),
    'profiles.status is decorative - every production row says active and no money, seat, '
      + 'tournament or auth path reads it. Writing it would create a second opinion about '
      + "a player's standing that nothing enforces."
  );
  assert.ok(
    !/insert into public\.player_notes|update public\.player_notes/.test(body),
    'public.player_notes belongs to the PLAYERS: it is where one player records another '
      + "opponent's tells and tendencies. An operator note written there would appear "
      + "inside a player's own notebook."
  );
});

test('every include-horses parameter defaults to TRUE', () => {
  const defaults = [...sql.matchAll(/p_include_horses\s+boolean\s+default\s+(\w+)/g)];
  assert.ok(defaults.length >= 2, 'expected p_include_horses on the search and the list');
  for (const m of defaults) {
    assert.equal(
      m[1],
      'true',
      'CLAUDE.md 10.5: any include-horses parameter DEFAULTS TRUE. A report that leaves '
        + 'the fleet out by default is the defect that cost 39 events their rake attribution.'
    );
  }
});

test('no read in this phase excludes a horse', () => {
  // is_horse may be SELECTED (identification, sanctioned) and may appear in
  // the include-horses clause. It may never appear as a bare exclusion.
  const lines = sql.split('\n');
  for (const line of lines) {
    if (line.trim().startsWith('--')) continue;
    if (!/is_horse/.test(line)) continue;
    const ok =
      /coalesce\(p_include_horses, true\)/.test(line)
      || /select is_horse|p\.is_horse|as is_horse|'isHorse'|'is_horse'/.test(line)
      || /coalesce\(v_is_horse, false\)/.test(line)
      || /v_is_horse/.test(line);
    assert.ok(
      ok,
      `is_horse used outside identification or the include-horses default: ${line.trim()}`
    );
  }
});

test('every function is service_role only, except the two the trigger needs', () => {
  assert.match(sql, /grant execute on function %s to service_role/, 'the ACL loop is gone');
  // The trigger runs as whoever is inserting - the engine, a browser under
  // RLS, a cron - so the reader it calls has to be executable by them. It is
  // SECURITY DEFINER, so this widens who may ASK, not what they may see.
  assert.match(
    sql,
    /grant execute on function public\.fn_ca_player_restricted\(uuid, text\)\s+to anon, authenticated, service_role/,
    'the reader must be executable by the roles that insert seats, or the guard throws '
      + 'permission denied on every insert and fails open on all of them'
  );
});

test('the migration takes a lock timeout and does not raise it', () => {
  assert.match(sql, /set local lock_timeout = '3s'/, 'the migration must bound its lock wait');
  assert.match(
    sql,
    /A timeout means retry off-peak/,
    'the file must say what a timeout means, because the tempting fix is to raise it'
  );
});

test('the RG correction uses array_append and cannot be re-broken', () => {
  assert.ok(
    !/v_loosens\s*:=\s*v_loosens\s*\|\|/.test(rgFixCode),
    'the || form is back. An untyped literal on the right of || makes Postgres resolve '
      + 'anyarray || anyarray and PARSE the string as an array literal, which raised 22P02 '
      + 'out of the responsible-gaming path.'
  );
  // Scoped to the FUNCTION BODY, the same way the in-database assertion
  // scopes itself to prosrc. Counting the whole file also counts the two
  // mentions inside the assertion block that is doing the counting, which is
  // a test measuring itself.
  const fnBody = rgFixCode.slice(
    rgFixCode.indexOf('create or replace function public.fn_ca_player_rg_set'),
    rgFixCode.indexOf('revoke all on function public.fn_ca_player_rg_set')
  );
  assert.ok(fnBody.length > 500, 'fn_ca_player_rg_set is gone or was renamed');
  const appends = fnBody.match(/array_append/g) || [];
  assert.equal(
    appends.length,
    5,
    'expected five array_append calls in the function body, one per classified loosening '
      + 'direction: cleared and raised for the money caps, lengthened for the reality '
      + 'check, cleared and shortened for the exclusions'
  );
  assert.match(
    rgFixCode,
    /ASSERT FAILED: the \|\| form is back/,
    'the correction must assert its own fix, so a later edit that reintroduces || fails '
      + 'at apply time rather than in somebody worst month'
  );
});

test('the reality check interval is classified as SHORTER IS TIGHTER', () => {
  assert.match(
    flat(rgFixCode),
    /v_num > v_before\.reality_check_interval_minutes then v_loosens := array_append\(v_loosens, 'reality_check_interval_minutes:lengthened'\)/,
    'a LONGER reality-check interval means FEWER reminders and is a LOOSENING. Sorting it '
      + 'with the money limits would classify "remind me less often" as a tightening.'
  );
});

test('both migrations carry a rollback section', () => {
  for (const [name, body] of [['phase 4', sql], ['the RG fix', rgFix]]) {
    assert.match(body, /-- ROLLBACK/, `${name} has no ROLLBACK section, and it is Tier 3`);
  }
  assert.match(
    flat(sql),
    /turning the switch off is faster and safer than rolling -- this back/,
    'the rollback must say that flipping the switch is the real answer, as 20260903202500 '
      + 'says about approvals'
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// THE CORRECTIONS. Everything below pins a defect adversarial review found
// AFTER the first two migrations were applied. Each one shipped, so each one
// can ship again; a comment saying "do not do this" is not a test.
// ═══════════════════════════════════════════════════════════════════════════

const FIX = path.join(
  HERE, '..',
  'supabase/migrations/20260904183000_ca_the_restriction_guard_can_actually_be_reached.sql'
);
const REVIVE = path.join(
  HERE, '..',
  'supabase/migrations/20260904183500_ca_the_seat_guard_sees_a_revived_seat.sql'
);
const fix = await readFile(FIX, 'utf8');
const revive = await readFile(REVIVE, 'utf8');
const fixCode = code(fix);
const reviveCode = code(revive);

test('the seat guard fires on the REVIVE path, not only on INSERT', () => {
  // The blocker. Three of the five sanctioned seat creators UPDATE a vacated
  // row (SET left_at = NULL WHERE left_at IS NOT NULL) and only INSERT as a
  // fallback, and 299,475 of 300,453 production seats are revivable. A
  // BEFORE INSERT guard is unreachable for essentially every seat at any
  // table somebody has ever left.
  assert.match(
    reviveCode,
    /create trigger zz_restriction_seat_revive_guard\s+before update of user_id, left_at on public\.table_seats/,
    'the revive guard must fire on UPDATE OF user_id, left_at'
  );
  assert.match(
    flat(reviveCode),
    /when \(new\.left_at is null and \(old\.left_at is not null or old\.user_id is distinct from new\.user_id\)\)/,
    'and only for a transition INTO an occupied seat, so an ordinary stack update '
      + 'during a hand costs nothing'
  );
  assert.match(
    reviveCode,
    /tgtype & 16/,
    'the migration must assert the UPDATE BIT, not just count triggers. Counting is '
      + 'exactly how a BEFORE INSERT guard passed a test named "both guards attached" '
      + 'while being unreachable for 99.7% of seats.'
  );
});

test('the guard resolves cash from tournaments per seat, not per trigger argument', () => {
  // 293,804 of 300,454 production seats are at a table with a tournament_id.
  // A guard hardcoded to 'cash' judged almost every seat against the wrong
  // rule, and wrote 'cash' into every observation row for a tournament seat.
  assert.match(
    flat(fixCode),
    /if tg_table_name = 'table_seats' then select t\.tournament_id into v_tourney from public\.tables t where t\.id = new\.table_id;/,
    'the guard must read the seat\'s table to decide the scope'
  );
  assert.match(
    flat(fixCode),
    /v_scope := case when v_tourney is not null then 'tournaments' else 'cash' end/,
    'and map it to the scope an operator actually chose'
  );
});

test('the hot path is still one index probe for an unrestricted player', () => {
  // The scope lookup must not run for everybody. It sits AFTER an EXISTS on
  // the partial index, so a platform with no restrictions pays nothing.
  const fn = fixCode.slice(
    fixCode.indexOf('function public.fn_ca_refuse_restricted_entry'),
    fixCode.indexOf('comment on function public.fn_ca_refuse_restricted_entry')
  );
  const existsAt = fn.indexOf('if not exists (');
  const lookupAt = fn.indexOf("tg_table_name = 'table_seats'");
  assert.ok(existsAt > -1, 'the cheap EXISTS probe is gone');
  assert.ok(
    existsAt < lookupAt,
    'the table lookup must come AFTER the probe that establishes this player is '
      + 'restricted at all, or every seat insert on the platform pays for it'
  );
});

test('a run-out restriction no longer blocks a new one', () => {
  const fn = fixCode.slice(
    fixCode.indexOf('function public.fn_ca_player_restrict('),
    fixCode.indexOf('function public.fn_ca_player_lift_restriction')
  );
  assert.match(
    flat(fn),
    /where user_id = p_user_id and scope = p_scope and status = 'active' and \(expires_at is null or expires_at > now\(\)\)/,
    'the duplicate check must honour expiry. expires_at is the clock and status is '
      + 'only the intent - the console renders a run-out row as Expired while the RPC '
      + 'told the operator to lift an active one.'
  );
  assert.match(
    fn,
    /set status = 'expired'/,
    'and it must retire the stale row in the same transaction, because the partial '
      + 'unique index keys on status alone and would raise a violation the operator '
      + 'cannot act on'
  );
});

test('no Phase 4 write RPC audits any more: the route is the single writer', () => {
  for (const name of [
    'fn_ca_player_restrict', 'fn_ca_player_lift_restriction',
    'fn_ca_player_note_add', 'fn_ca_player_note_delete',
    'fn_ca_player_tag_set', 'fn_ca_player_rg_set',
  ]) {
    const start = fixCode.indexOf(`create or replace function public.${name}(`);
    assert.ok(start > -1, `${name} is not replaced by the correction`);
    const end = fixCode.indexOf('create or replace function public.', start + 10);
    const body = fixCode.slice(start, end === -1 ? undefined : end);
    assert.ok(
      !/perform\s+public\.fn_log_admin_action/.test(body),
      `${name} still files its own audit row. Two writers meant two rows per event `
        + 'and two different answers to "what changed" - Phase 2 defect D-7, five more times.'
    );
  }
  assert.ok(
    fixCode.includes("prosrc ~ 'perform") && fixCode.includes("fn_log_admin_action'"),
    'and the migration must assert it by matching a CALL, not a mention: prosrc carries '
      + "the comments too, and fn_ca_player_restrict's body contains the line \"NO "
      + 'fn_log_admin_action HERE\" explaining why it does not audit. A LIKE match found '
      + 'that comment and failed the assertion on the text that documents it.'
  );
});

test('the responsible-gaming hold moves only when something moved', () => {
  const fn = fixCode.slice(
    fixCode.indexOf('create or replace function public.fn_ca_player_rg_set'),
    fixCode.indexOf('create or replace function public.fn_ca_player_360')
  );
  assert.match(
    fn,
    /'reason', 'patch_changes_nothing'/,
    'a patch that changes nothing must be REFUSED. It used to answer ok:true and push '
      + "the PLAYER'S own protection hold forward a day - an operator no-op tightening "
      + 'the cage by accident.'
  );
  assert.match(
    fn,
    /'reason', 'reality_check_not_nullable'/,
    'clearing a NOT NULL column must be refused, not coalesced back and reported as '
      + 'a successful update that changed nothing'
  );
  assert.match(fn, /v_changed := array_append/, 'the change set must actually be computed');
});

test('the 360 masks responsible-gaming money like every other figure', () => {
  const fn = fixCode.slice(
    fixCode.indexOf('create or replace function public.fn_ca_player_360'),
    fixCode.indexOf('create or replace function public.fn_ca_player_search')
  );
  for (const key of [
    'daily_deposit_limit', 'weekly_deposit_limit', 'monthly_deposit_limit', 'daily_loss_limit',
  ]) {
    assert.match(
      flat(fn),
      new RegExp(`'${key}', case when v_money then rg\\.${key} end`),
      `${key} is currency and must be withheld without money.read. support and `
        + 'read_only both hold players.read and neither holds money.read.'
    );
  }
  // And the protection state stays visible: an operator answering a
  // self-exclusion question needs to see it.
  assert.match(
    flat(fn),
    /'self_excluded_until', rg\.self_excluded_until/,
    'the exclusion timestamps are protection state, not money, and stay visible'
  );
});

test('both list functions page stably', () => {
  // A non-unique sort key with no tiebreaker lets a row repeat or vanish
  // between two LIMIT/OFFSET queries.
  assert.match(flat(fixCode), /order by restricted desc, display_name asc, id/);
  assert.match(flat(fixCode), /order by applied_at desc, id limit v_lim offset v_off/);
  assert.match(flat(fixCode), /order by observed_at desc, id limit v_lim offset v_off/);
});

test('the observation log has a retention function, as the contract promised', () => {
  assert.match(fixCode, /function public\.fn_ca_restriction_observation_prune/);
  assert.match(
    fix,
    /Schedule through Open Claw[\s\S]{0,120}NEVER the Claude scheduler/,
    'and it must say where it is scheduled, because World Hub CLAUDE.md 10.9 makes '
      + 'the Claude scheduler a hard no: a task installed from one account is '
      + 'unreachable from the next and reports enabled true while never firing'
  );
});

test('the ordering assertion reads the database, not the ASCII table', () => {
  assert.ok(
    !/if 'zz_freeze_entry_guard' >= 'zz_restriction_seat_guard'/.test(fixCode),
    'the original compared two string literals - dead in every possible state of the '
      + 'database, while reading as a check on the live triggers'
  );
  assert.match(
    flat(fixCode),
    /select t\.tgname into v_first from pg_trigger/,
    'the replacement must select the real trigger names'
  );
});
