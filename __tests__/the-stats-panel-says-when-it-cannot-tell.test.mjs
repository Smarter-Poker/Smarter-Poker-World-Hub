/**
 * THE STATS PANEL SAYS WHEN IT CANNOT TELL, AND THE SMOKE HAS AN INVOCATION.
 * =========================================================================
 * Two defects from the 2026-09-30 deep dive of the World Hub diamond wallet.
 *
 * 1. AN ETERNAL LOADING SKELETON. The Stats panel had exactly two states.
 *    `showStats && stats` drew the figures; `showStats && !stats` drew an
 *    animated skeleton with `aria-busy="true"` and NO loading gate behind it
 *    and no terminal state after it. `stats` is null whenever `lifetime` is
 *    null, and `/api/store/diamond-transactions` answered HTTP 200 with a
 *    bare `lifetime: null` whenever its 5,000-row window select threw - a
 *    `catch (statsErr)` that only `console.warn`s. So the client set no
 *    error, the ledger rendered normally, and a player who opened Stats
 *    watched that skeleton for ever, told nothing.
 *
 *    That is 10.86 rule 1 exactly: "'I could not tell' is a distinct outcome
 *    and must have its own name. Never fold it into pending, green, empty,
 *    zero or silence." UNKNOWN was folded into PENDING. Phase 7 had already
 *    built this refusal ONE LEVEL DOWN - a null `topSources` renders
 *    "Breakdown Unavailable Right Now. Pull Down To Refresh." - and had not
 *    built it for `lifetime`.
 *
 *    Fixed at both ends. The route names the outcome (`lifetimeStatus`:
 *    'ok' / 'unavailable' / 'paged') instead of leaving one null value to
 *    mean two things, and still answers 200 with the rows, because a failed
 *    stats read must not cost the player the ledger. The client holds three
 *    states and the skeleton is gated on the pending one.
 *
 * 2. A CHECK WITH NO INVOCATION, AND A RECORD THAT SAID OTHERWISE.
 *    `scripts/ci/diamond-wallet-live-smoke.mjs` was in no workflow, no npm
 *    script and no import, and the phase 8 audit note called it a reader
 *    (10.83). Running on demand is the right design and stays - no cron, no
 *    vercel.json entry, no pages/api/cron handler, no GitHub `schedule:`,
 *    no Claude scheduled task (World Hub CLAUDE.md 10.9 / 11.3, Club Arena
 *    10.85). What it lacked was a way to be found and an honest record.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const API = read('../pages/api/store/diamond-transactions.js');
const MODAL = read('../src/components/store/DiamondWalletModal.jsx');
const SMOKE = read('../scripts/ci/diamond-wallet-live-smoke.mjs');
const AUDIT = read('../.agent/audits/2026-09-29-phase-8-the-route-and-the-client-agree.md');
const PKG_RAW = read('../package.json');
const PKG = JSON.parse(PKG_RAW);

/* Both files EXPLAIN the shortcut they no longer take, by name, so a
   "this must not appear" assertion over raw source would fail on the prose
   that documents the fix. These rules are about CODE. Block comments and
   whole-line `//` comments come out; a mid-line `//` is left alone so a
   `https://` inside a string cannot swallow real code. */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const API_CODE = code(API);
const MODAL_CODE = code(MODAL);

/* Every JSX branch that decides whether a Stats panel is drawn. The anchor is
   asserted present before anything is asserted about what it found (10.86
   rule 1): a regex that matches nothing must never report an empty set and
   pass as "no ungated branches". */
function statsPanelBranches() {
  const found = MODAL_CODE.match(/\{showStats && [^\n]*$/gm) || [];
  assert.ok(
    found.length >= 3,
    `expected at least three showStats branches (loading, unreadable, good); found ${found.length}. ` +
      'If the panel was restructured, re-anchor this extractor rather than letting it match nothing.'
  );
  return found;
}

// -- DEFECT 1: THE ROUTE ---------------------------------------------------

test('the route distinguishes a failed stats read from a page that never asked', () => {
  // The outcome is named, and its default on a first page is the honest one:
  // a first page that reaches the response without computing the figures
  // could not tell, and says so rather than looking like a Load More.
  assert.match(
    API,
    /let lifetimeStatus = offset === 0 \? 'unavailable' : 'paged';/,
    'the route must initialise lifetimeStatus to the could-not-tell value on a first page'
  );
  // 'ok' is only ever reached after the figures were actually built.
  const okAt = API.indexOf("lifetimeStatus = 'ok';");
  const builtAt = API.indexOf('lifetime = {');
  assert.ok(builtAt !== -1, 'the lifetime figures must still be built here');
  assert.ok(okAt > builtAt, "'ok' is set only after `lifetime` is built");
  // Exactly one assignment can claim success, so no later branch can quietly
  // upgrade a failed read.
  assert.equal(
    (API_CODE.match(/lifetimeStatus = 'ok'/g) || []).length,
    1,
    "exactly one place may declare the stats read 'ok'"
  );
  // And it reaches the client, in the same 200 literal as `lifetime`.
  const body = API.slice(API.indexOf('return res.status(200).json({'));
  assert.match(body, /\n\s+lifetime,\n/);
  assert.match(body, /\n\s+lifetimeStatus,\n/);
});

test('a failed stats read still returns the transactions, under a 200', () => {
  // The rows are what the player came for. The stats failure is caught and
  // warned, never turned into a 500 that blanks the ledger.
  const start = API.indexOf('let lifetime = null;');
  const end = API.indexOf('let summary = null;');
  assert.ok(start !== -1 && end > start, 'the stats block must still be locatable');
  const guard = API.slice(start, end);
  assert.match(guard, /catch \(statsErr\) \{/);
  assert.doesNotMatch(
    guard,
    /res\.status\(5\d\d\)/,
    'a failed stats read must not fail the whole request'
  );
  assert.doesNotMatch(guard, /return res\./, 'the stats block never short-circuits the response');
  // And an unreadable total is never reported as the number 0.
  assert.doesNotMatch(guard, /lifetime = 0/);
  assert.doesNotMatch(guard, /lifetime = \{\s*\}/);
});

// -- DEFECT 1: THE CLIENT --------------------------------------------------

test('the skeleton is gated on a loading state, not merely on !stats', () => {
  // THE PIN. This fails if `!stats` renders a skeleton with no loading gate.
  const skeletonAt = MODAL_CODE.indexOf('statsSkeletonPlate');
  assert.ok(skeletonAt > 0, 'the stats skeleton must still exist to be gated');
  const opener = MODAL_CODE.lastIndexOf('{showStats &&', skeletonAt);
  assert.ok(opener > 0, 'the skeleton must sit inside a showStats branch');
  const condition = MODAL_CODE.slice(opener, skeletonAt);
  assert.match(
    condition,
    /statsRead === 'pending'/,
    'the stats skeleton must be gated on the pending read state. `showStats && !stats` alone is ' +
      'the eternal-skeleton defect of 2026-09-30'
  );
  // No branch anywhere may draw a panel on `!stats` and nothing else.
  for (const branch of statsPanelBranches()) {
    if (!branch.includes('!stats')) continue;
    assert.match(branch, /statsRead/, `an ungated !stats branch is back: ${branch.trim()}`);
  }
});

test('the panel has three states, and the third is terminal', () => {
  assert.match(MODAL, /const \[statsRead, setStatsRead\] = useState\('pending'\);/);
  // Loading, settled-unreadable, settled-good.
  assert.match(MODAL, /\{showStats && !stats && statsRead === 'pending' && \(/);
  assert.match(MODAL, /\{showStats && !stats && statsRead !== 'pending' && \(/);
  assert.match(MODAL, /\{showStats && stats && \(/);
  // The terminal one is not busy, and speaks in the voice phase 7 established
  // one level down for the breakdown.
  assert.match(MODAL, /Stats Unavailable Right Now\. Pull Down To Refresh\./);
  assert.match(MODAL, /Breakdown Unavailable Right Now\. Pull Down To Refresh\./);
  assert.match(MODAL, /aria-busy="false"/);
  // And it never invents a figure to fill the gap.
  assert.doesNotMatch(MODAL_CODE, /lifetime \|\| \{\s*\}/);
  assert.doesNotMatch(MODAL_CODE, /stats\?\.totalEarned \|\| 0/);
  assert.doesNotMatch(MODAL_CODE, /data\.lifetime \|\| \{/);
});

test('the read settles on every path, so the skeleton cannot run for ever', () => {
  // The route's verdict is taken on a first page only ('paged' is not a
  // verdict about anything). A route that predates the field is handled by
  // the presence of `lifetime`, which is the only evidence there would be.
  assert.match(
    MODAL,
    /setStatsRead\(data\.lifetimeStatus === 'ok' \|\| data\.lifetime \? 'ok' : 'unavailable'\);/
  );
  // A first-page read that ends any other way - no user, no session, a thrown
  // fetch, a non-ok response - settles in the finally, which every path runs.
  assert.match(
    MODAL,
    /if \(offset === 0 && !pendingRefetchRef\.current\) \{\s*\n\s*setStatsRead\(\(prev\) => \(prev === 'pending' \? 'unavailable' : prev\)\);/
  );
  // A retry puts it back to pending, so a stale refusal is not left on screen
  // while the wallet is asking again; figures already read are kept.
  assert.match(MODAL, /setStatsRead\(\(prev\) => \(prev === 'ok' \? prev : 'pending'\)\);/);
});

// -- DEFECT 2: THE LIVE SMOKE HAS AN INVOCATION, AND THE RECORD IS HONEST --

test('the live smoke has a real, discoverable invocation', () => {
  assert.equal(
    PKG.scripts['smoke:diamond-wallet'],
    'node scripts/ci/diamond-wallet-live-smoke.mjs',
    'npm run smoke:diamond-wallet must invoke the live smoke'
  );
});

test('the invocation is a command, never a schedule', () => {
  // 10.9 / 11.3 / Club Arena 10.85: the fix for "nobody can find it" is a
  // command, not machinery. None of the forbidden registrations may appear.
  const vercel = read('../vercel.json');
  assert.doesNotMatch(vercel, /diamond-wallet/, 'the smoke must never enter the vercel.json crons');
  assert.doesNotMatch(SMOKE, /mcp__scheduled-tasks/);
  assert.doesNotMatch(code(SMOKE), /schedule:/);
  // And it is invoked from package.json rather than from a workflow trigger.
  assert.match(PKG_RAW, /"smoke:diamond-wallet"/);
});

test('the audit note records who runs it and when, and drops the claim it could not support', () => {
  // The overstated line is gone.
  assert.doesNotMatch(AUDIT, /A drift on either side has a reader \(10\.83\)\./);
  // Replaced by what is true, with the two moments named.
  assert.match(AUDIT, /npm run smoke:diamond-wallet/);
  assert.match(AUDIT, /WHO RUNS IT, AND WHEN/);
  // The prose wraps, so the two moments are matched across the line break.
  assert.match(AUDIT, /BEFORE the release/);
  assert.match(AUDIT, /AFTER the live `commitSha`\s+is verified/);
  // And the claim is stated once, not left beside the sentence it replaced.
  assert.equal(
    (AUDIT.match(/become scheduled/g) || []).length,
    1,
    'the scheduling refusal is stated once; a second copy is how two records drift'
  );
  // And the script itself carries the same account, so the two cannot drift.
  assert.match(SMOKE, /WHO RUNS IT, AND WHEN/);
  assert.match(SMOKE, /npm run smoke:diamond-wallet/);
  assert.doesNotMatch(SMOKE, /A drift on either side has a reader\./);
});

// -- HOUSE RULES -----------------------------------------------------------

test('house rules hold on both changed source files', () => {
  for (const [name, src] of [
    ['route', API_CODE],
    ['modal', MODAL_CODE],
  ]) {
    // Rule 1: no .single()
    assert.doesNotMatch(src, /[^e]\.single\(\)/, `${name} uses .single()`);
    // Rule 7: no emoji - a bare emoji breaks SWC and fails the Vercel build.
    assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}]/u, `${name} carries an emoji`);
    // Rule 5: identity is never read out of the query string.
    assert.doesNotMatch(src, /req\.query\.userId/, `${name} trusts req.query.userId`);
    // 10.5: horses are players. Nothing on this path filters them out.
    assert.doesNotMatch(src, /is_horse/, `${name} filters on is_horse`);
  }
  // Rule 4: the route uses the shared server client, never a raw SDK import.
  assert.match(API, /from '\.\.\/\.\.\/\.\.\/src\/lib\/supabaseServerClient'/);
  assert.doesNotMatch(API_CODE, /from '@supabase\/supabase-js'/);
  // No em dash in the copy a player reads.
  const copy = MODAL.match(/Stats Unavailable Right Now\.[^<]*/);
  assert.ok(copy, 'the unavailable sentence must be locatable to be checked');
  assert.doesNotMatch(copy[0], /—/, 'player-facing copy must carry no em dash');
});
