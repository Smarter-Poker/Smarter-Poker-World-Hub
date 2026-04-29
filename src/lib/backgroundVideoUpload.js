/**
 * BACKGROUND VIDEO UPLOAD MANAGER v3.1
 * src/lib/backgroundVideoUpload.js
 *
 * v3.1 (2026-04-29): empty-Bearer JWS race fix — _ensureBearer falls back
 * to supabase.auth.refreshSession() when getAccessToken() returns null;
 * applied to both initial TUS POST headers and per-chunk onBeforeRequest.
 * Cache-bust comment to force Vercel to rebuild this module's chunk.
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

import { getAccessToken, SUPABASE_ANON_KEY } from './authUtils';
import { sniffMimeType } from './socialHelpers';
import toast, { useToastStore } from '../stores/toastStore';
import * as tus from 'tus-js-client';

// ─── Auth resilience helper ──────────────────────────────────────────────────
// getAccessToken() is a one-shot localStorage read that races with Supabase SDK
// token refresh, fails in PWA standalone mode (separate localStorage scope from
// Safari), and returns null under iOS memory pressure. When that happens, the
// TUS Authorization header becomes "Bearer " (empty) and Supabase Storage
// rejects the request with "Invalid Compact JWS" before ever reading
// x-signature. This helper falls back to an active SDK refresh when localStorage
// is empty so the bearer header is never blank.
async function _ensureBearer() {
    let token = getAccessToken();
    if (token) return token;
    try {
        const { supabase } = await import('./supabase');
        const { data } = await supabase.auth.refreshSession();
        token = data?.session?.access_token || null;
    } catch (_) { /* refresh failed; caller will reject with a clear error */ }
    return token;
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
const TUS_CHUNK_SIZE = 6 * 1024 * 1024; // 6 MB — Supabase recommended

// ─── Client-side hard timeout for the entire upload session ───────────────────
const UPLOAD_HARD_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — surfaces real error, never hangs

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _emit(type, payload) {
    _listeners.forEach((l) => l[type]?.(payload));
    _permanentListeners.forEach((l) => l[type]?.(payload));
}

function _setState(state, progress, label) {
    _state = state;
    if (progress !== undefined) _progress = progress;
    if (label !== undefined) _label = label;
    _emit('onProgress', { state: _state, pct: _progress, label: _label, queuePosition: _queuePosition, queueTotal: _queueTotal });
}

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
    // Compact JWS" no matter how valid x-signature is. Resolve a guaranteed
    // non-empty bearer token now; if we can't, fail loudly with a user-readable
    // error rather than shipping "Bearer " on the wire.
    const userToken = await _ensureBearer();
    if (!userToken) {
        throw new Error('Session expired. Please refresh the page and try again.');
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
        const tusHeaders = {
            Authorization: `Bearer ${userToken}`,
            apikey: SUPABASE_ANON_KEY,
            'x-upsert': 'true',
        };
        if (meta.token) {
            tusHeaders['x-signature'] = meta.token;
        }

        const upload = new tus.Upload(file, {
            endpoint: meta.tusEndpoint,
            chunkSize: TUS_CHUNK_SIZE,          // 6MB — immune to gateway timeouts
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
                    reject(new Error(`Upload failed: ${msg.slice(0, 300)} — please try again.`));
                }
            },
            // Refresh Authorization on every chunk PATCH so multi-minute uploads
            // survive token rotation. _ensureBearer falls back to an active SDK
            // refresh when localStorage is stale; tus-js-client v4 awaits the
            // returned Promise, so an async callback is safe here.
            onBeforeRequest: async (req) => {
                const fresh = await _ensureBearer();
                if (fresh) req.setHeader('Authorization', `Bearer ${fresh}`);
                req.setHeader('apikey', SUPABASE_ANON_KEY);
                if (meta.token) req.setHeader('x-signature', meta.token);
            },
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

            // Show brief "uploading in background" toast — auto-dismisses after 4s
            // The ghost post card in the feed shows live upload progress, so persistent
            // toast is unnecessary and annoying.
            _bgToastId = toast.action(
                'Upload Is Running In The Background — Do Not Close This App Until Upload Is Completed',
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

            // ── Step 2: Upload — prefer TUS (chunked/resumable) for all videos ─
            // Falls back to XHR PUT if tusEndpoint is not present in meta (old cached meta).
            const mimeType = sniffMimeType(file);
            let finalPublicUrl;
            if (meta.tusEndpoint) {
                // TUS path: chunked, resumable, iOS-safe
                await _uploadWithTus(file, meta, mimeType);
                finalPublicUrl = meta.publicUrl;
            } else {
                // XHR fallback: preserves Bug 3 fix (alreadyConsumed detection)
                const freshPublicUrl = await _uploadWithRetry(file, meta.signedUrl, mimeType, 0, userId, folder);
                finalPublicUrl = freshPublicUrl || meta.publicUrl;
            }

            // ── Upload complete ───────────────────────────────────────────────
            clearTimeout(_bgTimer);
            _bgTimer = null;
            _removeBeforeUnload();
            _removeNetworkListeners();
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

            // NOTE: callers fire the "Video is live" toast AFTER their DB insert
            // so we don't announce too early. bgUpload only handles the upload.

            return { publicUrl: finalPublicUrl, wasBackground };

        } catch (err) {
            clearTimeout(_bgTimer);
            _bgTimer = null;
            _removeBeforeUnload();
            _removeNetworkListeners();
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
