import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { syncClubArenaHandsForAudit } from '../src/lib/training/handAuditEngine.js';
import { buildCoachingSnapshot } from '../src/lib/personal-assistant/coachingIntelligence.mjs';
import { buildLiveSpotHandHistory } from '../src/lib/personal-assistant/liveSpotHandHistory.mjs';
import { normalizeHandClass } from '../src/lib/personal-assistant/mttShortStackCharts.mjs';
import { parseHandHistory, getHeroDecisionPoints } from '../src/engines/HandHistoryParser.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// 1. Incremental watermark truncation data-loss guard
test('fortress: syncClubArenaHandsForAudit keeps continuation non-null when batch overflows before watermark', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const baseMs = Date.parse('2026-11-25T20:00:00.000Z');
  // 5 newer hands + 1 watermark hand = 6 rows returned, limit = 3.
  // Reaches watermark in the same page while 2 newer hands overflow the slice.
  const allRows = Array.from({ length: 6 }, (_, i) => ({
    id: `00000000-0000-4000-8000-00000000000${6 - i}`,
    created_at: new Date(baseMs - i * 60_000).toISOString(),
    table_id: 'tbl-1',
    game_variant: 'nlh',
    small_blind: 1,
    big_blind: 2,
    button_seat: 1,
    players: [
      { userId, seat: 1, name: 'Hero', stack: 200 },
      { userId: '22222222-2222-4222-8222-222222222222', seat: 2, name: 'Villain', stack: 200 },
    ],
    actions: [],
    hole_cards: {},
    source: 'engine-api',
  }));
  const watermarkRow = allRows[5];
  const makeQuery = (rows) => {
    const q = {
      select() { return q; },
      in() { return q; },
      contains() { return q; },
      eq() { return q; },
      neq() { return q; },
      is() { return q; },
      not() { return q; },
      gte() { return q; },
      gt() { return q; },
      lt() { return q; },
      lte() { return q; },
      or() { return q; },
      order() { return q; },
      limit() { return q; },
      range() { return Promise.resolve({ data: rows, error: null }); },
      then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
    };
    return q;
  };
  let handHistoryCall = 0;
  const db = {
    from(table) {
      if (table === 'hand_history') {
        handHistoryCall += 1;
        return makeQuery(handHistoryCall === 1 ? allRows : []);
      }
      if (table === 'ca_hand_facts') return makeQuery([]);
      if (table === 'hand_audit_decisions') return makeQuery([]);
      if (table === 'training_question_cache') return makeQuery([]);
      return makeQuery([]);
    },
    rpc() { return Promise.resolve({ data: { inserted: 0, deleted: 0 }, error: null }); },
  };
  const result = await syncClubArenaHandsForAudit(db, userId, {
    limit: 3,
    sinceBoundary: {
      createdAt: watermarkRow.created_at,
      id: watermarkRow.id,
      matcherVersion: 'hand-audit-v3',
    },
  });
  assert.equal(result.available, true, 'sync must complete with mock db');
  assert.equal(result.handsFound, 3);
  assert.equal(result.complete, false, 'overflow beyond limit must keep complete=false even when watermark was reached');
  assert.ok(result.continuation, 'overflow beyond limit must return continuation cursor so newer hands are never skipped');
  assert.equal(result.continuation.boundary.id, allRows[2].id);
});

// 2. Cooldown RTA suppression + camelCase leakId + zero false relapse from first_detected_at
test('fortress: coachingIntelligence suppresses recap during 5-min cooldown, honors camelCase leakId, and avoids false relapse without post-drill baseline', () => {
  const sessionWindow = {
    startMs: Date.parse('2026-11-25T18:00:00Z'),
    endMs: Date.parse('2026-11-25T20:00:00Z'),
    source: 'club_arena_seat',
  };
  const decisions = Array.from({ length: 10 }, (_, i) => ({
    id: `dec-${i}`,
    hand_external_id: `club-arena:aaaaaaaa-aaaa-4aaa-8aaa-00000000000${i}`,
    hand_played_at: new Date(Date.parse('2026-11-25T18:10:00Z') + i * 60_000).toISOString(),
    audited_at: '2026-11-25T19:50:00Z',
    leak_id: 'lk-camel',
    leak_type: 'cbet_flop_overfold',
    spot_type: 'cbet_flop_overfold',
    street: 'flop',
    hero_position: 'BTN',
    hero_hand: 'AhKd',
    player_action: 'fold',
    solver_action: 'call',
    classification: 'blunder',
    ev_loss: 3.4,
    ev_loss_measured: true,
    solver_verified: true,
  }));
  const leak = {
    leakId: 'lk-camel',
    leak_type: 'cbet_flop_overfold',
    title: 'Flop C-Bet Overfold',
    status: 'active',
    first_detected_at: '2026-11-25T18:00:00Z',
    total_samples: 10,
    mistake_count: 10,
  };
  // Mastered review with NO remediation_baseline_at and NO history yet
  const reviews = [{
    leak_id: 'lk-camel',
    retired: true,
    reps: 3,
    strong_streak: 3,
    history: [],
    remediation_baseline_at: null,
  }];

  const cooldownSnap = buildCoachingSnapshot({
    leaks: [leak],
    decisions,
    reviews,
    liveTable: { active: false, cooldown: true },
    sessionWindow,
  });

  // Cooldown must suppress session recap hands completely
  assert.equal(cooldownSnap.sessionDebrief.cooldownActive, true);
  assert.equal(cooldownSnap.sessionDebrief.recapEligible, false);
  assert.deepEqual(cooldownSnap.sessionDebrief.topLeakedHands, []);
  assert.equal(cooldownSnap.sessionDebrief.recapUnavailableReason, 'cooldown_active');

  // CamelCase leakId resolved AND missing remediation_baseline_at does NOT falsely trigger relapsed_at_tables
  const leakEntry = cooldownSnap.leaks.find((l) => l.id === 'lk-camel');
  assert.ok(leakEntry, 'camelCase leakId must be indexed');
  assert.equal(
    leakEntry.tableVerification.status,
    'awaiting_live_hands',
    'must not fall back to first_detected_at and falsely classify pre-drill hands as relapsed_at_tables',
  );
  assert.equal(leakEntry.tableVerification.postSampleCount, 0);
});

// 3. Live Quick Spot BTN facing open_raise never makes Hero open against themselves
test('fortress: buildLiveSpotHandHistory BTN facing open_raise has CO open and parses cleanly without Hero opposing self', () => {
  for (const position of ['MP', 'CO', 'BTN', 'SB', 'BB']) {
    const built = buildLiveSpotHandHistory({
      heroCards: 'As Kd',
      board: '',
      position,
      format: 'cash',
      stackBb: 100,
      facing: 'open_raise',
      action: 'raise',
    });
    assert.equal(built.ok, true, `${position} open_raise should build`);
    const preflopSection = built.text.split('*** HOLE CARDS ***')[1] || '';
    const heroActions = preflopSection.split('\n').filter((line) => line.startsWith('Hero:'));
    assert.equal(heroActions.length, 1, `${position} Hero must act exactly once facing open_raise (never opening against self)`);
    const parsed = parseHandHistory(built.text, 'Hero');
    assert.equal(parsed.length, 1, `${position} hand must parse cleanly`);
    assert.equal(parsed[0].supported, true);
    const points = getHeroDecisionPoints(parsed[0]);
    assert.ok(points.length >= 1, `${position} must yield at least one hero decision point`);
  }
});

// 4. MTT Short-Stack chart normalization handles '10', rejects ambiguous unsuffixed non-pairs, and rejects suffixed pairs
test('fortress: normalizeHandClass handles 10-ranks, refuses ambiguous unsuffixed non-pairs, and rejects impossible suffixed pairs', () => {
  assert.equal(normalizeHandClass('A10s'), 'ATs');
  assert.equal(normalizeHandClass('109s'), 'T9s');
  assert.equal(normalizeHandClass('1010'), 'TT');
  assert.equal(normalizeHandClass('AK'), null, 'ambiguous unsuffixed non-pair returns null');
  assert.equal(normalizeHandClass('KA'), null, 'ambiguous reversed unsuffixed non-pair returns null');
  assert.equal(normalizeHandClass('AA'), 'AA');
  assert.equal(normalizeHandClass('AAs'), null, 'suited pocket pair is impossible');
  assert.equal(normalizeHandClass('AAo'), null, 'suffixed pocket pair rejected');
});

// 5. HandHistoryParser handles EUR/GBP/commas, parentheses in player names, keyword-prefixed ACR names, and header-only tournament classification
test('fortress: HandHistoryParser parses EUR/GBP/comma stacks, parenthesized names, keyword-prefixed ACR names, and header-only format', () => {
  const eurParenHand = `PokerStars Hand #9900112233: Hold'em No Limit (€5/€10 EUR) - 2026/11/25 18:00:00 ET
Table 'Vienna' 6-max Seat #1 is the button
Seat 1: TournamentPro (€1,250.50 in chips)
Seat 2: Player (2) (€2,100.00 in chips)
Seat 3: Hero (€1,000.25 in chips)
Player (2): posts small blind €5
Hero: posts big blind €10
*** HOLE CARDS ***
Dealt to Hero [Ah Kd]
TournamentPro: raises €25 to €35
Player (2): folds
Hero: raises €1,000.25 to €1,035.25 and is all-in
TournamentPro: folds
*** SUMMARY ***
Total pot €75.00 | Rake €0`;

  const parsedEur = parseHandHistory(eurParenHand, 'Hero');
  assert.equal(parsedEur.length, 1);
  assert.equal(parsedEur[0].format, 'cash', 'player named TournamentPro must not flip cash hand to tournament');
  assert.equal(parsedEur[0].tableSize, 3);
  const parenPlayer = parsedEur[0].players.find((p) => p.seat === 2);
  assert.equal(parenPlayer?.name, 'Player (2)');
  assert.equal(parenPlayer?.stack, 2100);
  const heroPlayer = parsedEur[0].players.find((p) => p.seat === 3);
  assert.equal(heroPlayer?.stack, 1000.25);
  const heroAction = parsedEur[0].streets.preflop.actions.find((a) => a.isHero);
  assert.equal(heroAction?.amount, 1035.25);
  assert.equal(parsedEur[0].result.pot, 75);

  const acrKeywordNames = `Hand #88112233 - Holdem (No Limit) - $1/$2 - 2026/11/25 18:10:00 UTC
Americas Cardroom Table 'Alpha' 6-max Seat #1 is the button
Seat 1: Boardman ($200.00)
Seat 2: Seaton ($200.00)
Seat 3: TableTennis ($200.00)
Seat 4: Hero ($200.00)
Seaton posts the small blind $1.00
TableTennis posts the big blind $2.00
*** HOLE CARDS ***
Dealt to Hero [As Ks]
Hero raises $4.00 to $6.00
Boardman calls $6.00
Seaton folds
TableTennis calls $4.00
*** FLOP *** [Ah 7c 2d]
TableTennis checks
Hero bets $10.00
Boardman calls $10.00
TableTennis folds
*** SUMMARY ***
Total pot $39.00`;

  const parsedAcr = parseHandHistory(acrKeywordNames, 'Hero');
  assert.equal(parsedAcr.length, 1);
  assert.equal(parsedAcr[0].site, 'acr');
  const preflopPlayers = parsedAcr[0].streets.preflop.actions.map((a) => a.player);
  assert.ok(preflopPlayers.includes('Boardman'), 'Boardman action must not be dropped');
  assert.ok(preflopPlayers.includes('Seaton'), 'Seaton action must not be dropped');
  assert.ok(preflopPlayers.includes('TableTennis'), 'TableTennis action must not be dropped');
});

// 6. Duplicate notification unique conflict (23505) never sends a duplicate web push
test('fortress: notify() guards Branch B web push against 23505 duplicate notification conflicts', () => {
  const src = read('src/lib/notify.js');
  assert.match(src, /let duplicateConflict = false;/);
  assert.match(src, /if \(String\(error\.code \|\| ''\) === '23505'\)\s*\{\s*duplicateConflict = true;/);
  assert.match(src, /if \(wantsPush && duplicateConflict\)\s*\{\s*out\.push = \{ sent: false, skipped: true, reason: 'duplicate_notification' \};\s*\} else if \(wantsPush\)/);
});

// 7. UI wiring, SSR share honesty, and smoke filter scoping
test('fortress: PA Home recap wires &drill=1 and cooldown check, ShareHandPage exports SSR getServerSideProps, and smoke script scopes format buttons', () => {
  const home = read('pages/hub/personal-assistant/index.js');
  assert.match(home, /!sessionDebrief\?\.liveTableActive\s*&&\s*!sessionDebrief\?\.cooldownActive/);
  assert.match(home, /\/hub\/personal-assistant\/leaks\?hand=\$\{encodeURIComponent\(recapDrillHandId\)\}&drill=1/);

  const share = read('pages/share/hand.js');
  assert.match(share, /export async function getServerSideProps\(/);
  assert.match(share, /res\.setHeader\('X-Robots-Tag',\s*'noindex, nofollow'\)/);
  assert.match(share, /res\.setHeader\('Cache-Control',\s*'private, no-store, max-age=0'\)/);
  assert.match(share, /export default function ShareHandPage\(\{\s*initialQuery\s*=\s*\{\}\s*\}\)/);

  const smoke = read('scripts/ci/pa-browser-smoke.mjs');
  assert.match(smoke, /item\.label === 'cash' \|\| item\.label === 'tournament' \|\| item\.label === 'all formats'/);

  const nextConfig = read('next.config.js');
  assert.doesNotMatch(nextConfig, /source:\s*'\/share\/hand\/:id\*'/, 'zero-or-more :id* hijacks bare /share/hand?view=review with a 308 redirect');
  assert.match(nextConfig, /source:\s*'\/share\/hand\/:id\+'/);
});
