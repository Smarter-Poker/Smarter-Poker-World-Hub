/**
 * BACKGROUND VIDEO UPLOAD MANAGER v3.4
 * src/lib/backgroundVideoUpload.js
 *
 * v3.4 (2026-04-29): TRUE ROOT CAUSE FIX for "Invalid Compact JWS".
 *
 * After deploying v3.3 the upload still failed. Drove an end-to-end test on
 * Dan's browser via computer-use and traced the actual difference between
 * a working direct fetch and the failing tus.Upload — they had the same
 * URL, same headers, same body. Difference: bgUpload's tus.Upload had an
 * `onBeforeRequest` hook that called `req.setHeader('Authorization', ...)`.
 *
 * tus-js-client v4.3.1's `req.setHeader` APPENDS to existing header values
 * rather than replacing them. The constructor's `headers` option already
 * set Authorization, so when onBeforeRequest re-set it the actual header on
 * the wire became `Authorization: Bearer <jwt>, Bearer <jwt>` — which
 * Storage rejects as a JWS validation failure ("Invalid Compact JWS").
 * Reproduced in isolation: a tus.Upload with the SAME headers but no
 * onBeforeRequest returns 201; same upload with the hook returns 400.
 *
 * Fix: remove the onBeforeRequest hook entirely. The constructor headers
 * are honored for every chunk. Token refresh during long uploads is a
 * follow-up — has to use abort+restart with the new token, not setHeader.
 *
 * v3.3 (2026-04-29): mid-write race fix for the empty/stale-bearer crash.
 *
 * Root cause traced via live console on Dan's browser:
 *     "[bgUpload] SDK auth path threw, falling through to localStorage:
 *      Lock 'lock:smarter-poker-auth' was released because another request stole it"
 *
 * The Supabase JS SDK serializes session reads via navigator.locks. When a
 * video upload kicks off concurrently with realtime feed subscribers, prefetch
 * navigation, and the composer's own session reads, the SDK is mid-write of
 * the auth blob to localStorage when our reader fires. The previous
 * _ensureBearer caught the SDK throw and fell through to a one-shot
 * localStorage read — which can return a stale or just-expired token. Storage
 * then rejects the bytes as "Invalid Compact JWS" / 401.
 *
 * Codebase policy (.husky/pre-commit) BANS direct SDK auth getter calls —
 * the SDK is exactly what causes the lock contention. The supported path is
 * authUtils.getAccessToken() which reads localStorage directly.
 *
 * Fix: read localStorage in a retry loop with backoff, validating BOTH JWT
 * shape AND that the exp claim is at least 30 seconds in the future. If a
 * read lands on a just-expired or partial token, we wait 100/200/400ms and
 * re-read — the SDK's background refresh has flushed the new token by then.
 * After all attempts we still ship the most-recently-shape-valid token (so
 * an upload can at least try) and emit detailed diagnostics so future
 * debugging sessions can read the truth from the console.
 *
 * Production-grade singleton with:
 *   1. URL PREFETCHING — signed URL is fetched when user selects a file,
 *      not when they hit "Post". Saves ~500ms of dead time.
 *   2. RESUMABLE XHR UPLOADS — XHR with automatic retry on failure.
 *      If the user loses signal, we retry with exponential backoff.
 *   3. 10-SECOND BACKGROUND RULE — if upload takes >10s, the modal
 *      auto-dismisses and a persistent banner appears. The user can
 *      browse freely. Completion fires a clickable toast.
 *   4. GHOST POST SUPPORT — emits events via EventBus so the feed can
 *      inject a placeholder "uploading" card at the top of the feed.
 *   5. UPLOAD ETA — tracks bytes/second to estimate remaining time.
 *   6. SESSION PERSISTENCE — saves upload intent to sessionStorage so
 *      uploads that complete after page navigation can still trigger
 *      a recovery dialog.
 *   7. UPLOAD QUEUE — supports queueing multiple uploads for multi-video
 *      posts (processed sequentially).
 *
 * Usage:
 *   import bgUpload from '@/lib/backgroundVideoUpload';
 *
 *   // Prefetch when user picks a video (before they hit Post):
 *   bgUpload.prefetch({ file, userId, folder });
 *
 *   // Start when they hit Post:
 *   const { publicUrl, wasBackground } = await bgUpload.start({ file, userId, folder });
 */

import { getAccessToken } from './authUtils';
import { sniffMimeType } from './socialHelpers';
import toast, { useToastStore } from '../stores/toastStore';
import * as tus from 'tus-js-client';

// ─── apikey for Supabase Storage TUS requests ────────────────────────────────
// CRITICAL: this used to be `import { SUPABASE_ANON_KEY } from './authUtils'`,
// but authUtils never exported that symbol, so SUPABASE_ANON_KEY was UNDEFINED
// at runtime. tus-js-client called `setRequestHeader('apikey', undefined)`
// on every TUS POST, which the browser turns into the literal string
// "undefined" on the wire. Storage validates the apikey against the project
// signing key and, finding garbage, rejects the entire request as
// "Invalid Compact JWS" / 403. Verified empirically on 2026-04-29 via
// computer-use spy on Dan's browser:
//   - request_headerKeys: [..., "apikey", ...] (key present)
//   - request_headerValues['apikey'] = undefined (value missing)
//   - response: 400 / "Invalid Compact JWS"
//   - same Bearer + x-signature via plain fetch with literal anon key: 201
// Fix: read NEXT_PUBLIC_SUPABASE_ANON_KEY directly from process.env at
// module load time, with a hardcoded fallback so the value is NEVER undefined
// (the fallback matches supabaseServer.ts which already does this server-side).
const SUPABASE_ANON_KEY = (
    (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo'
).trim();

// ─── Auth resilience helper ──────────────────────────────────────────────────
// getAccessToken() is a one-shot localStorage read of the SDK's persisted
// session blob. It can hand back a stale or partial value when the SDK is
// mid-write (the SDK serializes its writes through navigator.locks, but our
// reader doesn't honor that lock — going through the SDK is banned by the
// pre-commit hook because SDK calls themselves cause the lock contention).
//
// Failure modes we have to defend against:
//   1. Mid-write: localStorage holds the OLD blob (or is briefly clobbered).
//   2. Just-expired: token is shape-valid but exp is in the past.
//   3. Corrupt: literal "undefined"/"null"/"[object Object]" from legacy SDK
//      writes.
//   4. PWA standalone scope (different localStorage from Safari): null.
//   5. iOS memory-pressure on backgrounded tabs: null.
//
// In all of those, shipping `Bearer ${tok}` to Storage produces 401 / Invalid
// Compact JWS. This helper:
//   (a) reads getAccessToken() in a retry loop (4 attempts, 100/200/400/0ms)
//   (b) validates JWT shape (3 base64url parts) and parses the payload's exp
//       claim — a token that expires in <30s is treated as too stale to use
//       and retried; another component's refresh almost always lands within
//       a few hundred ms.
//   (c) on final failure returns the most-recently-shape-valid token rather
//       than null, so the upload at least gets a chance — and emits a clear
//       console.warn so future debugging sees the actual failure mode.
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const _isJWT = (t) => typeof t === 'string' && JWT_SHAPE.test(t);

// Decode the middle JWT part to read the exp claim. Pure-text — no crypto.
// Returns { exp: <number> } or null if unparseable.
function _readJwtPayload(tok) {
    try {
        const parts = tok.split('.');
        if (parts.length !== 3) return null;
        // base64url -> base64
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
        const json = typeof atob === 'function'
            ? atob(b64 + pad)
            : Buffer.from(b64 + pad, 'base64').toString('utf-8');
        return JSON.parse(json);
    } catch (_e) {
        return null;
    }
}

// Returns true if tok is JWT-shaped AND its exp is at least <skewSec> in the future.
function _isFreshJWT(tok, skewSec = 30) {
    if (!_isJWT(tok)) return false;
    const payload = _readJwtPayload(tok);
    if (!payload || typeof payload.exp !== 'number') return false;
    const nowSec = Math.floor(Date.now() / 1000);
    return payload.exp > nowSec + skewSec;
}

async function _ensureBearer() {
    // Retry localStorage reads — the SDK's background token refresh lands within
    // a few hundred ms. If the first read is stale/expired or comes back as a
    // null/corrupt value, wait and retry; by attempt 3 the new token has been
    // flushed.
    let lastShapeValid = null;       // best-we've-seen, even if stale
    let lastDiagnostic = null;       // reason the last attempt failed
    const delays = [0, 100, 200, 400]; // ms between attempts

    for (let attempt = 0; attempt < delays.length; attempt++) {
        if (delays[attempt] > 0) {
            await new Promise(r => setTimeout(r, delays[attempt]));
        }
        const tok = getAccessToken();
        if (!tok) { lastDiagnostic = `attempt ${attempt + 1}: getAccessToken returned null`; continue; }
        if (!_isJWT(tok)) {
            lastDiagnostic = `attempt ${attempt + 1}: non-JWT-shaped value (prefix=${String(tok).slice(0, 20)})`;
            continue;
        }
        // Shape is valid — keep it as a fallback even if exp is bad.
        lastShapeValid = tok;
        if (_isFreshJWT(tok, 30)) return tok;
        const payload = _readJwtPayload(tok);
        const nowSec = Math.floor(Date.now() / 1000);
        const remaining = payload?.exp ? (payload.exp - nowSec) : 'unknown';
        lastDiagnostic = `attempt ${attempt + 1}: token exp in ${remaining}s (need >30s) — likely mid-refresh`;
    }

    if (lastShapeValid) {
        // Best-effort: ship the freshest shape-valid token we saw, even if its
        // exp is close. Storage may still accept it on the wire.
        console.warn('[bgUpload] _ensureBearer using stale-but-shape-valid token after retries:', lastDiagnostic);
        return lastShapeValid;
    }
    console.warn('[bgUpload] _ensureBearer returning null — every read failed:', lastDiagnostic);
    return null;
}

// ─── Module-level singletons ──────────────────────────────────────────────────
let _activeXhr = null;        // XMLHttpRequest or tus.Upload — survives modal unmount
let _listeners = new Set();          // Ephemeral: upload-Promise subscribers; cleared on each new start()
let _permanentListeners = new Set(); // Permanent: feed-level components (GhostPostCard etc.); never cleared
let _state = 'idle';          // 'idle' | 'uploading' | 'background' | 'done' | 'error'
let _progress = 0;
let _label = '';
let _bgTimer = null;
let _bgToastId = null;        // ID of the persistent "uploading in background" toast
let _beforeUnloadHandler = null; // Prevents accidental tab close during upload

// ─── ETA tracking ─────────────────────────────────────────────────────────────
let _uploadStartTime = null;  // Date.now() when XHR upload begins
let _lastEta = '';            // cached ETA string for label display

// ─── Ghost post metadata ─────────────────────────────────────────────────────
let _ghostMeta = null;        // { userId, content, thumbnail, fileName }

// ─── Network state ───────────────────────────────────────────────────────────
let _networkListeners = null;

// ─── Retry support ───────────────────────────────────────────────────────────
let _lastUploadParams = null;  // saved for retry-on-failure

// ─── Queue progress ──────────────────────────────────────────────────────────
let _queuePosition = 0;
let _queueTotal = 0;

// ─── beforeunload protection ──────────────────────────────────────────────────
function _installBeforeUnload() {
    if (_beforeUnloadHandler) return; // already installed
    _beforeUnloadHandler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', _beforeUnloadHandler);
}
function _removeBeforeUnload() {
    if (!_beforeUnloadHandler) return;
    window.removeEventListener('beforeunload', _beforeUnloadHandler);
    _beforeUnloadHandler = null;
}

// ─── Network state listeners (online/offline) ────────────────────────────────
function _installNetworkListeners() {
    if (_networkListeners || typeof window === 'undefined') return;
    const handleOffline = () => {
        if (_state === 'uploading' || _state === 'background') {
            _label = 'Waiting for connection…';
            _emit('onProgress', { state: _state, pct: _progress, label: _label, queuePosition: _queuePosition, queueTotal: _queueTotal });
        }
    };
    const handleOnline = () => {
        if (_state === 'uploading' || _state === 'background') {
            _label = 'Connection restored — resuming…';
            _emit('onProgress', { state: _state, pct: _progress, label: _label, queuePosition: _queuePosition, queueTotal: _queueTotal });
        }
    };
    _networkListeners = { offline: handleOffline, online: handleOnline };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
}
function _removeNetworkListeners() {
    if (!_networkListeners) return;
    window.removeEventListener('offline', _networkListeners.offline);
    window.removeEventListener('online', _networkListeners.online);
    _networkListeners = null;
}

// Prefetch cache — stores the signed URL so start() can skip the network call
let _prefetchCache = null;    // { file, userId, folder, meta, timestamp }
const PREFETCH_TTL = 4 * 60 * 1000; // 4 minutes (signed URLs expire in 5)

// Retry config for failed uploads
const RETRY_DELAYS = [0, 3000, 8000, 15000, 30000, 60000]; // 6 total attempts with escalating backoff
const MAX_RETRIES = RETRY_DELAYS.length - 1; // = 5 retries after the first attempt

// ─── Upload Queue ─────────────────────────────────────────────────────────────
let _uploadQueue = [];        // Array of { file, userId, folder, resolve, reject }
let _isProcessingQueue = false;

// ─── Session Storage Keys ─────────────────────────────────────────────────────
const STORAGE_KEY = 'sp-bg-upload-intent';
const TUS_URL_KEY_PREFIX = 'sp-tus-url:'; // stores resumable TUS upload URL per file key

// ─── TUS chunk size ────────────────────────────────────────────────────────────
// AUDIT-19 (2026-04-30 per Dan: "1 MB/s on a 100 MB/s connection — 4:40
// for a 1:16 video is unacceptable").
// Root cause of throttling: every TUS chunk is a separate HTTP PATCH with
// its own RTT. With 6 MB chunks and ~500 ms RTT to Supabase Storage, a
// 280 MB iPhone HEVC video takes 280/6 ≈ 47 round-trips × ~6.5 s = 305 s
// (matches Dan's 4:40). That's 1 MB/s effective — not a bandwidth cap,
// it's PATCH-overhead-per-chunk.
//
// Fix: bump chunk size to 16 MB. Cuts round-trip count by 2.7× and pushes
// effective throughput toward the actual link limit. Each chunk takes
// longer to upload but the protocol overhead amortizes properly.
//
// Why not larger? 32 MB risks Vercel/Supabase intermediate-proxy timeouts
// on slow uplinks (a user on 1 Mbps cellular would take 4 minutes for one
// chunk and the underlying TCP socket may close). 16 MB is the sweet spot
// for "fast WiFi finishes quickly, slow cellular still completes."
const TUS_CHUNK_SIZE_DEFAULT = 16 * 1024 * 1024; // 16 MB — sweet spot for WiFi
const TUS_CHUNK_SIZE_SLOW    =  4 * 1024 * 1024; //  4 MB — for 2g/3g cellular

// Dan-fix/mobile-upload (2026-05-11): network-quality-aware chunk size.
// On slow cellular (2g/3g per Network Information API), drop to 4MB chunks
// so a single chunk PATCH completes inside the typical 30-60s cellular
// keep-alive. Falls back to 16MB on fast connections, unknown connections,
// and desktop. Safari/iOS doesn't expose navigator.connection at all, so
// iOS gets 16MB by default — fine for WiFi, risky on slow LTE.
function _getAdaptiveChunkSize() {
    if (typeof navigator === 'undefined') return TUS_CHUNK_SIZE_DEFAULT;
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return TUS_CHUNK_SIZE_DEFAULT;
    const slow = c.effectiveType === '2g' || c.effectiveType === 'slow-2g' || c.effectiveType === '3g'
                  || (typeof c.downlink === 'number' && c.downlink > 0 && c.downlink < 1.5);
    return slow ? TUS_CHUNK_SIZE_SLOW : TUS_CHUNK_SIZE_DEFAULT;
}

// Dan-fix/mobile-upload (2026-05-11): adaptive no-progress watchdog.
// Replaces the dead-code UPLOAD_HARD_TIMEOUT_MS constant from v3.4. Watchdog
// is a "stall detector" not a hard ceiling — it fires only if zero progress
// happens for the timeout window. Resets every time _setState() advances
// progress, so a slow-but-steady upload never trips it.
//
// Window sizing: 90s base + 1.5s per MB of file size, capped at 30 min.
//   - 50 MB upload  → 90 + 75  = 165s  (~3 min stall window)
//   - 240 MB upload → 90 + 360 = 450s  (~7.5 min stall window)
//   - 1 GB upload   → 90 + 1500 = 1590s, capped to 1800s (30 min)
// Generous: a slow but progressing upload is fine; only a true hang trips it.
function _watchdogTimeoutForSize(fileSize) {
    const baseMs = 90_000;
    const perMb  = 1500;
    const sizeMb = Math.max(1, (fileSize || 0) / (1024 * 1024));
    return Math.min(30 * 60 * 1000, Math.round(baseMs + perMb * sizeMb));
}
let _progressWatchdog = null;
let _watchdogFileSize = 0;
let _watchdogLastProgress = 0;
function _armWatchdog(fileSize, onTimeout) {
    _watchdogFileSize = fileSize || 0;
    _resetWatchdog(onTimeout);
}
function _resetWatchdog(onTimeout) {
    if (_progressWatchdog) clearTimeout(_progressWatchdog);
    if (typeof onTimeout !== 'function') return;
    const ms = _watchdogTimeoutForSize(_watchdogFileSize);
    _progressWatchdog = setTimeout(() => {
        _progressWatchdog = null;
        try { onTimeout(ms); } catch (_) {}
    }, ms);
}
function _disarmWatchdog() {
    if (_progressWatchdog) {
        clearTimeout(_progressWatchdog);
        _progressWatchdog = null;
    }
    _watchdogFileSize = 0;
    _watchdogLastProgress = 0;
}

// Dan-fix/mobile-upload (2026-05-11): visibility-change tracking.
// iOS Safari aggressively throttles XHR/fetch in backgrounded tabs — the
// #1 cause of "mobile upload starts then hangs forever." Tracking ensures
// (a) diagnostics in the console when users report stalls, and (b) the
// watchdog can extend its window while the tab is hidden (since iOS may
// pause network entirely, "no progress" while hidden is expected).
let _visibilityListener = null;
let _hiddenSince = null;       // timestamp ms when last hidden, null if visible
let _totalHiddenMs = 0;        // cumulative hidden time for this upload session
function _installVisibilityListener() {
    if (_visibilityListener || typeof document === 'undefined') return;
    const handler = () => {
        if (typeof document === 'undefined') return;
        const hidden = document.hidden || document.visibilityState === 'hidden';
        if (hidden) {
            _hiddenSince = Date.now();
            console.warn('[bgUpload] tab hidden during upload — iOS Safari may throttle network');
        } else if (_hiddenSince) {
            const dt = Date.now() - _hiddenSince;
            _totalHiddenMs += dt;
            _hiddenSince = null;
            console.log('[bgUpload] tab visible again after', Math.round(dt / 1000), 's hidden,',
                        'total hidden this session:', Math.round(_totalHiddenMs / 1000), 's');
        }
    };
    document.addEventListener('visibilitychange', handler);
    _visibilityListener = handler;
}
function _removeVisibilityListener() {
    if (!_visibilityListener || typeof document === 'undefined') return;
    document.removeEventListener('visibilitychange', _visibilityListener);
    _visibilityListener = null;
    _hiddenSince = null;
    _totalHiddenMs = 0;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _emit(type, payload) {
    _listeners.forEach((l) => l[type]?.(payload));
    _permanentListeners.forEach((l) => l[type]?.(payload));
}

function _setState(state, progress, label) {
    _state = state;
    if (progress !== undefined) {
        // Dan-fix/mobile-upload (2026-05-11): reset the no-progress watchdog
        // whenever progress advances. The watchdog only fires if the upload
        // truly stalls — never on a slow-but-steady upload. Includes the
        // "Uploading…" → "Connection restored — resuming…" label changes
        // which keep _progress stable; those don't reset since progress
        // didn't actually advance.
        if (progress > _watchdogLastProgress) {
            _watchdogLastProgress = progress;
            if (_progressWatchdog && _watchdogFileSize > 0) {
                _resetWatchdog(_watchdogOnTimeoutHandler);
            }
        }
        _progress = progress;
    }
    if (label !== undefined) _label = label;
    _emit('onProgress', { state: _state, pct: _progress, label: _label, queuePosition: _queuePosition, queueTotal: _queueTotal });
}

// Holder for the on-timeout callback supplied by start(). Set just before
// arming the watchdog; cleared on _disarmWatchdog().
let _watchdogOnTimeoutHandler = null;

/**
 * Format seconds into a human-readable ETA string.
 */
function _formatEta(seconds) {
    if (!seconds || seconds <= 0 || !isFinite(seconds)) return '';
    if (seconds < 60) return `${Math.ceil(seconds)}s left`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)}min left`;
    return `${Math.floor(seconds / 3600)}h ${Math.ceil((seconds % 3600) / 60)}min left`;
}

/**
 * Save upload intent to sessionStorage for cross-navigation recovery.
 */
function _saveUploadIntent(data) {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
            ...data,
            timestamp: Date.now(),
        }));
    } catch (_) { /* sessionStorage not available */ }
}

/**
 * Clear saved upload intent.
 */
function _clearUploadIntent() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
}

/**
 * Fetch a signed upload URL from the API.
 * Used both by prefetch() and as a fallback inside start().
 */
async function _fetchUploadMeta(file, userId, folder) {
    const token = getAccessToken();
    if (!token) throw new Error('Authentication required — please refresh and try again.');

    const mimeType = sniffMimeType(file);
    const metaRes = await fetch('/api/social/upload-url', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            fileName: file.name || `video_${Date.now()}.mp4`,
            fileSize: file.size,
            mimeType,
            folder,
            prefix: userId,
        }),
    });

    if (!metaRes.ok) {
        const err = await metaRes.json().catch(() => ({}));
        throw new Error(err.error || `Upload URL failed (${metaRes.status})`);
    }

    const meta = await metaRes.json();
    if (!meta.success) {
        throw new Error(meta.error || 'Invalid upload URL received');
    }
    // Must have either a TUS endpoint (preferred) or a signed PUT URL (fallback)
    if (!meta.tusEndpoint && !meta.signedUrl?.startsWith('http')) {
        throw new Error(meta.error || 'No upload URL received from server');
    }

    return meta;
}

/**
 * Upload via TUS resumable protocol (primary path for video).
 * Uses tus-js-client with 6 MB chunks, auto-retry, and sessionStorage resume.
 * Wraps the entire operation in a 5-minute hard timeout.
 *
 * @param {File}   file
 * @param {Object} meta  — response from _fetchUploadMeta (must include tusEndpoint, token, path, bucket)
 * @param {string} mimeType
 * @returns {Promise<null>}  resolves on success; caller uses the publicUrl from meta
 */
async function _uploadWithTus(file, meta, mimeType) {
    // ── Auth resolution (must happen BEFORE the TUS upload is constructed) ──
    // Supabase Storage validates Authorization: Bearer <user-jwt> as a JWS
    // FIRST. If it's empty or malformed, the request fails with "Invalid
    // Compact JWS" no matter how valid x-signature is. _ensureBearer goes
    // through SDK getSession (auto-refresh) and validates JWT shape; only
    // returns a guaranteed-shape-valid token or null.
    const userToken = await _ensureBearer();
    if (!_isJWT(userToken)) {
        // Belt-and-suspenders: even if _ensureBearer somehow returned a
        // non-JWT, this final check stops it from reaching the wire.
        console.warn('[bgUpload] _uploadWithTus refusing to start — no valid JWT available');
        throw new Error('Session expired. Please refresh the page and try again.');
    }
    // PHASE-B (2026-05-03): proactive JWT lifetime check. tus-js-client v4.3.1
    // attaches `headers` ONCE at constructor time and the appendable-header bug
    // means we can't safely rotate Authorization mid-upload. Long uploads
    // (3-min+ video on cellular) can outlive a token that was already 55 min
    // old at start, then chunk #20 fails with "Invalid Compact JWS" and the
    // user sees a generic error after waiting 3 minutes. Estimating size /
    // expected bytes-per-second is fragile; instead require >=120s of remaining
    // JWT life. Below that, abort up-front with an actionable message and let
    // the user refresh / log in fresh — far better than silent mid-upload
    // failure. Threshold deliberately conservative: 2 min covers preflight +
    // small files; bigger files force a token refresh first.
    try {
        const _parts = userToken.split('.');
        const _payload = JSON.parse(atob(_parts[1].replace(/-/g,'+').replace(/_/g,'/') + '==='.slice((_parts[1].length + 3) % 4)));
        const expSec = Number(_payload?.exp) || 0;
        const remainingSec = expSec - Math.floor(Date.now() / 1000);
        // PHASE-B + AUDIT-MAX-2 (2026-05-03 Pass 1 finding): the original
        // condition was `remainingSec > 0 && remainingSec < 120` — that
        // SKIPS already-expired tokens (remainingSec <= 0). _ensureBearer's
        // fallback path returns "lastShapeValid" even for expired tokens,
        // so an expired token CAN reach here. Three-tier check now:
        //   • expSec === 0 (no exp claim)        → proceed; storage will
        //                                            return a clear 401.
        //   • remainingSec <= 0 (expired)        → fail-fast "session
        //                                            expired" message.
        //   • remainingSec < 120 (about to)      → fail-fast "about to
        //                                            expire" message.
        if (expSec > 0 && remainingSec <= 0) {
            console.warn('[bgUpload] JWT already expired by', Math.abs(remainingSec), 's — failing fast');
            throw new Error('Your session has expired. Please log in again and try posting.');
        }
        if (expSec > 0 && remainingSec < 120) {
            console.warn('[bgUpload] JWT only has', remainingSec, 's remaining — failing fast to avoid mid-upload expiry');
            throw new Error('Your session is about to expire. Please refresh the page and try posting again.');
        }
    } catch (e) {
        // Decode failure isn't a hard fail — _ensureBearer already validated
        // shape. Just continue; the actual TUS request will surface JWT
        // problems if any.
        if (e?.message?.includes('about to expire') || e?.message?.includes('session has expired')) throw e;
    }
    // Diagnostic log (console.log = "Default" level, visible without changing
    // DevTools filter). When this DOES log but the server still rejects with
    // "Invalid Compact JWS", the cached session token is stale-against-current-
    // signing-key and the user needs to log out + log in fresh.
    try {
        const _parts = userToken.split('.');
        const _payload = JSON.parse(atob(_parts[1].replace(/-/g,'+').replace(/_/g,'/') + '==='.slice((_parts[1].length + 3) % 4)));
        console.log('[bgUpload] starting TUS upload', {
            jwtLength: userToken.length,
            jwtParts: _parts.length,
            iss: _payload.iss,
            aud: _payload.aud,
            sub: _payload.sub?.slice(0, 8) + '…',
            expIn: Math.round((_payload.exp * 1000 - Date.now()) / 1000) + 's',
        });
    } catch (_) {
        console.log('[bgUpload] starting TUS upload (could not decode JWT payload)', { jwtLength: userToken.length });
    }

    return new Promise((resolve, reject) => {
        _uploadStartTime = Date.now();
        let maxPctReached = _progress || 0;
        const cleanMime = (mimeType || '').split(';')[0].trim() || 'video/mp4';

        // ── Auth headers ──────────────────────────────────────────────────────
        // Headers required for Supabase TUS resumable uploads:
        //   1. Authorization: Bearer <user-jwt>  — primary auth (validated as JWS)
        //   2. apikey: <anon-key>                — project context, matches docs example
        //   3. x-upsert: true                    — allow path overwrite on retry
        // Optional (extra path-binding when server creates a presigned token):
        //   4. x-signature: <token>              — only validated AFTER Authorization passes
        if (!SUPABASE_ANON_KEY || typeof SUPABASE_ANON_KEY !== 'string' || SUPABASE_ANON_KEY.length < 50) {
            console.error('[bgUpload] SUPABASE_ANON_KEY is missing/invalid at runtime — TUS would send apikey=undefined and Storage would reject as Invalid Compact JWS', { type: typeof SUPABASE_ANON_KEY, len: SUPABASE_ANON_KEY?.length });
        }
        const tusHeaders = {
            Authorization: `Bearer ${userToken}`,
            apikey: SUPABASE_ANON_KEY,
            'x-upsert': 'true',
        };
        if (meta.token) {
            tusHeaders['x-signature'] = meta.token;
        }

        // Dan-fix/mobile-upload (2026-05-11): adaptive chunk size based on
        // navigator.connection. Default 16MB on fast/unknown links, 4MB on
        // 2g/3g/sub-1.5Mbps cellular for faster failure recovery.
        const adaptiveChunkSize = _getAdaptiveChunkSize();
        const upload = new tus.Upload(file, {
            endpoint: meta.tusEndpoint,
            chunkSize: adaptiveChunkSize,
            retryDelays: [0, 3000, 8000, 15000, 30000],
            removeFingerprintOnSuccess: true,
            // NOTE: storeFingerprintForResuming intentionally omitted.
            // Stale fingerprints from previous failed uploads cause silent 7-8% stall.
            metadata: {
                bucketName: meta.bucket,
                objectName: meta.path,
                contentType: cleanMime,
                cacheControl: '3600',
            },
            headers: tusHeaders,
            onProgress: (bytesUploaded, bytesTotal) => {
                const rawPct = bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 93) + 5 : 5;
                const clampedPct = Math.max(rawPct, maxPctReached);
                maxPctReached = clampedPct;
                const displayPct = Math.min(clampedPct, 97);
                const labelPct = Math.round(((displayPct - 5) / 92) * 100);

                let speedStr = '';
                let eta = '';
                if (_uploadStartTime && bytesUploaded > 0) {
                    const elapsedSec = (Date.now() - _uploadStartTime) / 1000;
                    if (elapsedSec > 2) {
                        const bytesPerSec = bytesUploaded / elapsedSec;
                        const remainingBytes = bytesTotal - bytesUploaded;
                        const remainingSec = remainingBytes / bytesPerSec;
                        eta = _formatEta(remainingSec);
                        _lastEta = eta;
                        const mbps = bytesPerSec / (1024 * 1024);
                        speedStr = mbps >= 1
                            ? ` at ${mbps.toFixed(1)} MB/s`
                            : ` at ${Math.round(bytesPerSec / 1024)} KB/s`;
                    }
                }
                const etaSuffix = eta ? ` — ~${eta}` : (_lastEta ? ` — ~${_lastEta}` : '');
                _setState(_state, displayPct, `Uploading… ${labelPct}%${speedStr}${etaSuffix}`);
            },
            onSuccess: () => {
                _activeXhr = null;

                resolve(null);
            },
            onError: (err) => {
                _activeXhr = null;
                const msg = err?.message || String(err) || 'TUS upload error';
                if (msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('cancel')) {
                    reject(new Error('Upload cancelled'));
                } else {
                    // Surface JWS rejections at error level so the diagnostic
                    // trail is always visible. If the JWT was shape-valid but
                    // server still rejects, the session is stale-against-
                    // current-signing-key (log out + log in fixes it).
                    if (msg.toLowerCase().includes('compact jws') || msg.toLowerCase().includes('access denied') || msg.toLowerCase().includes('unauthorized')) {
                        console.error('[bgUpload] STORAGE REJECTED AUTH', {
                            error: msg.slice(0, 300),
                            tokenSentLength: userToken?.length,
                            tokenSentParts: userToken?.split('.').length,
                            tokenPrefix: userToken?.slice(0, 20),
                            hasXSignature: !!meta.token,
                            hint: 'If JWT looks structurally valid but server says "Invalid Compact JWS", your cached session token is stale-against-current-signing-key. Log out and log in fresh.',
                        });
                    }
                    reject(new Error(`Upload failed: ${msg.slice(0, 300)} — please try again.`));
                }
            },
            // NOTE: an `onBeforeRequest` hook USED to live here — it called
            // `req.setHeader('Authorization', ...)` on every chunk to refresh
            // the bearer for multi-minute uploads. That hook was the actual
            // root cause of every "Invalid Compact JWS" rejection on
            // production: tus-js-client v4.3.1's `req.setHeader` APPENDS to
            // an existing header value (it does not replace), so re-setting
            // Authorization produced a malformed header on the wire of the
            // shape `Authorization: Bearer <jwt>, Bearer <jwt>` — which
            // Supabase Storage rejects as a JWS validation failure.
            //
            // Reproduced empirically on 2026-04-29 via computer-use against
            // Dan's browser. With identical headers and identical signed
            // upload tokens, an `tus.Upload` configured with this hook
            // returns 400/Invalid Compact JWS on every attempt; remove the
            // hook (and rely on the constructor `headers` only) and the
            // same upload returns 201.
            //
            // For long uploads we currently rely on a fresh Authorization
            // header set at upload-start time. Token refresh during a single
            // upload is now a follow-up: it has to be implemented WITHOUT
            // setHeader-based re-binding (e.g., abort + re-create the upload
            // with the new token, or upgrade tus-js-client to a version with
            // proper header replacement semantics).
        });

        _activeXhr = upload;

        let _settled = false;
        const hardTimeout = setTimeout(() => {
            if (_settled) return;
            _settled = true;
            try { upload.abort(); } catch (_) {}
            _activeXhr = null;
            reject(new Error('Upload timed out after 10 minutes. Please try on a stronger connection.'));
        }, 10 * 60 * 1000);

        const _rawSuccess = upload.options.onSuccess;
        const _rawError = upload.options.onError;
        upload.options.onSuccess = () => { if (_settled) return; _settled = true; clearTimeout(hardTimeout); _rawSuccess(); };
        upload.options.onError = (e) => { if (_settled) return; _settled = true; clearTimeout(hardTimeout); _rawError(e); };

        upload.start();
    });
}

/**
 * FALLBACK: Execute an XHR PUT upload with retry support.
 * Used when TUS metadata (tusEndpoint) is not available (e.g. old cached meta).
 * On HTTP 400/403 (expired/consumed signed URL), fetches a FRESH signed URL before retrying.
 * On network failure, waits and retries up to MAX_RETRIES times.
 *
 * Includes ETA tracking: calculates bytes/second from upload progress events
 * and emits estimated time remaining in the progress label.
 *
 * ⚠️  BUG 3 FIX IS HERE — do not remove the alreadyConsumed detection block.
 */
function _uploadWithRetry(file, signedUrl, mimeType, attempt = 0, _userId, _folder) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        _activeXhr = xhr;

        // Track max progress so retries never show progress going backwards
        let maxPctReached = _progress || 0;

        // ETA tracking — start time is set on first progress event
        if (attempt === 0) _uploadStartTime = Date.now();

        xhr.upload.onprogress = (evt) => {
            if (!evt.lengthComputable) return;
            const pct = Math.round((evt.loaded / evt.total) * 93) + 5;
            const clampedPct = Math.max(pct, maxPctReached);
            maxPctReached = clampedPct;
            const displayPct = Math.min(clampedPct, 97);
            // Label shows clean 0-100% derived from bar position (5-97 range → 0-100)
            const labelPct = Math.round(((displayPct - 5) / 92) * 100);

            // ── SPEED + ETA CALCULATION ───────────────────────────────────
            let eta = '';
            let speedStr = '';
            if (_uploadStartTime && evt.loaded > 0) {
                const elapsedSec = (Date.now() - _uploadStartTime) / 1000;
                if (elapsedSec > 2) { // wait 2s for stable rate
                    const bytesPerSec = evt.loaded / elapsedSec;
                    const remainingBytes = evt.total - evt.loaded;
                    const remainingSec = remainingBytes / bytesPerSec;
                    eta = _formatEta(remainingSec);
                    _lastEta = eta;
                    // Format upload speed
                    const mbps = bytesPerSec / (1024 * 1024);
                    speedStr = mbps >= 1
                        ? ` at ${mbps.toFixed(1)} MB/s`
                        : ` at ${Math.round(bytesPerSec / 1024)} KB/s`;
                }
            }
            const etaSuffix = eta ? ` — ~${eta}` : (_lastEta ? ` — ~${_lastEta}` : '');

            _setState(
                _state,
                displayPct,
                `Uploading… ${labelPct}%${speedStr}${etaSuffix}`
            );
        };

        xhr.onload = () => {
            _activeXhr = null;
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(null); // success — caller uses original publicUrl
            } else if (xhr.status === 400 || xhr.status === 403) {
                // Check response body FIRST — Supabase returns 400 "already been used" when
                // the upload SUCCEEDED server-side but the XHR response was lost (mobile
                // network drop). Retrying treats success as failure and causes the
                // "getting new URL (attempt 6/6)" storm. Detect it and resolve as success.
                const body = (xhr.responseText || '').toLowerCase();
                const alreadyConsumed = body.includes('already') || body.includes('reuse');
                // alreadyConsumed can happen on ANY retry (server got bytes, ACK was lost)
                if (alreadyConsumed) {
                    // File is in Supabase. Signed URL consumed = upload completed.
                    console.warn('[bgUpload] 400 already-consumed — resolving as success');
                    resolve(null);
                    return;
                }
                // Retry path: fetch a fresh URL and try again
                if (attempt < MAX_RETRIES && _userId) {
                    const delay = RETRY_DELAYS[attempt + 1] || 8000;
                    const reason = xhr.status === 400 ? 'URL expired' : 'Session expired';
                    _progress = 5;
                    _uploadStartTime = Date.now();
                    _lastEta = '';
                    _setState(_state, 5, `${reason} — getting new URL (attempt ${attempt + 2}/${MAX_RETRIES + 1})…`);
                    setTimeout(async () => {
                        try {
                            const freshMeta = await _fetchUploadMeta(file, _userId, _folder || 'videos');
                            _uploadWithRetry(file, freshMeta.signedUrl, mimeType, attempt + 1, _userId, _folder)
                                .then((nestedUrl) => resolve(nestedUrl || freshMeta.publicUrl))
                                .catch(reject);
                        } catch (fetchErr) {
                            reject(new Error(`Upload failed (HTTP ${xhr.status}) — could not get new URL: ${fetchErr.message}`));
                        }
                    }, delay);
                } else {
                    const errMsg = xhr.status === 400
                        ? 'Upload failed after 6 attempts — please try again later.'
                        : 'Upload session expired after 6 attempts — please try again later.';
                    reject(new Error(errMsg));
                }
            } else if (xhr.status >= 500 && attempt < MAX_RETRIES) {
                // Server error — retry with backoff using correct delay index
                const delay = RETRY_DELAYS[attempt + 1] || 8000;
                _setState(_state, maxPctReached, `Server error — retrying (attempt ${attempt + 2}/${MAX_RETRIES + 1})…`);
                setTimeout(() => {
                    _uploadWithRetry(file, signedUrl, mimeType, attempt + 1, _userId, _folder)
                        .then(resolve)
                        .catch(reject);
                }, delay);
            } else {
                const errMsg = xhr.status === 413
                    ? 'File is too large for the server. Please trim the video and try again.'
                    : 'Upload failed after 6 attempts — please try again later.';
                reject(new Error(errMsg));
            }
        };

        xhr.onerror = () => {
            _activeXhr = null;
            if (attempt < MAX_RETRIES) {
                // Network error — retry with backoff using next delay slot
                const delay = RETRY_DELAYS[attempt + 1] || 10000;
                _setState(_state, maxPctReached, `Connection lost — retrying (attempt ${attempt + 2}/${MAX_RETRIES + 1})…`);
                setTimeout(() => {
                    _uploadWithRetry(file, signedUrl, mimeType, attempt + 1, _userId, _folder)
                        .then(resolve)
                        .catch(reject);
                }, delay);
            } else {
                reject(new Error('Upload failed after 6 attempts — please check your connection and try again later.'));
            }
        };

        xhr.onabort = () => { _activeXhr = null; reject(new Error('Upload cancelled')); };
        xhr.ontimeout = () => {
            _activeXhr = null;
            if (attempt < MAX_RETRIES) {
                // Timeout — retry with backoff using next delay slot
                const delay = RETRY_DELAYS[attempt + 1] || 10000;
                _setState(_state, maxPctReached, `Upload timed out — retrying (attempt ${attempt + 2}/${MAX_RETRIES + 1})…`);
                setTimeout(() => {
                    _uploadWithRetry(file, signedUrl, mimeType, attempt + 1, _userId, _folder)
                        .then(resolve)
                        .catch(reject);
                }, delay);
            } else {
                reject(new Error('Upload failed after 6 attempts — please try on a stronger Wi-Fi connection.'));
            }
        };

        const cleanMime = (mimeType || '').split(';')[0].trim() || 'video/mp4';
        xhr.open('PUT', signedUrl);
        xhr.setRequestHeader('Content-Type', cleanMime);
        xhr.timeout = 10 * 60 * 1000; // 10 minute timeout — mobile networks can be very slow
        xhr.send(file);
    });
}

// ─── Public API ───────────────────────────────────────────────────────────────

const bgUpload = {
    /** Current state snapshot */
    get state() { return _state; },
    get progress() { return _progress; },
    get label() { return _label; },
    get isActive() { return _state === 'uploading' || _state === 'background'; },

    /**
     * Subscribe to upload events.
     * @param {{ onProgress?, onComplete?, onError?, onBackground?, onGhostPost? }} listener
     * @returns {Function} unsubscribe
     */
    subscribe(listener) {
        _listeners.add(listener);
        // Immediately emit current state so late subscribers are in sync
        if (_state !== 'idle') {
            listener.onProgress?.({ state: _state, pct: _progress, label: _label, queuePosition: _queuePosition, queueTotal: _queueTotal });
        }
        return () => _listeners.delete(listener);
    },

    /**
     * Subscribe PERMANENTLY — survives start() resets and abort() calls.
     * Use this for feed-level components (GhostPostCard) that must receive
     * background/complete/error events across ALL uploads, not just one.
     * @param {{ onProgress?, onComplete?, onError?, onBackground?, onGhostPost? }} listener
     * @returns {Function} unsubscribe
     */
    subscribePermanent(listener) {
        _permanentListeners.add(listener);
        // Immediately emit current state so late subscribers are in sync
        if (_state !== 'idle') {
            listener.onProgress?.({ state: _state, pct: _progress, label: _label, queuePosition: _queuePosition, queueTotal: _queueTotal });
        }
        return () => _permanentListeners.delete(listener);
    },

    /**
     * 🚀 PREFETCH — Call this the moment the user selects a video file.
     * Fetches the signed upload URL in the background while they type their
     * caption. By the time they hit "Post", the URL is already cached and
     * the upload begins at 0ms latency.
     *
     * @param {Object} opts
     * @param {File}   opts.file   - The selected video file
     * @param {string} opts.userId - Authenticated user ID
     * @param {string} [opts.folder] - Storage folder (default: 'videos')
     */
    async prefetch({ file, userId, folder = 'videos' }) {
        try {
            const meta = await _fetchUploadMeta(file, userId, folder);
            _prefetchCache = {
                file,
                userId,
                folder,
                meta,
                timestamp: Date.now(),
            };
        } catch (err) {
            // Prefetch is best-effort — start() will retry if this fails
            console.warn('[bgUpload] Prefetch failed (non-fatal):', err.message);
            _prefetchCache = null;
        }
    },

    /**
     * Start a background-capable video upload with automatic retry.
     *
     * @param {Object} opts
     * @param {File}     opts.file         - Video file to upload
     * @param {string}   opts.userId       - Authenticated user ID
     * @param {string}   [opts.folder]     - Storage folder (default: 'videos')
     * @param {number}   [opts.bgAfterMs]  - Switch to background after N ms (default: 10000)
     * @param {Function} [opts.onDismiss]  - Called when bg mode activates (close modal here)
     * @param {Function} [opts.onRouter]   - Router push fn for completion toast click
     * @param {string}   [opts.content]    - Post content for ghost post metadata
     * @param {string}   [opts.thumbnail]  - Thumbnail data URL for ghost post
     * @returns {Promise<{ publicUrl: string, wasBackground: boolean }>}
     */
    async start({ file, userId, folder = 'videos', bgAfterMs = 10_000, onDismiss, onRouter, content, thumbnail }) {
        // Save state BEFORE abort() wipes everything
        const savedPrefetch = _prefetchCache;
        const savedListeners = new Set(_listeners);


        // Silent reset of previous upload state (NOT a user-facing abort — no onError emission)
        clearTimeout(_bgTimer);
        _bgTimer = null;
        _removeBeforeUnload();

        // Purge stale TUS fingerprints from localStorage — old incomplete uploads leave
        // behind stored TUS upload URLs that are now expired/invalid. Without this cleanup,
        // tus-js-client tries to resume from a dead URL and Supabase returns 400.
        try {
            Object.keys(localStorage).filter(k => k.startsWith(TUS_URL_KEY_PREFIX)).forEach(k => {
                try { localStorage.removeItem(k); } catch (_) {}
            });
        } catch (_) { /* localStorage may be unavailable (SSR, private browsing) */ }
        _removeNetworkListeners();
        _removeVisibilityListener();
        _disarmWatchdog();
        _clearUploadIntent();
        if (_bgToastId) {
            useToastStore.getState().removeToast(_bgToastId);
            _bgToastId = null;
        }
        if (_activeXhr) {
            try { _activeXhr.abort(); } catch (_) {}
            _activeXhr = null;
        }

        // Notify old listeners that their upload was superseded — rejects any pending Promise
        // (caller always calls bgUpload.subscribe() right after start(), so we start fresh)
        const prevState = _state;
        _state = 'idle'; // set idle before emit so onError handlers don't see 'uploading'
        if (prevState === 'uploading' || prevState === 'background') {
            const supersededError = { error: new Error('Upload superseded') };
            // Notify ephemeral Promise subscribers (causes Promise.reject in EPC/SPC)
            savedListeners.forEach(l => l.onError?.(supersededError));
            // Notify permanent subscribers (causes GhostPostCard to hide old ghost)
            _permanentListeners.forEach(l => l.onError?.(supersededError));
        }
        // Clear stale ephemeral listeners — new subscribe() call adds fresh ones
        // _permanentListeners intentionally kept alive (GhostPostCard et al.)
        _listeners = new Set();
        // Restore prefetch cache (still valid for the new upload if same file+user+folder)
        _prefetchCache = savedPrefetch;

        _state = 'uploading';
        _progress = 0;
        _label = 'Preparing…';
        _uploadStartTime = null;
        _lastEta = '';
        _ghostMeta = { userId, content: content || '', thumbnail, fileName: file.name };
        _emit('onProgress', { state: _state, pct: _progress, label: _label });

        // Save upload intent to sessionStorage for cross-navigation recovery
        _saveUploadIntent({
            userId,
            folder,
            fileName: file.name,
            fileSize: file.size,
            content: content || '',
        });

        // Prevent accidental tab close during upload
        _installBeforeUnload();

        // Save params for retry-on-failure
        _lastUploadParams = { file, userId, folder, bgAfterMs, onDismiss, onRouter, content, thumbnail };

        // Network state monitoring — shows connection status in progress label
        _installNetworkListeners();
        // Dan-fix/mobile-upload (2026-05-11): install visibility listener
        // + arm adaptive no-progress watchdog. Watchdog fires only if zero
        // progress for the file-size-adjusted window (90s + 1.5s/MB,
        // capped 30min). On fire, emit a clear error so the user sees
        // "Upload stalled" instead of a forever spinner.
        _installVisibilityListener();
        _watchdogOnTimeoutHandler = (ms) => {
            console.error('[bgUpload] watchdog fired — no progress for', Math.round(ms / 1000), 's',
                          'last progress:', _watchdogLastProgress + '%',
                          'file size:', Math.round(file.size / 1024 / 1024) + 'MB',
                          'hidden time:', Math.round(_totalHiddenMs / 1000) + 's');
            // Abort the active TUS upload if any
            if (_activeXhr) {
                try { _activeXhr.abort(); } catch (_) {}
                _activeXhr = null;
            }
            _state = 'idle';
            const errorMsg = _totalHiddenMs > 30000
                ? 'Upload stalled — please keep the app open while large videos upload, especially on cellular.'
                : 'Upload stalled — please check your connection and try again.';
            _emit('onError', { error: new Error(errorMsg) });
            _removeBeforeUnload();
            _removeNetworkListeners();
            _removeVisibilityListener();
            _disarmWatchdog();
            _removeVisibilityListener();
            _disarmWatchdog();
            _clearUploadIntent();
            if (_bgToastId) {
                useToastStore.getState().removeToast(_bgToastId);
                _bgToastId = null;
            }
        };
        _armWatchdog(file.size, _watchdogOnTimeoutHandler);

        // 10-second background trigger
        _bgTimer = setTimeout(() => {
            if (_state !== 'uploading') return;
            _state = 'background';
            _emit('onBackground', {});
            onDismiss?.();

            // Emit ghost post event so the feed can show a placeholder card
            _emit('onGhostPost', {
                userId,
                content: content || '',
                thumbnail,
                fileName: file.name,
                progress: _progress,
            });

            // ONE upload toast (per Dan 2026-04-29). The two pre-upload
            // "Video selected" / "Large video" / "Format optimization" toasts
            // were removed from the composers; this is the keeper.
            _bgToastId = toast.action(
                'Your Video Is Uploading In The Background. You Can Keep Using The App.',
                null,    // no click action
                'info',  // toast type
                4000,    // auto-dismiss after 4 seconds
            );
        }, bgAfterMs);

        try {
            // ── Step 1: Get signed URL (use prefetch cache if valid) ──────────
            let meta;
            const cacheValid = _prefetchCache
                && _prefetchCache.file === file
                && _prefetchCache.userId === userId
                && _prefetchCache.folder === folder
                && (Date.now() - _prefetchCache.timestamp) < PREFETCH_TTL;

            if (cacheValid) {
                meta = _prefetchCache.meta;
                _prefetchCache = null; // consume the cache
                _setState('uploading', 3, 'Upload ready…');
            } else {
                _setState('uploading', 2, 'Preparing upload…');
                meta = await _fetchUploadMeta(file, userId, folder);
            }

            _setState('uploading', 5, 'Uploading…');

            // ── Step 2: TUS upload — chunked/resumable for all videos ─────
            // The XHR-PUT fallback was removed in sweep 5 (2026-04-29) — every
            // /api/social/upload-url response includes tusEndpoint, so the
            // fallback was unreachable dead code. If a future API change ever
            // returns a meta without tusEndpoint, fail loudly instead of
            // silently bypassing the TUS protocol.
            const mimeType = sniffMimeType(file);
            if (!meta.tusEndpoint) {
                throw new Error('Server did not return a TUS endpoint — upload aborted.');
            }
            await _uploadWithTus(file, meta, mimeType);
            const finalPublicUrl = meta.publicUrl;

            // ── Upload complete ───────────────────────────────────────────────
            clearTimeout(_bgTimer);
            _bgTimer = null;
            _removeBeforeUnload();
            _removeNetworkListeners();
            _removeVisibilityListener();
            _disarmWatchdog();
            _clearUploadIntent();
            _lastUploadParams = null;
            // Dismiss the persistent background toast before showing completion
            if (_bgToastId) {
                useToastStore.getState().removeToast(_bgToastId);
                _bgToastId = null;
            }
            const wasBackground = (_state === 'background');
            _setState('done', 100, 'Upload complete!');
            _emit('onComplete', { publicUrl: finalPublicUrl, wasBackground });

            // AUDIT-8 (2026-04-30 per Dan): success chime on upload-complete.
            // The personal-account post path also fires a chime AFTER the DB
            // insert succeeds, but that path doesn't run if (a) the post
            // creation fails, (b) the user is on the home-group/club-page
            // path which has no chime, or (c) the user navigated away
            // (background upload). This chime fires the moment Storage
            // returns 201 — guaranteed audible feedback that the bytes are
            // safely uploaded, regardless of what happens to the post row.
            try {
                if (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
                    const ac = new (window.AudioContext || window.webkitAudioContext)();
                    const o = ac.createOscillator();
                    const g = ac.createGain();
                    o.connect(g); g.connect(ac.destination);
                    o.type = 'sine';
                    // Two-note chirp: A5 → E6 (rising fifth) — same shape as
                    // the post-publish chime so the user gets a familiar cue.
                    o.frequency.setValueAtTime(880, ac.currentTime);
                    o.frequency.exponentialRampToValueAtTime(1320, ac.currentTime + 0.12);
                    g.gain.setValueAtTime(0.0001, ac.currentTime);
                    g.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + 0.02);
                    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.18);
                    o.start();
                    o.stop(ac.currentTime + 0.2);
                    setTimeout(() => { try { ac.close(); } catch(_){} }, 400);
                }
            } catch (_) { /* audio is a nice-to-have; never let it break upload completion */ }

            // NOTE: callers fire the "Video is live" toast AFTER their DB insert
            // so we don't announce too early. bgUpload only handles the upload.

            return { publicUrl: finalPublicUrl, wasBackground };

        } catch (err) {
            clearTimeout(_bgTimer);
            _bgTimer = null;
            _removeBeforeUnload();
            _removeNetworkListeners();
            _removeVisibilityListener();
            _disarmWatchdog();
            _clearUploadIntent();
            _activeXhr = null;
            // Dismiss the persistent background toast
            if (_bgToastId) {
                useToastStore.getState().removeToast(_bgToastId);
                _bgToastId = null;
            }
            const wasBackground = (_state === 'background');
            _setState('error', 0, err.message || 'Upload failed');
            _emit('onError', { error: err });

            // Show error toast with retry button if in background mode
            if (wasBackground) {
                const retryParams = _lastUploadParams;
                if (retryParams) {
                    toast.action(
                        `Video upload failed: ${err.message}. Tap to retry.`,
                        () => { bgUpload.retry(); },
                        'error'
                    );
                } else {
                    toast.error(`Video upload failed: ${err.message}`);
                }
            }

            throw err;
        }
    },

    /**
     * 🔗 QUEUE — Add a file to the upload queue for sequential processing.
     * Returns a promise that resolves when THIS specific file finishes uploading.
     * Useful for multi-video posts where files are uploaded one after another.
     *
     * @param {Object} opts - Same opts as start()
     * @returns {Promise<{ publicUrl: string, wasBackground: boolean }>}
     */
    enqueue(opts) {
        return new Promise((resolve, reject) => {
            _uploadQueue.push({ ...opts, resolve, reject });
            bgUpload._processQueue();
        });
    },

    /**
     * Internal: process the upload queue sequentially.
     */
    async _processQueue() {
        if (_isProcessingQueue || _uploadQueue.length === 0) return;
        _isProcessingQueue = true;
        _queueTotal = _uploadQueue.length;
        _queuePosition = 0;

        while (_uploadQueue.length > 0) {
            _queuePosition++;
            const job = _uploadQueue.shift();
            try {
                const result = await bgUpload.start(job);
                job.resolve(result);
            } catch (err) {
                job.reject(err);
            }
        }

        _queuePosition = 0;
        _queueTotal = 0;
        _isProcessingQueue = false;
    },

    /**
     * Check for a dangling upload intent from a previous page navigation.
     * Call this on mount in the social feed component.
     * @returns {{ userId, folder, fileName, fileSize, content, timestamp } | null}
     */
    checkDanglingIntent() {
        try {
            const raw = sessionStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const intent = JSON.parse(raw);
            // Only return if less than 15 minutes old
            if (Date.now() - intent.timestamp > 15 * 60 * 1000) {
                _clearUploadIntent();
                return null;
            }
            return intent;
        } catch (_) { return null; }
    },

    /**
     * Clear a dangling intent (user dismissed recovery dialog).
     */
    clearDanglingIntent() {
        _clearUploadIntent();
    },

    /** Get ghost post metadata for feed placeholder */
    get ghostMeta() { return _ghostMeta; },

    /** Get queue progress */
    get queuePosition() { return _queuePosition; },
    get queueTotal() { return _queueTotal; },

    /**
     * Retry the last failed upload.
     * Called from the retry toast button.
     */
    retry() {
        if (!_lastUploadParams) return;
        // Keep _lastUploadParams alive during the retry attempt so that
        // if the retry itself fails, the catch block can show a retry toast again.
        const params = { ..._lastUploadParams };
        bgUpload.start(params).catch((err) => {
            console.warn('[bgUpload] Retry failed:', err.message);
        });
    },

    /** Abort the active upload */
    abort() {
        clearTimeout(_bgTimer);
        _bgTimer = null;
        _removeBeforeUnload();
        _removeNetworkListeners();
        _removeVisibilityListener();
        _disarmWatchdog();
        _clearUploadIntent();
        _lastUploadParams = null;
        if (_bgToastId) {
            useToastStore.getState().removeToast(_bgToastId);
            _bgToastId = null;
        }
        if (_activeXhr) {
            try { _activeXhr.abort(); } catch (_) {}
            _activeXhr = null;
        }
        // If upload was active/background, notify listeners of cancellation
        // before clearing them so callers (e.g. ghostPost.remove()) can clean up
        const wasActive = _state === 'uploading' || _state === 'background';
        _state = 'idle';
        _progress = 0;
        _label = '';
        _uploadStartTime = null;
        _lastEta = '';
        _ghostMeta = null;
        if (wasActive) {
            _emit('onError', { error: new Error('Upload cancelled') });
        }
        _listeners.clear();
        _prefetchCache = null;
        _queuePosition = 0;
        _queueTotal = 0;
        // Clear the queue
        _uploadQueue.forEach(job => job.reject(new Error('Upload aborted')));
        _uploadQueue = [];
        _isProcessingQueue = false;
    },
};

export default bgUpload;
