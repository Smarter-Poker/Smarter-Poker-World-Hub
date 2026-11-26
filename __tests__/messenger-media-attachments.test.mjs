/*
 * A SENT PHOTO IS A PHOTO, NOT ITS MARKUP (2026-11-08).
 *
 * The thread printed `[Image](https://…storage…)` as text because the
 * uploader and the renderer spoke different dialects. These tests hold the
 * one dialect in place: one writer, one reader, every surface wired to them.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as messageMedia from '../src/lib/messenger/messageMedia.mjs';
import {
    encodeMessageMedia,
    extractMediaDimensions,
    extractReplyPrefix,
    extractSharedThreadMedia,
    formatReplyQuote,
    parseMessageMedia,
    isMediaMessage,
    isSafeMediaUrl,
    isStructuredMessageContent,
    isVisualMediaKind,
    mediaPreviewLabel,
    mediaThumbnailUrl,
    isThumbnailUrl,
    resolveUploadMedia,
    stripForwardPrefix,
    videoPreviewUrl,
} from '../src/lib/messenger/messageMedia.mjs';
import * as liveInvite from '../src/lib/messenger/liveInvite.mjs';
import * as callReceipt from '../src/lib/messenger/callReceipt.mjs';
import * as reliabilityIncident from '../src/lib/messenger/reliabilityIncident.mjs';
import * as accountingMessage from '../src/lib/accountingMessage.mjs';
import * as unionEco from '../src/lib/unionEco.mjs';
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
    assert.match(bubble, /onClick=\{e => \{ e\.stopPropagation\(\); setViewing\(true\); \}\}/);
    // The dialog itself is MediaViewer's; messenger-viewer-gestures pins its
    // behaviour, and this only pins that the thread opens it.
    assert.match(bubble, /<MediaViewer /);
});

// A THREAD PHOTO IS DRAWN UP TO 400PX WIDE ON DESKTOP, SO WIDTH 800 IS 2X RETINA SHARP (2026-11-25).
test('a thread photo is requested at 2x retina width from our own storage only', () => {
    const stored = 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/messages/a/b.jpg';
    const fitted = mediaThumbnailUrl(stored);
    assert.match(fitted, /\/storage\/v1\/render\/image\/public\/social-media\/messages\/a\/b\.jpg\?width=800&quality=72$/);
    assert.equal(isThumbnailUrl(fitted), true);
    assert.equal(isThumbnailUrl(stored), false);
});

test('an animated GIF is never fitted, because a still frame is not a GIF', () => {
    const stored = 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/messages/a/b.gif';
    assert.equal(mediaThumbnailUrl(stored, { kind: 'gif' }), stored);
    assert.equal(mediaThumbnailUrl(stored, { kind: 'video' }), stored);
    assert.equal(mediaThumbnailUrl(stored, { kind: 'audio' }), stored);
});

test('anything we do not host, and any unsafe or absurd request, is left alone or refused', () => {
    const foreign = 'https://example.invalid/a.jpg';
    assert.equal(mediaThumbnailUrl(foreign), foreign, 'a foreign host is not ours to transform');
    const signed = 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/sign/social-media/a.jpg?token=x';
    assert.equal(mediaThumbnailUrl(signed), signed, 'only a public object URL is rewritten');
    assert.equal(mediaThumbnailUrl('javascript:alert(1)'), null);
    assert.equal(mediaThumbnailUrl(null), null);
    const stored = 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/a.jpg';
    for (const bad of [{ width: 0 }, { width: 99999 }, { width: 1.5 }, { quality: 1 }, { quality: 300 }]) {
        assert.equal(mediaThumbnailUrl(stored, bad), stored, `${JSON.stringify(bad)} must fall back to the original`);
    }
});

test('the viewer loads the original, and a failed fit costs bandwidth not the picture', () => {
    const bubble = readFileSync('src/components/messenger/MessageBubble.js', 'utf8');
    // The thread draws the fitted copy.
    assert.match(bubble, /const threadSrc = fitted \? \(mediaThumbnailUrl\(media\.url, \{ kind: media\.kind \}\) \|\| media\.url\) : media\.url;/);
    assert.match(bubble, /src=\{threadSrc\}/);
    // A fitted copy that will not load drops to the original before giving up.
    assert.match(bubble, /if \(threadSrc !== media\.url\) setFitted\(false\); else setFailed\(true\);/);
    // The viewer is never fitted: it fills the screen and may be zoomed.
    const viewer = bubble.slice(bubble.indexOf('aria-modal="true"'));
    assert.equal(/mediaThumbnailUrl/.test(viewer), false, 'the full-screen viewer must load the original');
});

// UPLOADED IMAGES & VIDEOS RENDER NORMAL-SIZED WITH A 1PX THIN FRAME (2026-11-25).
// Regression: MessageBubble wrapped photos and videos in the padded 8px/12px blue
// text bubble and crushed height to 280px (shrinking a phone screenshot to 129px
// wide inside a thick blue frame). Every messenger surface now renders visual
// media flush inside a 1px hairline border at normal chat dimensions.
test('visual media classification, upload MIME fallback, and video preview fragment', () => {
    assert.equal(isVisualMediaKind('image'), true);
    assert.equal(isVisualMediaKind('video'), true);
    assert.equal(isVisualMediaKind('gif'), true);
    assert.equal(isVisualMediaKind('audio'), false);
    assert.equal(isVisualMediaKind(null), false);

    assert.deepEqual(resolveUploadMedia({ name: 'shot.png', type: 'image/png' }), { kind: 'image', mimeType: 'image/png' });
    assert.deepEqual(resolveUploadMedia({ name: 'clip.mp4', type: 'video/mp4; codecs=avc1' }), { kind: 'video', mimeType: 'video/mp4' });
    // iOS Photo Library picks often omit file.type or send octet-stream.
    assert.deepEqual(resolveUploadMedia({ name: 'IMG_1024.HEIC', type: '' }), { kind: 'image', mimeType: 'image/heic' });
    assert.deepEqual(resolveUploadMedia({ name: 'IMG_1025.MOV', type: 'application/octet-stream' }), { kind: 'video', mimeType: 'video/quicktime' });
    assert.equal(resolveUploadMedia({ name: 'evil.svg', type: 'image/svg+xml' }), null, 'SVG must be refused client-side');
    assert.equal(resolveUploadMedia({ name: 'doc.pdf', type: 'application/pdf' }), null);

    const video = 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/messages/a/clip.mp4';
    assert.equal(videoPreviewUrl(video), `${video}#t=0.001`);
    assert.equal(videoPreviewUrl(`${video}#t=2`), `${video}#t=2`);
    assert.equal(videoPreviewUrl('blob:https://smarter.poker/abc'), 'blob:https://smarter.poker/abc');
    assert.equal(videoPreviewUrl('javascript:alert(1)'), null);
});

test('MessageBubble renders uploaded images, videos and GIFs full-sized with a 1px thin frame and zero thick bubble padding', () => {
    const require = createRequire(import.meta.url);
    const ts = require('typescript');
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const lightTheme = {
        bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
        blue: '#0084FF', red: '#E41E3F', border: '#E4E6EB', hoverBg: '#E4E6EB',
        ownBubble: 'linear-gradient(135deg, #0084FF 0%, #0066CC 100%)', otherBubble: '#E4E6EB',
    };
    const darkTheme = { ...lightTheme, bg: '#1C1E21', card: '#242526', text: '#E4E6EB', border: '#3E4042', otherBubble: '#3A3B3C' };
    const code = ts.transpileModule(readFileSync('src/components/messenger/MessageBubble.js', 'utf8'), {
        fileName: 'MessageBubble.jsx',
        compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const mod = { exports: {} };
    const Nothing = () => null;
    new Function('require', 'module', 'exports', code)(name => ({
        './MediaViewer': { __esModule: true, default: Nothing, ATTACHMENT_ATTRIBUTE: 'data-message-attachment' },
        './MessengerTheme': { defaultTheme: lightTheme },
        './Avatar': { Avatar: Nothing },
        './AccountingInvoiceCard': { __esModule: true, default: Nothing },
        './InvoicePaymentStatus': { __esModule: true, default: Nothing },
        './CashoutRequestActions': { __esModule: true, default: Nothing, formatChips: String },
        './ReliabilityIncidentControls': { __esModule: true, default: Nothing, ReliabilityMessageHeader: Nothing, ReliabilityMessageDelete: Nothing },
        '../../lib/authUtils': { getAccessToken: () => null, authedFetch: async () => ({}) },
        '../../lib/accountingMessage.mjs': accountingMessage,
        '../../lib/unionEco.mjs': unionEco,
        '../../lib/messenger/messageMedia.mjs': messageMedia,
        '../../lib/messenger/liveInvite.mjs': liveInvite,
        '../../lib/messenger/callReceipt.mjs': callReceipt,
        '../../lib/messenger/reliabilityIncident.mjs': reliabilityIncident,
    })[name] || require(name), mod, mod.exports);
    const { MessageBubble } = mod.exports;

    const renderBubble = (content, { isOwn = true, theme = lightTheme, isDeleted = false, sender = { username: 'Dan', is_vip: true } } = {}) =>
        renderToStaticMarkup(React.createElement(MessageBubble, {
            message: { id: 'm1', content, created_at: '2026-11-25T17:00:00Z', is_deleted: isDeleted },
            isOwn, showAvatar: false, showTime: true, isLastInGroup: true, sender, currentUserId: 'u1', theme,
        }));

    // Uploaded photo: 1px thin frame, zero bubble padding, transparent bubble background, normal sizing.
    const photoHtml = renderBubble(`[Image](${PHOTO})`);
    assert.match(photoHtml, /data-media-frame="image"/);
    assert.match(photoHtml, /max-width:min\(400px, 78%\)/);
    assert.match(photoHtml, /padding:0;border-radius:14px;background:transparent;border:1px solid #E4E6EB/);
    assert.doesNotMatch(photoHtml, /max-height:280px/, 'photos must not be crushed to 280px');
    assert.match(photoHtml, /max-height:min\(520px, 68dvh\)/);
    assert.match(photoHtml, /object-fit:contain/);
    assert.match(photoHtml, /display:block/);
    assert.match(photoHtml, /border-radius:0/);

    // Dark mode received VIP photo: still 1px thin dark border, never thick 3px VIP gold left bar.
    const darkPhotoHtml = renderBubble(`[Image](${PHOTO})`, { isOwn: false, theme: darkTheme });
    assert.match(darkPhotoHtml, /border:1px solid #3E4042/);
    assert.doesNotMatch(darkPhotoHtml, /border-left:3px solid #FFD700/);

    // Uploaded video: 1px thin frame, zero thick padding, normal sizing, iOS first-frame fragment.
    const videoUrl = 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/messages/a/clip.mp4';
    const videoHtml = renderBubble(`[Video](${videoUrl})`);
    assert.match(videoHtml, /data-media-frame="video"/);
    assert.match(videoHtml, /padding:0;border-radius:14px;background:transparent;border:1px solid #E4E6EB/);
    assert.match(videoHtml, /<video[^>]+src="https:\/\/kuklfnapbkmacvwxktbh\.supabase\.co\/storage\/v1\/object\/public\/social-media\/messages\/a\/clip\.mp4#t=0\.001"/);
    assert.match(videoHtml, /preload="metadata"/);
    assert.match(videoHtml, /max-height:min\(520px, 68dvh\)/);
    assert.match(videoHtml, /object-fit:contain/);

    // GIF: 1px thin frame, normal sizing.
    const gifHtml = renderBubble(`[GIF](${PHOTO})`);
    assert.match(gifHtml, /data-media-frame="gif"/);
    assert.match(gifHtml, /padding:0;border-radius:14px;background:transparent;border:1px solid #E4E6EB/);
    assert.match(gifHtml, /max-height:min\(360px, 60dvh\)/);

    // Captioned, replied-to and forwarded photo keep the 1px frame and padded text strips.
    const richHtml = renderBubble(`[REPLY:Where is it?] [Forwarded] [Image](${PHOTO}) Check this hand`);
    assert.match(richHtml, /data-media-frame="image"/);
    assert.match(richHtml, /Where is it\?/);
    assert.match(richHtml, /Forwarded/);
    assert.match(richHtml, /Check this hand/);

    // Plain text and voice messages keep their normal padded colored bubbles.
    const textHtml = renderBubble('Yes it is next to your name');
    assert.doesNotMatch(textHtml, /data-media-frame=/);
    assert.match(textHtml, /padding:8px 12px/);

    const voiceHtml = renderBubble(`[Audio](${PHOTO})|dur:9`);
    assert.doesNotMatch(voiceHtml, /data-media-frame=/);
    assert.match(voiceHtml, /padding:8px 12px/);

    // Unsent photo never renders a media frame or <img>.
    const deletedHtml = renderBubble(`[Image](${PHOTO})`, { isDeleted: true });
    assert.doesNotMatch(deletedHtml, /data-media-frame=/);
    assert.doesNotMatch(deletedHtml, /<img /);
});

test('corner Messenger dock and ClubArenaMessenger use the same 1px thin media frame and shared uploader dialect', () => {
    const dock = readFileSync('src/components/messenger/dock/MessengerChat.jsx', 'utf8');
    const dockCss = readFileSync('src/components/messenger/dock/MessengerDock.css', 'utf8');
    const caMessenger = readFileSync('src/components/club-arena/ClubArenaMessenger.jsx', 'utf8');
    const viewer = readFileSync('src/components/messenger/MediaViewer.jsx', 'utf8');

    assert.match(dock, /encodeMessageMedia/);
    assert.match(dock, /resolveUploadMedia/);
    assert.match(dock, /formatReplyQuote/);
    assert.match(dock, /extractReplyPrefix/);
    assert.match(dock, /mediaThumbnailUrl/);
    assert.match(dock, /<MediaViewer /);
    assert.match(dock, /dock-media-bubble/);
    assert.match(dock, /dock-media-fallback/);
    assert.match(dock, /dock-reply-quote/);
    assert.equal(/\[(?:Image|Video|GIF|Audio)\]\(\$\{/.test(dock), false, 'dock must not hand-write media markers');
    assert.match(dockCss, /\.dock-message-bubble\.dock-media-bubble[\s\S]*padding:\s*0;[\s\S]*border:\s*1px solid/);
    assert.match(dockCss, /\.dock-media-bubble img,[\s\S]*margin:\s*0 auto;[\s\S]*object-fit:\s*contain;/);
    assert.match(caMessenger, /media-bubble/);
    assert.match(caMessenger, /\.message-bubble\.media-bubble[\s\S]*padding:\s*0;[\s\S]*border:\s*1px solid/);
    assert.match(viewer, /onError=\{\(\) => setFailed\(true\)\}/);
    assert.match(viewer, /Unable To Load Photo/);
});

// SECOND-PASS HARDENING (2026-11-25):
// - Replying to a photo/video previously embedded `[Image](url)` inside `[REPLY:...]`
//   whose inner `]` terminated the reply regex early and corrupted the message.
// - Forwarding an already-forwarded photo doubled `[Forwarded]` and broke parsing.
// - Saved Messages, Search, Edit Message, and Copy Text leaked raw `[Image](url)` markup.
test('reply quotes, double-forwarded media, structured edit guards, and search/saved previews never leak or break markup', () => {
    const videoUrl = 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/messages/a/clip.mp4';
    // Reply quotes translate attachments to plain labels and never contain `]`.
    assert.equal(formatReplyQuote(`[Image](${PHOTO})`), 'Photo');
    assert.equal(formatReplyQuote(`[Video](${videoUrl})`), 'Video');
    assert.equal(formatReplyQuote(`[Audio](${PHOTO})|dur:9`), 'Voice Message');
    assert.equal(formatReplyQuote(`[Image](${PHOTO}) Look at the river card`), 'Photo: Look at the river card');
    assert.equal(formatReplyQuote('[REPLY:older] hello [world]'), 'hello [world');
    const replyWire = `[REPLY:${formatReplyQuote(`[Image](${PHOTO})`)}] Nice hand!`;
    assert.deepEqual(extractReplyPrefix(replyWire), { replyQuote: 'Photo', body: 'Nice hand!' });

    // Double-forwarded media still decodes as media, and stripForwardPrefix prevents doubling.
    const dbl = parseMessageMedia(`[Forwarded] [Forwarded] [Image](${PHOTO})`);
    assert.equal(dbl?.kind, 'image');
    assert.equal(dbl?.forwarded, true);
    assert.equal(dbl?.url, PHOTO);
    assert.equal(stripForwardPrefix(`[Forwarded] [Forwarded] [Image](${PHOTO})`), `[Image](${PHOTO})`);

    // Structured media/system messages are refused for text editing.
    assert.equal(isStructuredMessageContent(`[Image](${PHOTO})`), true);
    assert.equal(isStructuredMessageContent(`[Video](${videoUrl})`), true);
    assert.equal(isStructuredMessageContent('[LIVE_INVITE]room=1'), true);
    assert.equal(isStructuredMessageContent('[CALL_RECEIPT]{"type":"video"}'), true);
    assert.equal(isStructuredMessageContent('Good luck!'), false);

    // Previews strip reply/forward wrappers cleanly.
    assert.equal(messengerPreviewText(`[REPLY:Hi] [Image](${PHOTO})`), 'Photo');
    assert.equal(messengerPreviewText('[REPLY:Hi] Thanks!'), 'Thanks!');
    assert.equal(messengerPreviewText('[Forwarded] See you at 8'), 'See you at 8');

    // Every main-page surface wires through the shared helpers.
    const page = readFileSync('pages/hub/messenger.js', 'utf8');
    const bubble = readFileSync('src/components/messenger/MessageBubble.js', 'utf8');
    assert.match(page, /formatReplyQuote\(replyToMessage\.content/);
    assert.match(page, /isStructuredMessageContent\(message\.content/);
    assert.match(page, /stripForwardPrefix\(/);
    assert.match(page, /messengerPreviewText\(item\.message\.content/);
    assert.match(page, /messengerPreviewText\(hit\.content/);
    assert.match(page, /messengerPreviewText\(result\.content/);
    assert.match(bubble, /const canEditMessage = isOwn[\s\S]*!isMediaAttachment/);
    assert.match(bubble, /margin:\s*'0 auto'/);
});

// THIRD-PASS FULL ENHANCEMENT SUITE (2026-11-25):
// Desktop actions (hover/focus pill + right-click + Escape), caption encoding,
// media dimension aspect-ratio CLS reservation, voice unmount cleanup & range
// scrubbing, TUS resumable video upload + progress/cancel, HEIC conversion,
// composer preview tray / paste / drag-and-drop, and Shared Thread Media gallery.
test('caption encoding, aspect-ratio extraction, and shared thread media extraction work cleanly', () => {
    const videoUrl = 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/messages/a/clip.mp4';
    const captioned = encodeMessageMedia({ kind: 'image', url: PHOTO, caption: '  River bluff!  ' });
    assert.equal(captioned, `[Image](${PHOTO}) River bluff!`);
    assert.equal(parseMessageMedia(captioned).caption, 'River bluff!');
    assert.equal(encodeMessageMedia({ kind: 'image', url: PHOTO, caption: '   ' }), `[Image](${PHOTO})`);

    assert.deepEqual(extractMediaDimensions({ media_width: 1080, media_height: 1920 }), {
        width: 1080, height: 1920, aspectRatio: '1080 / 1920',
    });
    assert.equal(extractMediaDimensions({ media_width: 10, media_height: 10 }), null, 'too small');
    assert.equal(extractMediaDimensions({ media_width: 5000, media_height: 100 }), null, 'extreme ratio refused');
    assert.equal(extractMediaDimensions(null), null);

    const gallery = extractSharedThreadMedia([
        { id: '1', content: 'plain text', created_at: '2026-11-25T10:00:00Z' },
        { id: '2', content: `[Image](${PHOTO}) First`, created_at: '2026-11-25T10:01:00Z', media_metadata: { media_width: 800, media_height: 600 } },
        { id: '3', content: `[Image](${PHOTO}) Deleted`, is_deleted: true, created_at: '2026-11-25T10:02:00Z' },
        { id: '4', content: `[Audio](${PHOTO})|dur:5`, created_at: '2026-11-25T10:03:00Z' },
        { id: '5', content: `[Video](${videoUrl}) Clip`, created_at: '2026-11-25T10:04:00Z' },
    ]);
    assert.equal(gallery.length, 2);
    assert.equal(gallery[0].id, '5', 'newest media appears first');
    assert.equal(gallery[0].kind, 'video');
    assert.equal(gallery[1].id, '2');
    assert.deepEqual(gallery[1].dimensions, { width: 800, height: 600, aspectRatio: '800 / 600' });
});

test('MessageBubble renders desktop actions, aspect-ratio reservation, and accessible voice scrubber', () => {
    const require = createRequire(import.meta.url);
    const ts = require('typescript');
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const theme = {
        bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
        blue: '#0084FF', red: '#E41E3F', border: '#E4E6EB', hoverBg: '#E4E6EB',
        ownBubble: 'linear-gradient(135deg, #0084FF 0%, #0066CC 100%)', otherBubble: '#E4E6EB',
    };
    const bubbleSource = readFileSync('src/components/messenger/MessageBubble.js', 'utf8');
    const code = ts.transpileModule(bubbleSource, {
        fileName: 'MessageBubble.jsx',
        compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const mod = { exports: {} };
    const Nothing = () => null;
    new Function('require', 'module', 'exports', code)(name => ({
        './MediaViewer': { __esModule: true, default: Nothing, ATTACHMENT_ATTRIBUTE: 'data-message-attachment' },
        './MessengerTheme': { defaultTheme: theme },
        './Avatar': { Avatar: Nothing },
        './AccountingInvoiceCard': { __esModule: true, default: Nothing },
        './InvoicePaymentStatus': { __esModule: true, default: Nothing },
        './CashoutRequestActions': { __esModule: true, default: Nothing, formatChips: String },
        './ReliabilityIncidentControls': { __esModule: true, default: Nothing, ReliabilityMessageHeader: Nothing, ReliabilityMessageDelete: Nothing },
        '../../lib/authUtils': { getAccessToken: () => null, authedFetch: async () => ({}) },
        '../../lib/accountingMessage.mjs': accountingMessage,
        '../../lib/unionEco.mjs': unionEco,
        '../../lib/messenger/messageMedia.mjs': messageMedia,
        '../../lib/messenger/liveInvite.mjs': liveInvite,
        '../../lib/messenger/callReceipt.mjs': callReceipt,
        '../../lib/messenger/reliabilityIncident.mjs': reliabilityIncident,
    })[name] || require(name), mod, mod.exports);
    const { MessageBubble } = mod.exports;

    const sizedPhotoHtml = renderToStaticMarkup(React.createElement(MessageBubble, {
        message: {
            id: 'm2',
            content: `[Image](${PHOTO})`,
            media_metadata: { media_width: 900, media_height: 1600 },
            created_at: '2026-11-25T17:00:00Z',
        },
        isOwn: true, showAvatar: false, showTime: true, isLastInGroup: true,
        onReply: () => {}, onReact: () => {}, onDelete: () => {},
        currentUserId: 'u1', theme,
    }));
    assert.match(sizedPhotoHtml, /width="900"/);
    assert.match(sizedPhotoHtml, /height="1600"/);
    assert.match(sizedPhotoHtml, /aspect-ratio:900 \/ 1600/);
    assert.match(sizedPhotoHtml, /data-message-actions/);
    assert.match(sizedPhotoHtml, /aria-label="React To Message"/);
    assert.match(sizedPhotoHtml, /aria-label="Reply To Message"/);
    assert.match(sizedPhotoHtml, /aria-label="More Message Actions"/);

    const voiceHtml = renderToStaticMarkup(React.createElement(MessageBubble, {
        message: { id: 'm3', content: `[Audio](${PHOTO})|dur:14`, created_at: '2026-11-25T17:01:00Z' },
        isOwn: false, showAvatar: false, showTime: true, isLastInGroup: true,
        currentUserId: 'u1', theme,
    }));
    assert.match(voiceHtml, /type="range"/);
    assert.match(voiceHtml, /aria-label="Voice Message Progress"/);
    assert.match(voiceHtml, /aria-label="Play Voice Message"/);

    // Source contracts: right-click handler, Escape dismiss, and AudioMessage unmount cleanup.
    assert.match(bubbleSource, /onContextMenu=\{handleContextMenu\}/);
    assert.match(bubbleSource, /event\.key === 'Escape'/);
    assert.match(bubbleSource, /cancelAnimationFrame\(animFrameRef\.current\)[\s\S]*audioRef\.current\.pause\(\)/);
});

test('composer preview tray, paste, drag-and-drop, TUS resumable video, HEIC conversion, and Shared Media drawer are wired', () => {
    const input = readFileSync('src/components/messenger/MessageInput.js', 'utf8');
    const page = readFileSync('pages/hub/messenger.js', 'utf8');
    const uploader = readFileSync('src/lib/messenger/mediaUpload.js', 'utf8');
    const dock = readFileSync('src/components/messenger/dock/MessengerChat.jsx', 'utf8');

    assert.match(input, /data-attachment-preview/);
    assert.match(input, /data-upload-progress/);
    assert.match(input, /aria-label="Cancel Upload"/);
    assert.match(input, /aria-label="Remove Attachment"/);
    assert.match(input, /onPaste=\{handlePaste\}/);
    assert.match(input, /Add A Caption/);

    assert.match(page, /prepareMessengerUploadFile/);
    assert.match(page, /uploadFileWithProgress/);
    assert.match(page, /data-chat-drop-overlay/);
    assert.match(page, /data-testid="conversation-info-drawer"/);
    assert.match(page, /extractSharedThreadMedia\(messages\)/);
    assert.match(page, /media_width: prepared\.width, media_height: prepared\.height/);

    assert.match(uploader, /import \* as tus from 'tus-js-client'/);
    assert.match(uploader, /isHeicFile/);
    assert.match(uploader, /removeFingerprintOnSuccess: true/);
    assert.equal(/onBeforeRequest\s*:/.test(uploader), false, 'tus-js-client v4.3.1 onBeforeRequest setHeader appends headers and breaks Supabase JWS');
    assert.equal(/storeFingerprintForResuming\s*:/.test(uploader), false, 'stale fingerprints cause silent TUS stalls');

    assert.match(dock, /prepareMessengerUploadFile/);
    assert.match(dock, /uploadFileWithProgress/);
    assert.match(dock, /dock-media-preview/);
    assert.match(dock, /dock-upload-progress/);
    assert.match(dock, /onPaste=\{handlePaste\}/);
    assert.match(dock, /extractMediaDimensions/);
});
