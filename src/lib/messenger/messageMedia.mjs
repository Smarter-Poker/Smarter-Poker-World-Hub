/*
 * ONE DIALECT FOR MESSENGER ATTACHMENTS (2026-11-08).
 *
 * ROOT CAUSE THIS FILE EXISTS TO END: the uploader wrote one dialect and the
 * thread renderer read another. `pages/hub/messenger.js` stored a photo as
 * `[Image](https://…)`, while `MessageBubble` only recognised `[GIF](…)` plus
 * the retired `[MEDIA]` / `[AUDIO]` prefixes. A sent photo therefore printed
 * its own markup as text with a bare storage link beside it, and the same was
 * true of videos and voice notes. The dock had a third, private parser.
 *
 * Every surface now encodes and decodes through this module, so a writer can
 * never drift from a reader again. Decoding accepts the retired prefixes so
 * messages already in the database keep rendering — nothing is rewritten in
 * place. Encoding emits exactly one shape.
 *
 * Hardening: a URL only renders when it is https (or a blob: preview this
 * client just made for an in-flight upload). Anything else — javascript:,
 * data:, plain http, whitespace-bearing, or absurdly long — is refused here
 * and the message falls back to plain text rather than reaching an <img src>.
 */

export const MEDIA_KINDS = ['image', 'video', 'gif', 'audio'];

const MARKER_BY_KIND = { image: 'Image', video: 'Video', gif: 'GIF', audio: 'Audio' };
const KIND_BY_MARKER = { image: 'image', video: 'video', gif: 'gif', audio: 'audio' };
const LABEL_BY_KIND = { image: 'Photo', video: 'Video', gif: 'GIF', audio: 'Voice Message' };

const MAX_URL_LENGTH = 2048;
const FORWARD_PREFIX = '[Forwarded] ';
const REPLY_PREFIX = /^\[REPLY:[^\]]*\]\s*/;
const MEDIA_PATTERN = /^\[(Image|Video|GIF|Audio)\]\(([^()\s]+)\)(?:\|dur:(\d+(?:\.\d+)?))?/i;
// A 2026-01 build prefixed attachments with a camera pictograph ("📷 [Image](…)").
// Those rows are still in the thread, so decoration ahead of the marker is
// stripped before matching. It is never written.
const LEADING_DECORATION = /^[\p{Extended_Pictographic}\u{FE0F}\u{200D}\s]+/u;

/** A URL is only ever handed to a media element when it passes this. */
export function isSafeMediaUrl(value) {
    if (typeof value !== 'string') return false;
    const url = value.trim();
    if (!url || url.length > MAX_URL_LENGTH) return false;
    if (/[\s<>"'`\\]/.test(url)) return false;
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }
    if (parsed.protocol === 'https:') return true;
    // A blob: preview is this browser's own object URL for a file that is
    // still uploading. It is same-origin, ephemeral and never persisted.
    return parsed.protocol === 'blob:' && /^blob:https:/i.test(url);
}

function normalizedDuration(value) {
    const duration = Number(value);
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

/** The single writer. Returns null rather than emitting an unsafe message. */
export function encodeMessageMedia({ kind, url, duration } = {}) {
    const marker = MARKER_BY_KIND[kind];
    if (!marker || !isSafeMediaUrl(url)) return null;
    const body = `[${marker}](${url.trim()})`;
    if (kind !== 'audio') return body;
    return `${body}|dur:${normalizedDuration(duration)}`;
}

function fromLegacyMedia(rest) {
    let url = rest;
    let kind = 'image';
    try {
        const parsed = JSON.parse(rest);
        url = parsed?.url;
        kind = parsed?.type === 'video' ? 'video' : parsed?.type === 'audio' ? 'audio' : 'image';
    } catch {
        /* a retired plain-URL payload */
    }
    return isSafeMediaUrl(url) ? { kind, url: String(url).trim(), duration: 0, caption: '' } : null;
}

/**
 * The single reader. Returns { kind, url, duration, caption, forwarded } for a
 * media message, or null for anything else — including a media marker whose
 * URL did not pass the safety check, which stays plain text on purpose.
 */
export function parseMessageMedia(content) {
    if (typeof content !== 'string') return null;
    let text = content.replace(REPLY_PREFIX, '').trim();
    const forwarded = text.startsWith(FORWARD_PREFIX);
    if (forwarded) text = text.slice(FORWARD_PREFIX.length).trim();

    text = text.replace(LEADING_DECORATION, '');

    const match = MEDIA_PATTERN.exec(text);
    if (match) {
        const kind = KIND_BY_MARKER[match[1].toLowerCase()];
        const url = match[2];
        if (!kind || !isSafeMediaUrl(url)) return null;
        return {
            kind,
            url: url.trim(),
            duration: normalizedDuration(match[3]),
            caption: text.slice(match[0].length).trim(),
            forwarded,
        };
    }

    if (text.startsWith('[MEDIA]')) {
        const legacy = fromLegacyMedia(text.slice('[MEDIA]'.length).trim());
        return legacy ? { ...legacy, forwarded } : null;
    }
    if (text.startsWith('[AUDIO]')) {
        const url = text.slice('[AUDIO]'.length).trim();
        return isSafeMediaUrl(url) ? { kind: 'audio', url, duration: 0, caption: '', forwarded } : null;
    }
    return null;
}

/** True when a message is an attachment, so link-preview cards stand down. */
export function isMediaMessage(content) {
    return parseMessageMedia(content) !== null;
}

/** What a conversation list or notification calls this attachment. */
export function mediaPreviewLabel(kind) {
    return LABEL_BY_KIND[kind] || 'Attachment';
}
