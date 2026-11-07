// src/lib/inBatches.mjs and the call sites it replaced (2026-11-07). The fake
// database below behaves like the gateway: an IN list over 150 values answers
// a 400, and a read returns at most 1000 rows, as PostgREST's max-rows does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    IN_BATCH_SIZE, idBatches, selectInBatches, listUserConversationIds, findSharedConversation,
} from '../src/lib/inBatches.mjs';
import { unboundedInCalls } from '../scripts/ci/check-unbatched-in-lists.mjs';

const GATEWAY_LIMIT = 150;
const MAX_ROWS = 1000;
const id = (prefix, n) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;

function fakeDb(tables) {
    const log = [];
    const db = {
        log,
        from(table) {
            const state = { table, filters: [], inList: null, range: null, limit: null };
            const query = {
                select() { return query; },
                eq(column, value) { state.filters.push(row => row[column] === value); return query; },
                is(column, value) { state.filters.push(row => (row[column] ?? null) === value); return query; },
                in(column, values) { state.inList = values; state.filters.push(row => values.includes(row[column])); return query; },
                order() { return query; },
                range(from, to) { state.range = [from, to]; return query; },
                limit(n) { state.limit = n; return query; },
                then(resolve, reject) {
                    log.push({ table, inSize: state.inList?.length ?? 0, range: state.range });
                    if (state.inList && state.inList.length > GATEWAY_LIMIT) {
                        return Promise.resolve({ data: null, error: { code: '400', message: 'Bad Request' } }).then(resolve, reject);
                    }
                    let rows = (tables[table] || []).filter(row => state.filters.every(f => f(row)));
                    if (state.range) rows = rows.slice(state.range[0], state.range[1] + 1);
                    rows = rows.slice(0, Math.min(state.limit ?? MAX_ROWS, MAX_ROWS));
                    return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
                },
            };
            return query;
        },
    };
    return db;
}

const caller = id('aaaaaaaa', 1);
const callee = id('bbbbbbbb', 2);
function inbox(count, sharedAt) {
    const participants = [];
    for (let i = 1; i <= count; i++) {
        const conversation_id = id('cccccccc', i);
        participants.push({ conversation_id, user_id: caller, context_entity_id: null });
        if (i === sharedAt) participants.push({ conversation_id, user_id: callee, context_entity_id: null });
    }
    return { social_conversation_participants: participants };
}

test('idBatches deduplicates, drops empties and never exceeds the size', () => {
    const batches = idBatches([...Array.from({ length: 250 }, (_, i) => `x${i}`), 'x1', null, '', undefined]);
    assert.deepEqual(batches.map(b => b.length), [100, 100, 50]);
    assert.equal(IN_BATCH_SIZE, 100);
    assert.throws(() => idBatches(['a'], 0), /positive integer/);
    assert.throws(() => idBatches(['a'], 1.5), /positive integer/);
});

test('selectInBatches makes no request for an empty list and stops at the first error', async () => {
    let calls = 0;
    assert.deepEqual(await selectInBatches([], () => { calls++; return Promise.resolve({ data: [] }); }), { data: [], error: null });
    assert.equal(calls, 0);
    const error = { code: '503', message: 'down' };
    const out = await selectInBatches(Array.from({ length: 300 }, (_, i) => `x${i}`), batch => {
        calls++;
        return Promise.resolve(calls === 2 ? { data: null, error } : { data: batch.map(value => ({ value })) });
    });
    assert.deepEqual(out, { data: null, error });
    assert.equal(calls, 2, 'the third batch is never sent after an error');
});

test('a 2,000-id lookup that a single query fails passes in batches', async () => {
    const ids = Array.from({ length: 2000 }, (_, i) => id('dddddddd', i));
    const db = fakeDb({ profiles: ids.map(value => ({ id: value })) });
    const single = await db.from('profiles').select('id').in('id', ids);
    assert.equal(single.error.code, '400');
    const batched = await selectInBatches(ids, batch => db.from('profiles').select('id').in('id', batch));
    assert.equal(batched.error, null);
    assert.equal(batched.data.length, 2000);
    assert.ok(db.log.slice(1).every(entry => entry.inSize <= IN_BATCH_SIZE));
});

test('every conversation is listed, past the row cap and past any .limit(500)', async () => {
    const db = fakeDb(inbox(2600));
    const { data, error, truncated } = await listUserConversationIds(db, caller);
    assert.equal(error, null);
    assert.equal(truncated, undefined);
    assert.equal(data.length, 2600);
    assert.deepEqual(db.log.map(entry => entry.range), [[0, 999], [1000, 1999], [2000, 2999]]);
});

test('a missed call in a 673-thread inbox finds the shared thread the 500 cap missed', async () => {
    const db = fakeDb(inbox(673, 650));
    const { data, error } = await findSharedConversation(db, { userId: caller, otherUserId: callee });
    assert.equal(error, null);
    assert.equal(data, id('cccccccc', 650));
    const lookups = db.log.filter(entry => entry.inSize > 0);
    assert.ok(lookups.every(entry => entry.inSize <= IN_BATCH_SIZE), 'every IN list fits the gateway');
    assert.equal(lookups.length, 7, 'stops at the batch holding the match');
});

test('no shared thread returns null, and a read failure is an error, not "not shared"', async () => {
    const none = await findSharedConversation(fakeDb(inbox(250)), { userId: caller, otherUserId: callee });
    assert.deepEqual(none, { data: null, error: null });
    const broken = {
        from() {
            const q = { select: () => q, eq: () => q, order: () => q, range: () => q, then: r => Promise.resolve({ data: null, error: { code: '57014', message: 'timeout' } }).then(r) };
            return q;
        },
    };
    const failed = await findSharedConversation(broken, { userId: caller, otherUserId: callee });
    assert.equal(failed.data, null);
    assert.equal(failed.error.code, '57014');
});

test('narrow keeps the identity context of the threads being searched', async () => {
    const tables = inbox(300, 120);
    tables.social_conversation_participants.forEach(row => { if (row.conversation_id === id('cccccccc', 120)) row.context_entity_id = 'club-1'; });
    const personal = await findSharedConversation(fakeDb(tables), {
        userId: caller, otherUserId: callee, narrow: q => q.is('context_entity_id', null),
    });
    assert.equal(personal.data, null, 'a club thread is never reused for a personal message');
    const club = await findSharedConversation(fakeDb(tables), {
        userId: caller, otherUserId: callee, narrow: q => q.eq('context_entity_id', 'club-1'),
    });
    assert.equal(club.data, id('cccccccc', 120));
});

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the call sites use the batched path and fail closed', () => {
    const live = source('pages/api/notifications/live-notify.js');
    assert.match(live, /selectInBatches\(followerIds/);
    assert.match(live, /selectInBatches\(eligibleIds/);
    assert.match(live, /if \(prefsError\)[\s\S]{0,200}status\(503\)/, 'never notify without knowing who opted out');
    assert.match(live, /if \(dedupError\)[\s\S]{0,200}status\(503\)/, 'never notify twice');
    assert.match(live, /\.range\(from, from \+ 999\)/, 'followers past the row cap are read');
    const missed = source('pages/api/messenger/insert-missed-call-notification.js');
    assert.match(missed, /findSharedConversation\(getSupabase\(\)/);
    assert.doesNotMatch(missed, /\.limit\(500\)/);
    const start = source('pages/api/messenger/start-conversation.js');
    assert.match(start, /findSharedConversation\(supabase/);
    assert.match(start, /is_group', false/);
    assert.doesNotMatch(start, /existingQuery\.limit\(500\)/);
    const requests = source('pages/hub/messenger/requests.js');
    assert.match(requests, /listUserConversationIds\(supabase, authUser\.id\)/);
    assert.doesNotMatch(requests, /\.limit\(200\)/);
    for (const path of [
        'pages/api/messenger/get-conversations.js', 'pages/hub/messenger/requests.js', 'src/lib/messengerPrefsSync.js',
        'pages/api/notifications/live-notify.js', 'pages/api/messenger/start-conversation.js',
        'pages/api/messenger/insert-missed-call-notification.js', 'pages/api/notifications/feed.js',
        'pages/api/poker/notifications.js', 'pages/api/messenger/global-search.js', 'pages/hub/social-media/index.js',
    ]) assert.deepEqual(unboundedInCalls(source(path)), [], `${path} has no unbounded IN list`);
});

test('the unread page-notification NOT IN list fits the URL limit', () => {
    const notifications = source('pages/api/poker/notifications.js');
    const cap = Number(notifications.match(/const READ_ID_CAP = (\d+);/)[1]);
    const quotedUuid = `"${id('eeeeeeee', 1)}"`.length + 1;
    assert.ok(cap * quotedUuid < 15000, `${cap} read ids make a ${cap * quotedUuid}-byte list`);
    assert.match(notifications, /readListComplete = readIdsForFilter\.length < READ_ID_CAP/);
});
