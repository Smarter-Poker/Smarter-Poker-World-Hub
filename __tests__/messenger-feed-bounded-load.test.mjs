// 2026-11-18: the Messenger page's main inbox (`workspace: 'feed'`) read thread
// details and both accounting authority functions for every thread the person
// ever had. Measured in production on the owner account: 5,895 threads, of
// which 1,303 are personal and about 1,973 are invoices the feed shows.
// These tests model that shape at 9,700 threads and count the round trips.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as workspace from '../src/lib/messengerWorkspace.mjs';

const { getMessengerWorkspace } = workspace;
const user = '00000000-0000-4000-8000-000000000001';
const uuid = (prefix, n) => `${prefix}${String(n).padStart(12, '0')}`;
const peer = n => uuid('00000000-0000-4000-9000-', n);
const clubId = n => uuid('10000000-0000-4000-8000-', n);
const pageId = n => uuid('20000000-0000-4000-8000-', n);
const thread = (inbox, n) => uuid(`3${String(inbox).padStart(7, '0')}-0000-4000-8000-`, n);

// Inbox 0 is personal (1,300 plain threads). Inbox n is club n (1,400):
//   1..600      invoices issued TO the caller (the feed shows them)
//   601         an invoice the caller issued that has a discussion (shown)
//   602..1300   invoices the caller issued with no discussion (never shown)
//   1301..1400  club discussions (shown only while unread)
// Thread n is older than thread n+1. The unread threads are the OLDEST ones
// (1..3, and discussion 1301), so a slice that kept only the newest loses them.
const RECEIVED = 600;
const SHOWN_PER_CLUB = RECEIVED + 1;
function ownerAccount({ clubs = 6, personal = 1300, perClub = 1400, actionRequired = [], attentionIds = 'installed' } = {}) {
    const inboxes = [{ context: null, size: personal }, ...Array.from({ length: clubs }, (_, i) => ({ context: pageId(i + 1), size: perClub }))];
    const rows = [];
    const accounting = [];
    inboxes.forEach((inbox, index) => {
        for (let n = 1; n <= inbox.size; n++) {
            const id = thread(index, n);
            rows.push({ conversation_id: id, context: inbox.context, is_group: false,
                unread_count: n <= 3 || (index > 0 && n === 1301) ? 2 : 0, other_user_id: peer(n), other_user_username: `player${n}`,
                last_message_at: new Date(Date.UTC(2026, 0, 1) + n * 60000).toISOString() });
            if (index > 0 && n <= 1300) {
                accounting.push({ conversation_id: id, scope_id: clubId(index), issuer_type: 'club',
                    recipient_id: n <= RECEIVED ? user : peer(n), sender_id: n <= RECEIVED ? peer(n) : user,
                    last_discussion_at: n === 601 ? '2026-02-01T00:00:00.000Z' : null });
            }
        }
    });
    const tables = {
        club_members: Array.from({ length: clubs }, (_, i) => ({ user_id: user, club_id: clubId(i + 1), role: 'owner', status: 'active', membership_lifecycle_status: 'active', is_active: true })),
        clubs: Array.from({ length: clubs }, (_, i) => ({ id: clubId(i + 1), name: `Club ${i + 1}`, avatar_url: null })),
        social_pages: Array.from({ length: clubs }, (_, i) => ({ id: pageId(i + 1), name: `Club ${i + 1}`, linked_entity_id: clubId(i + 1), linked_entity_type: 'club' })),
        club_messenger_staff_notice_groups: [], accounting_conversations: accounting, social_messages: [],
        social_conversations: rows.map(r => ({ id: r.conversation_id, is_request: false, last_message_preview: 'hi', group_name: null })),
        social_conversation_participants: [{ user_id: user, conversation_id: thread(0, 4), context_entity_id: null }],
    };
    const invoices = new Map(accounting.map(record => [record.conversation_id, record]));
    const action = new Set(actionRequired);
    const counted = { trips: 0, detailIds: 0, details: new Set(), largestIn: 0, rpc: {} };
    const db = {
        from(table) {
            counted.trips++;
            let data = [...(tables[table] || [])]; let order = null; let ascending = true; let limit = Infinity;
            const q = {
                select() { return q; },
                eq(k, v) { data = data.filter(r => r[k] === v); return q; },
                neq(k, v) { data = data.filter(r => r[k] !== v); return q; },
                gt(k, v) { data = data.filter(r => r[k] > v); return q; },
                lte(k, v) { data = data.filter(r => r[k] <= v); return q; },
                not(k, operator, v) { assert.equal(operator, 'is'); assert.equal(v, null); data = data.filter(r => r[k] != null); return q; },
                contains() { data = []; return q; },
                in(k, values) {
                    counted.largestIn = Math.max(counted.largestIn, values.length);
                    if (table === 'social_conversations') { counted.detailIds += values.length; values.forEach(v => counted.details.add(v)); }
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
            counted.rpc[name] = (counted.rpc[name] || 0) + 1;
            if (name === 'fn_get_user_conversations') {
                // The reader's own order: unread first, then newest.
                const mine = rows.filter(r => r.context === (args.p_context_entity_id ?? null))
                    .sort((a, b) => (b.unread_count > 0) - (a.unread_count > 0) || b.last_message_at.localeCompare(a.last_message_at));
                return { data: mine, error: null };
            }
            if (name === 'fn_messenger_private_accounting_threads') {
                assert.ok(args.p_conversation_ids.length <= 100);
                return { data: args.p_conversation_ids.filter(id => invoices.has(id)).map(id => ({ conversation_id: id,
                    recipient_visible: true, last_message_preview: 'Invoice', last_message_at: rows.find(r => r.conversation_id === id).last_message_at })), error: null };
            }
            if (name === 'fn_messenger_private_invoice_attention') {
                assert.ok(args.p_conversation_ids.length <= 100);
                return { data: args.p_conversation_ids.filter(id => invoices.get(id)?.recipient_id === args.p_user_id)
                    .map(id => ({ conversation_id: id, requires_action: action.has(id) })), error: null };
            }
            if (name === 'fn_messenger_private_invoice_attention_ids') {
                if (attentionIds === 'absent') return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fn_messenger_private_invoice_attention_ids(p_user_id) in the schema cache' } };
                if (attentionIds === 'broken') return { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
                return { data: [...action].filter(id => invoices.get(id)?.recipient_id === args.p_user_id), error: null };
            }
            return { data: [], error: null };
        },
    };
    return { db, counted, rows, clubs };
}
const feedOf = (db, request = {}) => getMessengerWorkspace(db, user, { workspace: 'feed', ...request });
const ids = result => new Set(result.conversations.map(c => c.id));
// Everything the unsliced feed shows: every personal thread, and per club its
// 601 visible invoices and the one unread discussion.
const EVERYTHING = 1300 + 6 * (SHOWN_PER_CLUB + 1);

test('the main inbox of a 9,700-thread owner account loads in a bounded number of round trips', async () => {
    const { db, counted } = ownerAccount();
    const result = await feedOf(db);
    assert.equal(result.success, true);
    // Before: thread details were read for all 9,700 threads (each batch is
    // read to exhaustion, so 19,400 ids) in about 500 round trips.
    // Now: 103 personal threads and 104 per club.
    assert.ok(counted.detailIds <= 2 * 7 * 110, `thread details were asked for ${counted.detailIds} times`);
    assert.ok(counted.trips <= 130, `the load made ${counted.trips} round trips`);
    assert.ok(counted.largestIn <= 100);
    assert.equal(counted.rpc.fn_messenger_private_invoice_attention_ids, 1, 'one call says which invoices still require action');
});

test('every unread thread is returned and every unread count is exact', async () => {
    const { db } = ownerAccount();
    const result = await feedOf(db);
    for (let inbox = 0; inbox <= 6; inbox++) {
        for (const n of inbox ? [1, 2, 3, 1301] : [1, 2, 3]) {
            const found = result.conversations.find(c => c.id === thread(inbox, n));
            assert.ok(found, `unread thread ${n} of inbox ${inbox} is missing`);
            assert.equal(found.unreadCount, 2);
        }
    }
    assert.equal(result.unreadCounts.messages, 6, 'the personal unread count is exact');
    assert.equal(result.conversations.reduce((sum, c) => sum + c.unreadCount, 0), 2 * (3 + 6 * 4), 'the page total, summed from the rows, is exact');
    assert.ok(result.conversations[0].unreadCount > 0, 'unread threads are listed first');
    const everything = await feedOf(ownerAccount().db, { window: 5000 });
    assert.equal(everything.unreadCounts.messages, result.unreadCounts.messages);
    assert.deepEqual(everything.attentionCounts, result.attentionCounts);
});

test('the first window is the newest threads, says there are older ones, and a larger window reaches them', async () => {
    const first = await feedOf(ownerAccount().db);
    assert.equal(first.hasOlder, true);
    assert.equal(first.window, workspace.FEED_WINDOW);
    assert.equal(first.olderWindow, 2 * workspace.FEED_WINDOW);
    assert.equal(first.workspace, 'social');
    // 100 newest read + 3 unread personal; per club 100 newest read invoices + 3 unread invoices + 1 unread discussion.
    assert.equal(first.conversations.length, 103 + 6 * 104);
    assert.ok(ids(first).has(thread(0, 1300)) && ids(first).has(thread(0, 1201)) && !ids(first).has(thread(0, 1200)));
    assert.ok(ids(first).has(thread(4, 601)) && ids(first).has(thread(4, 502)) && !ids(first).has(thread(4, 501)));

    const second = await feedOf(ownerAccount().db, { window: first.olderWindow });
    assert.equal(second.hasOlder, true);
    assert.equal(second.conversations.length, 203 + 6 * 204);
    assert.ok(ids(second).has(thread(0, 1101)) && ids(second).has(thread(4, 402)));
    for (const id of ids(first)) assert.ok(ids(second).has(id), 'a larger window never loses a row');

    const all = await feedOf(ownerAccount().db, { window: 1400 });
    assert.equal(all.hasOlder, false, 'nothing is left once every inbox fits the window');
    assert.equal(all.conversations.length, EVERYTHING);
    assert.ok(ids(all).has(thread(0, 4)) && ids(all).has(thread(6, 4)), 'the oldest read threads are reachable');
});

test('the window size is clamped by the server', async () => {
    assert.equal(workspace.feedWindow(undefined), 100);
    assert.equal(workspace.feedWindow(5), 100);
    assert.equal(workspace.feedWindow('250'), 250);
    assert.equal(workspace.feedWindow(250.5), 100);
    assert.equal(workspace.feedWindow(-1), 100);
    assert.equal(workspace.feedWindow(1e12), workspace.FEED_WINDOW_MAX);
    const result = await feedOf(ownerAccount().db, { window: 'everything' });
    assert.equal(result.window, 100);
});

test('a pinned thread outside the window is kept, and a pin never grants visibility', async () => {
    const hidden = thread(3, 900); // an invoice the caller issued with no discussion
    const elsewhere = uuid('3aaaaaaa-0000-4000-8000-', 1); // not in any inbox of the caller
    const pinnedIds = [thread(0, 20), thread(2, 15).toUpperCase(), hidden, elsewhere, 'not-a-uuid', 7, null];
    const result = await feedOf(ownerAccount().db, { pinnedIds });
    assert.ok(ids(result).has(thread(0, 20)), 'an old pinned personal thread is returned');
    assert.ok(ids(result).has(thread(2, 15)), 'an old pinned invoice is returned');
    assert.ok(!ids(result).has(hidden), 'a pin does not reveal an invoice the inbox rules hide');
    assert.ok(!ids(result).has(elsewhere), 'a pin does not reveal a thread the caller is not in');
    assert.equal(result.conversations.length, 103 + 6 * 104 + 2);
    assert.equal((await feedOf(ownerAccount().db, { pinnedIds: 'x' })).conversations.length, 103 + 6 * 104);
    const many = Array.from({ length: 400 }, (_, i) => thread(0, i + 4));
    assert.equal(workspace.feedPinnedIds(many).size, workspace.FEED_PINNED_MAX, 'the pin list is capped');
});

test('an old, read invoice that still requires action is kept and ranks first among read threads', async () => {
    const due = thread(1, 10);
    const { db } = ownerAccount({ actionRequired: [due] });
    const result = await feedOf(db);
    const found = result.conversations.find(c => c.id === due);
    assert.ok(found, 'the action-required invoice is outside the newest 100 and must still be returned');
    assert.equal(found.requiresAction, true);
    assert.equal(found.unreadCount, 0);
    assert.equal(result.conversations.find(c => c.unreadCount === 0).id, due, 'it ranks directly under the unread threads');
    assert.equal(result.conversations.length, 103 + 6 * 104 + 1);
});

test('when the attention function is not installed every invoice is read, exactly as before', async () => {
    const due = thread(1, 10);
    const { db, counted } = ownerAccount({ actionRequired: [due], attentionIds: 'absent' });
    const result = await feedOf(db);
    assert.equal(counted.rpc.fn_messenger_private_invoice_attention_ids, 1);
    assert.equal(result.conversations.find(c => c.id === due)?.requiresAction, true);
    assert.equal(result.conversations.filter(c => c.isAccounting).length, 6 * SHOWN_PER_CLUB, 'no invoice is left out');
    assert.equal(result.conversations.filter(c => !c.isAccounting && c.dockWorkspace.workspace === 'social').length, 103, 'personal threads have no invoice state and stay windowed');
    assert.equal(result.hasOlder, true);
    assert.equal(result.unreadCounts.messages, 6);
});

test('any other failure of the attention function fails closed', async () => {
    const { db } = ownerAccount({ attentionIds: 'broken' });
    await assert.rejects(feedOf(db), error => error.status === 503 && error.message === 'Invoice Threads Unavailable');
});

test('club threads the feed never shows are not read at all, and nothing shown is lost', async () => {
    const { db, counted } = ownerAccount();
    const all = await feedOf(db, { window: 1400 });
    for (let club = 1; club <= 6; club++) {
        const shown = all.conversations.filter(c => c.dockWorkspace.clubId === clubId(club));
        assert.equal(shown.filter(c => c.isAccounting).length, SHOWN_PER_CLUB);
        assert.deepEqual(shown.filter(c => !c.isAccounting).map(c => c.id), [thread(club, 1301)], 'a club discussion is listed only while unread');
        assert.ok(shown.some(c => c.id === thread(club, 601) && c.dockWorkspace.folder === 'invoices'), 'an issued invoice with a discussion is shown');
        assert.ok(!counted.details.has(thread(club, 602)), 'an issued invoice with no discussion is not read');
        assert.ok(!counted.details.has(thread(club, 1400)), 'a read club discussion is not read');
    }
    assert.equal(counted.details.size, EVERYTHING);
});

test('the club and resolve workspaces, the personal list and the dock are unchanged', async () => {
    const { db } = ownerAccount({ clubs: 1 });
    const invoicesTab = await getMessengerWorkspace(db, user, { workspace: 'club', clubId: clubId(1), folder: 'invoices' });
    assert.equal(invoicesTab.conversations.length, SHOWN_PER_CLUB, 'the club Invoices tab lists every invoice');
    assert.equal(invoicesTab.hasOlder, undefined);
    const messagesTab = await getMessengerWorkspace(db, user, { workspace: 'club', clubId: clubId(1), window: 100, pinnedIds: [] });
    assert.equal(messagesTab.conversations.length, 100);
    const personal = await getMessengerWorkspace(db, user, { workspace: 'social', window: 100 });
    assert.equal(personal.conversations.length, 1300);
    assert.equal(personal.hasOlder, undefined);
    const resolved = await getMessengerWorkspace(db, user, { workspace: 'resolve', conversationId: thread(0, 4) });
    assert.equal(resolved.conversation.id, thread(0, 4), 'a thread outside the feed window still opens');
    assert.equal(resolved.conversations.length, 1300);
    const fresh = ownerAccount({ clubs: 1 });
    const dock = await getMessengerWorkspace(fresh.db, user, { workspace: 'dock' });
    assert.equal(dock.hasOlder, undefined);
    assert.equal(fresh.counted.rpc.fn_messenger_private_invoice_attention_ids, undefined, 'the dock does not ask for it');
    assert.equal(dock.conversations.length, (workspace.DOCK_RECENT_LIMIT + 3) + (workspace.DOCK_RECENT_LIMIT + 4));
});

test('an account with nothing older says so', async () => {
    const { db } = ownerAccount({ clubs: 2, personal: 40, perClub: 60 });
    const result = await feedOf(db);
    assert.equal(result.hasOlder, false);
    assert.equal(result.conversations.length, 40 + 2 * 60);
});

test('feedInboxSlice keeps unread, pinned, action-required and the newest of the rest', () => {
    const at = n => new Date(Date.UTC(2026, 0, n)).toISOString();
    const list = [{ id: 'group' }, { id: 'u', unread_count: 1, last_message_at: at(1) },
        { id: 'new', last_message_at: at(9) }, { id: 'mid', last_message_at: at(8) }, { id: 'old', last_message_at: at(7) },
        { id: 'pin', last_message_at: at(3) }, { id: 'due', last_message_at: at(2) }, { id: 'plain', last_message_at: at(6) }];
    const slice = options => workspace.feedInboxSlice(list, { window: 2, alwaysKeep: 1, ...options });
    assert.deepEqual(slice({}).conversations.map(c => c.id), ['group', 'u', 'new', 'mid']);
    assert.equal(slice({}).hasOlder, true);
    assert.deepEqual(slice({ pinned: new Set(['pin']), attention: new Set(['due']) }).conversations.map(c => c.id), ['group', 'u', 'new', 'mid', 'pin', 'due']);
    const club = { alwaysKeep: 0, shown: new Set(['new', 'mid', 'old', 'due']) };
    assert.deepEqual(slice({ ...club, attention: new Set(['due']) }).conversations.map(c => c.id), ['u', 'new', 'mid', 'due']);
    assert.deepEqual(slice({ ...club, attention: null }).conversations.map(c => c.id), ['u', 'new', 'mid', 'old', 'due'], 'unknown attention leaves no invoice out');
    assert.equal(slice({ ...club, attention: null }).hasOlder, false);
    assert.deepEqual(slice({ ...club, unreadShown: false }).conversations.map(c => c.id), ['new', 'mid']);
    assert.equal(workspace.feedInboxSlice(list, { window: 50 }).hasOlder, false);
});

test('the Messenger page asks for a window, sends its pins and offers the older threads', () => {
    const page = readFileSync(new URL('../pages/hub/messenger.js', import.meta.url), 'utf8');
    assert.match(page, /workspace: workspaceSelection\.clubId \? 'club' : 'feed'/);
    assert.match(page, /pinnedIds: pinnedConvoIdsRef\.current/);
    assert.match(page, /window: feedWindowRef\.current/);
    assert.match(page, />Load Older Conversations</);
    assert.match(page, /resolveConversationRef\.current\(hit\.conversation_id\)/);
});

test('the new reader is service-role only, definer, and derived from the existing attention rule', () => {
    const sql = readFileSync(new URL('../supabase/migrations/20261118230000_messenger_invoice_attention_ids.sql', import.meta.url), 'utf8');
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.fn_messenger_private_invoice_attention_ids\(\s*p_user_id uuid\s*\)\s*RETURNS uuid\[\]/);
    assert.match(sql, /SECURITY DEFINER\s+SET search_path TO 'public', 'pg_temp'/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.fn_messenger_private_invoice_attention_ids\(uuid\) FROM PUBLIC, anon, authenticated;/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.fn_messenger_private_invoice_attention_ids\(uuid\) TO service_role;/);
    assert.match(sql, /cm\.membership_lifecycle_status = 'active'/);
    assert.match(sql, /i\.status IN \('pending', 'generated', 'overdue'\)/);
    assert.match(sql, /i\.invoice_type IS DISTINCT FROM 'cashier_cashout'/);
});
