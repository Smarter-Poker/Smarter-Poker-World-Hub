/**
 * 🎬 VIDEO COMPRESSOR & THUMBNAIL GENERATOR
 * src/lib/videoCompressor.js
 *
 * Client-side video processing:
 *   1. THUMBNAIL — Extracts a JPEG frame at ~2s for lightweight preview
 *   2. COMPRESSION — Re-encodes at lower bitrate via MediaRecorder
 *   3. FILE VALIDATION — Instant client-side size/duration checks
 *
 * Compression runs during staging (while user types caption).
 * If ready by post time → smaller upload → faster delivery.
 * If not ready → falls back to original file.
 */

const TARGET_BITRATE = 2_500_000; // 2.5 Mbps — good 720p quality
// ⚠️ DISABLED: Client-side compression via MediaRecorder runs at 1x real-time speed on mobile.
// A 60s clip takes 60+ seconds to compress on-device, freezing the UI before upload even begins.
// TUS chunked uploads (tus-js-client, 6 MB chunks) now handle large files reliably instead.
// Re-enable by lowering COMPRESS_THRESHOLD to 50 * 1024 * 1024 ONLY when ffmpeg.wasm is integrated.
// 2026-08-15 media-quality fix: poster capture settings, shared by
// generateThumbnail() and captureFrameAt(). See generateThumbnail for why
// 480/0.70 was the visible "grain" in the feed.
const POSTER_MAX_DIM = 1280;
const POSTER_QUALITY = 0.92;

// Canvas defaults to a cheap box filter, which aliases badly on the 2-4x
// downscales video/photo capture needs — reads as grain on fine detail
// (felt texture, card pips, small text).
function applyHighQualityScaling(ctx) {
    try {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
    } catch (_) {}
}

const COMPRESS_THRESHOLD = Infinity; // DISABLED — see note above
const MAX_COMPRESS_DURATION = 120; // Skip videos > 2 minutes (real-time processing)
const MAX_CLIENT_SIZE = 5 * 1024 * 1024 * 1024; // 5GB hard limit

/**
 * Get connection-aware warning threshold.
 * Uses navigator.connection.effectiveType to adapt to network speed:
 *   - WiFi/4G: 300MB threshold
 *   - 3G:      100MB threshold
 *   - 2G:      25MB threshold
 *   - Unknown:  200MB default
 */
function _getWarnThreshold() {
    try {
        const conn = navigator?.connection?.effectiveType;
        if (conn === '4g') return 300 * 1024 * 1024;
        if (conn === '3g') return 100 * 1024 * 1024;
        if (conn === '2g') return 25 * 1024 * 1024;
        if (conn === 'slow-2g') return 10 * 1024 * 1024;
    } catch (_) { /* navigator.connection not available */ }
    return 200 * 1024 * 1024; // default fallback
}

/**
 * Validate a video file before staging.
 * @param {File} file
 * @returns {{ valid: boolean, error?: string, warning?: string, sizeMB: number }}
 */
export function validateVideoFile(file) {
    const sizeMB = Math.round(file.size / (1024 * 1024));
    if (file.size > MAX_CLIENT_SIZE) {
        return { valid: false, error: `Video is too large (${sizeMB}MB). Maximum is 5GB.`, sizeMB };
    }
    const warnThreshold = _getWarnThreshold();
    let warning = null;
    if (file.size > warnThreshold) {
        const connType = navigator?.connection?.effectiveType;
        const connLabel = connType === '2g' || connType === 'slow-2g' ? 'on a slow connection'
                        : connType === '3g' ? 'on 3G'
                        : 'on mobile';
        warning = `Large video (${sizeMB}MB) — upload may take a few minutes ${connLabel}.`;
    }

    // Detect formats that need server-side transcoding
    const name = (file.name || '').toLowerCase();
    const type = (file.type || '').toLowerCase();
    let formatWarning = null;
    const isHEVC = type.includes('hevc') || type.includes('hev1') || name.endsWith('.hevc');
    const isMOV = type === 'video/quicktime' || name.endsWith('.mov');
    const isUncommon = type.includes('x-matroska') || name.endsWith('.mkv') || name.endsWith('.avi');
    if (isHEVC || isMOV || isUncommon) {
        formatWarning = 'Your video will be optimized for all devices after upload.';
    }

    return { valid: true, warning, formatWarning, sizeMB };
}

/**
 * Generate a JPEG thumbnail from a video file.
 * Extracts a frame at ~2 seconds (or 10% of duration for short clips).
 *
 * @param {File} file - Video file
 * @param {number} [timeSeconds=2] - Time offset for frame capture
 * @returns {Promise<string|null>} Data URL (image/jpeg) or null on failure
 */
export function generateThumbnail(file, timeSeconds = 2) {
    // SPEED FIX (2026-04-30 per Dan): the previous version always seeked to
    // ~2 seconds before capturing, which on iOS Safari + HEVC takes 10–20
    // seconds of decode time. Result: 20+ second staging delay with no
    // visible thumbnail. New behavior: capture the FIRST decoded frame
    // immediately on `loadeddata` (no seek), and only fall back to a 2s
    // seek if that first frame turns out to be blank/black. Cuts staging
    // time from ~25s to ~2s for typical iPhone HEVC clips.
    return new Promise((resolve) => {
        if (typeof document === 'undefined' || !file || !file.size) {
            return resolve(null);
        }

        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');

        const blobUrl = URL.createObjectURL(file);
        video.src = blobUrl;

        const cleanup = () => {
            try { video.pause(); video.removeAttribute('src'); video.load(); } catch (_) {}
            try { URL.revokeObjectURL(blobUrl); } catch (_) {}
        };

        let resolved = false;
        let attemptedSeek = false;
        const finish = (val) => { if (resolved) return; resolved = true; cleanup(); resolve(val); };

        // Hard cap: even with the first-frame fast-path, never block staging
        // for more than 8s. If decode hasn't produced anything by then, give
        // up and let the post upload without a client-side thumbnail (the
        // server-side transcode worker can generate one later, or the feed
        // falls back to the video poster attribute).
        const timeoutId = setTimeout(() => finish(null), 8000);

        const captureFrame = () => {
            // RACE FIX (2026-04-30 audit-3 — corrected from audit-2): if a
            // previous captureFrame already initiated a seek-to-2s fallback,
            // load-event handlers must NOT re-enter captureFrame and bail
            // before onseeked fires. Audit-2 used a `seekInFlight` flag
            // gating ALL captureFrame entries — but that ALSO blocked the
            // onseeked re-entry, breaking the seek-recovered capture path.
            // Corrected approach: prevention happens by detaching
            // video.onloadeddata + video.onloadedmetadata at seek-kick time
            // (further down in this function); captureFrame itself only
            // checks `resolved` so onseeked can ALWAYS re-enter.
            if (resolved) return;
            try {
                const canvas = document.createElement('canvas');
                // 2026-08-15 media-quality fix (Dan: "all of the videos and
                // images posted in the feed are grainy and distorted").
                // This poster IS the feed tile until the user hits play, and
                // the tile is bled to full card width — on a 2-3x DPR phone a
                // 480px q0.70 JPEG gets painted into 750-1125 physical pixels.
                // That upscale is the grain. 1280 covers the widest card at
                // 3x with headroom; q0.92 kills the blocking on flat felt and
                // card faces. Costs ~300-500KB on a one-time poster upload.
                const maxDim = POSTER_MAX_DIM;
                const vw = video.videoWidth || 640;
                const vh = video.videoHeight || 360;
                const ratio = Math.min(maxDim / vw, maxDim / vh, 1);
                canvas.width = Math.round(vw * ratio);
                canvas.height = Math.round(vh * ratio);

                const ctx = canvas.getContext('2d');
                applyHighQualityScaling(ctx);
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                // Verify we didn't draw a blank frame (all black). Sample 4
                // pixels (corners + center) — a single-pixel sample fails on
                // black-letterboxed content where the corner happens to be
                // black but the frame itself is fine.
                const samples = [
                    ctx.getImageData(canvas.width / 2 | 0, canvas.height / 2 | 0, 1, 1).data,
                    ctx.getImageData(2, 2, 1, 1).data,
                    ctx.getImageData(canvas.width - 3, 2, 1, 1).data,
                    ctx.getImageData(2, canvas.height - 3, 1, 1).data,
                ];
                const isBlank = samples.every(d => d[0] < 8 && d[1] < 8 && d[2] < 8);

                const dataUrl = canvas.toDataURL('image/jpeg', POSTER_QUALITY);
                if (dataUrl.length < 1000 || isBlank) {
                    if (!attemptedSeek && video.duration > 3) {
                        // First frame was black — seek to 2s and retry. This
                        // costs us ~5–15s on HEVC but only happens for clips
                        // where frame 0 is genuinely blank (intro fade-ins,
                        // most security cam footage). Still bounded by the 8s
                        // hard timeout above.
                        attemptedSeek = true;
                        // Detach the load-event handlers so only onseeked can
                        // re-enter captureFrame once the seek completes. This
                        // is what actually closes the load-handler race —
                        // previously two handlers firing in the same tick
                        // would both bail with finish(null) before onseeked
                        // had a chance to fire with the recovered frame.
                        video.onloadeddata = null;
                        video.onloadedmetadata = null;
                        const seekTo = Math.min(timeSeconds, (video.duration || 10) * 0.1 || 0.5);
                        video.currentTime = seekTo;
                        return; // will re-enter via onseeked
                    }
                    clearTimeout(timeoutId);
                    finish(null);
                    return;
                }
                clearTimeout(timeoutId);
                finish(dataUrl);
            } catch (err) {
                console.warn('[VideoCompressor] Thumbnail canvas failed:', err.message);
                clearTimeout(timeoutId);
                finish(null);
            }
        };

        video.onseeked = captureFrame;

        // FAST PATH: capture as soon as ANY decoded frame is available.
        // readyState >= 2 (HAVE_CURRENT_DATA) means the current playhead
        // position has decoded data. iOS Safari fires this within 1–2s of
        // src assignment for both H.264 and HEVC.
        video.onloadeddata = () => {
            if (resolved) return;
            if (video.readyState >= 2) captureFrame();
        };
        // Some iOS versions fire loadedmetadata but not loadeddata until a
        // play() call. Capture from metadata too — ctx.drawImage will show a
        // black frame in that case, which our blank-detector then triggers a
        // single seek-to-2s retry.
        video.onloadedmetadata = () => {
            if (resolved) return;
            if (video.readyState >= 2) captureFrame();
        };

        video.onerror = () => {
            console.warn('[VideoCompressor] Video element error during thumbnail gen');
            clearTimeout(timeoutId);
            finish(null);
        };

        // iOS Safari: programmatic play() is needed to trigger data loading from blob URLs.
        // Without this, loadedmetadata/loadeddata may never fire on mobile Safari.
        try {
            const playPromise = video.play();
            if (playPromise && playPromise.then) {
                playPromise
                    .then(() => { video.pause(); }) // pause immediately — we just needed to kick-start loading
                    .catch(() => {}); // play() rejection is expected (autoplay policy) — that's fine, metadata may still load
            }
        } catch (_) { /* play() not supported in this context — rely on preload */ }

        // NOTE: the 8s hard cap is set near the top via `timeoutId`. The old
        // version had a duplicate setTimeout here too — removed in audit-2 so
        // a single timer governs the budget and gets cleared on success.
    });
}

/**
 * Capture ONE frame at a specific timestamp, at poster resolution.
 *
 * 2026-08-15 media-quality fix: generateFrames() renders the filmstrip at
 * 360px/q0.65 because it decodes six frames and they only ever display as
 * ~64px picker tiles. But picking a tile used to hand that 360px tile
 * straight through as the post's real thumbnail_url — so choosing a custom
 * cover made the poster WORSE than the 480px default. The picker now shows
 * the cheap tiles and re-captures the chosen timestamp at full poster
 * quality through this function.
 *
 * @param {File} file
 * @param {number} timeSeconds
 * @returns {Promise<string|null>} JPEG data URL, or null if capture failed.
 */
export function captureFrameAt(file, timeSeconds, { maxDim = POSTER_MAX_DIM, quality = POSTER_QUALITY } = {}) {
    return new Promise((resolve) => {
        if (!file || typeof document === 'undefined') return resolve(null);
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');

        const blobUrl = URL.createObjectURL(file);
        let done = false;
        const finish = (val) => {
            if (done) return;
            done = true;
            try { video.pause(); video.removeAttribute('src'); video.load(); } catch (_) {}
            try { URL.revokeObjectURL(blobUrl); } catch (_) {}
            resolve(val);
        };

        // Bounded — a failed high-res recapture must never block the post.
        // The caller falls back to the filmstrip tile.
        setTimeout(() => finish(null), 8000);

        video.onseeked = () => {
            try {
                const canvas = document.createElement('canvas');
                const vw = video.videoWidth || 640;
                const vh = video.videoHeight || 360;
                const ratio = Math.min(maxDim / vw, maxDim / vh, 1);
                canvas.width = Math.round(vw * ratio);
                canvas.height = Math.round(vh * ratio);
                const ctx = canvas.getContext('2d');
                applyHighQualityScaling(ctx);
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                finish(dataUrl && dataUrl.length > 1000 ? dataUrl : null);
            } catch (_) {
                finish(null);
            }
        };
        video.onerror = () => finish(null);
        video.onloadedmetadata = () => {
            try {
                video.currentTime = Math.max(0.1, Math.min(timeSeconds || 0.1, (video.duration || 1) - 0.05));
            } catch (_) {
                finish(null);
            }
        };
        video.src = blobUrl;
    });
}

/**
 * Generate multiple evenly-spaced JPEG frames from a video file.
 * Used by the thumbnail picker filmstrip. Reuses a single video element
 * with sequential seeks for efficiency (avoids N parallel video elements).
 *
 * @param {File} file - Video file
 * @param {number} [count=6] - Number of frames to generate
 * @returns {Promise<Array<{ dataUrl: string|null, timeSeconds: number }>>}
 */
export function generateFrames(file, count = 6) {
    return new Promise((resolve) => {
        if (typeof document === 'undefined' || !file || !file.size) {
            return resolve([]);
        }

        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');

        const blobUrl = URL.createObjectURL(file);
        video.src = blobUrl;

        const cleanup = () => {
            try { video.pause(); video.removeAttribute('src'); video.load(); } catch (_) {}
            try { URL.revokeObjectURL(blobUrl); } catch (_) {}
        };

        const captureAt = (timeSeconds) => new Promise((res) => {
            let done = false;
            const finish = (dataUrl) => {
                if (done) return;
                done = true;
                res({ dataUrl, timeSeconds });
            };

            video.onseeked = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const maxDim = 360; // smaller for filmstrip thumbnails
                    const vw = video.videoWidth || 640;
                    const vh = video.videoHeight || 360;
                    const ratio = Math.min(maxDim / vw, maxDim / vh, 1);
                    canvas.width = Math.round(vw * ratio);
                    canvas.height = Math.round(vh * ratio);
                    const ctx = canvas.getContext('2d');
                    applyHighQualityScaling(ctx);
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
                    finish(dataUrl.length > 800 ? dataUrl : null);
                } catch {
                    finish(null);
                }
            };

            setTimeout(() => finish(null), 5000);
            video.currentTime = timeSeconds;
        });

        video.onloadedmetadata = async () => {
            const duration = video.duration || 10;
            // Spread frames across the video, skipping the very first and last 5%
            const times = Array.from({ length: count }, (_, i) => {
                return Math.max(0.1, (duration * 0.05) + (duration * 0.9 * i) / Math.max(count - 1, 1));
            });

            const frames = [];
            for (const t of times) {
                frames.push(await captureAt(t));
            }

            cleanup();
            resolve(frames);
        };

        video.onerror = () => { cleanup(); resolve([]); };

        // iOS: trigger loading
        try {
            const p = video.play();
            if (p && p.then) p.then(() => video.pause()).catch(() => {});
        } catch (_) {}

        setTimeout(() => { cleanup(); resolve([]); }, 20000); // 20s hard timeout
    });
}

/**
 * Compress a video file using MediaRecorder.
 * Processing is real-time (30s video ≈ 30s processing).
 * Only activates for files > 50MB and duration < 2 minutes.
 *
 * @param {File} file - Video file to compress
 * @param {Object} [options]
 * @param {Function} [options.onProgress] - ({ pct }) callback
 * @param {AbortSignal} [options.signal] - AbortController signal
 * @returns {Promise<{ file: File, compressed: boolean, savings?: number, reason?: string }>}
 */
export function compressVideo(file, { onProgress, signal } = {}) {
    return new Promise((resolve) => {
        // Skip if under threshold
        if (file.size <= COMPRESS_THRESHOLD) {
            return resolve({ file, compressed: false, reason: 'under-threshold' });
        }

        // Check browser support
        if (typeof window === 'undefined' || !('MediaRecorder' in window)) {
            return resolve({ file, compressed: false, reason: 'unsupported' });
        }

        // Find supported codec
        const mimeType = [
            'video/webm;codecs=vp8,opus',
            'video/webm;codecs=vp8',
            'video/webm',
            'video/mp4',
        ].find(t => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } });

        if (!mimeType) {
            return resolve({ file, compressed: false, reason: 'no-codec' });
        }

        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';

        const blobUrl = URL.createObjectURL(file);
        video.src = blobUrl;
        let done = false;
        let _recorder = null;   // outer-scope ref for abort cleanup
        let _stream = null;     // outer-scope ref for abort cleanup

        const cleanup = () => {
            try { video.pause(); video.src = ''; video.load(); } catch (_) {}
            try { URL.revokeObjectURL(blobUrl); } catch (_) {}
            // Stop recorder + stream tracks if still running
            try { if (_recorder && _recorder.state !== 'inactive') _recorder.stop(); } catch (_) {}
            try { _stream?.getTracks().forEach(t => t.stop()); } catch (_) {}
        };

        const finish = (result) => { if (done) return; done = true; cleanup(); resolve(result); };

        // Abort handling
        if (signal) {
            signal.addEventListener('abort', () => finish({ file, compressed: false, reason: 'aborted' }), { once: true });
        }

        video.onloadedmetadata = () => {
            // Skip long videos (real-time processing would be too slow)
            if (video.duration > MAX_COMPRESS_DURATION) {
                return finish({ file, compressed: false, reason: 'too-long' });
            }

            video.play().then(() => {
                let stream;
                try {
                    stream = video.captureStream();
                    _stream = stream; // track for abort cleanup
                } catch {
                    return finish({ file, compressed: false, reason: 'capture-failed' });
                }

                let recorder;
                try {
                    recorder = new MediaRecorder(stream, {
                        mimeType,
                        videoBitsPerSecond: TARGET_BITRATE,
                    });
                    _recorder = recorder; // track for abort cleanup
                } catch {
                    stream.getTracks().forEach(t => t.stop());
                    return finish({ file, compressed: false, reason: 'recorder-failed' });
                }

                const chunks = [];
                const duration = video.duration;

                recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

                // Progress tracking
                const progInterval = setInterval(() => {
                    if (done) { clearInterval(progInterval); return; }
                    if (video.currentTime && duration) {
                        onProgress?.({ pct: Math.round((video.currentTime / duration) * 100) });
                    }
                }, 500);

                recorder.onstop = () => {
                    clearInterval(progInterval);
                    stream.getTracks().forEach(t => t.stop());

                    const blob = new Blob(chunks, { type: mimeType });

                    // Only use compressed if actually 20%+ smaller
                    if (blob.size < file.size * 0.8) {
                        const ext = mimeType.includes('webm') ? 'webm' : 'mp4';
                        const compressedFile = new File(
                            [blob],
                            file.name.replace(/\.\w+$/, `.${ext}`),
                            { type: mimeType }
                        );
                        finish({
                            file: compressedFile,
                            compressed: true,
                            originalSize: file.size,
                            compressedSize: blob.size,
                            savings: Math.round((1 - blob.size / file.size) * 100),
                        });
                    } else {
                        finish({ file, compressed: false, reason: 'no-savings' });
                    }
                };

                recorder.start(1000);
                video.onended = () => { try { recorder.stop(); } catch (_) {} };
            }).catch(() => finish({ file, compressed: false, reason: 'play-failed' }));
        };

        video.onerror = () => finish({ file, compressed: false, reason: 'load-error' });
    });
}
