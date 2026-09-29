/**
 * Phase 5 client contract. Pure request builders and presentation decisions
 * are executed directly; the React panel is read for wiring that has no DOM
 * dependency in the repository test harness.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

import {
  CASE_DECISIONS,
  CASE_ITEM_TYPES,
  INTEGRITY_ADMIN,
  INTEGRITY_SECTIONS,
  QUEUE_TIERS,
  addItemBody,
  assignBody,
  caseUrl,
  decideBody,
  flagsUrl,
  handsUrl,
  healthUrl,
  listMeta,
  openCaseBody,
  pairsUrl,
  pendingSanctionsOf,
  queueMeta,
  queueUrl,
  rowsOf,
  sanctionBody,
  timingRowsOf,
  timingUrl,
  handSearchCoverage,
} from '../src/components/horses/integrityAdmin.js';
import {
  DETECTOR_STATES,
  QUEUE_STATES,
  classifyDetectorHealth,
  integrityEmptyState,
  patternLabel,
  tierLabel,
} from '../src/components/horses/integrityModel.js';
import { TABS, findTab, visibleTabs } from '../src/components/horses/tabRegistry.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const component = (name) => path.join(HERE, '..', 'src/components/horses', name);
const panel = await readFile(component('IntegrityPanel.jsx'), 'utf8');
const integritySource = await readFile(component('integrityAdmin.js'), 'utf8');
const operatorFetchSource = await readFile(component('useOperatorFetch.js'), 'utf8');
const pagedListSource = await readFile(component('usePagedList.js'), 'utf8');

/**
 * useOperatorFetch.js imports React and ../../lib/authUtils, and authUtils is
 * written for the bundler's extensionless resolution, so plain node cannot
 * import the module as it stands. Everything the deadline needs is globals, so
 * the module is evaluated with its import statements removed. This is what lets
 * the deadline itself be executed rather than only pattern matched, and a regex
 * cannot prove that a stalled body is bounded.
 */
const bounded = await import(
  `data:text/javascript;base64,${
    Buffer.from(operatorFetchSource.replace(/^import[^;]*;$/gm, '')).toString('base64')
  }`
);

/** A request that resolves only when its signal is aborted. */
const hangUntilAborted = (signal) => new Promise((_resolve, reject) => {
  signal.addEventListener('abort', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    reject(err);
  });
});
const settle = (promise) => promise.then(() => null, (err) => err);

test('the Integrity tab is visible, code split, and read-gated', () => {
  const tab = findTab('integrity');
  assert.ok(tab);
  assert.equal(tab.label, 'Integrity');
  assert.equal(tab.permission, 'players.read');
  assert.equal(typeof tab.load, 'function');
  assert.notEqual(tab.legacy, true);
  assert.ok(visibleTabs(TABS).some((entry) => entry.id === 'integrity'));
});

test('every client URL names one of the seven route sections', () => {
  const urls = [
    queueUrl({}),
    caseUrl('case-1'),
    pairsUrl({}),
    flagsUrl({}),
    timingUrl({}),
    handsUrl({ playerId: 'player-1' }),
    healthUrl(),
  ];
  assert.equal(INTEGRITY_SECTIONS.length, 7);
  for (const url of urls) {
    assert.ok(url.startsWith(INTEGRITY_ADMIN));
    const section = new URL(url, 'https://x').searchParams.get('section');
    assert.ok(INTEGRITY_SECTIONS.includes(section), `${url} names an unknown section`);
  }
});

test('queue filters keep server ranking and cursor pagination explicit', () => {
  const url = new URL(queueUrl({
    tier: 'chip_dump', pattern: 'CHIP_DUMP', cursor: 'next-pair', limit: 25,
  }), 'https://x');
  assert.equal(url.searchParams.get('tier'), 'chip_dump');
  assert.equal(url.searchParams.get('pattern'), 'CHIP_DUMP');
  assert.equal(url.searchParams.get('cursor'), 'next-pair');
  assert.equal(url.searchParams.get('limit'), '25');
  assert.equal(url.searchParams.has('offset'), false, 'the ranked queue is cursor paged');
  assert.equal(tierLabel('seven_day_money_flow'), 'Seven-Day Money Flow');
  assert.deepEqual(QUEUE_TIERS, [
    'active_case', 'multiple_signals', 'seven_day_money_flow',
    'chip_dump', 'other_non_timing', 'timing_only',
  ]);
});

test('no Integrity URL has a horse exclusion parameter', () => {
  for (const url of [queueUrl({}), pairsUrl({}), flagsUrl({}), timingUrl({}), handsUrl({ playerId: 'p' })]) {
    assert.ok(!/include.?horses|exclude.?horses|is_horse/i.test(url), url);
  }
  assert.ok(!/includeHorses|Exclude Horses|Hide Horses/.test(panel));
  assert.match(panel, /player_a_is_horse/,
    'horse identity belongs beside a result as disclosure');
});

test('every mutation carries an operation ID and the route action name', () => {
  const bodies = [
    openCaseBody({ subjectIds: ['a', 'b'], kind: 'collusion', opId: 'open-1' }),
    addItemBody({ caseId: 'c', itemType: 'hand', itemRef: 'h', opId: 'item-1' }),
    assignBody({ caseId: 'c', assignedTo: 'o', opId: 'assign-1' }),
    decideBody({ caseId: 'c', decision: 'no_action', decisionNote: 'Reviewed', opId: 'decide-1' }),
    sanctionBody({ caseId: 'c', subjectId: 'a', kind: 'warning', note: 'Reviewed', opId: 'sanction-1' }),
  ];
  assert.deepEqual(bodies.map((body) => body.action), [
    'open_case', 'add_item', 'assign', 'decide', 'sanction',
  ]);
  assert.deepEqual(bodies.map((body) => body.opId), [
    'open-1', 'item-1', 'assign-1', 'decide-1', 'sanction-1',
  ]);
  assert.equal(bodies[3].decisionNote, 'Reviewed');
  assert.equal('note' in bodies[3], false, 'the route field is decisionNote');
});

test('sanction bodies carry the kind-specific field and preserve approval keys', () => {
  const restriction = sanctionBody({
    caseId: 'c', subjectId: 'a', kind: 'restriction', restrictionId: 'r-1', opId: 'same-key',
  });
  assert.equal(restriction.restrictionId, 'r-1');
  assert.equal(restriction.opId, 'same-key');
  assert.equal('amount' in restriction, false);

  const confiscation = sanctionBody({
    caseId: 'c', subjectId: 'a', kind: 'confiscation', amount: '125', opId: 'money-key',
  });
  assert.equal(confiscation.amount, 125);
  assert.equal('restrictionId' in confiscation, false);
});

test('builders constrain case decision and evidence vocabularies', () => {
  assert.ok(CASE_DECISIONS.includes('confiscated'));
  assert.ok(CASE_ITEM_TYPES.includes('collusion_row'));
  assert.equal(openCaseBody({ subjectIds: [' a ', 'a', 'b'], kind: 'unknown', opId: 'x' }).kind, 'other');
  assert.deepEqual(openCaseBody({ subjectIds: [' a ', 'a', 'b'], opId: 'x' }).subjectIds, ['a', 'b']);
  assert.equal(addItemBody({ caseId: 'c', itemType: 'unknown', opId: 'x' }).itemType, 'note');
});

test('queue metadata keeps its explicit state and ranking totals', () => {
  const meta = queueMeta({
    queue_state: 'nothing_to_review',
    tier_totals: { chip_dump: 4, timing_only: 90 },
    filtered_total: 0,
    next_cursor: 'next',
  });
  assert.equal(meta.state, 'nothing_to_review');
  assert.equal(meta.tierTotals.chip_dump, 4);
  assert.equal(meta.filteredTotal, 0);
  assert.equal(meta.nextCursor, 'next');
  assert.equal(queueMeta({ rows: [] }).state, null,
    'an empty array must not silently manufacture a clean state');
});

test('response helpers preserve metadata and pending sanction operation IDs', () => {
  assert.deepEqual(rowsOf({ data: { groups: [{ id: 1 }] } }, 'groups'), [{ id: 1 }]);
  assert.equal(listMeta({ data: { total: 9, hasMore: true } }).total, 9);
  const pending = pendingSanctionsOf({
    case: { sanctions: [{ status: 'approved', op_id: 'keep-me' }, { status: 'applied' }] },
  });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].op_id, 'keep-me');
});

test('timing distribution objects become one row per participant composition', () => {
  assert.deepEqual(timingRowsOf({
    distribution: {
      horse_horse: { adjacent_pairs: 12, median_ms: 400 },
      human_human: { adjacent_pairs: 3, median_ms: 900 },
    },
  }), [
    { composition: 'horse_horse', adjacent_pairs: 12, median_ms: 400 },
    { composition: 'human_human', adjacent_pairs: 3, median_ms: 900 },
  ]);
  assert.deepEqual(timingRowsOf({ histogram: {} }), []);
  assert.deepEqual(timingRowsOf({ rows: [{ bucket: 'wrong-shape' }] }), []);
});

test('a recorded gap outranks a live detector status', () => {
  const model = classifyDetectorHealth({
    status: 'live', stale: true, has_unscanned_gap: true, last_success_at: '2026-09-06T09:00:00Z',
  });
  assert.equal(model.state, DETECTOR_STATES.GAP);
  assert.equal(model.tone, 'danger');
  assert.equal(model.loud, true);
});

test('stale, behind, live, never and unknown remain separate health answers', () => {
  assert.equal(classifyDetectorHealth({ status: 'live', stale: true }).state, DETECTOR_STATES.STALE);
  assert.equal(classifyDetectorHealth({ status: 'behind', catching_up: true }).state, DETECTOR_STATES.BEHIND);
  assert.equal(classifyDetectorHealth({ status: 'live', stale: false }).state, DETECTOR_STATES.LIVE);
  assert.equal(classifyDetectorHealth({ status: 'never_run' }).state, DETECTOR_STATES.NEVER);
  assert.equal(classifyDetectorHealth(null).state, DETECTOR_STATES.UNKNOWN);
  assert.equal(classifyDetectorHealth(null, { loading: true }).state, DETECTOR_STATES.LOADING);
});

test('the queue has three honest empty answers', () => {
  const clean = integrityEmptyState({ state: 'nothing_to_review', rowCount: 0 });
  const unproduced = integrityEmptyState({ state: 'nothing_produced', rowCount: 0 });
  const unknown = integrityEmptyState({ state: null, rowCount: 0 });
  assert.equal(clean.state, QUEUE_STATES.EMPTY);
  assert.equal(unproduced.state, QUEUE_STATES.UNPRODUCED);
  assert.equal(unknown.state, QUEUE_STATES.UNKNOWN);
  assert.equal(integrityEmptyState({ state: 'review_available', rowCount: 2 }), null);
});

test('the live health banner is above all seven local sections', () => {
  const banner = panel.indexOf('<DetectorHealthBanner');
  const nav = panel.indexOf('aria-label="Integrity Sections"');
  assert.ok(banner > 0 && nav > banner,
    'health must render before an operator can choose or read a section');
  assert.match(panel, /active: true,[\s\S]{0,100}healthUrl\(\)/,
    'health loads on panel mount, not only on the Health section');
  for (const section of INTEGRITY_SECTIONS) {
    assert.match(panel, new RegExp(`integrity-panel-${section}`));
    assert.match(panel, new RegExp(`integrity-tab-${section}`));
  }
});

test('the mobile queue is stacked evidence cards and not a wide table', () => {
  assert.match(panel, /function QueueCard/);
  assert.match(panel, /<article className=\{styles\.card\}>/);
  assert.ok(!panel.includes("import DataTable"),
    'a horizontally scrolling desktop table is not the 375px queue');
  assert.match(panel, /Why This Pair Is Here/);
  assert.match(panel, /rank_reasons/);
});

test('case decisions and sanctions remain separate human actions', () => {
  assert.match(panel, /This Records The Verdict\. It Does Not Apply A Sanction By Itself\./);
  assert.match(panel, /Record Decision/);
  assert.match(panel, /Apply A Sanction/);
  assert.match(panel, /Check Approval And Apply/);
  assert.match(panel, /decisionNote\.trim\(\)\.length < 10/,
    'the decision control must enforce the same minimum as the route');
  assert.match(panel, /sanctionDraft\.note\.trim\(\)\.length < 10/,
    'the sanction control must enforce the same minimum as the route');
  assert.match(panel, /caseStatus === 'decided' && sanctionDraft\.kind === expectedSanction/,
    'a sanction must follow a recorded, matching human decision');
  assert.match(panel, /Record A Human Decision First\./,
    'an undecided case must explain why sanction controls are unavailable');
  assert.match(panel, /opId: first\(root, 'opId', 'op_id'\) \|\| draft\.opId/,
    'the approval retry keeps the same operation ID');
  assert.ok(!/delete.*caseItems|caseItems.*delete/i.test(panel),
    'there is no evidence deletion control');
});

test('labels explain integrity vocabulary without raw database casing', () => {
  assert.equal(patternLabel('TIMING_CORRELATION'), 'Timing Correlation');
  assert.equal(patternLabel('no_action'), 'No Action');
  assert.equal(patternLabel('collusion_row'), 'Collusion Row');
});

test('the new client files obey source house rules', () => {
  for (const [name, source] of [
    ['IntegrityPanel.jsx', panel],
  ]) {
    assert.ok(!source.includes('\u2014'), `${name}: no em dash`);
    assert.ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u.test(source), `${name}: no emoji`);
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(source), `${name}: no raw colour`);
    assert.ok(!source.includes('.single('), `${name}: use maybeSingle on data paths`);
  }
});

// An empty hand-search window is not proof that no hand evidence exists.
// fn_ca_integrity_hands reads history in windows and reports 'search_incomplete'
// with a cursor when a window filled without matching. Before this was wired,
// the panel rendered that case as "No Hands Match That Search" and hid the pager,
// so an investigator could close a false negative under a human decision gate.
test('hand search coverage separates an exhausted search from an unfinished one', () => {
  const finished = handSearchCoverage({ state: 'nothing_to_review', scanned_count: 120, next_cursor: null });
  assert.equal(finished.incomplete, false);
  assert.equal(finished.hasMore, false);

  const unfinished = handSearchCoverage({
    state: 'search_incomplete',
    scanned_count: 500,
    next_cursor: { hand_id: 'abc', played_at: '2026-09-01T00:00:00Z' },
  });
  assert.equal(unfinished.incomplete, true);
  assert.equal(unfinished.hasMore, true);
  assert.equal(unfinished.scannedCount, 500);
  assert.deepEqual(unfinished.nextCursor, { hand_id: 'abc', played_at: '2026-09-01T00:00:00Z' });
});

test('hand search coverage never invents completeness from a missing payload', () => {
  for (const empty of [null, undefined, {}, { state: null }, 'garbage', 42, [], { data: null }]) {
    const coverage = handSearchCoverage(empty);
    assert.ok(coverage && typeof coverage === 'object', 'the shape is always safe to read');
    assert.equal(coverage.incomplete, false, 'absent state must not claim an unfinished search');
    assert.equal(coverage.hasMore, false, 'absent cursor must not claim another page');
    assert.equal(coverage.scannedCount, null, 'a scanned count that was never reported stays null');
    assert.equal(coverage.truncated, false, 'an absent truncated flag is not a truncated search');
    assert.equal(coverage.coverageNote, null, 'a note that was never sent is not invented');
  }
  // A non-boolean truncated flag must not be read as a boolean by accident.
  assert.equal(handSearchCoverage({ truncated: 0 }).incomplete, false);
  assert.equal(handSearchCoverage({ truncated: 'yes' }).incomplete, false);
  assert.equal(handSearchCoverage({ coverage_note: '   ' }).coverageNote, null);
});

test('the integrity panel reads the continuation the database reports', async () => {
  const panel = await readFile(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/components/horses/IntegrityPanel.jsx'),
    'utf8'
  );
  assert.match(panel, /handSearchCoverage/, 'the panel must read the hand search coverage');
  assert.match(
    panel,
    /handRows\.length > 0 \|\| handCoverage\.hasMore/,
    'the hands pager must stay reachable when the window was full but matched nothing'
  );
  assert.match(
    panel,
    /This Search Did Not Reach The End Of History/,
    'an unfinished hand search must say so instead of reporting no records'
  );
  assert.doesNotMatch(
    panel,
    /\{handRows\.length > 0 && \(\s*\n\s*<CursorPager/,
    'the old row-count-only pager gate must not come back'
  );
});

// ---------------------------------------------------------------------------
// Audit repair 1: an incomplete hand search reported itself as complete.
//
// fn_ca_integrity_hands sets state to 'search_incomplete' ONLY when the window
// filled and nothing matched. The moment one row matches it says
// 'hands_available' instead, even with truncated true and a cursor in hand. The
// panel read state alone, so the measured live case - a player with 28,395
// hands answering matched_in_sample 27, scanned_count 500, truncated true -
// rendered 25 cards and no disclosure at all. An investigator could record
// "reviewed this player's hands" after seeing 0.09% of them.
// ---------------------------------------------------------------------------

test('a truncated hand search that DID match rows is still an incomplete search', () => {
  // The exact live payload from the production audit.
  const measured = handSearchCoverage({
    ok: true,
    state: 'hands_available',
    matched_in_sample: 27,
    candidate_cap: 500,
    scanned_count: 500,
    truncated: true,
    next_cursor: { created_at: '2026-09-01T00:00:00Z', id: 'hand-500' },
    coverage_note: 'Search examines the newest 500 candidate hands per page before player filters.',
  });
  assert.equal(measured.incomplete, true,
    'matched rows plus a full candidate window is an unfinished search, not a finished one');
  assert.equal(measured.truncated, true);
  assert.equal(measured.state, 'hands_available', 'the database state is reported as it was sent');
  assert.equal(measured.hasMore, true);
  assert.equal(measured.scannedCount, 500);
  assert.deepEqual(measured.nextCursor, { created_at: '2026-09-01T00:00:00Z', id: 'hand-500' });
  assert.equal(
    measured.coverageNote,
    'Search examines the newest 500 candidate hands per page before player filters.',
    'the disclosure must be able to quote what the database says it examined'
  );

  // The same answer arriving inside a data envelope is read the same way.
  assert.equal(handSearchCoverage({ data: { state: 'hands_available', truncated: true } }).incomplete, true);
});

test('the older empty-window signal still reports an incomplete search', () => {
  const unfinished = handSearchCoverage({
    state: 'search_incomplete',
    scanned_count: 500,
    truncated: true,
    next_cursor: { created_at: '2026-08-01T00:00:00Z', id: 'hand-1' },
  });
  assert.equal(unfinished.incomplete, true);
  assert.equal(unfinished.hasMore, true);

  // And the state alone is enough, even if the flag were ever dropped.
  assert.equal(handSearchCoverage({ state: 'search_incomplete' }).incomplete, true);
});

test('a genuinely exhausted hand search is not warned about', () => {
  for (const exhausted of [
    { state: 'hands_available', matched_in_sample: 3, scanned_count: 120, truncated: false, next_cursor: null },
    { state: 'nothing_to_review', scanned_count: 120, truncated: false, next_cursor: null },
  ]) {
    const coverage = handSearchCoverage(exhausted);
    assert.equal(coverage.incomplete, false, 'a window that did not fill reached the end of history');
    assert.equal(coverage.truncated, false);
    assert.equal(coverage.hasMore, false);
    assert.equal(coverage.scannedCount, 120);
  }
});

test('the panel gates its hand coverage disclosure on more than the state string', () => {
  assert.match(
    integritySource,
    /incomplete: state === 'search_incomplete' \|\| truncated,/,
    'either the state or the truncated flag must make a search incomplete'
  );
  assert.doesNotMatch(
    panel,
    /'search_incomplete'/,
    'the panel must not re-derive coverage from the state string; that is the defect'
  );
  assert.match(
    panel,
    /handFilters && handCoverage\.incomplete && handRows\.length > 0/,
    'the disclosure must be reachable with matched rows on screen, which is the dangerous case'
  );
  assert.match(
    panel,
    /handCoverage\.coverageNote\s*\n?\s*\|\| 'The Hand-History Source Is Read In Windows\.'/,
    "the database's own coverage_note is preferred, with the original copy as the fallback"
  );
  // The rows-present disclosure must say the rows are a sample, not just that
  // more pages exist, and the exhausted empty state must stay distinct from the
  // truncated one.
  assert.match(panel, /'The Match Below Came' : /,
    'one matched hand still reads as a sample of a window');
  assert.match(panel, /Matches Below Came/);
  assert.match(panel, /From One Window Of Candidate Hands\$\{handScannedClause\}/,
    'the disclosure must say how much was actually examined');
  assert.match(panel, /Not From The Whole Of This Player's History/);
  assert.match(panel, /The Hand-History Source Was Read To The End Of History And Returned No Matching Records\./);
  assert.match(panel, /Use Next To Continue The Search Before Treating This As No Evidence\./);
});

// ---------------------------------------------------------------------------
// Audit repair 2: the operator console had no request timeout anywhere.
//
// Every AbortController in this console fired on unmount, and in usePagedList on
// the next load. Neither is a deadline, so a hung read left a panel spinning for
// ever with no error and no retry. The near miss these tests exist to prevent is
// a deadline with the right shape and the wrong extent: arm a timer, call fetch,
// clear the timer around the fetch alone, then read the body. That bounds the
// response headers and nothing else, so a server that sends 200 and then stalls
// the body hangs exactly as it did before.
// ---------------------------------------------------------------------------

test('the deadline stays armed until the body is read, not just until the headers arrive', async () => {
  const { withRequestTimeout, OPERATOR_TIMEOUT_MS, isTimeoutError } = bounded;
  assert.equal(OPERATOR_TIMEOUT_MS, 30000,
    'the integrity queue legitimately takes about three seconds, so the bound sits well above it');

  // Headers arrive, then the body stalls. This is precisely the case a timer
  // cleared around the fetch alone fails to bound.
  let headersArrived = false;
  const failed = await settle(withRequestTimeout(
    async (signal) => { headersArrived = true; return hangUntilAborted(signal); },
    { timeoutMs: 40 },
  ));
  assert.equal(headersArrived, true, 'the stall must be after the headers, or this proves nothing');
  assert.equal(isTimeoutError(failed), true, 'a stalled body must trip the same deadline a stalled header does');
  assert.equal(failed.name, 'TimeoutError');
  assert.equal(failed.code, 'CLIENT_TIMEOUT');
  assert.match(failed.message, /No Answer Within/,
    'an operator must be able to tell a timeout apart from a server error');
  assert.doesNotMatch(failed.message, /500|Request Failed/,
    'a timeout is not a server refusal and must not read like one');

  // Work that finishes inside the bound is untouched, and a real server error
  // keeps its own identity rather than being dressed up as a timeout.
  assert.equal(await withRequestTimeout(async () => 'body', { timeoutMs: 5000 }), 'body');
  const server = await settle(withRequestTimeout(
    async () => { throw new Error('Request Failed (500)'); },
    { timeoutMs: 5000 },
  ));
  assert.equal(isTimeoutError(server), false);
  assert.equal(server.message, 'Request Failed (500)');
});

test('unmount still cancels, and a cancellation is never reported as a timeout', async () => {
  const { withRequestTimeout, isTimeoutError } = bounded;

  const unmount = new AbortController();
  setTimeout(() => unmount.abort(), 10);
  const cancelled = await settle(withRequestTimeout(hangUntilAborted, {
    timeoutMs: 5000, signals: [unmount.signal],
  }));
  assert.equal(cancelled.name, 'AbortError', 'a component unmounting must still cancel its request');
  assert.equal(isTimeoutError(cancelled), false, 'an operator navigating away is not a server timeout');

  const already = new AbortController();
  already.abort();
  const refused = await settle(withRequestTimeout(hangUntilAborted, {
    timeoutMs: 5000, signals: [already.signal],
  }));
  assert.equal(refused.name, 'AbortError', 'a view that is already gone opens no request at all');
});

test('useOperatorFetch bounds the whole round trip and keeps its unmount abort', () => {
  const src = operatorFetchSource;
  assert.match(src, /export const OPERATOR_TIMEOUT_MS = 30000;/,
    'the bound is a named constant, justified in a comment, and a caller may override it');
  assert.match(src, /A caller with a heavier read passes `timeoutMs`/,
    'the chosen bound must be justified where it is defined');
  assert.match(src, /const timer = setTimeout\(\(\) => \{ timedOut = true; abort\(\); \}, ms\);/,
    'the abort must be on a real timer, not only on unmount');
  assert.match(src, /clearTimeout\(timer\);/, 'the timer must be cleared');

  // The timer is armed, then the work is awaited, and only then is it cleared.
  const armed = src.indexOf('const timer = setTimeout(');
  const awaited = src.indexOf('return await run(controller.signal);');
  const cleared = src.indexOf('clearTimeout(timer);');
  assert.ok(armed > 0 && awaited > armed && cleared > awaited,
    'the timer may only be cleared after the awaited work has fully settled');

  // The fetch AND the body read both sit inside the bounded callback, and the
  // timer is not touched between them. That is the header-only bound, ruled out
  // structurally rather than by hoping nobody reintroduces it.
  const window = src.slice(
    src.indexOf('withRequestTimeout(async (signal) => {'),
    src.indexOf('signals: ['),
  );
  assert.ok(window.length > 0, 'the operator fetch must run inside withRequestTimeout');
  assert.match(window, /await fetch\(url, \{/, 'the request is inside the armed window');
  assert.match(window, /const body = await readJsonBody\(res\);/,
    'the body read is inside the armed window, not after the timer is cleared');
  assert.doesNotMatch(window, /clearTimeout/,
    'clearing the timer before the body is read is the bug this repair exists to avoid');

  assert.match(src, /err\.name = 'TimeoutError';/, 'a timeout is its own outcome, not a 500');
  assert.match(src, /controllersRef\.current\.add\(controller\)/,
    'the unmount abort set must survive the repair');
  assert.match(src, /signals: \[controller \? controller\.signal : null, options\.signal\]/,
    'the unmount controller and the caller signal both still cancel');
});

test('usePagedList runs every page read under the same bound', () => {
  const src = pagedListSource;
  assert.match(src, /import \{ OPERATOR_TIMEOUT_MS, withRequestTimeout \} from '\.\/useOperatorFetch';/,
    'the bound is shared, so the console cannot end up with two divergent deadlines');
  assert.match(src, /timeoutMs = OPERATOR_TIMEOUT_MS,/, 'a caller may override the bound');
  assert.match(
    src,
    /const result = await withRequestTimeout\(\s*\(signal\) => fetchRef\.current\(\{[\s\S]*?signal,[\s\S]*?\}\),[\s\S]*?timeoutMs[\s\S]*?signals: \[controller \? controller\.signal : null\]/,
    'the page read runs inside the armed window'
  );

  // fetchPage is the call that reads the response body, so there must be exactly
  // one path to it and it must be the bounded one.
  assert.equal(src.split('fetchRef.current(').length - 1, 1,
    'no second, unbounded path to fetchPage may exist');
  assert.ok(
    src.indexOf('fetchRef.current(') > src.indexOf('await withRequestTimeout('),
    'the body read sits inside the armed window'
  );
  // The timer itself lives in the shared helper, asserted above; usePagedList
  // must not hand-roll a second one that could drift from it.
  assert.ok(!/setTimeout\(/.test(src), 'the deadline comes from the shared helper, not a local copy');

  // The pre-existing cancellation behaviour is untouched.
  assert.match(src, /useEffect\(\(\) => \(\) => \{\s*\n\s*if \(abortRef\.current\)/,
    'unmount must still abort the in-flight page');
  assert.match(src, /if \(err && err\.name === 'AbortError'\) return;/,
    'a cancellation stays silent, while a timeout carries its own message to the operator');
});

test('the integrity panel hands its reads an explicit deadline', () => {
  assert.match(panel, /import \{ OPERATOR_TIMEOUT_MS \} from '\.\/useOperatorFetch';/);
  assert.match(
    panel,
    /authFetch\(url, \{\s*\n\s*signal: controller \? controller\.signal : undefined,\s*\n\s*timeoutMs: OPERATOR_TIMEOUT_MS,\s*\n\s*\}\)/,
    'the panel read carries a bound as well as its unmount controller'
  );
  assert.match(panel, /an unmount cancel and nothing more/,
    'the controller must be documented as a cancel, not mistaken for a deadline');
});
