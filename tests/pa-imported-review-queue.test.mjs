import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { parseHandHistory } from '../src/engines/HandHistoryParser.js';
import { buildLiveSpotHandHistory, detectExternalHandFormat, summarizeLiveSpotAudit } from '../src/lib/personal-assistant/liveSpotHandHistory.mjs';
import { buildImportedSavedHandRows, persistImportedSavedHands } from '../src/lib/personal-assistant/importedSavedHands.mjs';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const SPOT = { heroCards: 'Qs Js', position: 'CO', format: 'tournament', stackBb: 85, facing: 'facing_bet', action: 'call', board: 'Ts 9h 2c 4d 6c' };
const TEXT = buildLiveSpotHandHistory(SPOT, { now: new Date('2026-11-27T00:00:00.000Z') }).text;
const options = () => ({ userId: OWNER, evidenceScope: 'self_reported_live', hands: parseHandHistory(TEXT).map(hand => ({ ...hand, smallBlind: 50, bigBlind: 100 })) });

function database(mode = {}) {
  const records = new Map();
  const calls = [];
  const db = {
    records, calls,
    from(table) {
      const filters = [];
      const query = {
        async upsert(rows, config) {
          calls.push({ table, kind: 'upsert', config, rows });
          if (mode.writeFails) return { error: { message: 'Write Failed' } };
          if (table === 'hand_histories') {
            assert.deepEqual(config, { onConflict: 'hand_id,user_id', ignoreDuplicates: true });
            for (const row of rows) {
              const key = `${row.user_id}:${row.hand_id}`;
              if (!records.has(key)) records.set(key, structuredClone(row));
            }
          }
          if (mode.throwAfterCommit) throw new Error('Connection Lost After Commit');
          return { error: mode.acknowledgmentLost ? { message: 'Response Lost After Commit' } : null };
        },
        select(columns) { calls.push({ table, kind: 'select', columns }); return query; },
        eq(column, value) { calls.push({ table, kind: 'eq', column, value }); filters.push(row => row[column] === value); return query; },
        in(column, values) { filters.push(row => values.includes(row[column])); return query; },
        then(resolve, reject) {
          let data = [...records.values()].filter(row => filters.every(filter => filter(row)));
          if (mode.missingReadback) data = [];
          if (mode.wrongOwner) data = data.map(row => ({ ...row, user_id: OTHER }));
          return Promise.resolve({ data, error: mode.readFails ? { message: 'Read Failed' } : null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return db;
}

test('import rows preserve actual parsed cards, streets, actions, seats and evidence ownership', () => {
  const input = options();
  const [row] = buildImportedSavedHandRows(input);
  const hand = input.hands[0];
  assert.equal(row.user_id, OWNER);
  assert.deepEqual(row.player_ids, [OWNER]);
  assert.equal(row.hand_data.source, 'manual');
  assert.equal(row.hand_data.sourceHandId, null);
  assert.equal(row.hand_data.evidenceScope, 'self_reported_live');
  assert.equal(row.hand_data.format, 'tournament');
  assert.equal(row.hand_data.heroPosition, 'CO');
  assert.deepEqual(row.hand_data.heroCards, ['Qs', 'Js']);
  assert.deepEqual(row.hand_data.communityCards, ['Ts', '9h', '2c', '4d', '6c']);
  assert.equal(row.hand_data.players.find(player => player.isHero).stack, 8500);
  assert.deepEqual(row.hand_data.players.filter(player => !player.isHero).map(player => player.holeCards), hand.players.filter(player => player.name !== hand.hero.name).map(() => []));
  for (const street of row.hand_data.streets) {
    assert.deepEqual(street.actions.map(action => [action.playerName, action.action, action.amount]), hand.streets[street.name].actions.map(action => [action.player, action.action, action.amount]));
  }
  assert.equal(row.small_blind, 50);
  assert.equal(row.big_blind, 100);
  assert.equal(row.hand_data.review.status, 'saved');
  assert.throws(() => buildImportedSavedHandRows({ ...input, evidenceScope: 'club_arena' }), /Evidence Scope/);
  assert.throws(() => buildImportedSavedHandRows({ ...input, hands: Array(101).fill(hand) }), /Bounded Set/);
});

test('imported Omaha keeps its precise five- and six-card variant without NLH grading', () => {
  for (const count of [5, 6]) {
    const input = options();
    input.hands[0] = { ...input.hands[0], variant: 'omaha', gameVariant: `plo${count}`, bettingStructure: 'PL', strategySupported: false, unsupportedReason: 'omaha_family_is_not_nlhe', hero: { ...input.hands[0].hero, holeCards: ['As', 'Ks', 'Qh', 'Jh', '7d', '8d'].slice(0, count) } };
    const [row] = buildImportedSavedHandRows(input);
    assert.equal(row.variant, `PLO${count}`);
    assert.equal(row.hand_data.heroCards.length, count);
    assert.equal(row.hand_data.strategySupported, false);
    assert.equal(row.betting_structure, 'pot_limit');
  }
});

test('duplicate and concurrent imports preserve review edits and isolate owners', async () => {
  const db = database();
  const input = options();
  const [a, b] = await Promise.all([persistImportedSavedHands(db, input), persistImportedSavedHands(db, { ...input, hands: [input.hands[0], input.hands[0]] })]);
  assert.deepEqual(a, b);
  assert.equal(db.records.size, 1);
  const row = [...db.records.values()][0];
  row.hand_data.review.notes = 'Keep My Private Review';
  row.hand_data.review.status = 'reviewed';
  assert.deepEqual(await persistImportedSavedHands(db, input), a);
  assert.equal(row.hand_data.review.notes, 'Keep My Private Review');
  assert.equal(row.hand_data.review.status, 'reviewed');
  const other = await persistImportedSavedHands(db, { ...input, userId: OTHER });
  assert.notEqual(other.handIds[0], a.handIds[0]);
  assert.equal(db.records.size, 2);
  assert.ok(db.calls.filter(call => call.kind === 'select').every(call => call.columns === 'id,hand_id,user_id'));
  assert.ok(db.calls.some(call => call.kind === 'eq' && call.column === 'user_id' && call.value === OWNER));
});

test('a lost write acknowledgment is resolved by owner-scoped durable readback', async () => {
  for (const mode of [{ acknowledgmentLost: true }, { throwAfterCommit: true }]) {
    const db = database(mode);
    const result = await persistImportedSavedHands(db, options());
    assert.equal(result.saved, true);
    assert.equal(result.count, 1);
    assert.equal(db.records.size, 1);
    assert.equal(db.calls.filter(call => call.kind === 'upsert').length, 1);
  }
});

test('missing, unreadable or wrong-owner readback never claims that import saving completed', async () => {
  for (const mode of [{ writeFails: true }, { readFails: true }, { missingReadback: true }, { wrongOwner: true }]) {
    await assert.rejects(persistImportedSavedHands(database(mode), options()), /Review Queue/);
  }
});

test('the audit summary only links confirmed unique saved identities', () => {
  const summary = summarizeLiveSpotAudit({ reviewQueue: { saved: true, count: 500, handIds: ['one/two', 'one/two', null, ''] } });
  assert.equal(summary.savedHandCount, 1);
  assert.deepEqual(summary.savedHandIds, ['one/two']);
  assert.equal(summary.reviewHref, '/hub/personal-assistant/review?hand=one%2Ftwo');
  assert.equal(summarizeLiveSpotAudit({ reviewQueue: { saved: false, handIds: ['unconfirmed'] } }).reviewHref, null);
  assert.equal(summarizeLiveSpotAudit({ reviewQueue: { saved: true, count: 1 } }).savedForReview, false);
});

function compileAuditRoute(db, { authenticated = true, allowed = true, auditPersisted = true } = {}) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-route-test-only';
  const deps = {
    'serverAuth.js': { getServerUserWithFallback: async () => ({ user: authenticated ? { id: OWNER } : null, error: authenticated ? null : 'Invalid', status: 401 }) },
    'supabaseServerClient.js': { createClient: () => db },
    'apiRateLimit.js': { applyRateLimit: () => true, LIMITS: { write: {} } },
    'apiErrorHandler.js': { reportApiError() {} },
    'contextAuthority.js': { checkSandboxAccess: async (_db, owner) => { assert.equal(owner, OWNER); return { allowed, accessLevel: allowed ? 'full' : 'hard_block' }; }, isFeatureAccessible: () => allowed },
    'HandHistoryParser.js': { parseHandHistory },
    'handAuditEngine.js': { auditParsedHands: async (_db, owner, hands, config) => {
      assert.equal(owner, OWNER); assert.equal(config.evidenceScope, 'self_reported_live');
      return { persisted: auditPersisted, evidenceReconciled: true, handsParsed: hands.length, analyses: hands.map(hand => ({ handId: hand.id, solverVerified: false, decisions: [] })) };
    } },
    'customTrainingLaunchContract.mjs': { buildCustomTrainingArenaHref: () => '/hub/training' },
    'clubArenaTableParity.js': { parseStakesToBlinds: () => ({ smallBlind: 50, bigBlind: 100, stakesLabel: '50/100' }) },
    'horseBrainTrainingAdapter.js': { evaluateTrainingSpotWithHorseBrain: () => null },
    'importedSavedHands.mjs': { persistImportedSavedHands },
  };
  const code = ts.transpileModule(read('pages/api/training/audit-hand-history.js'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    const dependency = Object.entries(deps).find(([suffix]) => name.endsWith(suffix));
    assert.ok(dependency, `Unexpected Dependency ${name}`);
    return dependency[1];
  }, module, module.exports);
  return module.exports.default;
}

async function runRoute(db, settings = {}, source = 'personal-assistant-live-spot') {
  const handler = compileAuditRoute(db, settings);
  const response = { statusCode: 200, body: null, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: 'POST', headers: { authorization: 'Bearer local-fixture' }, body: { handHistoryText: TEXT, evidenceScope: 'self_reported_live', source, userId: OTHER } }, response);
  return response;
}

test('the actual Log A Hand route saves private review rows and returns a usable hand id', async () => {
  const db = database();
  const response = await runRoute(db);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.reviewQueue.saved, true);
  assert.equal(response.body.reviewQueue.count, 1);
  const [row] = [...db.records.values()];
  assert.ok(row, 'Log A Hand must populate hand_histories, the Review My Play queue owner');
  assert.equal(response.body.reviewQueue.handIds[0], row.id);
  assert.equal(row.user_id, OWNER, 'A caller-supplied userId must never override authenticated ownership');
  assert.equal(row.hand_data.heroCards.join(' '), 'Qs Js');
  assert.equal(row.big_blind, 100);
  const summary = summarizeLiveSpotAudit(response.body);
  assert.equal(summary.savedForReview, true);
  assert.equal(summary.reviewHref, `/hub/personal-assistant/review?hand=${row.id}`);
});

test('Log A Hand preserves auth, active-play and audit-persistence gates before saving', async () => {
  for (const [settings, status] of [[{ authenticated: false }, 401], [{ allowed: false }, 403], [{ auditPersisted: false }, 503]]) {
    const db = database();
    const response = await runRoute(db, settings);
    assert.equal(response.statusCode, status);
    assert.equal(db.calls.filter(call => call.kind === 'upsert').length, 0);
  }
  const db = database();
  const response = await runRoute(db, {}, 'ordinary-training-import');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.reviewQueue, undefined);
  assert.equal(db.records.size, 0, 'Unrelated import callers retain their existing storage behavior');
});

test('Log A Hand reports an unconfirmed save instead of success when durable readback fails', async () => {
  const response = await runRoute(database({ readFails: true }));
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'REVIEW_QUEUE_SAVE_INCOMPLETE');
  assert.equal(response.body.reviewQueue.saved, false);
});

function evaluateLoggerCallbacks(extra = {}) {
  const source = read('src/components/personal-assistant/LiveSpotQuickEntry.jsx');
  const refs = source.slice(source.indexOf('  const requestIdRef = useRef('), source.indexOf('  const update = useCallback('));
  const audit = source.slice(source.indexOf('  const runAudit = useCallback('), source.indexOf('  const submitSpot ='));
  const state = { result: null, events: [], closed: false, signal: null, effects: [] };
  let answer;
  const pending = new Promise(resolve => { answer = resolve; });
  const context = {
    useRef: current => ({ current }), useCallback: fn => fn, useEffect: (fn, deps) => state.effects.push({ fn, deps }), useMemo: fn => fn(), useDeferredValue: value => value,
    userId: OWNER, pasted: '', spot: SPOT, open: true,
    buildLiveSpotHandHistory, detectExternalHandFormat, summarizeLiveSpotAudit,
    AUDIT_ENDPOINT: '/api/training/audit-hand-history', REQUEST_TIMEOUT_MS: 60000,
    getFreshAccessToken: async () => 'local-fixture', AbortController, setTimeout, clearTimeout, Event,
    fetch: async (_url, options) => { state.signal = options.signal; return pending; },
    setRunning() {}, setBulkProgress() {}, setResult: result => { state.result = result; }, setStatusAnnouncement() {},
    setPasted() {}, setSpot() {}, setWizardStep() {}, setShowErrors() {}, DEFAULT_SPOT: {},
    triggerRef: { current: null }, onClose: () => { state.closed = true; }, onAnalyzed: () => state.events.push('analyzed'),
    window: { dispatchEvent: event => state.events.push(event.type) },
    ...extra,
  };
  vm.runInNewContext(refs + audit + '\nglobalThis.controls = { runAudit, handleClose, ownerRef };', context);
  return { ...context.controls, state, answer };
}

test('closing a single-hand audit aborts its request and discards late success callbacks', async () => {
  const logger = evaluateLoggerCallbacks();
  const pending = logger.runAudit(TEXT, { evidenceScope: 'self_reported_live' });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(logger.state.signal);
  logger.handleClose();
  const wasAborted = logger.state.signal.aborted;
  logger.answer({ ok: true, status: 200, json: async () => ({ success: true, handsParsed: 1, analyses: [], reviewQueue: { saved: true, count: 1, handIds: ['saved-1'] } }) });
  await pending;
  assert.equal(wasAborted, true, 'Close must cancel the single-hand request too, not only a bulk batch');
  assert.deepEqual(logger.state.events, []);
  assert.notEqual(logger.state.result?.kind, 'ok');
});

test('unmount and account changes invalidate pending logger results and refresh events', async () => {
  for (const change of ['unmount', 'account']) {
    const logger = evaluateLoggerCallbacks();
    const pending = logger.runAudit(TEXT);
    await new Promise(resolve => setImmediate(resolve));
    if (change === 'unmount') {
      const unmount = logger.state.effects.find(effect => effect.deps.length === 1).fn();
      unmount();
    } else {
      logger.ownerRef.current = OTHER;
      logger.state.effects.find(effect => effect.deps.includes(OWNER)).fn();
    }
    assert.equal(logger.state.signal.aborted, true);
    logger.answer({ ok: true, status: 200, json: async () => ({ success: true, handsParsed: 1, reviewQueue: { saved: true, count: 1, handIds: ['previous-owner'] } }) });
    await pending;
    assert.deepEqual(logger.state.events, []);
    assert.notEqual(logger.state.result?.kind, 'ok');
  }
});

async function runBulkFixture(outcomes, { beforeFileReady } = {}) {
  const source = read('src/components/personal-assistant/LiveSpotQuickEntry.jsx');
  const callback = source.slice(source.indexOf('  const processBulkFile = useCallback('), source.indexOf('  const handleCancelBulk = useCallback('));
  let result;
  let batch = 0;
  const context = {
    useCallback: fn => fn, running: false, bulkProgress: null, MAX_FILE_BYTES: 5000000, MAX_PASTE_CHARS: 800000,
    userId: OWNER, ownerRef: { current: OWNER },
    bulkCancelRef: { current: false }, bulkAbortRef: { current: null }, lifecycleVersionRef: { current: 0 },
    splitHandHistoryChunks: () => ['batch1', 'batch2'], AbortController, Event,
    setResult: value => { result = value; }, setStatusAnnouncement() {}, setTab() {}, setPasted() {}, setBulkProgress() {},
    window: { dispatchEvent() {} }, onAnalyzed() {},
    runAudit: async () => outcomes[batch++],
  };
  vm.runInNewContext(callback + '\nglobalThis.run = processBulkFile;', context);
  await context.run({ size: 100, text: async () => { beforeFileReady?.(context); return TEXT; } });
  return { result, batches: batch };
}

const savedBatch = handIds => ({ ok: true, payload: {}, summary: { verifiedCount: 0, unpricedCount: 2, handsParsed: 2, decisionsAnalyzed: 2, savedForReview: true, savedHandCount: handIds.length, savedHandIds: handIds, reviewHref: `/hub/personal-assistant/review?hand=${handIds[0]}`, decisions: [], complete: true } });

test('the actual bulk callback retains unique saved-hand totals and the Review destination', async () => {
  const { result } = await runBulkFixture([savedBatch(['a', 'b']), savedBatch(['b', 'c'])]);
  assert.equal(result.kind, 'ok');
  assert.equal(result.summary.savedForReview, true);
  assert.equal(result.summary.savedHandCount, 3);
  assert.equal(result.summary.reviewHref, '/hub/personal-assistant/review?hand=a');
});

test('partial bulk failures retain the confirmed saved hands and their review link', async () => {
  const { result } = await runBulkFixture([savedBatch(['a', 'b']), { ok: false, status: 503, error: 'Save Not Confirmed' }]);
  assert.equal(result.kind, 'error');
  assert.equal(result.title, 'Partial Bulk Audit');
  assert.equal(result.summary.savedHandCount, 2);
  assert.equal(result.summary.reviewHref, '/hub/personal-assistant/review?hand=a');
});

test('a file still being read cannot start an audit after close or an account change', async () => {
  for (const change of ['close', 'account']) {
    const { result, batches } = await runBulkFixture([], { beforeFileReady: context => {
      if (change === 'close') context.lifecycleVersionRef.current += 1;
      else context.ownerRef.current = OTHER;
    } });
    assert.equal(batches, 0);
    assert.equal(result, undefined);
  }
});
