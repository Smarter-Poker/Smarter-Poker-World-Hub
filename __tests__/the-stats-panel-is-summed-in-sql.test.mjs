/**
 * PHASE 7 (World Hub): THE WALLET'S STATS PANEL IS SUMMED IN SQL.
 *
 * Until 2026-09-29 one panel reported one ledger two different ways. The
 * headline Total Earned / Total Spent had come from `fn_diamond_lifetime_totals`
 * since 2026-09-13 - the whole ledger, summed in Postgres. The bars, the donut
 * and the gift plates DIRECTLY BENEATH IT were `Object.entries` over
 * `lifetime.bySource` and `lifetime.giftsSent`, which the API had reduced over
 * its 5,000 most recent rows. Exact above, windowed below, in the same box.
 * Nothing was wrong on any wallet small enough to fit, which is exactly why it
 * would have been found by a player rather than by us.
 *
 * `fn_diamond_flow_by_kind(p_user_id uuid)` already summed the whole ledger per
 * bucket and Club Arena already read it; the World Hub referenced it nowhere.
 * These cases pin the three things that matter:
 *
 *   1. the breakdown is read from that RPC, over the whole ledger, with the
 *      user id passed EXPLICITLY (the route holds a service-role client, so
 *      `auth.uid()` is NULL and the default argument raises) and taken from
 *      the verified JWT, never `req.query.userId`;
 *   2. the client reduce is GONE, not kept beside its replacement;
 *   3. an unreadable read is its own outcome - not a zero, and not a quiet
 *      fallback to a sum over the page (10.86).
 *
 * The arithmetic that is still browser-side is asserted to be honest about
 * itself rather than assumed correct: the week figures carry a PROOF that the
 * window covered the week, and the two sections with no SQL behind them say so
 * on screen when the window fell short.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const API = read('../pages/api/store/diamond-transactions.js');
const MODAL = read('../src/components/store/DiamondWalletModal.jsx');

/**
 * Both files EXPLAIN the shortcuts they no longer take, by name, so a
 * "this string must not appear" assertion run over the raw source fails on
 * the prose that documents the fix. These rules are about CODE. Block
 * comments and whole-line `//` comments come out first; a `//` mid-line is
 * left alone so `https://` inside a string cannot swallow real code.
 */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const API_CODE = code(API);
const MODAL_CODE = code(MODAL);

test('the route reads the whole-ledger breakdown from fn_diamond_flow_by_kind', () => {
  assert.match(API, /rpc\('fn_diamond_flow_by_kind', \{ p_user_id: userId \}\)/);
  // First page only, like the other lifetime reads: a Load More must not
  // re-pay for a figure that cannot change as you page.
  assert.match(
    API,
    /const flowPromise =\s*\n\s*offset === 0\s*\n\s*\? getSupabase\(\)\.rpc\('fn_diamond_flow_by_kind'/
  );
  // And it reaches the client.
  assert.match(API, /\n\s{8}flow,\n/);
});

test('the user id is the verified JWT subject, never req.query.userId (rule 5, IDOR)', () => {
  // `userId` is only ever assigned from the auth helper's user.
  assert.match(
    API,
    /const \{ user: localUser \} = await getServerUserWithFallback\(req, getSupabase\(\)\)/
  );
  assert.match(API, /const userId = localUser\.id;/);
  assert.equal((API.match(/const userId\s*=/g) || []).length, 1, 'userId has exactly one origin');
  // The route never reads an identity out of the query string.
  assert.doesNotMatch(API_CODE, /req\.query\.userId/);
  assert.doesNotMatch(API_CODE, /req\.query\.user_id/);
  // The argument is passed explicitly and is never allowed to default: the
  // service-role client has no auth.uid(), so an omitted argument raises
  // `authentication_required` rather than quietly returning nothing.
  assert.doesNotMatch(API_CODE, /rpc\('fn_diamond_flow_by_kind'\)/);
});

test('an unreadable breakdown is null, never a zero and never a partial sum (10.86)', () => {
  assert.match(API, /let flow = null;/);
  // Every figure is validated before it is believed, the way the Club Arena
  // consumer validates it. A malformed answer throws rather than half-parsing.
  assert.match(API, /throw new Error\('fn_diamond_flow_by_kind returned nothing'\)/);
  assert.match(API, /throw new Error\('fn_diamond_flow_by_kind returned a non-numeric figure'\)/);
  assert.match(API, /throw new Error\('fn_diamond_flow_by_kind returned no bucket list'\)/);
  assert.match(API, /throw new Error\('fn_diamond_flow_by_kind returned an unnamed bucket'\)/);
  // The failure path warns and leaves `flow` null. It does not substitute {}.
  const guard = API.slice(API.indexOf('let flow = null;'), API.indexOf('return res.status(200)'));
  assert.match(guard, /catch \(flowErr\) \{/);
  assert.doesNotMatch(guard, /flow = \{\s*\}/);
  assert.doesNotMatch(guard, /flow = \[\]/);
  // The error is checked BEFORE the body is read, so an unreadable answer is
  // never coerced into an empty one.
  assert.ok(
    guard.indexOf('if (flowErr) throw flowErr;') < guard.indexOf('Array.isArray(flowRow)'),
    'the error must be checked before the body is destructured'
  );
});

test('the client reduce is deleted, not left beside its replacement', () => {
  // The server no longer accumulates any of the four figures the RPC returns.
  assert.doesNotMatch(API_CODE, /const bySource = \{\}/);
  assert.doesNotMatch(API_CODE, /bySource\[kind\]/);
  assert.doesNotMatch(API_CODE, /giftsSent \+= /);
  assert.doesNotMatch(API_CODE, /giftsReceived \+= /);
  assert.doesNotMatch(API_CODE, /giftCount \+= 1/);
  // And it no longer ships them, so nothing can read the stale shape.
  assert.doesNotMatch(API_CODE, /\n\s+bySource,\n/);
  // The browser no longer reduces them either.
  assert.doesNotMatch(MODAL_CODE, /lifetime\.bySource/);
  assert.doesNotMatch(MODAL_CODE, /lifetime\.giftsSent/);
  assert.doesNotMatch(MODAL_CODE, /lifetime\.giftsReceived/);
  assert.doesNotMatch(MODAL_CODE, /lifetime\.giftCount/);
});

test('the panel and the donut are built from the server breakdown', () => {
  assert.match(MODAL, /const \[flow, setFlow\] = useState\(null\);/);
  assert.match(MODAL, /if \(offset === 0\) setFlow\(data\.flow \?\? null\);/);
  // Sources come from the RPC's own buckets, earned and spent merged.
  assert.match(MODAL, /for \(const line of \[\.\.\.flow\.earned, \.\.\.flow\.spent\]\)/);
  assert.match(
    MODAL,
    /sourceMap\[line\.label\] = \(sourceMap\[line\.label\] \|\| 0\) \+ line\.lifetime;/
  );
  // Gifts come from the RPC's own gift buckets.
  assert.match(MODAL, /giftLine\(flow\.spent, 'gifts_sent'\)/);
  assert.match(MODAL, /giftLine\(flow\.earned, 'gifts_received'\)/);
  // The donut is derived from the SAME list as the bars, so the two pictures
  // of one ledger cannot disagree.
  assert.match(MODAL, /const donutData = topSources\s*\n?\s*\? topSources\.map/);
  // The memo recomputes when the breakdown arrives.
  assert.match(MODAL, /\}, \[lifetime, flow\]\);/);
});

test('"could not tell" is a distinct rendered state, not an empty chart', () => {
  // null (unreadable) and [] (an empty ledger) are different values, and only
  // the first one produces a message.
  assert.match(MODAL, /const topSources = flow\s*\n?\s*\? Object\.entries\(sourceMap\)/);
  assert.match(MODAL, /:\s*null;/);
  assert.match(MODAL, /stats\.topSources === null \? \(/);
  assert.match(MODAL, /Breakdown Unavailable Right Now\. Pull Down To Refresh\./);
  // A null breakdown must not be rendered as 0 anywhere on the panel.
  assert.doesNotMatch(MODAL_CODE, /stats\.topSources \|\| \[\]/);
  assert.doesNotMatch(MODAL_CODE, /flow\?\.earnedTotal \|\| 0/);
  // The gift plates only appear when the figures were actually read: null is
  // not greater than 0, so the panel stays away rather than reporting zero
  // gifts to somebody who has sent hundreds.
  assert.match(MODAL, /stats && \(stats\.giftsSent > 0 \|\| stats\.giftsReceived > 0\)/);
});

test('"This Week" carries a proof that the window covered the week', () => {
  // The RPC reports lifetime and last 30 days, never 7 - so the week stays a
  // window sum, and the window is PROVED to reach past the week boundary
  // rather than assumed to.
  assert.match(
    API,
    /const weekExact =\s*\n?\s*allRows\.length < 5000 \|\| \(Number\.isFinite\(oldestAt\) && oldestAt < weekAgo\);/
  );
  assert.match(API, /\n\s+weekExact,\n/);
  // When it cannot be proved, the plate says so instead of implying an exact
  // figure.
  assert.match(MODAL, /weekExact: lifetime\.weekExact !== false,/);
  assert.match(MODAL, /\{!stats\.weekExact && ' Or More'\}/);
});

test('the two sections with no SQL behind them admit it when the window fell short', () => {
  // Recipient names are scraped out of the description and calendar months
  // are not the RPC's rolling 30 days, so neither can read `flow`. Both say
  // where their number came from when the window did not cover the ledger.
  assert.match(MODAL, /windowed: lifetime\.truncated === true,/);
  const notes = MODAL.match(/From Your 5,000 Most Recent Entries, Not Your Whole History\./g);
  assert.equal(notes?.length, 2, 'both windowed sections carry the note');
  assert.match(MODAL, /\{stats\.windowed && \(/);
  // The recipient list is still the one thing reduced over the window server
  // side, and it is the ONLY thing left in that loop.
  assert.match(API, /const recipients = \{\};/);
});

test('horses are players: nothing on this path filters them out (10.5)', () => {
  assert.doesNotMatch(API_CODE, /is_horse/);
  assert.doesNotMatch(MODAL_CODE, /is_horse/);
  // And no include/exclude flag is passed to the breakdown read.
  assert.doesNotMatch(API_CODE, /p_include_horses/);
});

test('house rules hold on both changed files', () => {
  for (const [name, src] of [
    ['route', API_CODE],
    ['modal', MODAL_CODE],
  ]) {
    // Rule 1: no .single()
    assert.doesNotMatch(src, /[^e]\.single\(\)/, `${name} uses .single()`);
    // Rule 7: no emoji.
    assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}]/u, `${name} carries an emoji`);
  }
  // Rule 4: the route uses the shared server client, never a raw SDK import.
  assert.match(API, /from '\.\.\/\.\.\/\.\.\/src\/lib\/supabaseServerClient'/);
  assert.doesNotMatch(API_CODE, /from '@supabase\/supabase-js'/);
  // Numbers are printed for humans.
  assert.match(MODAL, /\{stats\.giftCount\.toLocaleString\(\)\}/);
});
