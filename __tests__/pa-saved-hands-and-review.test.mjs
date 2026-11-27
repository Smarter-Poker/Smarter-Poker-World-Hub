import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const savedHandsLib = await import(pathToFileURL(path.join(ROOT, 'src/lib/personal-assistant/savedHands.mjs')).href);
const routeCore = await import(pathToFileURL(path.join(ROOT, 'src/lib/personal-assistant/savedHandsRouteCore.mjs')).href);

const HERO_ID = '11111111-1111-4111-8111-111111111111';
const VILLAIN_SHOWN_ID = '22222222-2222-4222-8222-222222222222';
const VILLAIN_HIDDEN_ID = '33333333-3333-4333-8333-333333333333';
const OUTSIDER_ID = '44444444-4444-4444-8444-444444444444';
const HAND_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TABLE_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function makeCompletedHandRow() {
  return {
    id: HAND_UUID,
    hand_number: 482,
    table_id: TABLE_UUID,
    tournament_id: null,
    game_variant: 'nlh',
    small_blind: 1,
    big_blind: 2,
    pot_size: 164,
    button_seat: 1,
    players: [
      { userId: HERO_ID, username: 'HeroPlayer', seat: 1, position: 'BTN', stack: 200, netResult: 80, won: 164, showedCards: true, holeCards: ['Ah', 'Kh'] },
      { userId: VILLAIN_SHOWN_ID, username: 'ShownVillain', seat: 2, position: 'BB', stack: 200, netResult: -80, won: 0, showedCards: true, holeCards: ['Qd', 'Qc'] },
      { userId: VILLAIN_HIDDEN_ID, username: 'FoldedVillain', seat: 3, position: 'CO', stack: 150, netResult: -4, won: 0, folded: true, showedCards: false, holeCards: ['7s', '2d'], privateHoleCards: ['7s', '2d'] },
    ],
    hole_cards: {
      [HERO_ID]: ['Ah', 'Kh'],
      [VILLAIN_SHOWN_ID]: ['Qd', 'Qc'],
      [VILLAIN_HIDDEN_ID]: ['7s', '2d'],
    },
    community_cards: ['As', '4s', '5s', '9c', '2h'],
    community_cards2: ['As', '4s', '5s', 'Kd', '3c'],
    rit_boards: [['As', '4s', '5s', 'Kd', '3c']],
    bomb_pot: null,
    kill_pot: false,
    actions: [
      { street: 'preflop', playerId: VILLAIN_HIDDEN_ID, action: 'raise', amount: 4, discardedCard: '9h' },
      { street: 'preflop', playerId: HERO_ID, action: 'raise', amount: 14 },
      { street: 'preflop', playerId: VILLAIN_SHOWN_ID, action: 'call', amount: 14 },
      { street: 'preflop', playerId: VILLAIN_HIDDEN_ID, action: 'fold' },
      { street: 'flop', playerId: VILLAIN_SHOWN_ID, action: 'check' },
      { street: 'flop', playerId: HERO_ID, action: 'allin', amount: 68 },
      { street: 'flop', playerId: VILLAIN_SHOWN_ID, action: 'call', amount: 68 },
    ],
    summary: {
      wentToShowdown: true,
      winnersByBoard: [
        { board: 1, playerId: HERO_ID, playerName: 'HeroPlayer', amount: 82, hand: 'Pair Of Aces' },
        { board: 2, playerId: HERO_ID, playerName: 'HeroPlayer', amount: 82, hand: 'Two Pair, Aces And Kings' },
      ],
    },
    source: 'club_arena',
    created_at: '2026-11-27T08:00:00.000Z',
  };
}

function createFakeSupabase({ handHistoryRows = [], factsRows = [], tablesRows = [], simulateUniqueRaceOnce = false } = {}) {
  const savedRows = [];
  let raceTriggered = false;

  const matchesFilters = (row, filters) => filters.every((f) => {
    if (f.type === 'eq') return String(row[f.col] ?? '') === String(f.val ?? '');
    if (f.type === 'json_rev_eq') {
      const rev = row.hand_data?.review?.revision;
      return rev !== undefined && rev !== null && String(rev) === String(f.val);
    }
    if (f.type === 'json_rev_is_null') {
      const rev = row.hand_data?.review?.revision;
      return rev === undefined || rev === null;
    }
    return true;
  });

  const makeTableQuery = (tableName) => {
    const state = { filters: [], mode: 'select', payload: null, orderDesc: false, limitN: null };
    const sourceList = () => {
      if (tableName === 'hand_history') return handHistoryRows;
      if (tableName === 'ca_hand_facts') return factsRows;
      if (tableName === 'tables') return tablesRows;
      if (tableName === 'hand_histories') return savedRows;
      return [];
    };

    const execute = async (singleMode) => {
      const list = sourceList();
      if (state.mode === 'insert') {
        const row = structuredClone(state.payload);
        row.created_at = row.created_at || new Date().toISOString();
        const dup = list.find((r) => r.user_id === row.user_id && r.hand_id === row.hand_id);
        if (dup) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "uq_hand_histories_hand_user"' } };
        }
        if (simulateUniqueRaceOnce && !raceTriggered && tableName === 'hand_histories') {
          raceTriggered = true;
          list.push(row);
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "uq_hand_histories_hand_user"' } };
        }
        list.push(row);
        return { data: singleMode ? structuredClone(row) : [structuredClone(row)], error: null };
      }

      if (state.mode === 'update') {
        const idx = list.findIndex((r) => matchesFilters(r, state.filters));
        if (idx === -1) return { data: singleMode ? null : [], error: null };
        list[idx] = { ...list[idx], ...structuredClone(state.payload) };
        return { data: singleMode ? structuredClone(list[idx]) : [structuredClone(list[idx])], error: null };
      }

      if (state.mode === 'delete') {
        const idx = list.findIndex((r) => matchesFilters(r, state.filters));
        if (idx === -1) return { data: singleMode ? null : [], error: null };
        const [removed] = list.splice(idx, 1);
        return { data: singleMode ? structuredClone(removed) : [structuredClone(removed)], error: null };
      }

      let rows = list.filter((r) => matchesFilters(r, state.filters)).map((r) => structuredClone(r));
      if (state.orderDesc) rows.reverse();
      if (state.limitN) rows = rows.slice(0, state.limitN);
      return { data: singleMode ? (rows[0] || null) : rows, error: null };
    };

    const api = {
      select() { return api; },
      insert(payload) { state.mode = 'insert'; state.payload = payload; return api; },
      update(payload) { state.mode = 'update'; state.payload = payload; return api; },
      delete() { state.mode = 'delete'; return api; },
      eq(col, val) { state.filters.push({ type: 'eq', col, val }); return api; },
      filter(col, op, val) {
        if (col === 'hand_data->review->>revision' && op === 'eq') {
          state.filters.push({ type: 'json_rev_eq', val });
        } else if (col === 'hand_data->review->>revision' && op === 'is' && val === null) {
          state.filters.push({ type: 'json_rev_is_null' });
        }
        return api;
      },
      order(_col, opts) { state.orderDesc = opts?.ascending === false; return api; },
      limit(n) { state.limitN = n; return api; },
      maybeSingle() { return execute(true); },
      then(resolve, reject) { return execute(false).then(resolve, reject); },
    };
    return api;
  };

  return {
    savedRows,
    from: makeTableQuery,
  };
}

async function callHandler({ method = 'GET', query = {}, body = undefined, userId = HERO_ID, supabase }) {
  const headers = {};
  let statusCode = 200;
  let jsonBody = null;
  const req = {
    method,
    query,
    body,
    headers: { 'x-forwarded-for': `127.0.0.${Math.floor(Math.random() * 200) + 1}` },
    socket: { remoteAddress: '127.0.0.1' },
  };
  const res = {
    headersSent: false,
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    getHeader(k) { return headers[k.toLowerCase()]; },
    status(code) { statusCode = code; return res; },
    json(data) { jsonBody = data; res.headersSent = true; return res; },
  };

  await routeCore.executeSavedHandsRequest(req, res, {
    getDb: () => supabase,
    getUser: async () => (userId ? { user: { id: userId }, error: null, status: 200 } : { user: null, error: 'Unauthorized', status: 401 }),
  });
  return { statusCode, headers, body: jsonBody };
}

test('POST /api/poker/saved-hands rejects unauthenticated callers and invalid UUIDs', async () => {
  const sb = createFakeSupabase({ handHistoryRows: [makeCompletedHandRow()] });
  const unauth = await callHandler({ method: 'POST', body: { source: 'club-arena', handId: HAND_UUID }, userId: null, supabase: sb });
  assert.equal(unauth.statusCode, 401);

  const badId = await callHandler({ method: 'POST', body: { source: 'club-arena', handId: 'not-a-uuid' }, userId: HERO_ID, supabase: sb });
  assert.equal(badId.statusCode, 400);
});

test('POST /api/poker/saved-hands enforces participation and protects hidden opponent cards', async () => {
  const sb = createFakeSupabase({
    handHistoryRows: [makeCompletedHandRow()],
    tablesRows: [{ id: TABLE_UUID, name: 'Kings High Stakes', club_id: 'club-1' }],
  });

  // Non-participant gets 404
  const outsider = await callHandler({ method: 'POST', body: { source: 'club-arena', handId: HAND_UUID }, userId: OUTSIDER_ID, supabase: sb });
  assert.equal(outsider.statusCode, 404);
  assert.equal(sb.savedRows.length, 0);

  // Verified participant saves cleanly
  const res = await callHandler({ method: 'POST', body: { source: 'club-arena', handId: HAND_UUID }, userId: HERO_ID, supabase: sb });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.alreadySaved, false);
  assert.ok(savedHandsLib.isValidUuid(res.body.hand.id));

  const saved = res.body.hand;
  assert.equal(saved.source, 'club-arena');
  assert.equal(saved.sourceHandId, HAND_UUID);
  assert.equal(saved.review.status, 'saved');
  assert.equal(saved.review.analysisState, 'not_analyzed');
  assert.equal(saved.hand_data.boards.length, 2);
  assert.equal(saved.hand_data.winnersByBoard.length, 2);

  // Verify hidden opponent cards are completely stripped while hero + showdown villain cards remain
  const serialized = JSON.stringify(saved);
  assert.doesNotMatch(serialized, /7s/);
  assert.doesNotMatch(serialized, /2d/);
  assert.doesNotMatch(serialized, /discardedCard.*9h/);
  const foldedVillain = saved.hand_data.players.find((p) => p.name === 'FoldedVillain');
  assert.deepEqual(foldedVillain.holeCards, []);
  assert.equal(foldedVillain.cardsVisibility, 'hidden');
  const shownVillain = saved.hand_data.players.find((p) => p.name === 'ShownVillain');
  assert.deepEqual(shownVillain.holeCards, ['Qd', 'Qc']);

  // Duplicate save returns 200 alreadySaved: true with the exact same saved-row UUID
  const dup = await callHandler({ method: 'POST', body: { source: 'club-arena', handId: HAND_UUID }, userId: HERO_ID, supabase: sb });
  assert.equal(dup.statusCode, 200);
  assert.equal(dup.body.alreadySaved, true);
  assert.equal(dup.body.hand.id, saved.id);
  assert.equal(sb.savedRows.length, 1);

  // Durable readback by sourceHandId returns the saved row
  const readback = await callHandler({ method: 'GET', query: { sourceHandId: HAND_UUID }, userId: HERO_ID, supabase: sb });
  assert.equal(readback.statusCode, 200);
  assert.equal(readback.body.found, true);
  assert.equal(readback.body.hand.id, saved.id);

  // Owner isolation: another user cannot read, patch, or delete Hero's saved row
  const otherRead = await callHandler({ method: 'GET', query: { id: saved.id }, userId: VILLAIN_SHOWN_ID, supabase: sb });
  assert.equal(otherRead.statusCode, 404);
  const otherPatch = await callHandler({ method: 'PATCH', body: { id: saved.id, notes: 'tamper' }, userId: VILLAIN_SHOWN_ID, supabase: sb });
  assert.equal(otherPatch.statusCode, 404);
});

test('POST /api/poker/saved-hands reconciles concurrent unique-constraint race atomically', async () => {
  const sb = createFakeSupabase({
    handHistoryRows: [makeCompletedHandRow()],
    simulateUniqueRaceOnce: true,
  });
  const res = await callHandler({ method: 'POST', body: { source: 'club-arena', handId: HAND_UUID }, userId: HERO_ID, supabase: sb });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.alreadySaved, true);
  assert.equal(sb.savedRows.length, 1);
});

test('PATCH /api/poker/saved-hands persists notes/status, enforces optimistic revision conflicts, and separates saved vs analyzed', async () => {
  const sb = createFakeSupabase({ handHistoryRows: [makeCompletedHandRow()] });
  const created = await callHandler({ method: 'POST', body: { source: 'club-arena', handId: HAND_UUID }, userId: HERO_ID, supabase: sb });
  const savedId = created.body.hand.id;
  assert.equal(created.body.hand.review.revision, 1);
  assert.equal(created.body.hand.review.status, 'saved');
  assert.equal(created.body.hand.review.analysisState, 'not_analyzed');

  // Update notes & review status with matching expectedRevision=1
  const updated = await callHandler({
    method: 'PATCH',
    body: { id: savedId, expectedRevision: 1, notes: '3-bet sizing was too small OOP', reviewStatus: 'in_review' },
    userId: HERO_ID,
    supabase: sb,
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.body.hand.review.revision, 2);
  assert.equal(updated.body.hand.review.status, 'in_review');
  assert.equal(updated.body.hand.review.notes, '3-bet sizing was too small OOP');
  assert.equal(updated.body.hand.review.analysisState, 'not_analyzed');

  // Stale expectedRevision=1 produces 409 REVISION_CONFLICT with latest server hand
  const conflict = await callHandler({
    method: 'PATCH',
    body: { id: savedId, expectedRevision: 1, notes: 'stale overwrite', reviewStatus: 'reviewed' },
    userId: HERO_ID,
    supabase: sb,
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.body.code, 'REVISION_CONFLICT');
  assert.equal(conflict.body.currentRevision, 2);
  assert.equal(conflict.body.hand.review.notes, '3-bet sizing was too small OOP');

  // Mark analyzed separately without changing reviewStatus
  const analyzed = await callHandler({
    method: 'PATCH',
    body: {
      id: savedId,
      expectedRevision: 2,
      analysisState: 'analyzed',
      lastAuditSummary: { solverVerifiedCount: 3, unpricedCount: 1, matchedLeaksCount: 1, strategySupported: true },
    },
    userId: HERO_ID,
    supabase: sb,
  });
  assert.equal(analyzed.statusCode, 200);
  assert.equal(analyzed.body.hand.review.revision, 3);
  assert.equal(analyzed.body.hand.review.status, 'in_review');
  assert.equal(analyzed.body.hand.review.analysisState, 'analyzed');
  assert.equal(analyzed.body.hand.review.lastAuditSummary.solverVerifiedCount, 3);
});

test('approved Personal Assistant landing page preserves artwork, order, internal routes, and zero Training Games redirects', () => {
  const hub = read('pages/hub/personal-assistant/index.js');
  const reviewIdx = hub.indexOf('Review My Play');
  const sandboxIdx = hub.indexOf('Virtual Sandbox');
  const leaksIdx = hub.indexOf('My Leaks');

  assert.ok(reviewIdx > 0, 'Review My Play exists');
  assert.ok(sandboxIdx > reviewIdx, 'Virtual Sandbox follows Review My Play');
  assert.ok(leaksIdx > sandboxIdx, 'My Leaks follows Virtual Sandbox');

  assert.match(hub, /\/images\/personal-assistant\/review-my-play\.webp/);
  assert.match(hub, /\/images\/personal-assistant\/virtual-sandbox\.webp/);
  assert.match(hub, /\/images\/personal-assistant\/my-leaks\.webp/);
  assert.match(hub, /\/hub\/personal-assistant\/review/);
  assert.match(hub, /\/hub\/personal-assistant\/sandbox/);
  assert.match(hub, /\/hub\/personal-assistant\/leaks/);
  assert.match(hub, /Log A Hand/);
  assert.match(hub, /My Coaching Plan/);
  assert.doesNotMatch(hub, /\/hub\/training/, 'landing-page body has no Training Games redirects');

  for (const img of [
    'public/images/personal-assistant/review-my-play.webp',
    'public/images/personal-assistant/virtual-sandbox.webp',
    'public/images/personal-assistant/my-leaks.webp',
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, img)), `artwork asset exists: ${img}`);
  }
});

test('Review My Play page wires durable readback, conflict resolution, canonical hand analysis, and distinct states', () => {
  const reviewPage = read('pages/hub/personal-assistant/review.js');
  assert.match(reviewPage, /canonical="\/hub\/personal-assistant\/review"/);
  assert.match(reviewPage, /\/api\/poker\/saved-hands/);
  assert.match(reviewPage, /\/api\/assistant\/leaks\/hand-audit/);
  assert.match(reviewPage, /reconcileBeforeWrite/);
  assert.match(reviewPage, /revision-conflict-banner/);
  assert.match(reviewPage, /Not Analyzed/);
  assert.match(reviewPage, /Analyzed/);
  assert.match(reviewPage, /Keep My Changes And Save/);
});
