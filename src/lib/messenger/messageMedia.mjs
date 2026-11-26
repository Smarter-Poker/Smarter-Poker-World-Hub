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

import { isLiveInvite } from './liveInvite.mjs';
import { isCallReceipt, describeCallReceipt } from './callReceipt.mjs';

export const MEDIA_KINDS = ['image', 'video', 'gif', 'audio'];
export const VISUAL_MEDIA_KINDS = ['image', 'video', 'gif'];

const MARKER_BY_KIND = { image: 'Image', video: 'Video', gif: 'GIF', audio: 'Audio' };
const KIND_BY_MARKER = { image: 'image', video: 'video', gif: 'gif', audio: 'audio' };
const LABEL_BY_KIND = { image: 'Photo', video: 'Video', gif: 'GIF', audio: 'Voice Message' };
const UPLOAD_EXT_MIME = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
    mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v',
    webm: 'video/webm', avi: 'video/x-msvideo', '3gp': 'video/3gpp',
    '3g2': 'video/3gpp2', hevc: 'video/hevc', mkv: 'video/x-matroska',
};
const BLOCKED_UPLOAD_MIMES = new Set(['image/svg+xml']);

/** True when an attachment renders as visual media (1px frameless card, no thick bubble padding). */
export function isVisualMediaKind(kind) {
    return VISUAL_MEDIA_KINDS.includes(kind);
}

/**
 * Resolve a browser File's upload kind and MIME type, with extension fallback
 * for iOS Photo Library picks that omit file.type or report application/octet-stream.
 */
export function resolveUploadMedia(file) {
    if (!file) return null;
    const rawMime = String(file.type || '').split(';')[0].trim().toLowerCase();
    let mimeType = rawMime;
    if (!mimeType || mimeType === 'application/octet-stream') {
        const ext = String(file.name || '').split('.').pop().toLowerCase();
        mimeType = UPLOAD_EXT_MIME[ext] || '';
    }
    if (!mimeType || BLOCKED_UPLOAD_MIMES.has(mimeType)) return null;
    if (mimeType.startsWith('image/')) return { kind: 'image', mimeType };
    if (mimeType.startsWith('video/')) return { kind: 'video', mimeType };
    return null;
}

/**
 * Append the iOS Safari first-frame media fragment (#t=0.001) to safe https
 * video URLs so uploaded videos render a decoded first frame instead of a blank box.
 */
export function videoPreviewUrl(url) {
    if (!isSafeMediaUrl(url)) return null;
    const trimmed = url.trim();
    if (/^blob:/i.test(trimmed) || trimmed.includes('#')) return trimmed;
    return `${trimmed}#t=0.001`;
}

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
export function encodeMessageMedia({ kind, url, duration, caption } = {}) {
    const marker = MARKER_BY_KIND[kind];
    if (!marker || !isSafeMediaUrl(url)) return null;
    const base = `[${marker}](${url.trim()})`;
    const body = kind === 'audio' ? `${base}|dur:${normalizedDuration(duration)}` : base;
    const cleanCaption = typeof caption === 'string'
        ? caption.replace(/\r\n?/g, '\n').trim()
        : '';
    if (!cleanCaption) return body;
    return `${body} ${cleanCaption}`;
}

const MIN_MEDIA_ASPECT = 0.25;
const MAX_MEDIA_ASPECT = 4;

/**
 * Extract validated positive pixel dimensions and a clamped CSS aspect ratio
 * from a message's media_metadata so visual frames reserve space before decode
 * without layout shift (CLS).
 */
export function extractMediaDimensions(meta) {
    if (!meta || typeof meta !== 'object') return null;
    const width = Number(meta.media_width ?? meta.width);
    const height = Number(meta.media_height ?? meta.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    const w = Math.round(width);
    const h = Math.round(height);
    if (w < 16 || h < 16 || w > 16384 || h > 16384) return null;
    const ratio = w / h;
    if (!Number.isFinite(ratio) || ratio < MIN_MEDIA_ASPECT || ratio > MAX_MEDIA_ASPECT) return null;
    return { width: w, height: h, aspectRatio: `${w} / ${h}` };
}

/**
 * Extract all visual media items (photos, GIFs, videos) from a thread's
 * message list for the Shared Media gallery drawer, newest first.
 */
export function extractSharedThreadMedia(messages) {
    if (!Array.isArray(messages)) return [];
    const items = [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i];
        if (!message || message.is_deleted || message.message_type === 'invoice') continue;
        const content = String(message.content || message.text || '');
        const parsed = parseMessageMedia(content);
        if (!parsed || !isVisualMediaKind(parsed.kind)) continue;
        items.push({
            id: message.id || `${parsed.kind}-${i}`,
            kind: parsed.kind,
            url: parsed.url,
            caption: parsed.caption || '',
            createdAt: message.created_at || message.timestamp || null,
            sender: message.profiles || null,
            dimensions: extractMediaDimensions(message.media_metadata || message.metadata),
        });
    }
    return items;
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

/** Strip leading [REPLY:...] header, returning { replyQuote, body }. */
export function extractReplyPrefix(content) {
    if (typeof content !== 'string') return { replyQuote: null, body: '' };
    const match = /^\[REPLY:([^\]]+)\]\s*/.exec(content);
    if (!match) return { replyQuote: null, body: content };
    return { replyQuote: match[1].trim(), body: content.slice(match[0].length) };
}

/** Strip repeated leading [Forwarded] prefixes so forwarding never double-wraps. */
export function stripForwardPrefix(content) {
    if (typeof content !== 'string') return '';
    let text = content.trim();
    while (text.startsWith(FORWARD_PREFIX)) {
        text = text.slice(FORWARD_PREFIX.length).trim();
    }
    return text;
}

/**
 * Plain-text quote safe to embed inside [REPLY:...].
 * Media attachments resolve to their human label (never raw `[Image](url)` whose
 * inner `]` would prematurely terminate `[REPLY:...]` and corrupt the message).
 */
export function formatReplyQuote(content, maxLength = 80) {
    const raw = extractReplyPrefix(String(content || '')).body.trim();
    if (!raw) return 'Attachment';
    const media = parseMessageMedia(raw);
    let summary;
    if (media) {
        const label = mediaPreviewLabel(media.kind);
        summary = media.caption ? `${label}: ${media.caption}` : label;
    } else if (isLiveInvite(raw)) {
        summary = 'Live Stream Invite';
    } else if (isCallReceipt(raw)) {
        summary = describeCallReceipt(raw);
    } else {
        summary = stripForwardPrefix(raw);
    }
    const safe = summary.replace(/[\r\n]+/g, ' ').replace(/\]/g, '').replace(/\s+/g, ' ').trim();
    if (!safe) return 'Attachment';
    return maxLength > 0 && safe.length > maxLength ? safe.slice(0, maxLength).trimEnd() : safe;
}

/** True when a message payload is structured (media, call receipt, live invite) and must not be edited as plain text. */
export function isStructuredMessageContent(content) {
    const raw = extractReplyPrefix(String(content || '')).body.trim();
    return Boolean(parseMessageMedia(raw) || isLiveInvite(raw) || isCallReceipt(raw));
}

/**
 * The single reader. Returns { kind, url, duration, caption, forwarded } for a
 * media message, or null for anything else — including a media marker whose
 * URL did not pass the safety check, which stays plain text on purpose.
 */
export function parseMessageMedia(content) {
    if (typeof content !== 'string') return null;
    let text = content.replace(REPLY_PREFIX, '').trim();
    let forwarded = false;
    while (text.startsWith(FORWARD_PREFIX)) {
        forwarded = true;
        text = text.slice(FORWARD_PREFIX.length).trim();
    }

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

// A thread photo is drawn up to 400 CSS pixels wide on desktop, but the file
// behind it is whatever came off the phone (often 1080x2340+ JPEG, >1 MB).
// Storage renders a fitted WebP copy on demand: width 800 stays 2x retina
// sharp across the full 400px desktop width while cutting payload by ~85-90%.
//
// The viewer is deliberately NOT transformed: it fills the screen and may be
// zoomed, so it loads the original.
const STORAGE_OBJECT = /^(https:\/\/[a-z0-9-]+\.supabase\.co)\/storage\/v1\/object\/public\/([^?#]+)$/i;

/**
 * A fitted copy for the thread, or the original URL when it cannot be fitted.
 * Never returns a transform for an animated GIF, which would come back as a
 * still frame, and never for anything that is not our own storage.
 */
export function mediaThumbnailUrl(url, { kind = 'image', width = 800, quality = 72 } = {}) {
    if (!isSafeMediaUrl(url)) return null;
    if (kind !== 'image') return url;
    if (!Number.isInteger(width) || width < 16 || width > 4096) return url;
    if (!Number.isInteger(quality) || quality < 20 || quality > 100) return url;
    const match = STORAGE_OBJECT.exec(url.trim());
    if (!match) return url;
    return `${match[1]}/storage/v1/render/image/public/${match[2]}?width=${width}&quality=${quality}`;
}

/** True when a URL is a fitted copy this module produced. */
export function isThumbnailUrl(url) {
    return typeof url === 'string' && /\/storage\/v1\/render\/image\/public\//.test(url);
}

/** What a conversation list or notification calls this attachment. */
export function mediaPreviewLabel(kind) {
    return LABEL_BY_KIND[kind] || 'Attachment';
}
