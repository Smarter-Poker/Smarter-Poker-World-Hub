import { strict as assert } from 'node:assert';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { clubArenaParticipantFilter } from '../src/lib/club-arena/handMembership.mjs';
import { openAuditCursor } from '../src/lib/personal-assistant/auditCursor.mjs';
import { syncClubArenaHandsForAudit } from '../src/lib/training/handAuditEngine.js';
import { aggregateSolverLeaks } from '../src/lib/training/solverDecisionEvidence.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';

test('Club Arena participant filter is one deduplicated modern-plus-legacy result set', () => {
  assert.equal(
    clubArenaParticipantFilter(USER_ID),
    `players.cs.${JSON.stringify([{ userId: USER_ID }])},players.cs.${JSON.stringify([{ id: USER_ID }])}`,
  );
  assert.throws(() => clubArenaParticipantFilter(''), /user_id_required/);
});

test('a signed version-one cursor safely restarts its frozen snapshot', () => {
  const previous = process.env.NEXTAUTH_SECRET;
  process.env.NEXTAUTH_SECRET = 'cursor-upgrade-test-secret';
  try {
    const legacy = {
      snapshotAt: '2026-08-30T12:00:00.000Z',
      modern: { createdAt: '2026-08-30T11:00:00.000Z', id: 'modern-5' },
      legacy: { createdAt: '2026-08-30T10:00:00.000Z', id: 'legacy-8' },
      modernDone: false,
      legacyDone: false,
      cumulativeHandsFound: 77,
      userId: USER_ID,
      expiresAt: Date.parse('2026-09-02T12:00:00.000Z'),
    };
    const payload = Buffer.from(JSON.stringify(legacy)).toString('base64url');
    const signature = createHmac('sha256', process.env.NEXTAUTH_SECRET).update(payload).digest('base64url');
    const opened = openAuditCursor(`${payload}.${signature}`, USER_ID, Date.parse('2026-08-31T12:00:00.000Z'));
    assert.equal(opened.version, 2);
    assert.equal(opened.snapshotAt, legacy.snapshotAt);
    assert.equal(opened.boundary, null);
    assert.equal(opened.cumulativeHandsFound, 0);
    assert.equal(opened.restartedFromLegacyCursor, true);
  } finally {
    if (previous === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = previous;
  }
});

test('mixed recorder shapes use one global keyset and exact unique cumulative count', async () => {
  const base = Date.parse('2026-08-30T12:00:00.000Z');
  const all = Array.from({ length: 130 }, (_, index) => ({
    id: `hand-${String(index).padStart(3, '0')}`,
    hand_number: index,
    game_variant: 'nlhe',
    source: 'manual',
    created_at: new Date(base - index * 1000).toISOString(),
    players: [{ userId: USER_ID, id: USER_ID, seat: 0 }, { userId: 'villain', seat: 1 }],
    summary: {
      bigBlind: 1,
      buttonSeat: 0,
      players: [
        { userId: USER_ID, seat: 0, holeCards: ['As', 'Kh'] },
        { userId: 'villain', seat: 1 },
      ],
      streets: { preflop: { actions: [{ userId: USER_ID, action: 'check' }] } },
    },
  }));
  const modern = all.slice(0, 90);
  const legacy = all.slice(40);
  const auditedIds = [];
  const db = {
    from(table) {
      if (table === 'hand_history') {
        let membership = null;
        let boundary = null;
        const chain = {
          select: () => chain,
          contains: (_column, value) => { membership = JSON.parse(value)[0]; return chain; },
          in: () => chain,
          order: () => chain,
          lte: () => chain,
          or: value => {
            const match = /created_at\.lt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.lt\.([^\)]+)\)/.exec(value);
            boundary = match ? { createdAt: match[1], id: match[3] } : null;
            return chain;
          },
          range: async (_from, to) => {
            const source = Object.hasOwn(membership, 'userId') ? modern : legacy;
            const before = source.filter(row => !boundary
              || row.created_at < boundary.createdAt
              || (row.created_at === boundary.createdAt && row.id < boundary.id));
            return { data: before.slice(0, to + 1), error: null };
          },
        };
        return chain;
      }
      if (table === 'hand_audit_decisions') {
        let ids = [];
        const chain = {
          eq: () => chain,
          in: (_column, values) => { ids = values; auditedIds.push(...values); return chain; },
          limit: async () => ({
            data: ids.map(hand_external_id => ({
              hand_external_id,
              solver_verified: true,
              solver_source: 'DETERMINISTIC_SOLVER|hand-audit-v3',
              classification: 'best',
              updated_at: '2026-08-30T12:00:00.000Z',
            })),
            error: null,
          }),
        };
        return { select: () => chain };
      }
      if (table === 'ca_hand_facts') throw new Error('facts table not available in fixture');
      throw new Error(`Unexpected table ${table}`);
    },
  };

  let cursor = null;
  let final;
  for (let page = 0; page < 4; page += 1) {
    final = await syncClubArenaHandsForAudit(db, USER_ID, {
      limit: 50,
      cursor,
      nowMs: Date.parse('2026-08-31T12:00:00.000Z'),
    });
    cursor = final.continuation;
    if (!cursor) break;
  }
  assert.equal(final.complete, true);
  assert.equal(final.cumulativeHandsFound, 130);
  assert.equal(new Set(auditedIds).size, 130);
  assert.equal(auditedIds.length, 130);
});

test('solver leak groups carry only exact unique mistaken Club Arena source hands', () => {
  const rows = Array.from({ length: 8 }, (_, index) => ({
    evidence_scope: 'club_arena',
    game_id: 'cash-rfi',
    street: 'preflop',
    hero_position: 'BTN',
    spot_type: 'rfi',
    solver_verified: true,
    classification: index < 3 ? 'wrong' : 'best',
    hand_external_id: `club-arena:hand-${Math.min(index, 2)}`,
    answered_at: `2026-08-30T12:00:0${index}.000Z`,
  }));
  const [leak] = aggregateSolverLeaks(rows);
  assert.deepEqual(leak._mistaken_hand_external_ids, [
    'club-arena:hand-0',
    'club-arena:hand-1',
    'club-arena:hand-2',
  ]);
});

test('Leak Finder wires exact solver source hands through an owner-scoped idempotent link', () => {
  const source = readFileSync(new URL('../pages/api/assistant/leaks/detect.js', import.meta.url), 'utf8');
  assert.match(source, /select\('hand_external_id, game_id,/);
  assert.match(source, /solverSourceHands\.set\(solverLeak\.leak_type, _mistaken_hand_external_ids \|\| \[\]\)/);
  assert.match(source, /\.contains\('players', JSON\.stringify\(\[\{ \[membershipKey\]: userId \}\]\)\)[\s\S]{0,100}query = query\.in\('id', ids\)/);
  assert.match(source, /exactSourceIds[\s\S]{0,300}solver-graded mistake/);
  assert.match(source, /onConflict: 'leak_id,hand_history_id', ignoreDuplicates: true/);
});
