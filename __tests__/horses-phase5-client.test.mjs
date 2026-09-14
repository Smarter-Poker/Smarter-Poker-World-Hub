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
  handSearchCoverage,
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
const panel = await readFile(
  path.join(HERE, '..', 'src/components/horses/IntegrityPanel.jsx'),
  'utf8',
);

test('empty candidate windows retain navigation and disclose unsearched history', () => {
  const cursor = { created_at: '2026-09-14T06:00:00.123456+00:00', id: 'hand-500' };
  const empty = handSearchCoverage({ hands: [], next_cursor: cursor }, 0, 0);
  assert.equal(empty.showPager, true);
  assert.equal(empty.nextCursor, cursor);
  assert.match(empty.detail, /Older Hands Remain Unsearched/);
  assert.equal(empty.label, 'Search Window 1: 0 Matching Hands');
  const url = new URL(handsUrl({ playerId: 'player-1', cursor }), 'https://x');
  assert.deepEqual(JSON.parse(url.searchParams.get('cursor')), cursor);
  const final = handSearchCoverage({ hands: [], next_cursor: null }, 0, 2);
  assert.equal(final.showPager, true, 'Previous stays reachable on a terminal empty window');
  assert.equal(final.nextCursor, null);
  assert.match(final.detail, /Reached The End/);
  assert.equal(handSearchCoverage({ next_cursor: null }, 0, 0).showPager, false);
  assert.equal(handSearchCoverage({ next_cursor: cursor }, 2, 1).label, 'Search Window 2: 2 Matching Hands');
  assert.match(panel, /hands\.loaded && !hands\.error && handCoverage\.showPager/);
  assert.match(panel, /renderListState\(hands, handRows, handCoverage\)/);
});

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
