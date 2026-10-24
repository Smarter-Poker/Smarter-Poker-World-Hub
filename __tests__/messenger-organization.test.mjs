import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationNeedsAttention, conversationRequiresAction, organizeConversations } from '../src/lib/messengerOrganization.mjs';

const conversations = [
    { id: 'old-unread', unreadCount: 1, last_message_at: '2026-10-01T01:00:00Z', otherUser: { username: 'old' } },
    { id: 'new-read', unreadCount: 0, last_message_at: '2026-10-05T01:00:00Z', otherUser: { username: 'new' } },
    { id: 'new-unread', unreadCount: 2, last_message_at: '2026-10-04T01:00:00Z', otherUser: { username: 'priority' } },
    { id: 'pinned-read', unreadCount: 0, last_message_at: '2026-09-01T01:00:00Z', otherUser: { username: 'pinned' } },
];

test('attention is derived only from an authoritative unread count', () => {
    assert.equal(conversationNeedsAttention({ unreadCount: 1 }), true);
    assert.equal(conversationNeedsAttention({ unreadCount: 0 }), false);
    assert.equal(conversationNeedsAttention(null), false);
});

test('an explicit action requirement stays distinct from unread state', () => {
    assert.equal(conversationRequiresAction({ requiresAction: true, unreadCount: 0 }), true);
    assert.equal(conversationNeedsAttention({ requiresAction: true, unreadCount: 0 }), true);
    assert.equal(conversationRequiresAction({ requiresAction: 'pending', unreadCount: 0 }), false);
    assert.equal(conversationRequiresAction({ unreadCount: 4 }), false);
});

test('unread conversations sort ahead of read action-required invoices', () => {
    const rows = [
        { id: 'action', requiresAction: true, unreadCount: 0, last_message_at: '2026-10-05T04:00:00Z', title: 'Invoice' },
        { id: 'unread', unreadCount: 4, last_message_at: '2026-10-01T04:00:00Z', title: 'Club' },
        { id: 'read', unreadCount: 0, last_message_at: '2026-10-06T04:00:00Z', title: 'Other' },
    ];
    assert.deepEqual(organizeConversations(rows).map((row) => row.id), ['unread', 'action', 'read']);
});

test('owner rule: unread always on top, even above pins; then pins, then recency', () => {
    assert.deepEqual(
        organizeConversations(conversations, { pinnedIds: ['pinned-read'] }).map((row) => row.id),
        ['new-unread', 'old-unread', 'pinned-read', 'new-read']
    );
});

test('a pinned unread thread stays among the unread, newest unread first', () => {
    const rows = [
        { id: 'pinned-unread-old', unreadCount: 1, last_message_at: '2026-10-01T00:00:00Z', title: 'a' },
        { id: 'unread-new', unreadCount: 1, last_message_at: '2026-10-03T00:00:00Z', title: 'b' },
        { id: 'pinned-read', unreadCount: 0, last_message_at: '2026-10-09T00:00:00Z', title: 'c' },
    ];
    assert.deepEqual(organizeConversations(rows, { pinnedIds: ['pinned-unread-old', 'pinned-read'] }).map((row) => row.id),
        ['unread-new', 'pinned-unread-old', 'pinned-read']);
});

test('a one-to-one thread with no named counterpart is never listed (no Unknown rows)', () => {
    const rows = [
        { id: 'orphan', unreadCount: 0, last_message_at: '2026-10-24T00:00:00Z', otherUser: null },
        { id: 'nameless', unreadCount: 3, last_message_at: '2026-10-24T00:00:00Z', otherUser: { id: 'x' } },
        { id: 'group', is_group: true, unreadCount: 0, last_message_at: '2026-10-01T00:00:00Z' },
        { id: 'named', unreadCount: 0, last_message_at: '2026-10-02T00:00:00Z', otherUser: { display_name: 'Player #1250' } },
    ];
    assert.deepEqual(organizeConversations(rows).map((row) => row.id), ['named', 'group']);
});

test('unread and search views cannot surface a thread that is outside the returned workspace', () => {
    assert.deepEqual(organizeConversations(conversations, { unreadOnly: true }).map((row) => row.id), ['new-unread', 'old-unread']);
    assert.deepEqual(organizeConversations(conversations, { query: 'priority' }).map((row) => row.id), ['new-unread']);
});
