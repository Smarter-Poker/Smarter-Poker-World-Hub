import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  evaluateHeroHandSimple,
  describeStreetDelta,
  describeBetSizingPlain,
  formatStakeAmount,
  COMMON_POKER_SPOTS,
  buildRangeStringFromPercent,
} from '../src/lib/sandbox/handEvaluatorSimple.mjs';
import { executeSavedHandsRequest } from '../src/lib/personal-assistant/savedHandsRouteCore.mjs';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('1. handEvaluatorSimple accurately evaluates NLH made hands, exact non-double-counted outs, PLO4 rules, and stake formatting', () => {
  const topPair = evaluateHeroHandSimple(['Ah', 'Kd'], ['Kh', '7c', '2d']);
  assert.match(topPair.rankLabel, /Top Pair/i);

  const flushDraw = evaluateHeroHandSimple(['Qh', 'Jh'], ['Ah', '8h', '3c']);
  assert.equal(flushDraw.draws.outs, 9);
  assert.ok(flushDraw.draws.riverPct >= 34 && flushDraw.draws.riverPct <= 36);
  assert.ok(flushDraw.draws.drawLabels.some((l) => /Flush Draw/i.test(l)));

  // Combo draw: flush draw (9) + open-ended straight draw (8) minus 2 overlapping outs = 15 outs
  const combo = evaluateHeroHandSimple(['Qh', 'Jh'], ['Th', '9h', '2c']);
  assert.equal(combo.draws.outs, 15, 'combo draw must not double-count straight-flush outs');

  // PLO4 Omaha rule: must use EXACTLY 2 hole cards + 3 board cards (so 4 spades on board + 1 spade in hand is NOT a flush)
  const ploNoFlush = evaluateHeroHandSimple(['As', 'Kd', 'Qc', 'Jh'], ['9s', '7s', '4s', '2s', '2d']);
  assert.doesNotMatch(ploNoFlush.rankLabel, /^Flush$/i, 'PLO4 must require two suited hole cards for a flush');

  assert.equal(formatStakeAmount(6.5, 'bb'), '6.5 BB');
  assert.equal(formatStakeAmount(6.5, '1_2'), '$13');
  assert.equal(formatStakeAmount(6.5, '2_5'), '$32.50');

  assert.equal(COMMON_POKER_SPOTS.length, 5);
  for (const spot of COMMON_POKER_SPOTS) {
    assert.ok(spot.id && spot.label && spot.heroHand?.card1 && spot.heroHand?.card2);
  }

  const delta = describeStreetDelta({
    prevEquity: 88,
    currEquity: 64,
    newCard: '9h',
    handEval: topPair,
    boardCards: ['Kh', '7h', '2d', '9h'],
  });
  assert.match(delta, /9h|Win Chance/i);

  const betHint = describeBetSizingPlain({ betBb: 3.5, potBb: 7, facingBetBb: 0, stakesDisplay: 'bb' });
  assert.match(betHint, /Pot|Call/i);

  const rangeRes = buildRangeStringFromPercent(25, ['pairs']);
  assert.ok(rangeRes.rangeString.includes('AA'));
  assert.ok(rangeRes.styleLabel.length > 0);
});

test('2. POST /api/poker/saved-hands { action: "import_club_arena" } bulk-imports unsaved Club Arena hands privately with club_id: null and strips non-showdown opponent cards', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const handId1 = '22222222-2222-4222-8222-222222222221';
  const handId2 = '22222222-2222-4222-8222-222222222222';
  const tableId = '33333333-3333-4333-8333-333333333333';
  const insertedRows = [];

  const mockDb = {
    from(table) {
      let op = 'select';
      let insertPayload = null;
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        in() { return chain; },
        or() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        insert(payload) {
          op = 'insert';
          insertPayload = payload;
          return chain;
        },
        maybeSingle() {
          if (table === 'hand_histories' && op === 'insert') {
            const row = { id: `saved-${insertedRows.length + 1}`, created_at: '2026-11-28T00:00:00Z', ...insertPayload };
            insertedRows.push(row);
            return Promise.resolve({ data: row, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        then(resolve, reject) {
          if (table === 'ca_hand_facts') {
            return Promise.resolve({
              data: [
                {
                  hand_id: handId1,
                  table_id: tableId,
                  hand_number: 101,
                  played_at: '2026-11-28T00:10:00Z',
                  variant: 'plo5',
                  stakes: '0.50/1',
                  big_blind: 1,
                  position: 'BTN',
                  hero_cards: ['Ah', 'Kh', 'Qs', 'Jc', 'Td'],
                  net_bb: 42.5,
                  pot_bb: 90,
                  went_to_showdown: false,
                },
                {
                  hand_id: handId2,
                  table_id: tableId,
                  hand_number: 102,
                  played_at: '2026-11-28T00:05:00Z',
                  variant: 'nlh',
                  stakes: '0.50/1',
                  big_blind: 1,
                  position: 'CO',
                  hero_cards: ['As', 'Ks'],
                  net_bb: -15,
                  pot_bb: 32,
                  went_to_showdown: false,
                },
              ],
              error: null,
            }).then(resolve, reject);
          }
          if (table === 'hand_histories') {
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          }
          if (table === 'hand_history') {
            return Promise.resolve({
              data: [
                {
                  id: handId1,
                  table_id: tableId,
                  hand_number: 101,
                  pot_total: 90,
                  small_blind: 0.5,
                  big_blind: 1,
                  community_cards: ['Ks', '7c', '2d'],
                  players: [
                    { user_id: userId, seat: 1, position: 'BTN', cards: ['Ah', 'Kh', 'Qs', 'Jc', 'Td'], showed: false },
                    { user_id: '99999999-9999-4999-8999-999999999999', seat: 2, position: 'BB', cards: ['7h', '7d'], showed: false },
                  ],
                  actions: [],
                  created_at: '2026-11-28T00:10:00Z',
                },
                {
                  id: handId2,
                  table_id: tableId,
                  hand_number: 102,
                  pot_total: 32,
                  small_blind: 0.5,
                  big_blind: 1,
                  community_cards: ['Qc', '8d', '3s'],
                  players: [
                    { user_id: userId, seat: 1, position: 'CO', cards: ['As', 'Ks'], showed: false },
                  ],
                  actions: [],
                  created_at: '2026-11-28T00:05:00Z',
                },
              ],
              error: null,
            }).then(resolve, reject);
          }
          if (table === 'tables') {
            return Promise.resolve({
              data: [{ id: tableId, name: 'PLO5 0.50/1 Classic' }],
              error: null,
            }).then(resolve, reject);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };

  function makeRes() {
    const headers = {};
    let statusCode = 200;
    let body = null;
    return {
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      getHeader(k) { return headers[k.toLowerCase()]; },
      status(code) { statusCode = code; return this; },
      json(payload) { body = payload; return this; },
      get result() { return { statusCode, body, headers }; },
    };
  }

  // Unauthenticated must fail closed with 401
  const unauthRes = makeRes();
  await executeSavedHandsRequest(
    { method: 'POST', headers: {}, body: { action: 'import_club_arena', limit: 25 } },
    unauthRes,
    {
      getDb: () => mockDb,
      getUser: async () => ({ user: null }),
      applyRateLimit: () => true,
      limits: { write: {} },
      reportError: () => {},
      attachTiming: () => {},
      checkAccess: async () => ({ allowed: true, accessLevel: 'full_access' }),
    },
  );
  assert.equal(unauthRes.result.statusCode, 401);

  // Authenticated bulk import inserts privately with club_id: null and strips hidden villain cards
  const res = makeRes();
  await executeSavedHandsRequest(
    { method: 'POST', headers: { authorization: 'Bearer test-token' }, body: { action: 'import_club_arena', limit: 25 } },
    res,
    {
      getDb: () => mockDb,
      getUser: async () => ({ user: { id: userId } }),
      applyRateLimit: () => true,
      limits: { write: {} },
      reportError: () => {},
      attachTiming: () => {},
      checkAccess: async () => ({ allowed: true, accessLevel: 'full_access' }),
    },
  );
  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.success, true);
  assert.equal(res.result.body.importedCount, 2);
  assert.equal(insertedRows.length, 2);
  for (const row of insertedRows) {
    assert.equal(row.club_id, null, 'private saved Club Arena rows must ALWAYS set club_id: null');
    assert.equal(row.user_id, userId);
  }
  const serialized = JSON.stringify(insertedRows);
  assert.doesNotMatch(serialized, /"7h","7d"/, 'non-showdown opponent hole cards must be stripped');
});

test('3. Virtual Sandbox Simplicity UX and Review My Play Real Club Arena Cards + Import contracts are wired', () => {
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');
  const table = read('src/components/sandbox/SandboxPokerTable.jsx');
  const summary = read('src/components/sandbox/SimpleHandSummary.jsx');
  const slider = read('src/components/sandbox/VisualOpponentSlider.jsx');
  const review = read('pages/hub/personal-assistant/review.js');
  const reviewCss = read('src/styles/worlds/PersonalAssistantReview.module.css');

  assert.match(sandbox, /pa_sandbox_prefs_v1/);
  assert.match(sandbox, /data-experience-toggle="true"/);
  assert.match(sandbox, /data-stakes-toggle="true"/);
  assert.match(sandbox, /data-common-spots="true"/);
  assert.match(sandbox, /data-simple-tabs="true"/);
  assert.match(sandbox, /SimpleHandSummary/);
  assert.match(sandbox, /VisualOpponentSlider/);
  assert.match(table, /data-arena-bet-helper="true"/);
  assert.match(table, /formatStakeAmount/);
  assert.match(summary, /data-simple-odds-bar="true"/);
  assert.match(summary, /data-what-changed="true"/);
  assert.match(slider, /data-opponent-slider="true"/);

  // Review My Play uses real Club Arena 4-color WebP cards and bulk Club Arena import
  assert.match(review, /\/hub\/club-arena\/cards\/4color\//);
  assert.match(review, /data-review-card=/);
  assert.match(review, /data-import-club-arena-btn="true"/);
  assert.match(review, /action:\s*'import_club_arena'/);
  assert.doesNotMatch(review, /function CardPill\b/, 'generic text-box CardPill must be replaced by real ArenaMiniCard');
  assert.match(reviewCss, /suggestedFeltTray|feltMiniStage|arenaCard/i);
});
