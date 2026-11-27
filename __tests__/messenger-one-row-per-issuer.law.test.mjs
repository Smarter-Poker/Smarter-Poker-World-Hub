// Owner, 2026-11-27: "REMOVE JARVIS FROM THE MESSENGER, AND INVESTIGATE AND FIX
// WHY IM GETTING MULTIPLE UNION ACCOUNTING AND UNION STATEMENTS, THERE SHOULD
// ONLY BE ONE."
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collapseIssuerThreads, selectWorkspaceConversations } from '../src/lib/messengerWorkspace.mjs';

const UNION = 'fade0000-0000-0000-0000-000000000001';
const ME = 'u-me';

test('one union billing four of my clubs shows as ONE row in the combined inbox', () => {
    const rows = [
        { id: 'felt', title: 'Midway Union Statements', unreadCount: 0, last_message_at: '2026-11-24T02:04:00Z', accountingIssuerId: UNION },
        { id: 'kings', title: 'Midway Union Statements', unreadCount: 2, last_message_at: '2026-11-24T02:04:00Z', accountingIssuerId: UNION },
        { id: 'dss', title: 'Midway Union Accounting', unreadCount: 1, last_message_at: '2026-11-24T02:04:00Z', accountingIssuerId: UNION, requiresAction: true },
        { id: 'savage', title: 'Midway Union Accounting', unreadCount: 0, last_message_at: '2026-11-24T02:04:00Z', accountingIssuerId: UNION },
        { id: 'friend', title: null, unreadCount: 0, last_message_at: '2026-11-27T00:00:00Z' },
    ];
    const out = collapseIssuerThreads(rows);
    const union = out.filter(row => /Midway Union/.test(row.title || ''));
    assert.equal(union.length, 1);
    assert.equal(union[0].unreadCount, 3, 'every unread statement is still counted');
    assert.equal(union[0].requiresAction, true, 'an invoice needing action is never hidden');
    assert.ok(['kings', 'dss'].includes(union[0].id), 'the row opens an unread statement first');
    assert.equal(union[0].title, 'Midway Union Accounting', 'the current issuer name, not the legacy Statements label');
    assert.ok(out.some(row => row.id === 'friend'));
    assert.ok(out.every(row => !('accountingIssuerId' in row)));
});

test('threads I SENT to different recipients are never merged', () => {
    const accounting = new Map([
        ['a', { scope_id: 'c1', recipient_id: 'agent-1', sender_id: ME, issuer_id: 'c1', last_discussion_at: '2026-11-23T00:00:00Z' }],
        ['b', { scope_id: 'c1', recipient_id: 'agent-2', sender_id: ME, issuer_id: 'c1', last_discussion_at: '2026-11-23T00:00:00Z' }],
    ]);
    const selected = selectWorkspaceConversations([{ id: 'a', unreadCount: 0 }, { id: 'b', unreadCount: 0 }], accounting, ME, { id: 'c1' }, 'invoices');
    assert.equal(collapseIssuerThreads(selected).length, 2);
});

test('the combined inbox and dock run through the collapse', () => {
    const source = readFileSync(new URL('../src/lib/messengerWorkspace.mjs', import.meta.url), 'utf8');
    assert.match(source, /collapseIssuerThreads\(\[\.\.\.new Map\(combined\.map/);
});

test('Jarvis is not in Messenger: no sidebar row and no ?chat=jarvis deep link', () => {
    const page = readFileSync(new URL('../pages/hub/messenger.js', import.meta.url), 'utf8');
    assert.doesNotMatch(page, /jarvis-avatar/);
    assert.doesNotMatch(page, /Personal Smarter\.Poker Coach/);
    assert.doesNotMatch(page, /router\.query\.chat !== 'jarvis'/);
    const config = readFileSync(new URL('../next.config.js', import.meta.url), 'utf8');
    assert.doesNotMatch(config, /chat=jarvis/);
});
