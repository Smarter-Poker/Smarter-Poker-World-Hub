/*
 * A SENT PHOTO IS A PHOTO, NOT ITS MARKUP (2026-11-08).
 *
 * The thread printed `[Image](https://…storage…)` as text because the
 * uploader and the renderer spoke different dialects. These tests hold the
 * one dialect in place: one writer, one reader, every surface wired to them.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    encodeMessageMedia,
    parseMessageMedia,
    isMediaMessage,
    isSafeMediaUrl,
    mediaPreviewLabel,
} from '../src/lib/messenger/messageMedia.mjs';
import { messengerPreviewText } from '../src/lib/messengerPreview.mjs';

const PHOTO = 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media-messages/a/b.png';

test('what the uploader writes is exactly what the thread reads back', () => {
    for (const kind of ['image', 'video', 'gif', 'audio']) {
        const encoded = encodeMessageMedia({ kind, url: PHOTO, duration: 12 });
        assert.ok(encoded, `${kind} must encode`);
        const parsed = parseMessageMedia(encoded);
        assert.equal(parsed.kind, kind);
        assert.equal(parsed.url, PHOTO);
    }
    assert.equal(parseMessageMedia(encodeMessageMedia({ kind: 'audio', url: PHOTO, duration: 12 })).duration, 12);
});

test('the photo from the bug report renders as a photo', () => {
    const parsed = parseMessageMedia(`[Image](${PHOTO})`);
    assert.equal(parsed.kind, 'image');
    assert.equal(parsed.url, PHOTO);
    assert.equal(isMediaMessage(`[Image](${PHOTO})`), true);
});

test('messages already in the database still render', () => {
    assert.deepEqual(parseMessageMedia(`[MEDIA]{"url":"${PHOTO}","type":"video"}`).kind, 'video');
    assert.equal(parseMessageMedia(`[MEDIA]${PHOTO}`).kind, 'image');
    assert.equal(parseMessageMedia(`[AUDIO]${PHOTO}`).kind, 'audio');
    assert.equal(parseMessageMedia(`[GIF](${PHOTO})`).kind, 'gif');
});

test('a replied-to or forwarded attachment is still an attachment', () => {
    assert.equal(parseMessageMedia(`[REPLY:Attachment] [Image](${PHOTO})`).kind, 'image');
    const forwarded = parseMessageMedia(`[Forwarded] [Image](${PHOTO})`);
    assert.equal(forwarded.kind, 'image');
    assert.equal(forwarded.forwarded, true);
});

test('the 2026-01 pictograph-prefixed rows still render, and a corrupt one does not', () => {
    assert.equal(parseMessageMedia(`\u{1F4F7} [Image](${PHOTO})`).kind, 'image');
    assert.equal(parseMessageMedia(`\u{1F4F7} [Image](httphttps://smarter.poker/a.png)`), null);
});

test('a caption beside an attachment is kept', () => {
    assert.equal(parseMessageMedia(`[Image](${PHOTO}) look at this`).caption, 'look at this');
});

test('only an https file — or this browser’s own upload preview — ever reaches a media element', () => {
    assert.equal(isSafeMediaUrl('blob:https://smarter.poker/9f0c-4a1d'), true);
    for (const hostile of [
        'javascript:alert(1)',
        'data:text/html;base64,PHNjcmlwdD4=',
        'http://smarter.poker/a.png',
        'https://smarter.poker/a .png',
        `https://smarter.poker/${'a'.repeat(2100)}.png`,
        '',
        null,
    ]) {
        assert.equal(isSafeMediaUrl(hostile), false, `${hostile} must be refused`);
        assert.equal(parseMessageMedia(`[Image](${hostile})`), null, `${hostile} must not render`);
        assert.equal(encodeMessageMedia({ kind: 'image', url: hostile }), null, `${hostile} must not send`);
    }
});

test('plain text is left alone', () => {
    assert.equal(parseMessageMedia('they have all been added back under you'), null);
    assert.equal(parseMessageMedia(`see ${PHOTO}`), null);
    assert.equal(parseMessageMedia('[CALL_RECEIPT]{"type":"video"}'), null);
});

test('the conversation list names the attachment instead of printing markup', () => {
    assert.equal(messengerPreviewText(`[Image](${PHOTO})`), 'Photo');
    assert.equal(messengerPreviewText(`[Audio](${PHOTO})|dur:8`), 'Voice Message');
    assert.equal(messengerPreviewText(`[Video](${PHOTO})`), 'Video');
    assert.equal(mediaPreviewLabel('image'), 'Photo');
});

test('every messenger surface is wired to the one dialect', () => {
    const bubble = readFileSync('src/components/messenger/MessageBubble.js', 'utf8');
    const dock = readFileSync('src/components/messenger/dock/MessengerChat.jsx', 'utf8');
    const page = readFileSync('pages/hub/messenger.js', 'utf8');

    assert.match(bubble, /from '\.\.\/\.\.\/lib\/messenger\/messageMedia\.mjs'/);
    assert.match(bubble, /const media = parseMessageMedia\(content\);/);
    assert.match(dock, /parseMessageMedia/);
    assert.match(page, /encodeMessageMedia/);

    // No surface may hand-write a marker again — that is how the dialects split.
    assert.equal(/\[(?:Image|Video|GIF|Audio)\]\(\$\{/.test(page), false);
    assert.equal(/content\.startsWith\('\[MEDIA\]'\)/.test(bubble), false);
});

test('a removed message never renders its attachment', () => {
    const bubble = readFileSync('src/components/messenger/MessageBubble.js', 'utf8');
    const deleted = bubble.indexOf('if (message.is_deleted) {');
    const media = bubble.indexOf('const media = parseMessageMedia(content);', deleted);
    assert.ok(deleted > 0 && media > deleted, 'the unsent check runs before the attachment renders');
});

test('a photo opens over the conversation, never in another tab or browser', () => {
    const bubble = readFileSync('src/components/messenger/MessageBubble.js', 'utf8');
    // Leaving the app to look at a picture loses the thread, the scroll
    // position and the draft.
    assert.equal(/window\.open/.test(bubble), false, 'no surface may send a photo to a new tab');
    assert.match(bubble, /createPortal/);
    assert.match(bubble, /aria-modal="true"/);
    assert.match(bubble, /aria-label="Close Photo"/);
    assert.match(bubble, /onClick=\{e => \{ e\.stopPropagation\(\); setViewing\(true\); \}\}/);
    // Escape closes it and the page behind stops scrolling while it is open.
    assert.match(bubble, /event\.key === 'Escape'/);
    assert.match(bubble, /document\.body\.style\.overflow = 'hidden'/);
});
