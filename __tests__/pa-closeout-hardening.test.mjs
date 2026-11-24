import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getUserContextState, CONTEXT_STATES } from '../src/lib/personal-assistant/contextAuthority.js';
import { gradeAction } from '../src/lib/sandbox/actionGrading.js';
import { normalizeClubArenaHand } from '../src/lib/training/handAuditEngine.js';

function queryResult(result) {
  const chain = {};
  for (const method of ['select', 'eq', 'is', 'order', 'not', 'gte']) chain[method] = () => chain;
  chain.limit = async () => result;
  return chain;
}

test('context authority fails closed when active-session evidence is unavailable', async () => {
  const db = { from: () => queryResult({ data: null, error: { message: 'db unavailable' } }) };
  assert.equal(await getUserContextState(db, 'user-1'), CONTEXT_STATES.SESSION_ACTIVE_UNKNOWN);
});

test('context authority fails closed when the recent-session query fails', async () => {
  let call = 0;
  const db = { from: () => queryResult(++call === 1
    ? { data: [], error: null }
    : { data: null, error: { message: 'timeout' } }) };
  assert.equal(await getUserContextState(db, 'user-1'), CONTEXT_STATES.SESSION_ACTIVE_UNKNOWN);
});

test('context authority blocks live play when user holds an active Club Arena table seat', async () => {
  const db = {
    from(table) {
      if (table === 'table_seats') {
        return queryResult({ data: [{ id: 'seat-1', table_id: 'table-9', left_at: null }], error: null });
      }
      return queryResult({ data: [], error: null });
    },
  };
  assert.equal(await getUserContextState(db, 'user-1'), CONTEXT_STATES.LIVE_PLAY);
});

test('context authority fails closed when Club Arena table_seats lookup errors', async () => {
  const db = {
    from(table) {
      if (table === 'table_seats') {
        return queryResult({ data: null, error: { code: '08006', message: 'connection lost' } });
      }
      return queryResult({ data: [], error: null });
    },
  };
  assert.equal(await getUserContextState(db, 'user-1'), CONTEXT_STATES.SESSION_ACTIVE_UNKNOWN);
});

test('action grading classifies check-raise, 4-bet, jam, and fractional pot bets accurately', () => {
  assert.equal(gradeAction('Bet 33%', 'Bet 150%'), false);
  assert.equal(gradeAction('Bet 50%', 'Bet 66%'), true);
  assert.equal(gradeAction('Check', 'Bet 33%'), false);
  assert.equal(gradeAction('Check', 'Check-Raise'), false);
  assert.equal(gradeAction('Check-Raise', 'Raise'), true);
  assert.equal(gradeAction('Bet', '4-Bet'), false);
  assert.equal(gradeAction('4-Bet', 'Raise'), true);
  assert.equal(gradeAction('Jam', 'All-In'), true);
  assert.equal(gradeAction('Bet 1/3 Pot', 'Bet Pot'), false);
  assert.equal(gradeAction('Bet 1/3 Pot', 'Bet 33%'), true);
  assert.equal(gradeAction('Bet 1/2 Pot', 'Bet 50%'), true);
  assert.equal(gradeAction('Bet 2/3 Pot', 'Bet 66%'), true);
});

test('context authority enforces Club Arena post-session cooldown and fails closed on schema cache error', async () => {
  const recentLeftAt = new Date(Date.now() - 60_000).toISOString();
  let tableSeatCall = 0;
  const dbCooldown = {
    from(table) {
      if (table === 'table_seats') {
        tableSeatCall += 1;
        return queryResult(tableSeatCall === 1
          ? { data: [], error: null }
          : { data: [{ id: 'seat-2', left_at: recentLeftAt }], error: null });
      }
      return queryResult({ data: [], error: null });
    },
  };
  assert.equal(await getUserContextState(dbCooldown, 'user-1'), CONTEXT_STATES.SESSION_ENDED_VERIFIED);

  const dbSchemaMiss = {
    from(table) {
      if (table === 'table_seats') {
        return queryResult({ data: null, error: { code: 'PGRST205', message: 'schema cache miss' } });
      }
      return queryResult({ data: [], error: null });
    },
  };
  assert.equal(await getUserContextState(dbSchemaMiss, 'user-1'), CONTEXT_STATES.SESSION_ACTIVE_UNKNOWN);
});

test('legacy hand normalization rejects unscoped cards and conflicting hero flags', () => {
  const base = {
    id: 'hand-privacy', game_variant: 'nlh', button_seat: 1,
    players: [{ userId: 'hero', username: 'Hero', seat: 1 }, { userId: 'villain', username: 'Villain', seat: 2 }],
    summary: { heroCards: ['As', 'Kh'] },
    actions: [{ userId: 'villain', isHero: true, action: 'raise', stage: 'preflop', amount: 3 }],
  };
  assert.equal(normalizeClubArenaHand(base, 'hero'), null);
  const hand = normalizeClubArenaHand({ ...base, hero_private_cards: ['As', 'Kh'] }, 'hero');
  assert.ok(hand);
  assert.equal(hand.streets.preflop.actions[0].isHero, false);
  assert.equal(normalizeClubArenaHand({ ...base, hero_private_cards: ['As', 'Kh'], game_variant: null }, 'hero'), null);
});

test('private hand stores and examples ship owner-only source policies', async () => {
  const examples = await readFile(new URL('../supabase/migrations/20260831093000_lock_leak_hand_examples_to_owner.sql', import.meta.url), 'utf8');
  const facts = await readFile(new URL('../supabase/migrations/20260831094000_version_private_club_arena_hand_facts.sql', import.meta.url), 'utf8');
  const limiter = await readFile(new URL('../supabase/migrations/20260831095000_strict_personal_assistant_rate_limit.sql', import.meta.url), 'utf8');
  assert.match(examples, /DROP POLICY IF EXISTS anyone_read_examples/);
  assert.match(examples, /user_leaks\.user_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(facts, /REVOKE ALL ON TABLE public\.ca_hand_facts FROM anon/);
  assert.match(facts, /user_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(limiter, /EXCEPTION WHEN OTHERS THEN[\s\S]*RETURN false/);
});
