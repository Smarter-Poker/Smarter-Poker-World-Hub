/**
 * PHASE 4 LAW - a horse is restricted, searched and read exactly as a human
 * is, and nothing takes anybody's access away until Dan turns it on.
 *
 * A NOTE ON THE LAW REGISTRY, because the obvious assumption is wrong.
 * CLAUDE.md 10.8 requires every `*.law.test.*` file to have a row in
 * `docs/LAWS.md`, enforced by `tests/law-registry.law.test.ts`. Both of those
 * live in the CLUB ARENA repo. This is the World Hub, which has neither, and
 * carries four `.law.test.mjs` files with no registry behind them
 * (no-slide-to-see, overlays-leave-room-to-close, world-command-menu, and
 * this one). Checked, rather than assumed, on 2026-09-04.
 *
 * So this file is NOT registered anywhere, and saying it was would be the
 * kind of claim 10.8 exists to prevent. If a registry is ever added here,
 * this is one of the four rows it needs.
 *
 * WHY THIS PHASE NEEDS A LAW FILE OF ITS OWN
 *
 * CLAUDE.md 10.5 is a HARD LAW and its own text says how it gets broken: an
 * agent writes `is_horse` into a filter "in order to leave horses OUT of
 * something a human would get" and believes they are being sensible. It has
 * already happened once, in fn_settle_tournament_rake, and it cost 39
 * tournaments their entire rake attribution - zero VIP points, zero agent
 * commissions - which was then reported as correct behaviour.
 *
 * Phase 4 is where that mistake is most tempting, because a Player 360 with
 * 1,000 horses and 310 humans in it LOOKS cluttered, and hiding the fleet
 * "just in the search" is a five-character change that feels like tidying.
 * The whole console is downstream of that list.
 *
 * The second law here is section 0 rule 2, and it is the one that can hurt a
 * person: an operator must never be told a player has been stopped while
 * enforcement is off, and must never be told a restriction is harmless when
 * nobody could read the switch.
 *
 * IF THIS FILE GOES RED, YOUR CHANGE IS THE BUG. Do not weaken a pin. If you
 * genuinely need to narrow a view, the sanctioned way is an explicit,
 * operator-chosen filter that DEFAULTS TO INCLUDING HORSES, which is exactly
 * what `includeHorses` already is.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

import {
  RESTRICTION_SCOPES,
  SCOPE_META,
  enforcementNotice,
} from '../src/lib/horses/playerRestrictions.js';
import {
  restrictionsUrl,
  searchQuery,
  searchUrl,
} from '../src/components/horses/playerAdmin.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const at = (p) => path.join(HERE, '..', p);
const read = (p) => readFile(at(p), 'utf8');

/** Source with comments stripped: the files EXPLAIN these rules at length. */
function code(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/^\s*--.*$/gm, ' ');
}

const PHASE4_FILES = [
  'pages/api/horses/player-admin.js',
  'src/components/horses/PlayersPanel.jsx',
  'src/components/horses/playerAdmin.js',
  'src/lib/horses/playerRestrictions.js',
];
/**
 * EVERY migration that carries a live Phase 4 body, not just the first one.
 *
 * This list is the whole reason to read it twice. The law originally named
 * only 20260904150000, and then three corrections replaced the live bodies of
 * fn_ca_player_search, fn_ca_restriction_list, fn_ca_player_360,
 * fn_ca_player_restrict, fn_ca_player_rg_set and the guard itself. The law
 * kept passing - against a file that no longer described the database - and
 * one of its assertions had started arguing AGAINST the fix, insisting there
 * were exactly two trigger attachments when the corrected platform has three.
 *
 * A law that guards a superseded file is worse than no law: it is a green
 * check somebody will trust, and an assertion message that tells the next
 * agent the correct state is wrong. That is the revert-war shape CLAUDE.md
 * 10.7 and 10.8 name.
 *
 * ADD THE NEXT MIGRATION HERE. If a Phase 4 body moves again and this list
 * does not, these assertions stop meaning anything, silently.
 */
const MIGRATIONS = [
  'supabase/migrations/20260904150000_ca_player_360_and_restrictions.sql',
  'supabase/migrations/20260904160000_ca_rg_loosen_list_is_an_array.sql',
  'supabase/migrations/20260904183000_ca_the_restriction_guard_can_actually_be_reached.sql',
  'supabase/migrations/20260904183500_ca_the_seat_guard_sees_a_revived_seat.sql',
  'supabase/migrations/20260904193000_ca_creating_rg_limits_must_not_loosen_one.sql',
];
/** The first one, where the tables and the vocabulary are declared. */
const MIGRATION = MIGRATIONS[0];

// ══ HORSES ARE PLAYERS ══════════════════════════════════════════════════════

/**
 * The shapes that EXCLUDE, named one by one.
 *
 * An earlier draft of this test worked the other way round: a whitelist of
 * sanctioned shapes, and anything else was a failure. It went red on
 * `if (!isHorse) return null;` inside the badge component itself, which is
 * the single most obviously legitimate line in the phase.
 *
 * That is worth recording rather than just fixing, because a law that cries
 * wolf gets weakened by the next agent who meets it, and a weakened law is
 * how fn_settle_tournament_rake happened. So this lists what is FORBIDDEN.
 * The forbidden thing is narrow and nameable: using the flag to leave horses
 * out of a set. Rendering it, selecting it, passing it around and branching
 * on it to draw a badge are all identification, which section 10.5 sanctions
 * in as many words.
 */
const EXCLUSION_SHAPES = [
  // SQL
  { re: /\bnot\s+coalesce\(\s*\w*\.?is_horse/i, why: 'NOT coalesce(is_horse ...) excludes horses' },
  { re: /\bis_horse\s*(=|is)\s*false\b/i, why: 'is_horse = false excludes horses' },
  { re: /\bis_horse\s+is\s+not\s+true\b/i, why: 'is_horse is not true excludes horses' },
  { re: /\band\s+not\s+\w*\.?is_horse\b/i, why: 'AND NOT is_horse is the exact shape that cost 39 events their rake' },
  // Supabase client
  { re: /\.eq\(\s*'is_horse'\s*,\s*false/i, why: ".eq('is_horse', false) excludes horses" },
  { re: /\.neq\(\s*'is_horse'\s*,\s*true/i, why: ".neq('is_horse', true) excludes horses" },
  { re: /\.not\(\s*'is_horse'/i, why: ".not('is_horse' ...) excludes horses" },
  // JavaScript
  { re: /\.filter\([^)]*!\s*\w*\.?is_?[Hh]orse/i, why: 'filtering horses out of an array' },
];

test('no Phase 4 file excludes a horse from anything', async () => {
  for (const file of [...PHASE4_FILES, ...MIGRATIONS]) {
    const body = code(await read(file));
    for (const [i, line] of body.split('\n').entries()) {
      if (!/is_horse|isHorse/i.test(line)) continue;

      // The ONE place an exclusion shape is legitimate: the include-horses
      // clause itself, which is how an operator narrows a view ON PURPOSE
      // and which defaults to including everybody.
      if (/include_horses|includeHorses/.test(line)) continue;

      for (const shape of EXCLUSION_SHAPES) {
        assert.ok(
          !shape.re.test(line),
          `${file}:${i + 1} ${shape.why}\n`
            + `  ${line.trim()}\n`
            + '  CLAUDE.md 10.5: horses are NEVER excluded by design from anything a human '
            + 'gets. If you need to narrow a view, use the includeHorses filter, which '
            + 'defaults to including them.'
        );
      }
    }
  }
});

test('the only exclusion clause in the phase is the include-horses default', async () => {
  // Belt and braces on the test above: count the exclusion-shaped clauses in
  // the migration and prove every one of them sits inside a
  // `coalesce(p_include_horses, true) or ...` guard.
  const sql = code(await read(MIGRATION));
  const excluding = sql
    .split('\n')
    .filter((l) => /not\s+coalesce\(\s*\w*\.?is_horse/i.test(l));
  for (const line of excluding) {
    assert.match(
      line,
      /coalesce\(p_include_horses, true\)\s+or/,
      `an exclusion clause outside the include-horses default:\n  ${line.trim()}`
    );
  }
  assert.ok(
    excluding.length >= 2,
    'expected the include-horses clause on both the search and the restriction list'
  );
});

test('an absent include-horses parameter means EVERY player', () => {
  // Through the builder, which is the only thing that constructs these URLs.
  for (const value of [undefined, null, true, 'true', 1, 0, '']) {
    assert.equal(
      searchQuery({ includeHorses: value }).includeHorses,
      undefined,
      `includeHorses ${JSON.stringify(value)} must not narrow the list`
    );
  }
  assert.ok(!searchUrl({}).includes('includeHorses'));
  assert.ok(!restrictionsUrl({}).includes('includeHorses'));
});

test('the SQL defaults are true, not merely available', async () => {
  // Across EVERY migration, because the corrections replaced both functions
  // that carry this parameter.
  let found = 0;
  for (const file of MIGRATIONS) {
    const sql = code(await read(file));
    for (const m of sql.matchAll(/p_include_horses\s+boolean\s+default\s+(\w+)/g)) {
      found += 1;
      assert.equal(m[1], 'true', `${file}: every p_include_horses DEFAULTS TRUE`);
    }
  }
  assert.ok(found >= 4, `expected the parameter in both functions in both files, found ${found}`);
});

test('a horse can be restricted through the same path a human is', async () => {
  // The LIVE body, which 20260904183000 replaced.
  const sql = code(await read(MIGRATIONS[2]));
  const fn = sql.slice(
    sql.indexOf('function public.fn_ca_player_restrict('),
    sql.indexOf('function public.fn_ca_player_lift_restriction')
  );
  assert.ok(fn.length > 200, 'fn_ca_player_restrict is gone or was renamed');
  assert.ok(
    !/if\s+v_is_horse|not\s+v_is_horse|v_is_horse\s+then/.test(fn),
    'fn_ca_player_restrict must not branch on is_horse. It reads the flag to REPORT the '
      + 'badge back and for no other purpose.'
  );
});

test('enforcement binds a horse by construction, not by a second code path', async () => {
  // THREE attachments across the migrations that create them: the seat
  // insert, the seat REVIVE (almost every seating on this platform is an
  // UPDATE of a vacated row, which the first version of this law asserted
  // must not exist), and the tournament insert. One trigger FUNCTION for all
  // three, so there is no second code path to keep in step - including for
  // the fleet, which seats through atomic_table_buyin exactly as a browser
  // does.
  let attachments = 0;
  for (const file of MIGRATIONS) {
    const body = await read(file);
    attachments += (body.match(/execute function public\.fn_ca_refuse_restricted_entry\(/g) || []).length;
    assert.ok(
      !/if .*is_horse.*then[\s\S]{0,200}return new/i.test(code(body)),
      `${file}: the guard must not let a horse through a check a human fails, or the reverse`
    );
  }
  assert.equal(
    attachments,
    3,
    'exactly three attachments: table_seats INSERT, table_seats seat-revive UPDATE, and '
      + 'tournament_players INSERT. Fewer leaves an entry route unguarded - a BEFORE '
      + 'INSERT-only guard was unreachable for 99.7% of seats.'
  );

  // And the revive one must actually carry the UPDATE bit.
  const revive = await read(MIGRATIONS[3]);
  assert.match(
    revive,
    /before update of user_id, left_at on public\.table_seats/,
    'the revive guard must fire on the UPDATE that revives a vacated seat'
  );
});

// ══ NOTHING BITES UNTIL DAN TURNS IT ON ════════════════════════════════════

test('the enforcement switch defaults false in the schema', async () => {
  const sql = await read(MIGRATION);
  assert.match(
    sql,
    /restrictions_enforced boolean not null default false/,
    'section 0 rule 2. The guards observe until Dan flips this.'
  );
  assert.match(
    sql,
    /ASSERT FAILED: restrictions_enforced must be false on apply/,
    'and the migration refuses to finish if it is not'
  );
});

test('the operator is never told a restriction bites when it does not', async () => {
  // The route's sentence.
  const route = code(await read('pages/api/horses/player-admin.js'));
  const fn = route.slice(
    route.indexOf('function restrictionMessage'),
    route.indexOf('function scopeLabel')
  );
  assert.match(fn, /enforced === false/, 'the off case must be handled explicitly');
  assert.match(
    fn,
    /Recorded And Observed, Not Refused/,
    'and must say plainly that nothing is refused'
  );

  // The shared notice the panel renders.
  assert.equal(enforcementNotice(false).tone, 'observing');
  assert.match(enforcementNotice(false).body, /not refused/i);
});

test('an UNKNOWN switch is never reported as off', async () => {
  assert.equal(enforcementNotice(null).tone, 'unknown');
  assert.notEqual(enforcementNotice(null).tone, enforcementNotice(false).tone);

  const route = code(await read('pages/api/horses/player-admin.js'));
  const fn = route.slice(
    route.indexOf('async function enforcementState'),
    route.indexOf('function moneyVisible')
  );
  assert.match(
    fn,
    /return null;/,
    'a failed policy read must answer null. Telling an operator their restriction will '
      + 'not bite when nobody knows is the same lie in the other direction.'
  );
  assert.ok(
    !/return false;/.test(fn),
    'enforcementState must never answer false on a failure path'
  );
});

test('a scope with no guard is labelled as recorded only', () => {
  const guarded = ['account', 'cash', 'tournaments'];
  for (const scope of RESTRICTION_SCOPES) {
    const meta = SCOPE_META[scope];
    assert.equal(
      meta.enforced,
      guarded.includes(scope),
      `${scope}: SCOPE_META.enforced must match whether a guard actually watches it`
    );
    if (!meta.enforced) {
      assert.match(
        meta.blurb,
        /Recorded Only/,
        `${scope} has no guard, so its description must say the decision is recorded and `
          + 'stops nothing'
      );
    }
  }
});

// ══ NOTHING IRREVERSIBLE ═══════════════════════════════════════════════════

test('nothing in this phase deletes a player, a note or a restriction', async () => {
  for (const file of MIGRATIONS) {
    const sql = code(await read(file));
    const body = sql.slice(0, sql.indexOf('ROLLBACK') === -1 ? undefined : sql.indexOf('ROLLBACK'));
    assert.ok(
      !/delete from public\.ca_player_restrictions/.test(body),
      `${file}: a lift marks lifted. The record of a decision is part of the decision.`
    );
    assert.ok(
      !/delete from public\.ca_operator_player_notes/.test(body),
      `${file}: a note delete is soft and keeps its author and its text`
    );
    assert.ok(
      !/delete from public\.profiles|drop table public\.profiles/.test(body),
      `${file}: this phase deletes no account. P11 is deferred for exactly this reason.`
    );
  }
  const sql = code(await read(MIGRATION));
  const body = sql.slice(0, sql.indexOf('ROLLBACK') === -1 ? undefined : sql.indexOf('ROLLBACK'));

  const route = code(await read('pages/api/horses/player-admin.js'));
  assert.ok(!/\.delete\(\)/.test(route), 'the route deletes nothing either');
});

test('this phase never writes profiles.status', async () => {
  for (const file of [...MIGRATIONS, 'pages/api/horses/player-admin.js']) {
    const body = code(await read(file));
    assert.ok(
      !/update public\.profiles|from\('profiles'\)[\s\S]{0,120}\.update\(/.test(body),
      `${file}: profiles.status is decorative - all 1,310 production rows say active and `
        + 'no money, seat, tournament or auth path reads it. Writing it would create a '
        + "second opinion about a player's standing that nothing enforces."
    );
  }
});

test('operator notes never land in the players own notes table', async () => {
  for (const file of [...MIGRATIONS, ...PHASE4_FILES]) {
    const body = code(await read(file));
    assert.ok(
      !/from\('player_notes'\)|into public\.player_notes|update public\.player_notes/.test(body),
      `${file}: public.player_notes belongs to the PLAYERS. It is where one player records `
        + "another opponent's tells, tendencies, real name and photo. An operator note "
        + "written there would appear inside a player's own notebook."
    );
  }
});

// ══ THE SUPPORT DESK MAY NOT SANCTION ══════════════════════════════════════

test('restricting needs moderation.write, which support does not hold', async () => {
  const route = code(await read('pages/api/horses/player-admin.js'));
  for (const action of ['restrict', 'lift', 'rg_set']) {
    assert.match(
      route,
      new RegExp(`${action}: PERMISSIONS\\.MODERATION_WRITE`),
      `${action} must need moderation.write. The support role holds players.write - a help `
        + 'desk has to be able to leave a note - and must not be able to take a player'
        + "'s access away."
    );
  }
  const { ROLE_PERMISSIONS } = await import('../src/lib/horses/permissions.js');
  assert.ok(
    !ROLE_PERMISSIONS.support.includes('moderation.write'),
    'the support role must not hold moderation.write, or the gate above is decorative'
  );
  assert.ok(
    ROLE_PERMISSIONS.support.includes('players.write'),
    'and it must still hold players.write, or a help desk cannot annotate a player'
  );
});

test('an operator cannot bypass a players own protection', async () => {
  // THE LIVE BODY, which is 20260904193000. The law used to read
  // 20260904160000, whose fn_ca_player_rg_set was wholly replaced twice
  // since - so deleting the hold from the live function would have left this
  // assertion green.
  const sql = code(await read(MIGRATIONS[4]));
  assert.match(
    sql,
    /'ok', false,\s*'reason', 'loosening_is_held'/,
    'a loosening patch inside the hold must be refused'
  );
  assert.match(
    sql,
    /now\(\) < v_before\.limit_increase_available_at/,
    'and the hold is the same limit_increase_available_at the player is subject to'
  );

  const route = code(await read('pages/api/horses/player-admin.js'));
  assert.ok(
    !/force|override|bypass/i.test(route.slice(
      route.indexOf('async function actionRgSet'),
      route.indexOf('async function actionTicketAssign')
    )),
    'there must be no force flag on the responsible-gaming path. A force flag is the '
      + 'bypass with an extra click in front of it.'
  );
});
