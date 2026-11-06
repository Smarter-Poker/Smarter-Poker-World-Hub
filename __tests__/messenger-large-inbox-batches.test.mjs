// 2026-11-06: an agent with 673 inbox threads could not mark any message read.
// Every conversation resolve ran ONE social_messages IN list of all 673 ids;
// the URL reached 26.7KB and the database gateway answered a plain 400, which
// surfaced as "Read Status Could Not Be Saved. Please Reopen This Conversation."
// These tests model that gateway: any IN list over 150 values fails.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getMessengerWorkspace, idBatches, IN_BATCH_SIZE } from '../src/lib/messengerWorkspace.mjs';

const GATEWAY_LIMIT = 150;
const user = '00000000-0000-4000-8000-000000000001';
const uuid = (prefix, n) => `${prefix}${String(n).padStart(12, '0')}`;
const peer = n => uuid('00000000-0000-4000-9000-', n);
const thread = n => uuid('30000000-0000-4000-8000-', n);

function busyInbox(count) {
    const conversations = Array.from({ length: count }, (_, i) => thread(i + 1));
    const tables = {
        club_members: [], clubs: [], social_pages: [], club_messenger_staff_notice_groups: [], accounting_conversations: [],
        social_conversations: conversations.map(id => ({ id, is_request: false, last_message_preview: 'hi', group_name: null })),
        social_conversation_participants: conversations.map(id => ({ conversation_id: id, user_id: user, context_entity_id: null })),
        social_messages: [
            // Two club-identity messages in one thread, in different batches of
            // the same query: the newest must win, as it did unbatched.
            { conversation_id: thread(5), sender_id: peer(5), created_at: '2026-11-01T00:00:00Z', media_metadata: { is_club_identity: true, club_name: 'Old Name' } },
            { conversation_id: thread(5), sender_id: peer(5), created_at: '2026-11-05T00:00:00Z', media_metadata: { is_club_identity: true, club_name: "King's Club" } },
            { conversation_id: thread(count), sender_id: peer(count), created_at: '2026-11-06T00:00:00Z', media_metadata: { is_club_identity: true, club_name: 'Last Club' } },
        ],
    };
    const largest = { value: 0 };
    const db = {
        from(table) {
            let data = [...(tables[table] || [])]; let error = null; let order = null; let ascending = true; let limit = Infinity;
            const q = {
                select() { return q; },
                eq(k, v) { data = data.filter(r => r[k] === v); return q; },
                neq(k, v) { data = data.filter(r => r[k] !== v); return q; },
                gt(k, v) { data = data.filter(r => r[k] > v); return q; },
                contains(k, v) { data = data.filter(r => Object.entries(v).every(([key, value]) => r[k]?.[key] === value)); return q; },
                in(k, values) {
                    largest.value = Math.max(largest.value, values.length);
                    if (values.length > GATEWAY_LIMIT) error = { code: '', message: 'Bad Request' };
                    data = data.filter(r => values.includes(r[k])); return q;
                },
                order(k, options = {}) { order = k; ascending = options.ascending !== false; return q; },
                limit(n) { limit = n; return q; },
                then(resolve, reject) {
                    if (order) data.sort((a, b) => String(a[order]).localeCompare(String(b[order])) * (ascending ? 1 : -1));
                    return Promise.resolve(error ? { data: null, error } : { data: data.slice(0, limit), error: null }).then(resolve, reject);
                },
            };
            return q;
        },
        async rpc(name, args) {
            if (args.p_conversation_ids && args.p_conversation_ids.length > GATEWAY_LIMIT) return { data: null, error: { message: 'too many' } };
            if (name === 'fn_get_user_conversations') {
                return { data: conversations.map((id, i) => ({ conversation_id: id, is_group: false, unread_count: 1,
                    other_user_id: peer(i + 1), other_user_username: `player${i + 1}`, last_message_at: '2026-11-06T00:00:00Z' })), error: null };
            }
            if (name === 'fn_messenger_private_accounting_threads' || name === 'fn_messenger_private_invoice_attention') return { data: [], error: null };
            if (name === 'fn_messenger_club_relationships') {
                if (args.p_peers.length > GATEWAY_LIMIT) return { data: null, error: { message: 'too many' } };
                return { data: [], error: null };
            }
            return { data: [], error: null };
        },
    };
    return { db, largest };
}

test('a 673-thread agent inbox resolves a conversation (mark-read, send and open all depend on this)', async () => {
    const { db, largest } = busyInbox(673);
    const result = await getMessengerWorkspace(db, user, { workspace: 'resolve', conversationId: thread(5) });
    assert.equal(result.conversation.id, thread(5));
    assert.ok(largest.value <= IN_BATCH_SIZE, `largest IN list was ${largest.value}`);
});

test('batched club-identity lookup keeps the newest brand per thread and finds threads in later batches', async () => {
    const { db } = busyInbox(673);
    const first = await getMessengerWorkspace(db, user, { workspace: 'resolve', conversationId: thread(5) });
    assert.equal(first.conversation.otherUser.display_name, "King's Club");
    const last = await getMessengerWorkspace(db, user, { workspace: 'resolve', conversationId: thread(673) });
    assert.equal(last.conversation.otherUser.display_name, 'Last Club');
});

test('a 2,000-thread inbox still resolves without one oversized request', async () => {
    const { db, largest } = busyInbox(2000);
    const result = await getMessengerWorkspace(db, user, { workspace: 'resolve', conversationId: thread(1999) });
    assert.equal(result.conversation.id, thread(1999));
    assert.ok(largest.value <= IN_BATCH_SIZE);
});

test('idBatches de-duplicates and bounds every batch', () => {
    const list = [...Array.from({ length: 250 }, (_, i) => thread(i)), thread(1), thread(2)];
    const batches = idBatches(list);
    assert.deepEqual(batches.map(b => b.length), [100, 100, 50]);
    assert.equal(new Set(batches.flat()).size, 250);
    assert.deepEqual(idBatches([]), []);
});

test('the social contacts rail batches its participant and profile lookups', () => {
    const source = readFileSync(new URL('../pages/hub/social-media/index.js', import.meta.url), 'utf8');
    const start = source.indexOf('const loadContacts = async');
    const body = source.slice(start, source.indexOf('const handleSearch', start));
    assert.match(body, /\.in\('conversation_id', conversationIds\.slice\(start, start \+ 100\)\)/);
    assert.match(body, /\.in\('id', uniqueUserIds\.slice\(start, start \+ 100\)\)/);
    assert.doesNotMatch(body, /\.in\('conversation_id', conversationIds\)/);
});

test('a read receipt in a 673-thread inbox authorizes one conversation, not the whole inbox', async () => {
    const { db } = busyInbox(673);
    const counted = { calls: 0, rpc: 0 };
    const from = db.from.bind(db); const rpc = db.rpc.bind(db);
    db.from = table => { counted.calls++; return from(table); };
    db.rpc = (name, args) => { counted.rpc++; return rpc(name, args); };
    const { authorizeMessengerConversation } = await import('../src/lib/messengerWorkspace.mjs');
    const result = await authorizeMessengerConversation(db, user, thread(5));
    assert.equal(result.conversation.id, thread(5));
    assert.equal(result.authorizedOnly, true);
    assert.equal(result.conversations.length, 1);
    assert.ok(counted.calls + counted.rpc <= 8, `used ${counted.calls} queries and ${counted.rpc} rpcs`);
});

test('mark-read and send-message authorize through the one-conversation path', () => {
    for (const route of ['pages/api/messenger/mark-read.js', 'pages/api/messenger/send-message.js']) {
        const source = readFileSync(new URL(`../${route}`, import.meta.url), 'utf8');
        assert.match(source, /authorizeMessengerConversation\(getSupabase\(\), userId, conversationId\)/, route);
        assert.doesNotMatch(source, /getMessengerWorkspace\(/, route);
    }
});
