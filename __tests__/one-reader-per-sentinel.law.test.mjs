/**
 * ONE READER PER SENTINEL.
 *
 * A photo printed as `[Image](https://…)` in the thread for months because
 * the uploader wrote one dialect and the renderer read another, while a third
 * surface quietly worked and hid it. The remedy was one encoder and one
 * decoder in one module.
 *
 * That shape was not unique to photos. A stored message carries other
 * bracketed sentinels, and a sweep on 2026-11-09 found exactly two still
 * parsed in several places:
 *
 *   [LIVE_INVITE]  unpacked in 4 files, written in 3
 *   [CALL_RECEIPT] unpacked in 2 files, detected in 4
 *
 * They had already drifted. MessageBubble and the notifications feed trimmed
 * the invite querystring; the unread-count toast did not. A single stray space
 * would have given the toast `/hub/live/guest? room=…` — a broken join link —
 * while every other surface worked, which is the same failure the photo bug
 * was, caught before a user met it.
 *
 * This law holds the line: a sentinel is parsed in one module, and the
 * surfaces call it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import {
    encodeLiveInvite, parseLiveInvite, liveInviteHref, isLiveInvite, LIVE_INVITE_FALLBACK,
} from '../src/lib/messenger/liveInvite.mjs';
import { isCallReceipt, parseCallReceipt, describeCallReceipt, callDurationText } from '../src/lib/messenger/callReceipt.mjs';

const sourceFiles = () => execSync(
    "git ls-files 'src/**/*.js' 'src/**/*.jsx' 'src/**/*.mjs' 'pages/**/*.js' 'pages/**/*.jsx'",
    { encoding: 'utf8' }).trim().split('\n').filter(Boolean);

const OWNERS = {
    '[LIVE_INVITE]': 'src/lib/messenger/liveInvite.mjs',
    '[CALL_RECEIPT]': 'src/lib/messenger/callReceipt.mjs',
    '[Forwarded]': 'src/lib/messenger/messageMedia.mjs',
};

test('the sweep can see the tree, so it cannot pass by reading nothing', () => {
    const files = sourceFiles();
    assert.ok(files.length > 500, `Expected the application sources, found ${files.length}`);
});

test('only the owning module unpacks a sentinel; every surface calls it', () => {
    const offenders = [];
    for (const file of sourceFiles()) {
        const source = readFileSync(file, 'utf8');
        // Comments explaining the format are not parsers of it.
        const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
        for (const [marker, owner] of Object.entries(OWNERS)) {
            if (file === owner) continue;
            const literal = marker.replace(/[[\]]/g, '\\$&');
            // Unpacking means slicing the marker off the content, not merely
            // naming it: `.replace('[X]','')`, `.slice('[X]'.length)`, `/^\[X\]/`.
            const unpacks = new RegExp(`\\.replace\\(\\s*['"\`]${literal}['"\`]|\\.slice\\(\\s*['"\`]${literal}['"\`]\\s*\\.length`).test(code);
            if (unpacks) offenders.push(`${file} unpacks ${marker} (owner: ${owner})`);
        }
    }
    assert.deepEqual(offenders, [],
        'Unpack a sentinel in its owning module and call that module here, or the two drift apart.');
});

test('what the writer writes is what every reader reads back', () => {
    const written = encodeLiveInvite({ roomId: 'room-1', inviteCode: 'code-2' });
    assert.equal(written, '[LIVE_INVITE]room=room-1&invite=code-2');
    assert.equal(isLiveInvite(written), true);
    assert.deepEqual(parseLiveInvite(written), { query: 'room=room-1&invite=code-2', joinHref: '/hub/live/guest?room=room-1&invite=code-2' });
    assert.equal(encodeLiveInvite({ roomId: 'r' }), null, 'an incomplete invite is not written');
    assert.equal(encodeLiveInvite(), null);
});

test('the drift this found: a stray space no longer breaks one surface and not the others', () => {
    // The unread-count toast did not trim; the other two did.
    const padded = '[LIVE_INVITE] room=r1&invite=c2';
    assert.equal(liveInviteHref(padded), '/hub/live/guest?room=r1&invite=c2');
    // Nothing usable, and nothing hostile, becomes a guest URL.
    for (const bad of ['[LIVE_INVITE]', '[LIVE_INVITE]   ', '[LIVE_INVITE]/evil?x=1', '[LIVE_INVITE]a b']) {
        assert.equal(liveInviteHref(bad), LIVE_INVITE_FALLBACK, `${bad} must fall back to the lives index`);
    }
    assert.equal(parseLiveInvite('not an invite'), null);
    assert.equal(liveInviteHref('not an invite'), LIVE_INVITE_FALLBACK);
});

test('a call receipt reads the same in the thread and in the conversation list', () => {
    const made = status => `[CALL_RECEIPT]${JSON.stringify({ type: 'video', status, duration: 75 })}`;
    assert.equal(describeCallReceipt(made('completed')), 'Video Call, 1m 15s');
    assert.equal(describeCallReceipt(made('missed')), 'Missed Video Call, 1m 15s');
    assert.equal(parseCallReceipt(made('declined')).status, 'declined');
    assert.equal(parseCallReceipt(made('nonsense')).status, 'completed', 'an unknown status is not invented');
    assert.equal(callDurationText(75), '1m 15s');
    assert.equal(callDurationText(9), '9s');
    assert.equal(callDurationText(0), '');
    // The receipts written before the payload existed are still in the thread.
    const legacy = parseCallReceipt('[CALL_RECEIPT]Video call ended');
    assert.equal(legacy.legacy, 'Video Call ended');
    assert.equal(describeCallReceipt('[CALL_RECEIPT]Video call ended'), 'Video Call ended');
    assert.equal(isCallReceipt('hello'), false);
    assert.equal(parseCallReceipt('hello'), null);
});
