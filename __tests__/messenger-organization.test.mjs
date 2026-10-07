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

test('action-required conversations sort ahead of unread-only conversations', () => {
    const rows = [
        { id: 'unread', unreadCount: 4, last_message_at: '2026-10-05T04:00:00Z' },
        { id: 'action', requiresAction: true, unreadCount: 0, last_message_at: '2026-10-01T04:00:00Z' },
    ];
    assert.deepEqual(organizeConversations(rows).map((row) => row.id), ['action', 'unread']);
});

test('organization keeps pins first, then unread conversations, then recency', () => {
    assert.deepEqual(
        organizeConversations(conversations, { pinnedIds: ['pinned-read'] }).map((row) => row.id),
        ['pinned-read', 'new-unread', 'old-unread', 'new-read']
    );
});

test('unread and search views cannot surface a thread that is outside the returned workspace', () => {
    assert.deepEqual(organizeConversations(conversations, { unreadOnly: true }).map((row) => row.id), ['new-unread', 'old-unread']);
    assert.deepEqual(organizeConversations(conversations, { query: 'priority' }).map((row) => row.id), ['new-unread']);
});
