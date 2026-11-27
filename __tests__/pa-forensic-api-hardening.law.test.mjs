/**
 * PERSONAL ASSISTANT — FORENSIC API, SCHEMA, CORS, SHARE & SECURITY HARDENING LAWS
 * ─────────────────────────────────────────────────────────────────────────
 * Permanent anti-regression laws pinning every verified P0/P1/P2 finding:
 *
 *   LAW 1: Real Club Arena engine `hand_history` (`summary: null`) + `ca_hand_facts`
 *          schema alignment (exact column names verified against migrations,
 *          top-level winners/winners_by_board/showdown/hole_cards merging,
 *          seat-only action fallback, strict stripping of mucked/folded/hidden cards,
 *          and `console.warn` observability on non-fatal lookup errors).
 *   LAW 2: `public.hand_histories` RLS privacy boundary (`club_id === null`).
 *   LAW 3: Native Capacitor CORS & OPTIONS preflight for `/api/poker/saved-hands`.
 *   LAW 4: PLO4/5/6/Pineapple hole cards on `/share/hand` & `/api/og/hand-card`,
 *          plus UUID & opponent-name scrubbing when `includeNotes: true`.
 *   LAW 5: Cursor pagination with nullable `created_at` and equal-millisecond
 *          sibling preservation on raw ISO & opaque cursors.
 *   LAW 6: Pre-DB probe throttling across all 5 hand-lookup endpoints (0 DB queries).
 *   LAW 7: Active-play RTA 5-minute post-session cooldown (`limited_review` -> 423)
 *          while completed-hand logging stays allowed at the table.
 *   LAW 8: Legacy/corrupt `revision: 0` PATCH recovery (no 409 deadlock),
 *          `ALLOWED_LIST_STATUSES` live usage, and `bodyParser.sizeLimit = '64kb'`.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { compareFixtureValues, matchesFixtureOr, compareFixtureOrders } from './helpers/saved-hand-query-fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const savedHandsLib = await import(pathToFileURL(path.join(ROOT, 'src/lib/personal-assistant/savedHands.mjs')).href);
const routeCore = await import(pathToFileURL(path.join(ROOT, 'src/lib/personal-assistant/savedHandsRouteCore.mjs')).href);
const shareLib = await import(pathToFileURL(path.join(ROOT, 'src/lib/personal-assistant/anonymizeHandForShare.mjs')).href);

const HERO_ID = '11111111-1111-4111-8111-111111111111';
const VILLAIN_SHOWN_ID = '22222222-2222-4222-8222-222222222222';
const VILLAIN_MUCKED_ID = '33333333-3333-4333-8333-333333333333';
const VILLAIN_FOLDED_ID = '44444444-4444-4444-8444-444444444444';
const OUTSIDER_ID = '55555555-5555-4555-8555-555555555555';
const HAND_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HAND_UUID_2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
const HAND_UUID_3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac';
const HAND_UUID_4 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad';
const TABLE_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CLUB_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function createInstrumentedSupabase({
  handHistoryRows = [],
  factsRows = [],
  tablesRows = [],
  savedRows: initialSavedRows = [],
  pokerSessionsRows = [],
  tableSeatsRows = [],
  tableErrors = {},
  throwTables = {},
} = {}) {
  const savedRows = initialSavedRows.map((r) => structuredClone(r));
  const queryLog = [];

  const matchesFilters = (row, filters) => filters.every((f) => {
    if (f.type === 'or') return matchesFixtureOr(row, f.expression);
    if (f.type === 'lte') return row[f.col] !== null && row[f.col] !== undefined && compareFixtureValues(row[f.col], f.val) <= 0;
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

  const from = (tableName) => {
    const entry = { table: tableName, mode: 'select', selectCols: null };
    queryLog.push(entry);

    const state = {
      filters: [],
      mode: 'select',
      payload: null,
      orders: [],
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
      if (throwTables[tableName]) {
        throw new Error(throwTables[tableName]);
      }
      if (tableErrors[tableName]) {
        return { data: null, error: tableErrors[tableName] };
      }
      const list = sourceList();
      if (state.mode === 'insert') {
        const row = structuredClone(state.payload);
        if (!Object.prototype.hasOwnProperty.call(row, 'created_at')) {
          row.created_at = new Date().toISOString();
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
      if (state.orders.length) rows.sort((a, b) => compareFixtureOrders(a, b, state.orders));
      if (state.limitN) rows = rows.slice(0, state.limitN);
      return { data: singleMode ? (rows[0] || null) : rows, error: null };
    };

    const api = {
      select(cols) { entry.selectCols = cols; return api; },
      insert(payload) { state.mode = 'insert'; entry.mode = 'insert'; state.payload = payload; return api; },
      update(payload) { state.mode = 'update'; entry.mode = 'update'; state.payload = payload; return api; },
      delete() { state.mode = 'delete'; entry.mode = 'delete'; return api; },
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
      or(expression) { state.filters.push({ type: 'or', expression }); return api; },
      lte(col, val) { state.filters.push({ type: 'lte', col, val }); return api; },
      order(col, opts) { state.orders.push({ col, descending: opts?.ascending === false }); return api; },
      limit(n) { state.limitN = n; return api; },
      maybeSingle() { return execute(true); },
      then(resolve, reject) { return execute(false).then(resolve, reject); },
    };
    return api;
  };

  return { savedRows, queryLog, from };
}

async function callHandler({
  method = 'GET',
  query = {},
  body = undefined,
  userId = HERO_ID,
  supabase,
  ip = '198.51.100.10',
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
    headers: { 'x-forwarded-for': ip },
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

// ═══════════════════════════════════════════════════════════════════════════
// LAW 1: Real Club Arena Engine Schema Alignment (`summary: null`) + `ca_hand_facts`
// ═══════════════════════════════════════════════════════════════════════════
test('LAW 1: real Club Arena engine hand_history (summary: null) + ca_hand_facts populates financials, showdown, seat-only actions, and strips hidden cards', async () => {
  // Verify select column list pins real engine top-level columns.
  const selectCols = savedHandsLib.CLUB_ARENA_SOURCE_HAND_SELECT.split(',').map((s) => s.trim());
  assert.ok(selectCols.includes('winners'), 'CLUB_ARENA_SOURCE_HAND_SELECT must include winners');
  assert.ok(selectCols.includes('winners_by_board'), 'CLUB_ARENA_SOURCE_HAND_SELECT must include winners_by_board');
  assert.ok(selectCols.includes('showdown'), 'CLUB_ARENA_SOURCE_HAND_SELECT must include showdown');

  // Verify ca_hand_facts query selects ONLY columns that exist in the canonical migration.
  const factsMigration = read('supabase/migrations/20260831094000_version_private_club_arena_hand_facts.sql');
  const routeCoreSrc = read('src/lib/personal-assistant/savedHandsRouteCore.mjs');
  const heroSelectMatch = routeCoreSrc.match(/const HERO_HAND_FACT_SELECT\s*=\s*\[([\s\S]*?)\]\.join/);
  assert.ok(heroSelectMatch, 'HERO_HAND_FACT_SELECT must be defined');
  const factSelectCols = [...heroSelectMatch[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(
    factSelectCols,
    ['hole_cards', 'position', 'invested', 'returned', 'net', 'net_bb', 'went_to_showdown', 'won_at_showdown'],
  );
  for (const col of factSelectCols) {
    assert.match(factsMigration, new RegExp(`\\b${col}\\b`), `ca_hand_facts migration must contain column ${col}`);
  }

  // Real Club Arena engine row shape: summary is null, players lack position/net/won,
  // actions omit userId (seat-only), showdown uses { user_id, seat, mucked }, hole_cards uses { rank, suit }[].
  const realEngineHandRow = {
    id: HAND_UUID,
    hand_number: 9912,
    table_id: TABLE_UUID,
    tournament_id: null,
    game_variant: 'nlh',
    small_blind: 5,
    big_blind: 10,
    pot_size: 420,
    button_seat: 1,
    players: [
      { userId: HERO_ID, username: 'RealHero', seat: 1, stack: 1000, cards: [] },
      { userId: VILLAIN_SHOWN_ID, username: 'ShowdownShark', seat: 2, stack: 1000, cards: [] },
      { userId: VILLAIN_MUCKED_ID, username: 'MuckedNit', seat: 3, stack: 1000, cards: ['9s', '8s'] },
      { userId: VILLAIN_FOLDED_ID, username: 'FoldedFish', seat: 4, stack: 1000, cards: ['7d', '2c'] },
    ],
    hole_cards: {
      [HERO_ID]: [{ rank: 'A', suit: 's' }, { rank: 'K', suit: 's' }],
      [VILLAIN_SHOWN_ID]: [{ rank: 'Q', suit: 'd' }, { rank: 'Q', suit: 'c' }],
      [VILLAIN_MUCKED_ID]: [{ rank: '9', suit: 's' }, { rank: '8', suit: 's' }],
      [VILLAIN_FOLDED_ID]: [{ rank: '7', suit: 'd' }, { rank: '2', suit: 'c' }],
    },
    community_cards: ['As', '7h', '3s', 'Jc', '2s'],
    community_cards2: ['As', '7h', '3s', 'Qd', '4h'],
    rit_boards: [['As', '7h', '3s', 'Qd', '4h']],
    bomb_pot: null,
    kill_pot: false,
    actions: [
      // Seat-only actions (engine omits optional userId)
      { seat: 4, action: 'fold', stage: 'preflop' },
      { seat: 1, action: 'raise', amount: 30, stage: 'preflop' },
      { seat: 2, action: 'call', amount: 30, stage: 'preflop' },
      { seat: 3, action: 'call', amount: 30, stage: 'preflop' },
      { seat: 1, action: 'allin', amount: 180, stage: 'flop' },
      { seat: 2, action: 'call', amount: 180, stage: 'flop' },
      { seat: 3, action: 'call', amount: 180, stage: 'flop' },
    ],
    winners: [
      { userId: HERO_ID, amount: 210, potIndex: 0, hand: { name: 'Ace High Flush', ranking: 6 } },
      { userId: VILLAIN_SHOWN_ID, amount: 210, potIndex: 0, hand: { name: 'Three of a Kind, Queens', ranking: 4 } },
    ],
    winners_by_board: [
      { board: 1, userId: HERO_ID, amount: 210, handName: 'Ace High Flush', low: false },
      { board: 2, userId: VILLAIN_SHOWN_ID, amount: 210, handName: 'Three of a Kind, Queens', low: false },
    ],
    showdown: [
      { user_id: HERO_ID, seat: 1, reveal_order: 1, mucked: false, hand_name: 'Ace High Flush' },
      { user_id: VILLAIN_SHOWN_ID, seat: 2, reveal_order: 2, mucked: false, hand_name: 'Three of a Kind, Queens' },
      { user_id: VILLAIN_MUCKED_ID, seat: 3, reveal_order: 3, mucked: true },
    ],
    summary: null,
    source: 'club_arena',
    created_at: '2026-11-27T11:00:00.000Z',
  };

  const heroFact = {
    hand_id: HAND_UUID,
    user_id: HERO_ID,
    hole_cards: ['As', 'Ks'],
    position: 'BTN',
    invested: 210,
    returned: 210,
    net: 0,
    net_bb: 0,
    went_to_showdown: true,
    won_at_showdown: true,
  };

  const sb = createInstrumentedSupabase({
    handHistoryRows: [realEngineHandRow],
    factsRows: [heroFact],
    tablesRows: [{ id: TABLE_UUID, name: 'High Roller NLH', club_id: CLUB_UUID }],
  });

  const res = await callHandler({
    method: 'POST',
    body: { source: 'club-arena', handId: HAND_UUID },
    userId: HERO_ID,
    supabase: sb,
  });

  assert.equal(res.statusCode, 201);
  const saved = res.body.hand;
  const hd = saved.hand_data;

  // Verify financials & metadata merged from top-level engine columns + ca_hand_facts
  assert.equal(hd.heroPosition, 'BTN');
  assert.equal(hd.heroNet, 0);
  assert.equal(hd.won, 210);
  assert.equal(hd.invested, 210);
  assert.equal(hd.wentToShowdown, true);
  assert.equal(hd.wonAtShowdown, true);
  assert.deepEqual(saved.winner_ids, [HERO_ID]);
  assert.deepEqual(hd.heroCards, ['As', 'Ks']);

  assert.equal(hd.winners.length, 2);
  assert.deepEqual(hd.winners[0], { playerName: 'RealHero', amount: 210, hand: 'Ace High Flush', isHero: true });
  assert.deepEqual(hd.winners[1], { playerName: 'ShowdownShark', amount: 210, hand: 'Three of a Kind, Queens', isHero: false });

  assert.equal(hd.winnersByBoard.length, 2);
  assert.equal(hd.winnersByBoard[0].board, 1);
  assert.equal(hd.winnersByBoard[0].isHero, true);
  assert.equal(hd.winnersByBoard[0].hand, 'Ace High Flush');
  assert.equal(hd.winnersByBoard[1].board, 2);
  assert.equal(hd.winnersByBoard[1].playerName, 'ShowdownShark');

  // Verify seat-only action fallback resolved isHero, playerName, and Hero's position
  const preflop = hd.streets.find((s) => s.name === 'preflop');
  assert.ok(preflop, 'preflop street must exist');
  const heroRaise = preflop.actions.find((a) => a.action === 'raise');
  assert.equal(heroRaise.isHero, true);
  assert.equal(heroRaise.playerName, 'RealHero');
  assert.equal(heroRaise.position, 'BTN');
  const fishFold = preflop.actions.find((a) => a.action === 'fold');
  assert.equal(fishFold.isHero, false);
  assert.equal(fishFold.playerName, 'FoldedFish');

  // Verify legitimately showdown-revealed opponent cards are preserved
  const shownOpp = hd.players.find((p) => p.name === 'ShowdownShark');
  assert.equal(shownOpp.showedCards, true);
  assert.equal(shownOpp.cardsVisibility, 'shown');
  assert.deepEqual(shownOpp.holeCards, ['Qd', 'Qc']);

  // Verify mucked AND seat-only-folded opponent cards are strictly stripped
  const muckedOpp = hd.players.find((p) => p.name === 'MuckedNit');
  assert.equal(muckedOpp.mucked, true);
  assert.equal(muckedOpp.cardsVisibility, 'hidden');
  assert.deepEqual(muckedOpp.holeCards, []);

  const foldedOpp = hd.players.find((p) => p.name === 'FoldedFish');
  assert.equal(foldedOpp.folded, true);
  assert.equal(foldedOpp.cardsVisibility, 'hidden');
  assert.deepEqual(foldedOpp.holeCards, []);

  const serialized = JSON.stringify(hd);
  assert.doesNotMatch(serialized, /"9s"|"8s"|"7d"|"2c"/);

  // Verify non-showdown hand strictly strips opponent cards even if present in players[].cards
  // (including when the opponent WON uncontested without folding!)
  const nonShowdownHand = {
    ...realEngineHandRow,
    id: HAND_UUID_2,
    community_cards: [],
    community_cards2: null,
    rit_boards: null,
    showdown: null,
    hole_cards: { [HERO_ID]: ['Ah', 'Ad'], [VILLAIN_SHOWN_ID]: ['6c', '5d'] },
    winners: [{ userId: VILLAIN_SHOWN_ID, amount: 30 }],
    winners_by_board: null,
    actions: [
      { seat: 2, action: 'raise', amount: 30, stage: 'preflop' },
      { seat: 1, action: 'fold', stage: 'preflop' },
    ],
    players: [
      { userId: HERO_ID, username: 'RealHero', seat: 1, stack: 1000, cards: ['Ah', 'Ad'] },
      { userId: VILLAIN_SHOWN_ID, username: 'ShowdownShark', seat: 2, stack: 1000, cards: ['6c', '5d'] },
    ],
  };
  const builtNoShowdown = savedHandsLib.buildClubArenaSavedHandRow({
    userId: HERO_ID,
    handRow: nonShowdownHand,
    heroFactRow: { hole_cards: ['Ah', 'Ad'], position: 'CO', invested: 10, returned: 0, net: -10, went_to_showdown: false, won_at_showdown: false },
  });
  assert.equal(builtNoShowdown.hand_data.wentToShowdown, false);
  assert.equal(builtNoShowdown.hand_data.heroNet, -10);
  assert.equal(builtNoShowdown.hand_data.heroPosition, 'CO');
  assert.equal(builtNoShowdown.hand_data.heroCardsVisibility, 'private_hero');
  assert.deepEqual(builtNoShowdown.winner_ids, []);
  const uncontestedWinner = builtNoShowdown.hand_data.players.find((p) => p.name === 'ShowdownShark');
  assert.deepEqual(uncontestedWinner.holeCards, [], 'uncontested non-showdown winner cards must stay strictly hidden');
  assert.equal(uncontestedWinner.cardsVisibility, 'hidden');
  assert.doesNotMatch(JSON.stringify(builtNoShowdown.hand_data), /"6c"|"5d"/);
});

test('LAW 1b: non-fatal lookup errors (factErr, tableErr, histErr, tblErr, throws) emit console.warn instead of silently swallowing', async () => {
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const sbErrs = createInstrumentedSupabase({
      handHistoryRows: [{
        id: HAND_UUID,
        hand_number: 5,
        table_id: TABLE_UUID,
        players: [{ userId: HERO_ID, username: 'Hero', seat: 1, stack: 100 }],
        actions: [],
        summary: null,
        created_at: '2026-11-27T11:00:00.000Z',
      }],
      tableErrors: {
        ca_hand_facts: { message: 'simulated factErr' },
        tables: { message: 'simulated tableErr' },
      },
    });
    const saveRes = await callHandler({
      method: 'POST',
      body: { source: 'club-arena', handId: HAND_UUID },
      userId: HERO_ID,
      supabase: sbErrs,
    });
    assert.equal(saveRes.statusCode, 201);
    assert.ok(warnings.some((w) => w.includes('simulated factErr')), 'factErr must be logged via console.warn');
    assert.ok(warnings.some((w) => w.includes('simulated tableErr')), 'tableErr must be logged via console.warn');

    warnings.length = 0;
    const sbSuggestedErrs = createInstrumentedSupabase({
      factsRows: [{
        hand_id: HAND_UUID_2,
        user_id: HERO_ID,
        table_id: TABLE_UUID,
        played_at: '2026-11-27T10:00:00.000Z',
        game_variant: 'nlh',
        big_blind: 2,
        position: 'BTN',
        hole_cards: ['Ah', 'Kh'],
        invested: 40,
        returned: 0,
        net: -40,
        net_bb: -20,
        was_all_in: true,
      }],
      tableErrors: {
        hand_history: { message: 'simulated histErr' },
        tables: { message: 'simulated tblErr' },
      },
    });
    const sugRes = await callHandler({
      method: 'GET',
      query: { suggested: '1' },
      userId: HERO_ID,
      supabase: sbSuggestedErrs,
      checkAccess: async () => ({ allowed: true, contextState: 'training_mode', accessLevel: 'full_access' }),
    });
    assert.equal(sugRes.statusCode, 200);
    assert.ok(warnings.some((w) => w.includes('simulated histErr')), 'histErr must be logged via console.warn');
    assert.ok(warnings.some((w) => w.includes('simulated tblErr')), 'tblErr must be logged via console.warn');
  } finally {
    console.warn = origWarn;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LAW 2: `public.hand_histories` RLS Privacy Leak Prevention (`club_id: null`)
// ═══════════════════════════════════════════════════════════════════════════
test('LAW 2: private saved Club Arena rows ALWAYS write club_id: null on public.hand_histories', async () => {
  const row = savedHandsLib.buildClubArenaSavedHandRow({
    userId: HERO_ID,
    handRow: {
      id: HAND_UUID,
      hand_number: 10,
      table_id: TABLE_UUID,
      players: [{ userId: HERO_ID, username: 'Hero', seat: 1, stack: 100 }],
      summary: { clubId: CLUB_UUID },
      created_at: '2026-11-27T11:00:00.000Z',
    },
    clubId: CLUB_UUID,
  });

  assert.equal(row.club_id, null, 'top-level club_id MUST be null to block legacy club-admin RLS');
  assert.equal(row.hand_data.clubId, CLUB_UUID, 'clubId remains scoped inside owner-only hand_data');

  const sb = createInstrumentedSupabase({
    handHistoryRows: [{
      id: HAND_UUID,
      hand_number: 10,
      table_id: TABLE_UUID,
      players: [{ userId: HERO_ID, username: 'Hero', seat: 1, stack: 100 }],
      summary: null,
      created_at: '2026-11-27T11:00:00.000Z',
    }],
    tablesRows: [{ id: TABLE_UUID, name: 'VIP Club Table', club_id: CLUB_UUID }],
  });

  const res = await callHandler({
    method: 'POST',
    body: { source: 'club-arena', handId: HAND_UUID },
    userId: HERO_ID,
    supabase: sb,
  });
  assert.equal(res.statusCode, 201);
  assert.equal(sb.savedRows[0].club_id, null, 'persisted hand_histories row must have club_id: null');
});

// ═══════════════════════════════════════════════════════════════════════════
// LAW 3: Native Capacitor CORS / OPTIONS for `/api/poker/saved-hands`
// ═══════════════════════════════════════════════════════════════════════════
test('LAW 3: middleware.ts covers /api/poker/saved-hands for Capacitor iOS & Android CORS preflight and matcher', () => {
  const mw = read('middleware.ts');
  const prefixesBlock = mw.slice(
    mw.indexOf('const NATIVE_APP_API_PREFIXES'),
    mw.indexOf('function isNativeAppApiPath'),
  );
  const matcherBlock = mw.slice(mw.indexOf('matcher: ['));

  assert.ok(prefixesBlock.includes("'/api/poker/saved-hands',"), '/api/poker/saved-hands in NATIVE_APP_API_PREFIXES');
  assert.ok(matcherBlock.includes("'/api/poker/saved-hands',"), '/api/poker/saved-hands in config.matcher');
  assert.match(mw, /NATIVE_APP_ORIGINS = new Set\(\['capacitor:\/\/localhost', 'https:\/\/localhost'\]\)/);
  assert.match(mw, /Access-Control-Allow-Methods',\s*'GET, POST, PUT, PATCH, DELETE, OPTIONS'/);
  assert.match(mw, /request\.method === 'OPTIONS'/);
  assert.match(mw, /new NextResponse\(null,\s*\{\s*status:\s*204\s*\}\)/);
});

// ═══════════════════════════════════════════════════════════════════════════
// LAW 4: PLO4/5/6/Pineapple Hole Cards on Share/OG + Note Scrubbing
// ═══════════════════════════════════════════════════════════════════════════
test('LAW 4: PLO4/5/6/Pineapple hero cards survive share URL, /share/hand, and /api/og/hand-card; includeNotes scrubs UUIDs & opponent names', () => {
  // 4, 5, and 6 hero cards preserved by anonymizeHandForShare
  for (const [variant, cards] of [
    ['PLO', ['Ah', 'Ad', 'Kh', 'Qd']],
    ['PLO5', ['Ah', 'Ad', 'Kh', 'Qd', 'Jc']],
    ['PLO6', ['Ah', 'Ad', 'Kh', 'Qd', 'Jc', 'Ts']],
  ]) {
    const shared = shareLib.anonymizeHandForShare({
      variant,
      small_blind: 5,
      big_blind: 10,
      pot_total: 240,
      hand_data: {
        heroPosition: 'BTN',
        heroCards: cards,
        heroNet: 120,
        communityCards: ['Qh', 'Jh', '2c', '5d', '9s'],
        players: [
          { seatIndex: 1, name: 'HeroUser', position: 'BTN', isHero: true, holeCards: cards },
          { seatIndex: 2, name: 'RiverBluffer99', position: 'BB', isHero: false, holeCards: [] },
        ],
        review: {
          notes: `Exploit RiverBluffer99 (id ${VILLAIN_SHOWN_ID}) on hand ${HAND_UUID}; RiverBluffer99 overbluffs paired boards`,
          tags: ['PLO'],
        },
      },
    }, { includeNotes: true });

    assert.deepEqual(shared.anonymizedHand.heroCards, cards, `${variant} must keep all ${cards.length} hero cards`);
    const urlObj = new URL(`https://smarter.poker${shared.sharePath}`);
    assert.equal(urlObj.searchParams.get('hero'), cards.join(','), `${variant} share URL preserves all ${cards.length} cards`);

    // Note scrubbing when includeNotes: true
    assert.doesNotMatch(shared.anonymizedHand.notes, new RegExp(VILLAIN_SHOWN_ID, 'i'));
    assert.doesNotMatch(shared.anonymizedHand.notes, new RegExp(HAND_UUID, 'i'));
    assert.doesNotMatch(shared.anonymizedHand.notes, /RiverBluffer99/i);
    assert.match(shared.anonymizedHand.notes, /Villain 1/);
    assert.doesNotMatch(shared.summaryText, /RiverBluffer99/i);
    assert.doesNotMatch(shared.summaryText, new RegExp(VILLAIN_SHOWN_ID, 'i'));
    assert.doesNotMatch(shared.summaryText, new RegExp(HAND_UUID, 'i'));
    assert.match(shared.summaryText, /Notes: Exploit Villain 1/);
    assert.ok(!shared.shareUrl.includes('Exploit'), 'notes never enter share URL');
  }

  // Verify pages/share/hand.js accepts 2..6 hero cards in review & standard modes
  const sharePageSrc = read('pages/share/hand.js');
  assert.match(sharePageSrc, /reviewCardList\(hero,\s*6\)/);
  assert.match(sharePageSrc, /cleanHeroList\.length\s*>=\s*2\s*&&\s*cleanHeroList\.length\s*<=\s*6/);
  assert.doesNotMatch(sharePageSrc, /reviewCardList\(hero,\s*2\)/, 'must not truncate review hero cards to 2');

  // Verify pages/api/og/hand-card.js accepts 2..6 hero cards in review & standard modes
  const ogSrc = read('pages/api/og/hand-card.js');
  assert.match(ogSrc, /reviewCards\(searchParams\.get\('hero'\),\s*6\)/);
  assert.match(ogSrc, /hero\.length\s*>=\s*2\s*&&\s*hero\.length\s*<=\s*6/);
  assert.doesNotMatch(ogSrc, /reviewCards\(searchParams\.get\('hero'\),\s*2\)/, 'must not truncate OG review hero cards to 2');
});

// ═══════════════════════════════════════════════════════════════════════════
// LAW 5: Nullable `created_at` Cursor & Raw ISO Equal-Timestamp Siblings
// ═══════════════════════════════════════════════════════════════════════════
test('LAW 5: pagination handles nullable created_at and never skips equal-millisecond sibling rows', async () => {
  const makeRow = (id, { created_at = null, completed_at = null, started_at = null } = {}) => ({
    id,
    hand_id: `club-arena:${id}`,
    user_id: HERO_ID,
    player_ids: [HERO_ID],
    table_id: TABLE_UUID,
    club_id: null,
    hand_number: 1,
    variant: 'NLH',
    betting_structure: 'no_limit',
    small_blind: 1,
    big_blind: 2,
    pot_total: 20,
    winner_ids: [],
    created_at,
    completed_at,
    started_at,
    hand_data: {
      source: 'club-arena',
      sourceHandId: id,
      heroCards: ['Ah', 'Kh'],
      review: { status: 'saved', notes: '', tags: [], revision: 1, analysisState: 'not_analyzed' },
    },
  });

  const SAME_TS = '2026-11-27T12:00:00.000Z';
  const rows = [
    // Nullable created_at falling back to completed_at / started_at, with equal-ms siblings
    makeRow(HAND_UUID_4, { created_at: null, completed_at: '2026-11-27T12:05:00.000Z' }),
    makeRow(HAND_UUID_3, { created_at: null, started_at: SAME_TS }),
    makeRow(HAND_UUID_2, { created_at: SAME_TS, completed_at: SAME_TS }),
    makeRow(HAND_UUID, { created_at: '2026-11-27T11:55:00.000Z' }),
  ];

  const sb = createInstrumentedSupabase({ savedRows: rows });

  // Opaque cursor pagination across nullable created_at + equal-ms siblings
  const p1 = await callHandler({ method: 'GET', query: { limit: '2' }, userId: HERO_ID, supabase: sb });
  assert.equal(p1.statusCode, 200);
  assert.deepEqual(p1.body.hands.map((h) => h.id), [HAND_UUID_4, HAND_UUID_3]);
  assert.ok(typeof p1.body.nextCursor === 'string' && p1.body.nextCursor.length > 0, 'nullable created_at must still emit nextCursor');

  const p2 = await callHandler({ method: 'GET', query: { limit: '2', cursor: p1.body.nextCursor }, userId: HERO_ID, supabase: sb });
  assert.equal(p2.statusCode, 200);
  assert.deepEqual(p2.body.hands.map((h) => h.id), [HAND_UUID_2, HAND_UUID], 'equal-ms sibling HAND_UUID_2 must not be skipped');
  assert.equal(p2.body.nextCursor, null);

  // Raw ISO cursor at equal-ms timestamp MUST include BOTH equal-ms siblings (never silently skip HAND_UUID_2!)
  const rawIso = await callHandler({ method: 'GET', query: { cursor: SAME_TS }, userId: HERO_ID, supabase: sb });
  assert.equal(rawIso.statusCode, 200);
  assert.deepEqual(rawIso.body.hands.map((h) => h.id), [HAND_UUID_3, HAND_UUID_2, HAND_UUID]);
});

// ═══════════════════════════════════════════════════════════════════════════
// LAW 6: Pre-DB Probe Throttling Across All 5 Hand-Lookup Endpoints
// ═══════════════════════════════════════════════════════════════════════════
test('LAW 6: pre-DB probe throttling returns 429 with ZERO database queries on all 5 hand-lookup endpoints', async () => {
  const nowMs = 1_700_000_050_000;
  const attackerIp = '203.0.113.99';
  const probeStore = new Map();
  probeStore.set(`${OUTSIDER_ID}::${attackerIp}`, [
    nowMs - 4000,
    nowMs - 3000,
    nowMs - 2000,
    nowMs - 1000,
    nowMs - 500,
  ]);

  const cases = [
    { name: 'GET ?id=', method: 'GET', query: { id: HAND_UUID } },
    { name: 'POST club-arena', method: 'POST', body: { source: 'club-arena', handId: HAND_UUID } },
    { name: 'POST request_analysis', method: 'POST', body: { action: 'request_analysis', id: HAND_UUID } },
    { name: 'PATCH', method: 'PATCH', body: { id: HAND_UUID, notes: 'probe' } },
    { name: 'DELETE', method: 'DELETE', query: { id: HAND_UUID } },
  ];

  for (const tc of cases) {
    const sb = createInstrumentedSupabase();
    const res = await callHandler({
      method: tc.method,
      query: tc.query,
      body: tc.body,
      userId: OUTSIDER_ID,
      supabase: sb,
      ip: attackerIp,
      probeStore,
      probeBlockThreshold: 5,
      nowMs,
    });
    assert.equal(res.statusCode, 429, `${tc.name} must return 429 when probe bucket is throttled`);
    assert.equal(res.body.code, 'PROBE_RATE_LIMITED', `${tc.name} must return PROBE_RATE_LIMITED`);
    assert.ok(Number(res.headers['retry-after']) >= 1, `${tc.name} must set Retry-After`);
    assert.equal(sb.queryLog.length, 0, `${tc.name} must execute ZERO DB queries when throttled`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LAW 7: 5-Minute Post-Session RTA Cooldown (`limited_review` -> 423)
// ═══════════════════════════════════════════════════════════════════════════
test('LAW 7: 5-minute post-session cooldown (limited_review) locks all analysis endpoints with 423 while completed-hand logging stays allowed', async () => {
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const sb = createInstrumentedSupabase({
    handHistoryRows: [{
      id: HAND_UUID,
      hand_number: 42,
      table_id: TABLE_UUID,
      players: [{ userId: HERO_ID, username: 'Hero', seat: 1, stack: 100 }],
      summary: null,
      created_at: '2026-11-27T11:00:00.000Z',
    }],
    // Vacated Club Arena seat 2 minutes ago -> contextAuthority returns SESSION_ENDED_VERIFIED / limited_review
    tableSeatsRows: [{ id: 'seat-recent', table_id: TABLE_UUID, user_id: HERO_ID, left_at: twoMinutesAgo }],
  });

  // Completed-hand logging remains fast and allowed even during cooldown
  const saved = await callHandler({
    method: 'POST',
    body: { source: 'club-arena', handId: HAND_UUID },
    userId: HERO_ID,
    supabase: sb,
  });
  assert.equal(saved.statusCode, 201);
  const savedId = saved.body.hand.id;

  // All 4 verified analysis gate endpoints MUST return 423 during the 5-minute cooldown
  const g1 = await callHandler({ method: 'GET', query: { analysisGate: '1' }, userId: HERO_ID, supabase: sb });
  assert.equal(g1.statusCode, 423);
  assert.equal(g1.body.code, 'ACTIVE_PLAY_RESTRICTED');
  assert.equal(g1.body.contextState, 'session_ended_verified');
  assert.equal(g1.body.accessLevel, 'limited_review');

  const g2 = await callHandler({ method: 'POST', body: { action: 'check_analysis_gate' }, userId: HERO_ID, supabase: sb });
  assert.equal(g2.statusCode, 423);
  assert.equal(g2.body.code, 'ACTIVE_PLAY_RESTRICTED');

  const g3 = await callHandler({ method: 'POST', body: { action: 'request_analysis', id: savedId }, userId: HERO_ID, supabase: sb });
  assert.equal(g3.statusCode, 423);
  assert.equal(g3.body.code, 'ACTIVE_PLAY_RESTRICTED');

  const g4 = await callHandler({ method: 'PATCH', body: { id: savedId, analysisState: 'analyzed' }, userId: HERO_ID, supabase: sb });
  assert.equal(g4.statusCode, 423);
  assert.equal(g4.body.code, 'ACTIVE_PLAY_RESTRICTED');

  // After 5-minute cooldown expires -> full_access unlocks all 4 endpoints
  const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
  const sbAfterCooldown = createInstrumentedSupabase({
    savedRows: sb.savedRows,
    tableSeatsRows: [{ id: 'seat-old', table_id: TABLE_UUID, user_id: HERO_ID, left_at: sixMinutesAgo }],
  });

  const openGate = await callHandler({ method: 'GET', query: { analysisGate: '1' }, userId: HERO_ID, supabase: sbAfterCooldown });
  assert.equal(openGate.statusCode, 200);
  assert.equal(openGate.body.allowed, true);

  const openPatch = await callHandler({
    method: 'PATCH',
    body: { id: savedId, analysisState: 'analyzed' },
    userId: HERO_ID,
    supabase: sbAfterCooldown,
  });
  assert.equal(openPatch.statusCode, 200);
  assert.equal(openPatch.body.hand.review.analysisState, 'analyzed');
});

// ═══════════════════════════════════════════════════════════════════════════
// LAW 8: Legacy `revision: 0` PATCH Recovery, `ALLOWED_LIST_STATUSES`, & `bodyParser.sizeLimit`
// ═══════════════════════════════════════════════════════════════════════════
test('LAW 8: legacy revision: 0 rows recover cleanly on PATCH without 409 deadlock; ALLOWED_LIST_STATUSES is active; bodyParser sizeLimit is 64kb', async () => {
  const corruptRow = {
    id: HAND_UUID,
    hand_id: `club-arena:${HAND_UUID}`,
    user_id: HERO_ID,
    player_ids: [HERO_ID],
    table_id: TABLE_UUID,
    club_id: null,
    hand_number: 1,
    variant: 'NLH',
    betting_structure: 'no_limit',
    small_blind: 1,
    big_blind: 2,
    pot_total: 40,
    winner_ids: [],
    created_at: '2026-11-27T11:00:00.000Z',
    hand_data: {
      source: 'club-arena',
      sourceHandId: HAND_UUID,
      heroCards: ['Ah', 'Kh'],
      review: {
        status: 'saved',
        notes: 'legacy note',
        tags: [],
        revision: 0,
        analysisState: 'not_analyzed',
      },
    },
  };

  const sb = createInstrumentedSupabase({ savedRows: [corruptRow] });

  // Stale expectedRevision != 1 still conflicts cleanly
  const wrongRev = await callHandler({
    method: 'PATCH',
    body: { id: HAND_UUID, expectedRevision: 5, notes: 'should conflict' },
    userId: HERO_ID,
    supabase: sb,
  });
  assert.equal(wrongRev.statusCode, 409);
  assert.equal(wrongRev.body.code, 'REVISION_CONFLICT');
  assert.equal(wrongRev.body.currentRevision, 1);

  // Matching expectedRevision=1 recovers revision: 0 -> revision: 2 without 409 deadlock!
  const recovered = await callHandler({
    method: 'PATCH',
    body: { id: HAND_UUID, expectedRevision: 1, notes: 'healed cleanly' },
    userId: HERO_ID,
    supabase: sb,
  });
  assert.equal(recovered.statusCode, 200);
  assert.equal(recovered.body.hand.review.revision, 2);
  assert.equal(recovered.body.hand.review.notes, 'healed cleanly');

  // Subsequent normal PATCH on revision: 2 succeeds -> revision: 3
  const next = await callHandler({
    method: 'PATCH',
    body: { id: HAND_UUID, expectedRevision: 2, reviewStatus: 'reviewed' },
    userId: HERO_ID,
    supabase: sb,
  });
  assert.equal(next.statusCode, 200);
  assert.equal(next.body.hand.review.revision, 3);
  assert.equal(next.body.hand.review.status, 'reviewed');

  // Verify ALLOWED_LIST_STATUSES is actually used by matchesSavedHandFilters (not dead)
  const savedHandsSrc = read('src/lib/personal-assistant/savedHands.mjs');
  const filterFn = savedHandsSrc.slice(savedHandsSrc.indexOf('export function matchesSavedHandFilters'));
  assert.match(filterFn, /ALLOWED_LIST_STATUSES\.has\(/);
  assert.equal(savedHandsLib.matchesSavedHandFilters(next.body.hand, { status: 'bogus_status' }), false);

  // Verify Next.js API route exports bodyParser.sizeLimit = '64kb'
  const apiRouteSrc = read('pages/api/poker/saved-hands.js');
  assert.match(apiRouteSrc, /export\s+const\s+config\s*=\s*\{\s*api:\s*\{\s*bodyParser:\s*\{\s*sizeLimit:\s*['"]64kb['"]\s*,?\s*\}\s*,?\s*\}\s*,?\s*\}/);
});
