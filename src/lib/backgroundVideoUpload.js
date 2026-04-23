/**
 * 🎬 BACKGROUND VIDEO UPLOAD MANAGER
 * src/lib/backgroundVideoUpload.js
 *
 * Singleton that keeps a video upload alive even after the modal/creator
 * unmounts. The 10-second UX rule lives here:
 *
 *   <10 s  → modal stays open, normal inline progress bar
 *   ≥10 s  → modal dismisses, floating background banner appears,
 *             completion fires a clickable toast → /hub/social-media
 *
 * Usage:
 *   import bgUpload from '@/lib/backgroundVideoUpload';
 *   bgUpload.start({ ... });
 */

import { getAccessToken } from './authUtils';
import { sniffMimeType } from './socialHelpers';
import toast from '../stores/toastStore';

// ─── Module-level singletons ──────────────────────────────────────────────────
let _activeXhr = null;       // never garbage-collected on modal unmount
let _listeners = new Set();  // { onProgress, onComplete, onError, onBackground }
let _state = 'idle';         // 'idle' | 'uploading' | 'background' | 'done' | 'error'
let _progress = 0;
let _label = '';
let _bgTimer = null;

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _emit(type, payload) {
    _listeners.forEach((l) => l[type]?.(payload));
}

function _setState(state, progress, label) {
    _state = state;
    if (progress !== undefined) _progress = progress;
    if (label !== undefined) _label = label;
    _emit('onProgress', { state: _state, pct: _progress, label: _label });
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
     * @param {{ onProgress?, onComplete?, onError?, onBackground? }} listener
     * @returns {Function} unsubscribe
     */
    subscribe(listener) {
        _listeners.add(listener);
        // Immediately emit current state so late subscribers are in sync
        if (_state !== 'idle') {
            listener.onProgress?.({ state: _state, pct: _progress, label: _label });
        }
        return () => _listeners.delete(listener);
    },

    /**
     * Start a background-capable video upload.
     *
     * @param {Object} opts
     * @param {File}     opts.file         - Video file to upload
     * @param {string}   opts.userId       - Authenticated user ID
     * @param {string}   [opts.folder]     - Storage folder (default: 'videos')
     * @param {number}   [opts.bgAfterMs]  - Switch to background after N ms (default: 10000)
     * @param {Function} [opts.onDismiss]  - Called when bg mode activates (close modal here)
     * @param {Function} [opts.onRouter]   - Router push fn for completion toast click
     * @returns {Promise<{ publicUrl: string }>} — resolves when upload completes
     */
    async start({ file, userId, folder = 'videos', bgAfterMs = 10_000, onDismiss, onRouter }) {
        // Abort any previous upload
        bgUpload.abort();

        _state = 'uploading';
        _progress = 0;
        _label = 'Preparing…';
        _emit('onProgress', { state: _state, pct: _progress, label: _label });

        // 10-second background trigger
        _bgTimer = setTimeout(() => {
            if (_state !== 'uploading') return;
            _state = 'background';
            _emit('onBackground', {});
            onDismiss?.();
            // Show persistent "uploading in background" info toast
            toast.info(
                '📹 Long video uploading in the background — feel free to keep browsing!',
                undefined  // no duration = persistent
            );
        }, bgAfterMs);

        try {
            // ── Step 1: Get signed URL ────────────────────────────────────────
            _setState('uploading', 2, 'Preparing upload…');

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
            if (!meta.success || !meta.signedUrl?.startsWith('http')) {
                throw new Error(meta.error || 'Invalid upload URL received');
            }

            _setState('uploading', 5, 'Uploading…');

            // ── Step 2: XHR upload with live progress ─────────────────────────
            await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                _activeXhr = xhr;

                xhr.upload.onprogress = (evt) => {
                    if (!evt.lengthComputable) return;
                    const pct = Math.round((evt.loaded / evt.total) * 93) + 5;
                    _setState(_state, Math.min(pct, 97), `Uploading… ${Math.round((evt.loaded / evt.total) * 100)}%`);
                };

                xhr.onload = () => {
                    _activeXhr = null;
                    if (xhr.status >= 200 && xhr.status < 300) resolve();
                    else reject(new Error(`Upload failed (HTTP ${xhr.status})`));
                };

                xhr.onerror = () => { _activeXhr = null; reject(new Error('Network error during upload')); };
                xhr.onabort = () => { _activeXhr = null; reject(new Error('Upload cancelled')); };

                const cleanMime = (mimeType || '').split(';')[0].trim() || 'video/mp4';
                xhr.open('PUT', meta.signedUrl);
                xhr.setRequestHeader('Content-Type', cleanMime);
                xhr.send(file);
            });

            // ── Upload complete ───────────────────────────────────────────────
            clearTimeout(_bgTimer);
            _bgTimer = null;
            const wasBackground = (_state === 'background');
            _setState('done', 100, 'Upload complete!');
            _emit('onComplete', { publicUrl: meta.publicUrl, wasBackground });

            // NOTE: callers fire the "Video is live" toast AFTER their DB insert
            // so we don't announce too early. bgUpload only handles XHR.

            return { publicUrl: meta.publicUrl, wasBackground };

        } catch (err) {
            clearTimeout(_bgTimer);
            _bgTimer = null;
            _activeXhr = null;
            const wasBackground = (_state === 'background');
            _setState('error', 0, err.message || 'Upload failed');
            _emit('onError', { error: err });

            // Only show error toast if modal is already gone (background mode)
            if (wasBackground) {
                toast.error(`🎥 Video upload failed: ${err.message}`);
            }

            throw err;
        }
    },

    /** Abort the active upload */
    abort() {
        clearTimeout(_bgTimer);
        _bgTimer = null;
        if (_activeXhr) {
            try { _activeXhr.abort(); } catch (_) {}
            _activeXhr = null;
        }
        _state = 'idle';
        _progress = 0;
        _label = '';
        _listeners.clear();
    },
};

export default bgUpload;
