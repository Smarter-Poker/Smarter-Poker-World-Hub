import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { loadSurface } from './social-poker-card-harness.mjs';

const { module: diamondCap } = loadSurface('src/lib/trivia/diamondCap.js', {
    mocks: { './getTodayCST': { getTodayStartCST: () => '2026-10-05T00:00:00-05:00' } },
});
const { getDailyDiamondsEarned } = diamondCap;

test('settlement cap reads use the immutable trivia score play day', async () => {
    const calls = [];
    const query = {
        select(columns) { calls.push(['select', columns]); return this; },
        eq(column, value) { calls.push(['eq', column, value]); return this; },
        gte(column, value) { calls.push(['gte', column, value]); return this; },
        limit: async value => {
            calls.push(['limit', value]);
            return { data: [{ diamonds_earned: 7 }, { diamonds_earned: 3 }], error: null };
        },
    };
    const client = {
        from(table) { calls.push(['from', table]); return query; },
    };

    const earned = await getDailyDiamondsEarned(
        client,
        '11111111-1111-4111-8111-111111111111',
        'daily',
        '2026-11-01',
    );

    assert.equal(earned, 10);
    assert.deepEqual(calls.find(call => call[0] === 'eq' && call[1] === 'play_date'),
        ['eq', 'play_date', '2026-11-01']);
    assert.equal(calls.some(call => call[0] === 'gte'), false);
});

test('an invalid requested play day fails the cap check closed', async () => {
    let queried = false;
    const value = await getDailyDiamondsEarned(
        { from() { queried = true; throw new Error('must not query'); } },
        '11111111-1111-4111-8111-111111111111',
        'daily',
        'not-a-day',
    );
    assert.equal(value, Number.MAX_SAFE_INTEGER);
    assert.equal(queried, false);
});

test('session settlement constrains the secondary ledger to one Chicago day', () => {
    const source = readFileSync(new URL('../pages/api/trivia/session-submit.js', import.meta.url), 'utf8');
    assert.match(source, /sessionDiamondsForDay\(sb, userId, mode, playDate\)/);
    assert.match(source, /\.gte\('created_at', getTodayStartCST\(chicagoDate\)\)[\s\S]*\.lt\('created_at', getTodayStartCST\(nextDate\)\)/);
    assert.match(source, /getDailyDiamondsEarned\(sb, userId, mode, playDate\)/);
    assert.doesNotMatch(source, /sessionDiamondsToday/);
});
