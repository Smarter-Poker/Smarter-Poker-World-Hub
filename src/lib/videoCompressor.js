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
const COMPRESS_THRESHOLD = 50 * 1024 * 1024; // 50MB
const MAX_COMPRESS_DURATION = 120; // Skip videos > 2 minutes (real-time processing)
const MAX_CLIENT_SIZE = 5 * 1024 * 1024 * 1024; // 5GB hard limit
const MAX_FINAL_SIZE = 50 * 1024 * 1024; // 50MB hard cap for the output

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
    return new Promise((resolve) => {
        // Guard: skip if not in browser or file is invalid
        if (typeof document === 'undefined' || !file || !file.size) {
            return resolve(null);
        }

        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        // iOS Safari: these attributes are critical for blob URL playback
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');

        const blobUrl = URL.createObjectURL(file);
        video.src = blobUrl;

        const cleanup = () => {
            try { video.pause(); video.removeAttribute('src'); video.load(); } catch (_) {}
            try { URL.revokeObjectURL(blobUrl); } catch (_) {}
        };

        let resolved = false;
        const finish = (val) => { if (resolved) return; resolved = true; cleanup(); resolve(val); };

        const captureFrame = () => {
            try {
                const canvas = document.createElement('canvas');
                const maxDim = 480;
                const vw = video.videoWidth || 640;
                const vh = video.videoHeight || 360;
                const ratio = Math.min(maxDim / vw, maxDim / vh, 1);
                canvas.width = Math.round(vw * ratio);
                canvas.height = Math.round(vh * ratio);

                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                // Verify we didn't draw a blank frame (all black)
                const testData = ctx.getImageData(0, 0, 1, 1).data;
                const isBlank = testData[0] === 0 && testData[1] === 0 && testData[2] === 0;

                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                // A valid JPEG data URL should be > 1KB (blank frames are tiny)
                if (dataUrl.length < 1000 || isBlank) {
                    console.warn('[VideoCompressor] Blank frame detected, trying later time...');
                    // Try a slightly later time (iOS sometimes has blank first frames)
                    if (video.currentTime < 3 && video.duration > 3) {
                        video.currentTime = 3;
                        return; // will re-enter via onseeked
                    }
                    // Already retried or short video — return null to trigger placeholder
                    finish(null);
                    return;
                }
                finish(dataUrl);
            } catch (err) {
                console.warn('[VideoCompressor] Thumbnail canvas failed:', err.message);
                finish(null);
            }
        };

        video.onseeked = captureFrame;

        // Use loadedmetadata (fires before loadeddata, more reliable on iOS)
        video.onloadedmetadata = () => {
            const seekTo = Math.min(timeSeconds, (video.duration || 10) * 0.1 || 0.5);
            video.currentTime = seekTo;
        };

        // Fallback: also listen for loadeddata in case metadata fires but seek doesn't work
        video.onloadeddata = () => {
            if (!resolved && video.readyState >= 2) {
                const seekTo = Math.min(timeSeconds, (video.duration || 10) * 0.1 || 0.5);
                video.currentTime = seekTo;
            }
        };

        video.onerror = () => {
            console.warn('[VideoCompressor] Video element error during thumbnail gen');
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

        setTimeout(() => finish(null), 8000); // 8s timeout (iOS can be slow)
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
