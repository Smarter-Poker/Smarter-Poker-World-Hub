/**
 * Message notifications carry their sender (Dan 2026-10-21).
 *
 * Club Arena's live message pop-up and the bell show who wrote. Before this,
 * every `new_message` notification was written with actor_id null and only
 * the conversation id in data, so no reader could show the sender without a
 * second lookup. notify.js imports extensionless modules that raw `node --test`
 * cannot load, so this pins the contract in source, like its neighbours.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const notify = readFileSync(new URL('../src/lib/notify.js', import.meta.url), 'utf8');
const sendMessage = readFileSync(new URL('../pages/api/messenger/send-message.js', import.meta.url), 'utf8');

const helper = notify.slice(
    notify.indexOf('export function notifyNewMessage('),
    notify.indexOf('export function notifyFriendRequest('),
);

test('notifyNewMessage takes the sender id and records it as the actor', () => {
    assert.match(helper, /export function notifyNewMessage\([^)]*\bsenderId\)/);
    assert.match(helper, /actorId:\s*senderId \|\| undefined/);
});

test('message notification data carries the sender id and avatar for live readers', () => {
    assert.match(helper, /conversationId,/);
    assert.match(helper, /senderId \? \{ senderId \} : \{\}/);
    assert.match(helper, /senderAvatarUrl \? \{ senderAvatarUrl \} : \{\}/);
});

test('send-message passes the authenticated sender to notifyNewMessage', () => {
    assert.match(sendMessage, /senderProfile\?\.avatar_url \|\| null, userId\s*\)/);
});

test('the generic gateway still writes actor_id from actorId', () => {
    assert.match(notify, /actor_id: args\.actorId \|\| null/);
});
