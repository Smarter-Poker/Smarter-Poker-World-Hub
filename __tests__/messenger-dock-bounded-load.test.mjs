// 2026-11-18: "signal timed out" printed over the poker table.
// The dock refresh ran the full inbox waterfall for the personal inbox and
// twice per club. The owner account held 5,895 threads across six clubs
// (measured in production), every refresh made several hundred sequential
// database round trips, and the request passed the dock's 30 second ceiling.
// These tests model that account and count the round trips.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getMessengerWorkspace, dockInboxSlice, DOCK_RECENT_LIMIT } from '../src/lib/messengerWorkspace.mjs';

const user = '00000000-0000-4000-8000-000000000001';
const uuid = (prefix, n) => `${prefix}${String(n).padStart(12, '0')}`;
const peer = n => uuid('00000000-0000-4000-9000-', n);
const clubId = n => uuid('10000000-0000-4000-8000-', n);
const pageId = n => uuid('20000000-0000-4000-8000-', n);
const thread = (inbox, n) => uuid(`3${String(inbox).padStart(7, '0')}-0000-4000-8000-`, n);

// inbox 0 is personal; inbox n is club n. `unread` threads are the OLDEST ones,
// so a slice that kept only the newest would lose them.
function ownerAccount({ clubs = 6, personal = 1300, perClub = 1400, unread = 3 } = {}) {
    const inboxes = [{ context: null, size: personal }, ...Array.from({ length: clubs }, (_, i) => ({ context: pageId(i + 1), size: perClub }))];
    const rows = [];
    inboxes.forEach((inbox, index) => {
        for (let n = 1; n <= inbox.size; n++) {
            rows.push({ conversation_id: thread(index, n), context: inbox.context, is_group: false,
                unread_count: n <= unread ? 2 : 0, other_user_id: peer(n), other_user_username: `player${n}`,
                last_message_at: new Date(Date.UTC(2026, 0, 1) + n * 60000).toISOString() });
        }
    });
    const tables = {
        club_members: Array.from({ length: clubs }, (_, i) => ({ user_id: user, club_id: clubId(i + 1), role: 'owner', status: 'active', membership_lifecycle_status: 'active', is_active: true })),
        clubs: Array.from({ length: clubs }, (_, i) => ({ id: clubId(i + 1), name: `Club ${i + 1}`, avatar_url: null })),
        social_pages: Array.from({ length: clubs }, (_, i) => ({ id: pageId(i + 1), name: `Club ${i + 1}`, linked_entity_id: clubId(i + 1), linked_entity_type: 'club' })),
        club_messenger_staff_notice_groups: [], accounting_conversations: [], social_messages: [],
        social_conversations: rows.map(r => ({ id: r.conversation_id, is_request: false, last_message_preview: 'hi', group_name: null })),
        social_conversation_participants: [],
    };
    const counted = { trips: 0, detailIds: 0, largestIn: 0 };
    const db = {
        from(table) {
            counted.trips++;
            let data = [...(tables[table] || [])]; let order = null; let ascending = true; let limit = Infinity;
            const q = {
                select() { return q; },
                eq(k, v) { data = data.filter(r => r[k] === v); return q; },
                neq(k, v) { data = data.filter(r => r[k] !== v); return q; },
                gt(k, v) { data = data.filter(r => r[k] > v); return q; },
                not(k) { data = data.filter(r => r[k] != null); return q; },
                contains() { data = []; return q; },
                in(k, values) {
                    counted.largestIn = Math.max(counted.largestIn, values.length);
                    if (table === 'social_conversations') counted.detailIds += values.length;
                    const wanted = new Set(values); data = data.filter(r => wanted.has(r[k])); return q;
                },
                order(k, options = {}) { order = k; ascending = options.ascending !== false; return q; },
                limit(n) { limit = n; return q; },
                then(resolve, reject) {
                    if (order) data.sort((a, b) => String(a[order]).localeCompare(String(b[order])) * (ascending ? 1 : -1));
                    return Promise.resolve({ data: data.slice(0, limit), error: null }).then(resolve, reject);
                },
            };
            return q;
        },
        async rpc(name, args) {
            counted.trips++;
            if (name === 'fn_get_user_conversations') {
                // The reader's own order: unread first, then newest.
                const mine = rows.filter(r => r.context === (args.p_context_entity_id ?? null))
                    .sort((a, b) => (b.unread_count > 0) - (a.unread_count > 0) || b.last_message_at.localeCompare(a.last_message_at));
                return { data: mine, error: null };
            }
            return { data: [], error: null };
        },
    };
    return { db, counted, rows, clubs };
}

test('a dock refresh for a 9,700-thread owner account is a bounded number of round trips', async () => {
    const { db, counted } = ownerAccount();
    const result = await getMessengerWorkspace(db, user, { workspace: 'dock' });
    assert.equal(result.success, true);
    // Before: thread details were read for every thread, twice per club:
    // 1,300 + 2 x 6 x 1,400 = 18,100 ids and over 700 round trips.
    // Each batch is read to exhaustion, so every id is asked for twice.
    assert.ok(counted.detailIds <= 2 * 7 * (DOCK_RECENT_LIMIT + 3), `thread details were asked for ${counted.detailIds} times`);
    assert.ok(counted.trips <= 90, `the refresh made ${counted.trips} round trips`);
});

test('the bounded dock still carries every unread thread and the true unread count', async () => {
    const { db } = ownerAccount();
    const result = await getMessengerWorkspace(db, user, { workspace: 'dock' });
    // The unread threads are the oldest in each inbox; none may be sliced away.
    for (let inbox = 0; inbox <= 6; inbox++) {
        for (let n = 1; n <= 3; n++) {
            const found = result.conversations.find(c => c.id === thread(inbox, n));
            assert.ok(found, `unread thread ${n} of inbox ${inbox} is missing`);
            assert.equal(found.unreadCount, 2);
        }
    }
    assert.equal(result.unreadCounts.messages, 6, 'personal unread count is exact');
    // And the newest threads of each inbox are there, in the dock's own order.
    assert.ok(result.conversations.some(c => c.id === thread(0, 1300)));
    assert.ok(result.conversations.some(c => c.id === thread(6, 1400)));
    assert.equal(result.conversations.length, 7 * (DOCK_RECENT_LIMIT + 3));
    assert.ok(result.conversations[0].unreadCount > 0, 'unread threads are listed first');
});

test('each club is loaded once and serves both of its folders', async () => {
    const { db, clubs } = ownerAccount({ personal: 5, perClub: 5, unread: 1 });
    const reads = [];
    const rpc = db.rpc.bind(db);
    db.rpc = (name, args) => { if (name === 'fn_get_user_conversations') reads.push(args.p_context_entity_id ?? null); return rpc(name, args); };
    const result = await getMessengerWorkspace(db, user, { workspace: 'dock' });
    assert.equal(reads.length, 1 + clubs, 'one inbox read for the personal inbox and one per club');
    const club = result.conversations.find(c => c.id === thread(1, 5));
    assert.deepEqual(club.dockWorkspace, { workspace: 'club', clubId: clubId(1), folder: 'messages' });
});

test('the club and personal workspaces are not sliced, and the feed reads a window of its own', async () => {
    const { db } = ownerAccount({ clubs: 1, personal: 250, perClub: 250, unread: 0 });
    const page = await getMessengerWorkspace(db, user, { workspace: 'social' });
    assert.equal(page.conversations.length, 250);
    assert.equal(page.folders, undefined, 'the internal folder split never leaves the dock');
    const clubPage = await getMessengerWorkspace(db, user, { workspace: 'club', clubId: clubId(1) });
    assert.equal(clubPage.conversations.length, 250);
    // The main inbox is bounded separately (messenger-feed-bounded-load.test.mjs).
    const feed = await getMessengerWorkspace(db, user, { workspace: 'feed' });
    assert.equal(feed.conversations.filter(c => c.dockWorkspace.workspace === 'social').length, 100);
    assert.equal(feed.hasOlder, true);
    const older = await getMessengerWorkspace(db, user, { workspace: 'feed', window: 300 });
    assert.equal(older.conversations.filter(c => c.dockWorkspace.workspace === 'social').length, 250);
    assert.equal(older.hasOlder, false);
});

test('dockInboxSlice keeps unread threads, empty staff groups and the newest of the rest', () => {
    const list = [{ id: 'group' }, { id: 'u1', unread_count: 4 }, { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'u2', unread_count: 1 }];
    assert.deepEqual(dockInboxSlice(list, 2, 1).map(c => c.id), ['group', 'u1', 'a', 'b', 'u2']);
    assert.equal(dockInboxSlice(list, 10, 1), list);
    assert.equal(dockInboxSlice(list, 0, 1), list);
});

test('the dock route still answers through getMessengerWorkspace', () => {
    const route = readFileSync(new URL('../pages/api/messenger/get-conversations.js', import.meta.url), 'utf8');
    assert.match(route, /getMessengerWorkspace\(getSupabase\(\), userId, req\.body\)/);
});
