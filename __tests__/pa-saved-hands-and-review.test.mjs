import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const savedHandsLib = await import(pathToFileURL(path.join(ROOT, 'src/lib/personal-assistant/savedHands.mjs')).href);
const routeCore = await import(pathToFileURL(path.join(ROOT, 'src/lib/personal-assistant/savedHandsRouteCore.mjs')).href);
const shareLib = await import(pathToFileURL(path.join(ROOT, 'src/lib/personal-assistant/anonymizeHandForShare.mjs')).href);

const HERO_ID = '11111111-1111-4111-8111-111111111111';
const VILLAIN_SHOWN_ID = '22222222-2222-4222-8222-222222222222';
const VILLAIN_HIDDEN_ID = '33333333-3333-4333-8333-333333333333';
const OUTSIDER_ID = '44444444-4444-4444-8444-444444444444';
const HAND_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HAND_UUID_2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
const HAND_UUID_3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac';
const HAND_UUID_4 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad';
const HAND_UUID_5 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaae';
const HAND_UUID_6 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaf';
const HAND_UUID_7 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab0';
const TABLE_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function makeCompletedHandRow(overrides = {}) {
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
    ...overrides,
  };
}

function createFakeSupabase({
  handHistoryRows = [],
  factsRows = [],
  tablesRows = [],
  savedRows: initialSavedRows = [],
  pokerSessionsRows = [],
  tableSeatsRows = [],
  simulateUniqueRaceOnce = false,
} = {}) {
  const savedRows = initialSavedRows.map((r) => structuredClone(r));
  let raceTriggered = false;

  const matchesFilters = (row, filters) => filters.every((f) => {
    if (f.type === 'eq') return String(row[f.col] ?? '') === String(f.val ?? '');
    if (f.type === 'in') return f.vals.map(String).includes(String(row[f.col] ?? ''));
    if (f.type === 'is') {
      if (f.val === null) return row[f.col] === null || row[f.col] === undefined;
      return row[f.col] === f.val;
    }
    if (f.type === 'not_is') {
      if (f.val === null) return row[f.col] !== null && row[f.col] !== undefined;
      return row[f.col] !== f.val;
    }
    if (f.type === 'gte') {
      const a = Date.parse(String(row[f.col] ?? ''));
      const b = Date.parse(String(f.val ?? ''));
      if (!Number.isNaN(a) && !Number.isNaN(b)) return a >= b;
      return String(row[f.col] ?? '') >= String(f.val ?? '');
    }
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
    const state = {
      filters: [],
      mode: 'select',
      payload: null,
      orderCol: null,
      orderDesc: false,
      limitN: null,
    };
    const sourceList = () => {
      if (tableName === 'hand_history') return handHistoryRows;
      if (tableName === 'ca_hand_facts') return factsRows;
      if (tableName === 'tables') return tablesRows;
      if (tableName === 'hand_histories') return savedRows;
      if (tableName === 'poker_sessions') return pokerSessionsRows;
      if (tableName === 'table_seats') return tableSeatsRows;
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
      if (state.orderCol) {
        const col = state.orderCol;
        rows.sort((a, b) => {
          const av = String(a[col] ?? '');
          const bv = String(b[col] ?? '');
          return state.orderDesc ? bv.localeCompare(av) : av.localeCompare(bv);
        });
      } else if (state.orderDesc) {
        rows.reverse();
      }
      if (state.limitN) rows = rows.slice(0, state.limitN);
      return { data: singleMode ? (rows[0] || null) : rows, error: null };
    };

    const api = {
      select() { return api; },
      insert(payload) { state.mode = 'insert'; state.payload = payload; return api; },
      update(payload) { state.mode = 'update'; state.payload = payload; return api; },
      delete() { state.mode = 'delete'; return api; },
      eq(col, val) { state.filters.push({ type: 'eq', col, val }); return api; },
      in(col, vals) { state.filters.push({ type: 'in', col, vals: Array.isArray(vals) ? vals : [] }); return api; },
      is(col, val) { state.filters.push({ type: 'is', col, val }); return api; },
      not(col, op, val) {
        if (op === 'is') state.filters.push({ type: 'not_is', col, val });
        return api;
      },
      gte(col, val) { state.filters.push({ type: 'gte', col, val }); return api; },
      filter(col, op, val) {
        if (col === 'hand_data->review->>revision' && op === 'eq') {
          state.filters.push({ type: 'json_rev_eq', val });
        } else if (col === 'hand_data->review->>revision' && op === 'is' && val === null) {
          state.filters.push({ type: 'json_rev_is_null' });
        }
        return api;
      },
      order(col, opts) { state.orderCol = col; state.orderDesc = opts?.ascending === false; return api; },
      limit(n) { state.limitN = n; return api; },
      maybeSingle() { return execute(true); },
      then(resolve, reject) { return execute(false).then(resolve, reject); },
    };
    return api;
  };

  return {
    savedRows,
    pokerSessionsRows,
    tableSeatsRows,
    from: makeTableQuery,
  };
}

async function callHandler({
  method = 'GET',
  query = {},
  body = undefined,
  userId = HERO_ID,
  supabase,
  ip = null,
  checkAccess = undefined,
  probeStore = new Map(),
  probeWindowMs = undefined,
  probeBlockThreshold = undefined,
  probeLogger = () => {},
  nowMs = undefined,
} = {}) {
  const headers = {};
  let statusCode = 200;
  let jsonBody = null;
  let textBody = null;
  const req = {
    method,
    query,
    body,
    headers: { 'x-forwarded-for': ip || `127.0.0.${Math.floor(Math.random() * 200) + 1}` },
    socket: { remoteAddress: '127.0.0.1' },
  };
  const res = {
    headersSent: false,
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    getHeader(k) { return headers[k.toLowerCase()]; },
    status(code) { statusCode = code; return res; },
    json(data) { jsonBody = data; res.headersSent = true; return res; },
    send(data) { textBody = data; res.headersSent = true; return res; },
    end(data) { if (data !== undefined) textBody = data; res.headersSent = true; return res; },
  };

  const options = {
    getDb: () => supabase,
    getUser: async () => (userId ? { user: { id: userId }, error: null, status: 200 } : { user: null, error: 'Unauthorized', status: 401 }),
    probeStore,
    probeLogger,
  };
  if (checkAccess !== undefined) options.checkAccess = checkAccess;
  if (probeWindowMs !== undefined) options.probeWindowMs = probeWindowMs;
  if (probeBlockThreshold !== undefined) options.probeBlockThreshold = probeBlockThreshold;
  if (nowMs !== undefined) options.nowMs = nowMs;

  await routeCore.executeSavedHandsRequest(req, res, options);
  return { statusCode, headers, body: jsonBody, text: textBody };
}

test('POST /api/poker/saved-hands rejects unauthenticated callers and invalid UUIDs', async () => {
  const sb = createFakeSupabase({ handHistoryRows: [makeCompletedHandRow()] });
  const unauth = await callHandler({ method: 'POST', body: { source: 'club-arena', handId: HAND_UUID }, userId: null, supabase: sb });
  assert.equal(unauth.statusCode, 401);
  assert.equal(unauth.headers['cache-control'], 'private, no-store, max-age=0');
  assert.equal(unauth.headers['vary'], 'Authorization');

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
  assert.match(res.headers['server-timing'], /^pa_saved_hands_create;dur=/);

  const saved = res.body.hand;
  assert.equal(saved.source, 'club-arena');
  assert.equal(saved.sourceHandId, HAND_UUID);
  assert.equal(saved.review.status, 'saved');
  assert.equal(saved.review.analysisState, 'not_analyzed');
  assert.equal(saved.hand_data.boards.length, 2);
  assert.equal(saved.hand_data.winnersByBoard.length, 2);

  // Verify hidden opponent cards are completely stripped while hero + showdown villain cards remain
  const serialized = JSON.stringify(saved.hand_data);
  assert.doesNotMatch(serialized, /"7s"/);
  assert.doesNotMatch(serialized, /"2d"/);
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
  assert.match(updated.headers['server-timing'], /^pa_saved_hands_patch;dur=/);
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

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 1: Batch Lookup
// ═══════════════════════════════════════════════════════════════════════════
test('GET /api/poker/saved-hands?source=club-arena&handIds=... supports validated 50-ID batch lookup and owner isolation', async () => {
  const savedRow1 = savedHandsLib.buildClubArenaSavedHandRow({
    userId: HERO_ID,
    handRow: makeCompletedHandRow({ id: HAND_UUID }),
    now: new Date('2026-11-27T09:00:00.000Z'),
  });
  savedRow1.created_at = '2026-11-27T09:00:00.000Z';

  // Legacy `ca:<uuid>` key format should also resolve cleanly
  const savedRow2 = savedHandsLib.buildClubArenaSavedHandRow({
    userId: HERO_ID,
    handRow: makeCompletedHandRow({ id: HAND_UUID_2 }),
    now: new Date('2026-11-27T09:05:00.000Z'),
  });
  savedRow2.hand_id = `ca:${HAND_UUID_2}`;
  savedRow2.created_at = '2026-11-27T09:05:00.000Z';
  savedRow2.hand_data.review.status = 'reviewed';

  // Another user's saved hand must never appear in Hero's batch map
  const otherUserRow = savedHandsLib.buildClubArenaSavedHandRow({
    userId: VILLAIN_SHOWN_ID,
    handRow: makeCompletedHandRow({ id: HAND_UUID_3 }),
    now: new Date('2026-11-27T09:10:00.000Z'),
  });
  otherUserRow.created_at = '2026-11-27T09:10:00.000Z';

  const sb = createFakeSupabase({ savedRows: [savedRow1, savedRow2, otherUserRow] });

  // Generate 55 UUIDs (exceeds cap of 50) + duplicates + invalid strings
  const extraIds = Array.from({ length: 55 }, (_, i) => {
    const hex = i.toString(16).padStart(12, '0');
    return `cccccccc-cccc-4ccc-8ccc-${hex}`;
  });
  const csv = [HAND_UUID, 'not-a-uuid', HAND_UUID_2, HAND_UUID, HAND_UUID_3, ...extraIds].join(',');

  const res = await callHandler({
    method: 'GET',
    query: { source: 'club-arena', handIds: csv },
    userId: HERO_ID,
    supabase: sb,
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.match(res.headers['server-timing'], /^pa_saved_hands_batch;dur=/);
  assert.equal(res.headers['cache-control'], 'private, no-store, max-age=0');
  assert.equal(res.headers['vary'], 'Authorization');

  assert.deepEqual(Object.keys(res.body.savedByHandId).sort(), [HAND_UUID, HAND_UUID_2].sort());
  assert.equal(res.body.savedByHandId[HAND_UUID].id, savedRow1.id);
  assert.equal(res.body.savedByHandId[HAND_UUID].savedAt, '2026-11-27T09:00:00.000Z');
  assert.equal(res.body.savedByHandId[HAND_UUID].status, 'saved');
  assert.equal(res.body.savedByHandId[HAND_UUID].reviewUrl, `/hub/personal-assistant/review?hand=${savedRow1.id}`);

  assert.equal(res.body.savedByHandId[HAND_UUID_2].id, savedRow2.id);
  assert.equal(res.body.savedByHandId[HAND_UUID_2].status, 'reviewed');
  assert.equal(res.body.savedByHandId[HAND_UUID_2].reviewUrl, `/hub/personal-assistant/review?hand=${savedRow2.id}`);
  assert.equal(res.body.savedByHandId[HAND_UUID_3], undefined);

  // Verify 50-ID cap drops IDs past the 50th unique valid UUID
  const saved52nd = savedHandsLib.buildClubArenaSavedHandRow({
    userId: HERO_ID,
    handRow: makeCompletedHandRow({ id: extraIds[51] }),
  });
  saved52nd.created_at = '2026-11-27T09:20:00.000Z';
  sb.savedRows.push(saved52nd);

  const capped = await callHandler({
    method: 'GET',
    query: { source: 'club-arena', handIds: extraIds.join(',') },
    userId: HERO_ID,
    supabase: sb,
  });
  assert.equal(capped.statusCode, 200);
  assert.equal(capped.body.savedByHandId[extraIds[51]], undefined, '52nd UUID is beyond 50-ID cap');

  // All-invalid handIds returns 400
  const invalidBatch = await callHandler({
    method: 'GET',
    query: { source: 'club-arena', handIds: 'bad-1,bad-2' },
    userId: HERO_ID,
    supabase: sb,
  });
  assert.equal(invalidBatch.statusCode, 400);
});

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 2: Cursor Pagination, Counts, and Structured Filters
// ═══════════════════════════════════════════════════════════════════════════
test('GET /api/poker/saved-hands supports cursor pagination, accurate counts, and structured filters/search', async () => {
  const makeSaved = ({
    id,
    createdAt,
    source = 'club-arena',
    tournamentId = null,
    position = 'BTN',
    heroCards = ['Ah', 'Kh'],
    board = ['As', '4s', '5s', '9c', '2h'],
    tableName = 'Diamond Table',
    status = 'saved',
    analysisState = 'not_analyzed',
    notes = '',
    tags = [],
  }) => ({
    id,
    hand_id: source === 'club-arena' ? `club-arena:${id}` : id,
    user_id: HERO_ID,
    player_ids: [HERO_ID],
    table_id: source === 'ai-scan' ? 'AI-Scan' : TABLE_UUID,
    club_id: null,
    hand_number: 100,
    variant: 'NLH',
    betting_structure: 'no_limit',
    small_blind: 1,
    big_blind: 2,
    pot_total: 80,
    winner_ids: [HERO_ID],
    started_at: createdAt,
    completed_at: createdAt,
    created_at: createdAt,
    hand_data: {
      source,
      sourceHandId: source === 'club-arena' ? id : null,
      tournamentId,
      tableName,
      heroPosition: position,
      heroCards,
      heroNet: 40,
      communityCards: board,
      boards: [{ index: 1, label: 'Board 1', cards: board }],
      players: [{ seatIndex: 1, name: 'You', position, stack: 200, netResult: 40, isHero: true, holeCards: heroCards }],
      review: {
        status,
        notes,
        tags,
        revision: 1,
        updatedAt: createdAt,
        analysisState,
        analyzedAt: analysisState === 'analyzed' ? createdAt : null,
        lastAuditSummary: null,
      },
    },
  });

  const rows = [
    makeSaved({
      id: HAND_UUID,
      createdAt: '2026-11-27T10:05:00.000Z',
      source: 'club-arena',
      tournamentId: 'mtt-1',
      position: 'BTN',
      heroCards: ['Ah', 'Kh'],
      board: ['Qs', 'Js', 'Ts'],
      tableName: 'Sunday Major Final',
      status: 'saved',
      notes: 'Bubble shove spot against tight blinds',
      tags: ['Bubble', '3-Bet Pot'],
    }),
    makeSaved({
      id: HAND_UUID_2,
      createdAt: '2026-11-27T10:04:00.000Z',
      source: 'club-arena',
      position: 'BB',
      heroCards: ['9d', '9c'],
      board: ['Kd', '7h', '2c', '9s', '3h'],
      tableName: 'Kings Cash',
      status: 'in_review',
      analysisState: 'analyzed',
      notes: 'River bluff-catch check-raise',
      tags: ['River Bluff-Catch'],
    }),
    makeSaved({
      id: HAND_UUID_3,
      createdAt: '2026-11-27T10:03:00.000Z',
      source: 'ai-scan',
      position: 'CO',
      heroCards: ['Ac', 'Qc'],
      board: ['Ad', '8c', '4c'],
      tableName: 'Bellagio 2/5',
      status: 'reviewed',
      notes: 'Clean nut flush draw barrel',
      tags: ['3-Bet Pot'],
    }),
    makeSaved({
      id: HAND_UUID_4,
      createdAt: '2026-11-27T10:02:00.000Z',
      source: 'manual',
      position: 'UTG',
      heroCards: ['Ks', 'Kd'],
      board: ['Jh', '6s', '2d'],
      tableName: 'Home Game',
      status: 'saved',
      notes: 'Slowplayed kings in bomb pot',
      tags: ['Bomb Pot'],
    }),
  ];

  const sb = createFakeSupabase({ savedRows: rows });

  // Page 1 (limit=2)
  const page1 = await callHandler({ method: 'GET', query: { limit: '2' }, userId: HERO_ID, supabase: sb });
  assert.equal(page1.statusCode, 200);
  assert.match(page1.headers['server-timing'], /^pa_saved_hands_list;dur=/);
  assert.equal(page1.body.totalCount, 4);
  assert.equal(page1.body.unreviewedCount, 2);
  assert.equal(page1.body.hands.length, 2);
  assert.deepEqual(page1.body.hands.map((h) => h.id), [HAND_UUID, HAND_UUID_2]);
  assert.ok(typeof page1.body.nextCursor === 'string' && page1.body.nextCursor.length > 0);

  // Page 2 via opaque base64url cursor
  const page2 = await callHandler({ method: 'GET', query: { limit: '2', cursor: page1.body.nextCursor }, userId: HERO_ID, supabase: sb });
  assert.equal(page2.statusCode, 200);
  assert.equal(page2.body.hands.length, 2);
  assert.deepEqual(page2.body.hands.map((h) => h.id), [HAND_UUID_3, HAND_UUID_4]);
  assert.equal(page2.body.nextCursor, null);

  // Raw ISO timestamp cursor (inclusive at equal ms so sibling rows sharing a timestamp are never skipped)
  const isoPage = await callHandler({ method: 'GET', query: { cursor: '2026-11-27T10:04:00.000Z' }, userId: HERO_ID, supabase: sb });
  assert.equal(isoPage.statusCode, 200);
  assert.deepEqual(isoPage.body.hands.map((h) => h.id), [HAND_UUID_2, HAND_UUID_3, HAND_UUID_4]);

  const isoStrictOlder = await callHandler({ method: 'GET', query: { cursor: '2026-11-27T10:03:59.999Z' }, userId: HERO_ID, supabase: sb });
  assert.equal(isoStrictOlder.statusCode, 200);
  assert.deepEqual(isoStrictOlder.body.hands.map((h) => h.id), [HAND_UUID_3, HAND_UUID_4]);

  // Malformed cursor -> 400
  const badCursor = await callHandler({ method: 'GET', query: { cursor: '!!!not-valid-cursor!!!' }, userId: HERO_ID, supabase: sb });
  assert.equal(badCursor.statusCode, 400);

  // Status filters
  const unreviewed = await callHandler({ method: 'GET', query: { status: 'unreviewed' }, userId: HERO_ID, supabase: sb });
  assert.deepEqual(unreviewed.body.hands.map((h) => h.id), [HAND_UUID, HAND_UUID_4]);
  assert.equal(unreviewed.body.totalCount, 2);
  assert.equal(unreviewed.body.unreviewedCount, 2);

  const analyzedOnly = await callHandler({ method: 'GET', query: { status: 'analyzed' }, userId: HERO_ID, supabase: sb });
  assert.deepEqual(analyzedOnly.body.hands.map((h) => h.id), [HAND_UUID_2]);

  // Format filter
  const mttOnly = await callHandler({ method: 'GET', query: { format: 'tournament' }, userId: HERO_ID, supabase: sb });
  assert.deepEqual(mttOnly.body.hands.map((h) => h.id), [HAND_UUID]);

  // Source filter
  const manualOnly = await callHandler({ method: 'GET', query: { source: 'manual' }, userId: HERO_ID, supabase: sb });
  assert.deepEqual(manualOnly.body.hands.map((h) => h.id), [HAND_UUID_4]);

  // Position filter
  const bbOnly = await callHandler({ method: 'GET', query: { position: 'bb' }, userId: HERO_ID, supabase: sb });
  assert.deepEqual(bbOnly.body.hands.map((h) => h.id), [HAND_UUID_2]);

  // Tag filter (case-insensitive)
  const tag3bet = await callHandler({ method: 'GET', query: { tag: '3-bet pot' }, userId: HERO_ID, supabase: sb });
  assert.deepEqual(tag3bet.body.hands.map((h) => h.id), [HAND_UUID, HAND_UUID_3]);

  // Search `q` across notes, hero hand class, board, tableName, and tags
  const qNote = await callHandler({ method: 'GET', query: { q: 'bluff-catch' }, userId: HERO_ID, supabase: sb });
  assert.deepEqual(qNote.body.hands.map((h) => h.id), [HAND_UUID_2]);

  const qHeroHandClass = await callHandler({ method: 'GET', query: { q: 'aks' }, userId: HERO_ID, supabase: sb });
  assert.deepEqual(qHeroHandClass.body.hands.map((h) => h.id), [HAND_UUID]);

  const qBoard = await callHandler({ method: 'GET', query: { q: 'Ad 8c 4c' }, userId: HERO_ID, supabase: sb });
  assert.deepEqual(qBoard.body.hands.map((h) => h.id), [HAND_UUID_3]);

  const qTable = await callHandler({ method: 'GET', query: { q: 'home game' }, userId: HERO_ID, supabase: sb });
  assert.deepEqual(qTable.body.hands.map((h) => h.id), [HAND_UUID_4]);
});

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 3: Suggested Hands To Review + Active-Play RTA Gate
// ═══════════════════════════════════════════════════════════════════════════
test('GET /api/poker/saved-hands?suggested=1 enforces active-play gate and ranks top 5 unsaved hands without hidden opponent cards', async () => {
  const alreadySaved = savedHandsLib.buildClubArenaSavedHandRow({
    userId: HERO_ID,
    handRow: makeCompletedHandRow({ id: HAND_UUID }),
  });

  const factRows = [
    // Already saved — MUST be excluded
    {
      hand_id: HAND_UUID,
      user_id: HERO_ID,
      table_id: TABLE_UUID,
      tournament_id: null,
      played_at: '2026-11-27T09:50:00.000Z',
      game_variant: 'nlh',
      big_blind: 2,
      position: 'BTN',
      hole_cards: ['Ah', 'Kh'],
      invested: 80,
      returned: 164,
      net: 84,
      net_bb: 42,
      was_all_in: true,
      went_to_showdown: true,
      won_at_showdown: true,
    },
    // Top candidate #1: All-in lost big showdown
    {
      hand_id: HAND_UUID_2,
      user_id: HERO_ID,
      table_id: TABLE_UUID,
      tournament_id: null,
      played_at: '2026-11-27T09:45:00.000Z',
      game_variant: 'nlh',
      big_blind: 2,
      position: 'BB',
      hole_cards: ['Ks', 'Kd'],
      invested: 200,
      returned: 0,
      net: -200,
      net_bb: -100,
      was_all_in: true,
      four_bet: true,
      went_to_showdown: true,
      won_at_showdown: false,
    },
    // Candidate #2: 3-bet pot tournament
    {
      hand_id: HAND_UUID_3,
      user_id: HERO_ID,
      table_id: TABLE_UUID,
      tournament_id: 'mtt-99',
      played_at: '2026-11-27T09:40:00.000Z',
      game_variant: 'nlh',
      big_blind: 100,
      position: 'CO',
      hole_cards: ['As', 'Qs'],
      invested: 3500,
      returned: 7400,
      net: 3900,
      net_bb: 39,
      three_bet: true,
      went_to_showdown: true,
      won_at_showdown: true,
    },
    // Candidates #3-#6 (testing cap at 5)
    {
      hand_id: HAND_UUID_4,
      user_id: HERO_ID,
      table_id: TABLE_UUID,
      tournament_id: null,
      played_at: '2026-11-27T09:35:00.000Z',
      game_variant: 'plo',
      big_blind: 2,
      position: 'SB',
      hole_cards: ['Ah', 'Ad', 'Kh', 'Qd'],
      invested: 60,
      returned: 120,
      net: 60,
      net_bb: 30,
      three_bet: true,
    },
    {
      hand_id: HAND_UUID_5,
      user_id: HERO_ID,
      table_id: TABLE_UUID,
      tournament_id: null,
      played_at: '2026-11-27T09:30:00.000Z',
      game_variant: 'nlh',
      big_blind: 2,
      position: 'UTG',
      hole_cards: ['Jd', 'Jc'],
      invested: 40,
      returned: 0,
      net: -40,
      net_bb: -20,
      faced_three_bet: true,
      went_to_showdown: true,
      won_at_showdown: false,
    },
    {
      hand_id: HAND_UUID_6,
      user_id: HERO_ID,
      table_id: TABLE_UUID,
      tournament_id: null,
      played_at: '2026-11-27T09:25:00.000Z',
      game_variant: 'nlh',
      big_blind: 2,
      position: 'HJ',
      hole_cards: ['Th', '9h'],
      invested: 24,
      returned: 50,
      net: 26,
      net_bb: 13,
      saw_flop: true,
    },
    {
      hand_id: HAND_UUID_7,
      user_id: HERO_ID,
      table_id: TABLE_UUID,
      tournament_id: null,
      played_at: '2026-11-27T09:20:00.000Z',
      game_variant: 'nlh',
      big_blind: 2,
      position: 'BTN',
      hole_cards: ['6c', '5c'],
      invested: 4,
      returned: 0,
      net: -4,
      net_bb: -2,
    },
  ];

  const historyRows = [
    makeCompletedHandRow({
      id: HAND_UUID_2,
      pot_size: 400,
      big_blind: 2,
      community_cards: ['Ac', '8d', '4s', '2h', '9c'],
      hole_cards: { [HERO_ID]: ['Ks', 'Kd'], [VILLAIN_HIDDEN_ID]: ['7c', '2s'] },
    }),
  ];

  // Case A: Active Club Arena seat blocks suggested hands
  const activeSb = createFakeSupabase({
    savedRows: [alreadySaved],
    factsRows: factRows,
    handHistoryRows: historyRows,
    tablesRows: [{ id: TABLE_UUID, name: 'Velvet Room 1/2' }],
    tableSeatsRows: [{ id: 'seat-1', table_id: TABLE_UUID, user_id: HERO_ID, left_at: null }],
  });

  const blocked = await callHandler({ method: 'GET', query: { suggested: '1' }, userId: HERO_ID, supabase: activeSb });
  assert.equal(blocked.statusCode, 200);
  assert.match(blocked.headers['server-timing'], /^pa_saved_hands_suggested;dur=/);
  assert.equal(blocked.body.success, true);
  assert.equal(blocked.body.activePlayRestricted, true);
  assert.deepEqual(blocked.body.suggested, []);
  assert.equal(blocked.body.message, 'Suggested Hands Appear After You Leave Your Active Table.');

  // Case B: Gate error fails closed
  const failClosed = await callHandler({
    method: 'GET',
    query: { suggested: '1' },
    userId: HERO_ID,
    supabase: activeSb,
    checkAccess: async () => { throw new Error('db unreachable'); },
  });
  assert.equal(failClosed.statusCode, 200);
  assert.equal(failClosed.body.activePlayRestricted, true);
  assert.deepEqual(failClosed.body.suggested, []);

  // Case C: Off-table returns top 5 unsaved hands ranked by biggest pot / notable decisions
  const offTableSb = createFakeSupabase({
    savedRows: [alreadySaved],
    factsRows: factRows,
    handHistoryRows: historyRows,
    tablesRows: [{ id: TABLE_UUID, name: 'Velvet Room 1/2' }],
    tableSeatsRows: [],
  });

  const ok = await callHandler({ method: 'GET', query: { suggested: '1' }, userId: HERO_ID, supabase: offTableSb });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.success, true);
  assert.equal(ok.body.activePlayRestricted, false);
  assert.equal(ok.body.suggested.length, 5);
  assert.ok(!ok.body.suggested.some((h) => h.handId === HAND_UUID), 'already-saved hand is excluded');

  const top = ok.body.suggested[0];
  assert.equal(top.handId, HAND_UUID_2);
  assert.equal(top.variant, 'NLH');
  assert.equal(top.format, 'cash');
  assert.equal(top.heroPosition, 'BB');
  assert.deepEqual(top.heroCards, ['Ks', 'Kd']);
  assert.deepEqual(top.board, ['Ac', '8d', '4s', '2h', '9c']);
  assert.equal(top.potBb, 200);
  assert.equal(top.netBb, -100);
  assert.equal(top.tableName, 'Velvet Room 1/2');
  assert.ok(typeof top.reason === 'string' && top.reason.length > 0);

  // Zero hidden opponent cards or opponent IDs in suggested payload
  const serialized = JSON.stringify(ok.body.suggested);
  assert.doesNotMatch(serialized, /7c/);
  assert.doesNotMatch(serialized, /2s/);
  assert.doesNotMatch(serialized, /FoldedVillain|ShownVillain/);
});

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 4: Active-Table RTA Gate on Review Analysis Requests (423 Locked)
// ═══════════════════════════════════════════════════════════════════════════
test('Active-table RTA gate locks review analysis with 423 while keeping completed-hand logging fast and allowed', async () => {
  const sb = createFakeSupabase({
    handHistoryRows: [makeCompletedHandRow()],
    tableSeatsRows: [{ id: 'seat-live', table_id: TABLE_UUID, user_id: HERO_ID, left_at: null }],
  });

  // Hand logging MUST remain fast and allowed even while seated at an active live table
  const logged = await callHandler({
    method: 'POST',
    body: { source: 'club-arena', handId: HAND_UUID },
    userId: HERO_ID,
    supabase: sb,
  });
  assert.equal(logged.statusCode, 201);
  const savedId = logged.body.hand.id;

  // Notes & tag updates remain allowed while seated
  const notesPatch = await callHandler({
    method: 'PATCH',
    body: { id: savedId, notes: 'Review after session', tags: ['3-Bet Pot'] },
    userId: HERO_ID,
    supabase: sb,
  });
  assert.equal(notesPatch.statusCode, 200);

  // GET ?analysisGate=1 returns 423 Locked
  const gateGet = await callHandler({ method: 'GET', query: { analysisGate: '1' }, userId: HERO_ID, supabase: sb });
  assert.equal(gateGet.statusCode, 423);
  assert.equal(gateGet.body.code, 'ACTIVE_PLAY_RESTRICTED');
  assert.equal(gateGet.body.activePlayRestricted, true);

  // POST { action: 'check_analysis_gate' } returns 423 Locked
  const gatePost = await callHandler({ method: 'POST', body: { action: 'check_analysis_gate' }, userId: HERO_ID, supabase: sb });
  assert.equal(gatePost.statusCode, 423);
  assert.equal(gatePost.body.code, 'ACTIVE_PLAY_RESTRICTED');

  // POST { action: 'request_analysis', id } returns 423 Locked
  const reqAnalysis = await callHandler({ method: 'POST', body: { action: 'request_analysis', id: savedId }, userId: HERO_ID, supabase: sb });
  assert.equal(reqAnalysis.statusCode, 423);
  assert.equal(reqAnalysis.body.code, 'ACTIVE_PLAY_RESTRICTED');

  // PATCH transitioning analysisState to 'analyzed' returns 423 Locked
  const patchAnalyzed = await callHandler({
    method: 'PATCH',
    body: { id: savedId, analysisState: 'analyzed' },
    userId: HERO_ID,
    supabase: sb,
  });
  assert.equal(patchAnalyzed.statusCode, 423);
  assert.equal(patchAnalyzed.body.code, 'ACTIVE_PLAY_RESTRICTED');

  // Leave the table -> analysis gate unlocks (200)
  sb.tableSeatsRows.length = 0;
  const gateOpen = await callHandler({ method: 'GET', query: { analysisGate: '1' }, userId: HERO_ID, supabase: sb });
  assert.equal(gateOpen.statusCode, 200);
  assert.equal(gateOpen.body.allowed, true);
  assert.equal(gateOpen.body.activePlayRestricted, false);

  const reqOpen = await callHandler({ method: 'POST', body: { action: 'request_analysis', id: savedId }, userId: HERO_ID, supabase: sb });
  assert.equal(reqOpen.statusCode, 200);
  assert.equal(reqOpen.body.allowed, true);
  assert.equal(reqOpen.body.hand.id, savedId);
});

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 5: Sanitization, Payload Guard, Probe Tracking, & Server-Timing
// ═══════════════════════════════════════════════════════════════════════════
test('Sanitizes tags, enforces note/payload limits, logs & throttles non-participant probes, and emits Server-Timing on DELETE', async () => {
  const sb = createFakeSupabase({ handHistoryRows: [makeCompletedHandRow()] });
  const created = await callHandler({ method: 'POST', body: { source: 'club-arena', handId: HAND_UUID }, userId: HERO_ID, supabase: sb });
  const savedId = created.body.hand.id;

  // Note > 4000 chars rejected with 400
  const longNote = await callHandler({
    method: 'PATCH',
    body: { id: savedId, notes: 'x'.repeat(4001) },
    userId: HERO_ID,
    supabase: sb,
  });
  assert.equal(longNote.statusCode, 400);

  // Oversized payload > 32KB rejected with 413
  const giantPayload = await callHandler({
    method: 'PATCH',
    body: { id: savedId, notes: 'ok', extraPadding: 'a'.repeat(40_000) },
    userId: HERO_ID,
    supabase: sb,
  });
  assert.equal(giantPayload.statusCode, 413);

  // Tag sanitization: strips illegal chars, trims, truncates to 32 chars, deduplicates case-insensitively, caps at 10
  const rawTags = [
    '  3-Bet   Pot!!  ',
    '3-bet pot',
    '<script>alert(1)</script>',
    'A'.repeat(50),
    'Tag 1', 'Tag 2', 'Tag 3', 'Tag 4', 'Tag 5', 'Tag 6', 'Tag 7', 'Tag 8', 'Tag 9', 'Tag 10',
  ];
  const patchedTags = await callHandler({
    method: 'PATCH',
    body: { id: savedId, tags: rawTags },
    userId: HERO_ID,
    supabase: sb,
  });
  assert.equal(patchedTags.statusCode, 200);
  const tags = patchedTags.body.hand.review.tags;
  assert.equal(tags.length, 10);
  assert.equal(tags[0], '3-Bet Pot');
  assert.equal(tags[1], 'scriptalert1script');
  assert.equal(tags[2], 'A'.repeat(32));
  assert.ok(tags.every((t) => /^[a-zA-Z0-9 -]{1,32}$/.test(t)));

  // Non-string tag rejected
  const badTags = await callHandler({
    method: 'PATCH',
    body: { id: savedId, tags: ['Valid', 123] },
    userId: HERO_ID,
    supabase: sb,
  });
  assert.equal(badTags.statusCode, 400);

  // Non-participant probe tracking + structured logs + sliding-window throttling
  const probeLogs = [];
  const sharedProbeStore = new Map();
  const attackerIp = '203.0.113.42';

  for (let i = 1; i <= 4; i++) {
    const res = await callHandler({
      method: 'POST',
      body: { source: 'club-arena', handId: HAND_UUID },
      userId: OUTSIDER_ID,
      supabase: sb,
      ip: attackerIp,
      probeStore: sharedProbeStore,
      probeBlockThreshold: 5,
      probeLogger: (...args) => probeLogs.push(args),
      nowMs: 1_700_000_000_000 + i * 1000,
    });
    assert.equal(res.statusCode, 404);
  }
  assert.equal(probeLogs.length, 4);
  assert.equal(probeLogs[0][0], '[saved-hands] non_participant_probe');
  const firstEvent = JSON.parse(probeLogs[0][1]);
  assert.equal(firstEvent.event, 'non_participant_probe');
  assert.equal(firstEvent.userId, OUTSIDER_ID);
  assert.equal(firstEvent.handId, HAND_UUID);
  assert.equal(firstEvent.probeCount, 1);
  assert.equal(firstEvent.throttled, false);

  // 5th probe triggers sliding-window rate-limit tightening (429 + Retry-After)
  const fifth = await callHandler({
    method: 'POST',
    body: { source: 'club-arena', handId: HAND_UUID },
    userId: OUTSIDER_ID,
    supabase: sb,
    ip: attackerIp,
    probeStore: sharedProbeStore,
    probeBlockThreshold: 5,
    probeLogger: (...args) => probeLogs.push(args),
    nowMs: 1_700_000_005_000,
  });
  assert.equal(fifth.statusCode, 429);
  assert.equal(fifth.body.code, 'PROBE_RATE_LIMITED');
  assert.ok(Number(fifth.headers['retry-after']) >= 1);
  assert.equal(JSON.parse(probeLogs[4][1]).throttled, true);

  // DELETE emits pa_saved_hands_delete Server-Timing
  const del = await callHandler({ method: 'DELETE', query: { id: savedId }, userId: HERO_ID, supabase: sb });
  assert.equal(del.statusCode, 200);
  assert.equal(del.body.deletedId, savedId);
  assert.match(del.headers['server-timing'], /^pa_saved_hands_delete;dur=/);
});

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 6: Portable Export (JSON & Text)
// ═══════════════════════════════════════════════════════════════════════════
test('GET /api/poker/saved-hands?export=json|text downloads caller-owned hands with notes and zero hidden opponent cards', async () => {
  const sb = createFakeSupabase({
    handHistoryRows: [makeCompletedHandRow()],
    tablesRows: [{ id: TABLE_UUID, name: 'Kings High Stakes', club_id: 'club-1' }],
  });

  const saved = await callHandler({ method: 'POST', body: { source: 'club-arena', handId: HAND_UUID }, userId: HERO_ID, supabase: sb });
  await callHandler({
    method: 'PATCH',
    body: { id: saved.body.hand.id, notes: 'My private solver note', tags: ['3-Bet Pot', 'Multi-Board'] },
    userId: HERO_ID,
    supabase: sb,
  });

  // Add another user's saved hand to confirm owner isolation in exports
  const otherRow = savedHandsLib.buildClubArenaSavedHandRow({
    userId: VILLAIN_SHOWN_ID,
    handRow: makeCompletedHandRow({ id: HAND_UUID_2 }),
  });
  otherRow.hand_data.review.notes = 'SECRET OTHER USER NOTE';
  sb.savedRows.push(otherRow);

  // JSON export
  const jsonRes = await callHandler({ method: 'GET', query: { export: 'json' }, userId: HERO_ID, supabase: sb });
  assert.equal(jsonRes.statusCode, 200);
  assert.equal(jsonRes.headers['content-disposition'], 'attachment; filename="smarter-poker-saved-hands.json"');
  assert.equal(jsonRes.headers['cache-control'], 'private, no-store, max-age=0');
  assert.equal(jsonRes.headers['vary'], 'Authorization');
  assert.match(jsonRes.headers['server-timing'], /^pa_saved_hands_export;dur=/);
  assert.equal(jsonRes.body.schemaVersion, 1);
  assert.equal(jsonRes.body.count, 1);
  assert.equal(jsonRes.body.hands[0].review.notes, 'My private solver note');
  assert.deepEqual(jsonRes.body.hands[0].review.tags, ['3-Bet Pot', 'Multi-Board']);
  assert.doesNotMatch(JSON.stringify(jsonRes.body), /SECRET OTHER USER NOTE|"7s"|"2d"/);

  // Text export
  const textRes = await callHandler({ method: 'GET', query: { export: 'text' }, userId: HERO_ID, supabase: sb });
  assert.equal(textRes.statusCode, 200);
  assert.equal(textRes.headers['content-disposition'], 'attachment; filename="smarter-poker-saved-hands.txt"');
  assert.equal(textRes.headers['cache-control'], 'private, no-store, max-age=0');
  assert.equal(textRes.headers['vary'], 'Authorization');
  assert.match(textRes.headers['server-timing'], /^pa_saved_hands_export;dur=/);
  assert.match(textRes.text, /Smarter\.Poker Hand #482: NLH \(1\/2\)/);
  assert.match(textRes.text, /Dealt to Hero \[Ah Kh\]/);
  assert.match(textRes.text, /Notes: My private solver note/);
  assert.match(textRes.text, /Tags: 3-Bet Pot, Multi-Board/);
  assert.doesNotMatch(textRes.text, /7s|2d|SECRET OTHER USER NOTE/);

  // Invalid export format rejected with 400
  const badExport = await callHandler({ method: 'GET', query: { export: 'xml' }, userId: HERO_ID, supabase: sb });
  assert.equal(badExport.statusCode, 400);
});

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 7: Privacy-Safe Share Helper (`anonymizeHandForShare`)
// ═══════════════════════════════════════════════════════════════════════════
test('anonymizeHandForShare strips opponent PII, UUIDs, club/table identifiers, hidden cards, and private notes by default', () => {
  const row = savedHandsLib.buildClubArenaSavedHandRow({
    userId: HERO_ID,
    handRow: makeCompletedHandRow(),
    tableName: 'Secret Private VIP Club #7',
    clubId: '55555555-5555-4555-8555-555555555555',
  });
  row.hand_data.review.notes = 'Exploit ShownVillain because he overfolds rivers';
  row.hand_data.review.tags = ['3-Bet Pot', 'Multi-Board'];
  // Inject a leaked hidden opponent card into raw players to verify defense-in-depth stripping
  const folded = row.hand_data.players.find((p) => p.name === 'FoldedVillain');
  folded.holeCards = ['7s', '2d'];

  const decorated = routeCore.decorateSavedRow(row);
  const shared = shareLib.anonymizeHandForShare(decorated);

  // Verify sharePath matches `/share/hand?...` contract
  assert.match(shared.sharePath, /^\/share\/hand\?/);
  const urlObj = new URL(`https://smarter.poker${shared.sharePath}`);
  assert.equal(urlObj.searchParams.get('view'), 'review');
  assert.equal(urlObj.searchParams.get('anon'), '1');
  assert.equal(urlObj.searchParams.get('hero'), 'Ah,Kh');
  assert.equal(urlObj.searchParams.get('board'), 'As,4s,5s,9c,2h');
  assert.equal(urlObj.searchParams.get('position'), 'BTN');
  assert.equal(urlObj.searchParams.get('stakes'), '1/2');
  assert.equal(urlObj.searchParams.get('venue'), 'Cash');

  // Verify ZERO PII, UUIDs, club/table names, hidden cards, or private notes in default output
  const fullSerialized = JSON.stringify(shared);
  for (const forbidden of [
    'HeroPlayer',
    'ShownVillain',
    'FoldedVillain',
    'Secret Private VIP Club',
    HERO_ID,
    VILLAIN_SHOWN_ID,
    VILLAIN_HIDDEN_ID,
    HAND_UUID,
    TABLE_UUID,
    row.id,
    '55555555-5555-4555-8555-555555555555',
    '7s',
    '2d',
    'Exploit ShownVillain',
  ]) {
    assert.ok(!fullSerialized.includes(forbidden), `must not leak forbidden token: ${forbidden}`);
  }

  assert.equal(shared.anonymizedHand.notes, null);
  assert.deepEqual(shared.anonymizedHand.players.map((p) => p.label), ['Hero', 'Villain 1', 'Villain 2']);
  assert.deepEqual(shared.anonymizedHand.players[1].holeCards, ['Qd', 'Qc']);
  assert.deepEqual(shared.anonymizedHand.players[2].holeCards, []);
  assert.match(shared.summaryText, /Hero Cards: Ah Kh/);
  assert.match(shared.summaryText, /Villain 1/);
  assert.doesNotMatch(shared.summaryText, /Notes:/);

  // When includeNotes: true is explicitly requested, notes are included in anonymizedHand + summaryText
  // with opponent names and UUIDs scrubbed (and still never placed in the share URL!)
  const withNotes = shareLib.anonymizeHandForShare(decorated, { includeNotes: true, origin: 'https://smarter.poker' });
  assert.equal(withNotes.anonymizedHand.notes, 'Exploit Villain 1 because he overfolds rivers');
  assert.match(withNotes.summaryText, /Notes: Exploit Villain 1 because he overfolds rivers/);
  assert.doesNotMatch(withNotes.summaryText, /ShownVillain/);
  assert.ok(withNotes.shareUrl.startsWith('https://smarter.poker/share/hand?'));
  assert.ok(!withNotes.shareUrl.includes('Exploit'), 'private notes must never be placed in share URL');
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
