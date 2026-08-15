/**
 * Social Helpers — Shared utilities for social-media and social-pages
 * Extracted from social-media/index.js to enable code sharing.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Light Theme Colors (SmarterPoker-style)
// ═══════════════════════════════════════════════════════════════════════════
export const SOCIAL_COLORS = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', blueHover: '#166FE5', green: '#42B72A', red: '#FA383E',
};

// ═══════════════════════════════════════════════════════════════════════════
// Time formatting
// ═══════════════════════════════════════════════════════════════════════════
export const timeAgo = (d) => {
    if (!d) return '';
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
};

// ═══════════════════════════════════════════════════════════════════════════
// HTML Entity Decoding (for link preview titles/descriptions)
// ═══════════════════════════════════════════════════════════════════════════
export const decodeHtmlEntities = (text) => {
    if (!text) return text;
    const entities = {
        '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
        '&#039;': "'", '&#39;': "'", '&apos;': "'", '&#x27;': "'",
        '&nbsp;': ' ', '&#8217;': "'", '&#8216;': "'", '&#8220;': '"', '&#8221;': '"'
    };
    return text.replace(/&[#\w]+;/g, match => entities[match] || match);
};

// ═══════════════════════════════════════════════════════════════════════════
// YOUTUBE URL HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export function isYouTubeUrl(url) {
    if (!url) return false;
    return url.includes('youtube.com') || url.includes('youtu.be');
}

export function getYouTubeVideoId(url) {
    if (!url) return null;
    const watchMatch = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/);
    if (watchMatch) return watchMatch[1];
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
    if (shortMatch) return shortMatch[1];
    const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch) return shortsMatch[1];
    const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/);
    if (embedMatch) return embedMatch[1];
    return null;
}

export function getYouTubeEmbedUrl(url) {
    const videoId = getYouTubeVideoId(url);
    if (videoId) {
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
    }
    return url;
}

export function getYouTubeThumbnail(url) {
    const videoId = getYouTubeVideoId(url);
    if (videoId) {
        return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }
    return null;
}

export async function validateYouTubeVideo(url) {
    if (typeof window === 'undefined') return { valid: false, error: 'SSR environment' };
    const videoId = getYouTubeVideoId(url);
    if (!videoId) return { valid: false, error: 'Invalid YouTube URL' };
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            if (img.naturalWidth <= 120 && img.naturalHeight <= 90) {
                resolve({ valid: false, error: 'This YouTube video is unavailable or has been removed' });
            } else {
                resolve({ valid: true });
            }
        };
        img.onerror = () => {
            resolve({ valid: false, error: 'Could not verify YouTube video' });
        };
        setTimeout(() => resolve({ valid: false, error: 'Video check timed out' }), 5000);
        img.src = thumbnailUrl;
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// Image Compression — resize before upload to save bandwidth
// ═══════════════════════════════════════════════════════════════════════════
export const MAX_MEDIA = 10;

// Convenience alias — allows `import { C } from 'socialHelpers'` as a shorthand
export { SOCIAL_COLORS as C };

// 2026-08-15 media-quality fix (Dan: "grainy and distorted"). Three changes
// from the old 1920 / q0.85 / default-resampler settings:
//   1. 2560 max edge — a modern phone shoots 4032px; 1920 threw away more
//      than half the detail before the feed ever downscaled it again.
//   2. q0.92 — 0.85 blocks visibly on felt, card faces and skin tone.
//   3. imageSmoothingQuality='high' — the canvas default is a box filter
//      that aliases hard on a 2x+ downscale. That aliasing IS the "grain".
// PNG sources take a different branch: see the encodeType note below.
export async function compressImage(file, maxDim = 2560, quality = 0.92) {
    const mime = sniffMimeType(file);
    if (mime === 'image/gif' || file.size < 200 * 1024) return file;
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            if (img.width <= maxDim && img.height <= maxDim) { URL.revokeObjectURL(img.src); resolve(file); return; }
            const scale = maxDim / Math.max(img.width, img.height);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext('2d');
            try { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; } catch (_) {}
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            // A PNG on this platform is almost always a screenshot, GTO chart,
            // hand history or range grid — text and flat colour, exactly what
            // JPEG handles worst (ringing around every glyph, which is the
            // "distorted" half of the complaint). WebP keeps those clean and
            // still compresses. Browsers that can't encode WebP fall back to
            // PNG per the toBlob() spec, which is lossless — also fine.
            const isPng = mime === 'image/png';
            const encodeType = isPng ? 'image/webp' : 'image/jpeg';
            const encodeQuality = isPng ? 0.95 : quality;
            canvas.toBlob((blob) => {
                URL.revokeObjectURL(img.src);
                if (blob && blob.size < file.size) {
                    const outType = blob.type || encodeType;
                    const ext =
                        outType === 'image/webp' ? '.webp' : outType === 'image/png' ? '.png' : '.jpg';
                    resolve(new File([blob], file.name.replace(/\.[^.]+$/, ext), { type: outType }));
                } else {
                    // Re-encode came out bigger than the source — keep the
                    // original. Best quality, and the browser downscales it
                    // at paint time with a proper filter anyway.
                    resolve(file);
                }
            }, encodeType, encodeQuality);
        };
        img.onerror = () => { URL.revokeObjectURL(img.src); resolve(file); };
        img.src = URL.createObjectURL(file);
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// Video Upload Helpers (Direct-to-S3 signed URL uploads)
// ═══════════════════════════════════════════════════════════════════════════

// Extension-to-MIME fallback map (shared by sniffMimeType)
const EXT_MIME_MAP = {
    mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v',
    avi: 'video/x-msvideo', webm: 'video/webm',
    '3gp': 'video/3gpp', '3g2': 'video/3gpp2',
    hevc: 'video/hevc', mkv: 'video/x-matroska',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp',
};

/**
 * Sniff a clean MIME type from a File object.
 * - Strips codec suffixes (e.g. "video/quicktime; codecs=avc1.4D401E")
 * - Upgrades generic "application/octet-stream" via file extension
 * - Falls back to extension map when browser reports no type (iOS Photo Library)
 * - Normalises iPhone HEVC clips (.mov) to video/quicktime for Supabase compat
 */
export const sniffMimeType = (file) => {
    // Strip codec suffix — Supabase bucket allowed_mime_types does exact matching
    let mime = (file.type || '').split(';')[0].trim();

    // Upgrade generic octet-stream or empty via extension
    if (!mime || mime === 'application/octet-stream') {
        const ext = (file.name || '').split('.').pop().toLowerCase();
        mime = EXT_MIME_MAP[ext] || 'application/octet-stream';
    }

    return mime;
};

export const uploadVideoWithProgress = (signedUrl, file, mimeType, onProgress, xhrCallback) => {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', signedUrl);
        // Always use a clean MIME type (no codec suffix) — Supabase storage enforces
        // exact matching against the bucket's allowed_mime_types whitelist.
        const cleanMime = (mimeType || '').split(';')[0].trim();
        xhr.setRequestHeader('Content-Type', cleanMime || 'video/mp4');
        // Expose the XHR handle to the caller so it can be aborted on unmount
        if (typeof xhrCallback === 'function') xhrCallback(xhr);
        xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable && onProgress) {
                const pct = Math.round((evt.loaded / evt.total) * 100);
                onProgress({ pct, label: `Uploading video… ${pct}%` });
            }
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr);
            } else {
                reject(new Error(`PUT failed (${xhr.status}): ${xhr.responseText?.slice(0, 200) || ''}`.trim()));
            }
        };
        xhr.onerror = () => reject(new Error('Network error during video upload'));
        xhr.ontimeout = () => reject(new Error('Video upload timed out'));
        xhr.timeout = 10 * 60 * 1000; // 10 minute timeout for large videos
        xhr.send(file);
    });
};

/**
 * Compress a video file client-side using MediaRecorder + canvas capture.
 * Targets a reasonable bitrate to dramatically shrink large mobile videos.
 *
 * - Only triggers for files > COMPRESS_THRESHOLD_MB (default 30 MB)
 * - Falls back gracefully to original file if MediaRecorder is unavailable
 *   or the browser can't encode the preferred format.
 * - Calls onProgress(0-100) with "Compressing…" label while working.
 *
 * @param {File} file - Original video file
 * @param {Function} [onProgress] - Callback ({ pct, label })
 * @param {Object}   [options]
 * @param {number}   [options.thresholdMB=30]  - Skip compression below this size
 * @param {number}   [options.videoBitrate=2500000] - Target video bitrate (bps). 2.5 Mbps ≈ good 1080p mobile quality.
 * @param {number}   [options.audioBitrate=128000]  - Target audio bitrate (bps)
 * @returns {Promise<File>} Compressed (or original) file
 */
export async function compressVideoIfNeeded(file, onProgress, {
    thresholdMB = 30,
    videoBitrate = 2_500_000,
    audioBitrate = 128_000,
} = {}) {
    const thresholdBytes = thresholdMB * 1024 * 1024;

    // Skip tiny files — no compression needed
    if (file.size <= thresholdBytes) {
        return file;
    }

    // Skip if MediaRecorder not available (Safari < 14.1, some Android WebViews)
    if (typeof MediaRecorder === 'undefined') {
        console.warn('[VideoCompress] MediaRecorder not available — skipping compression');
        return file;
    }

    // Pick the best supported output MIME type
    const preferredTypes = [
        'video/mp4;codecs=avc1',
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
    ];
    const outputMime = preferredTypes.find(t => MediaRecorder.isTypeSupported(t));
    if (!outputMime) {
        console.warn('[VideoCompress] No supported MediaRecorder output type — skipping compression');
        return file;
    }

    onProgress?.({ pct: 0, label: 'Compressing video…' });

    return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.src = objectUrl;
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';

        video.onloadedmetadata = () => {
            const duration = video.duration || 0;

            // Capture video frames at native resolution via canvas
            const canvas = document.createElement('canvas');
            // Cap resolution to 1080p to save bandwidth without visible quality loss
            const MAX_DIM = 1080;
            let w = video.videoWidth;
            let h = video.videoHeight;
            if (w > MAX_DIM || h > MAX_DIM) {
                const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
                w = Math.round(w * ratio);
                h = Math.round(h * ratio);
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');

            let stream;
            try {
                stream = canvas.captureStream(30); // 30 fps capture
            } catch (err) {
                console.warn('[VideoCompress] captureStream failed:', err);
                URL.revokeObjectURL(objectUrl);
                return resolve(file); // fallback
            }

            // Add original audio track if available
            try {
                // Some browsers can capture audio from a video element
                const audioCtx = new AudioContext();
                const src = audioCtx.createMediaElementSource(video);
                const dest = audioCtx.createMediaStreamDestination();
                src.connect(dest);
                src.connect(audioCtx.destination);
                dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
            } catch (_) {
                // Audio capture not available in this browser — video will be muted
            }

            let recorder;
            try {
                recorder = new MediaRecorder(stream, {
                    mimeType: outputMime,
                    videoBitsPerSecond: videoBitrate,
                    audioBitsPerSecond: audioBitrate,
                });
            } catch (err) {
                console.warn('[VideoCompress] MediaRecorder init failed:', err);
                URL.revokeObjectURL(objectUrl);
                return resolve(file);
            }

            const chunks = [];
            recorder.ondataavailable = (e) => { if (e.data?.size > 0) chunks.push(e.data); };

            recorder.onstop = () => {
                URL.revokeObjectURL(objectUrl);
                const blob = new Blob(chunks, { type: outputMime.split(';')[0] });
                // Only use compressed version if it's actually smaller
                if (blob.size >= file.size) {
                    console.warn('[VideoCompress] Compressed size >= original — using original');
                    return resolve(file);
                }
                const ext = outputMime.includes('mp4') ? 'mp4' : 'webm';
                const compressed = new File(
                    [blob],
                    file.name.replace(/\.[^.]+$/, `.${ext}`),
                    { type: outputMime.split(';')[0] }
                );
                console.log(`[VideoCompress] ${(file.size / 1024 / 1024).toFixed(1)}MB → ${(compressed.size / 1024 / 1024).toFixed(1)}MB`);
                onProgress?.({ pct: 100, label: 'Compression complete' });
                resolve(compressed);
            };

            recorder.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(file); // fallback
            };

            recorder.start(1000); // collect chunks every 1 second

            // Play the video through the canvas frame-by-frame
            let lastTime = -1;
            const drawFrame = () => {
                if (video.paused || video.ended) return;
                if (video.currentTime !== lastTime) {
                    ctx.drawImage(video, 0, 0, w, h);
                    lastTime = video.currentTime;
                }
                // Report compression progress
                if (duration > 0) {
                    const pct = Math.round((video.currentTime / duration) * 100);
                    onProgress?.({ pct, label: `Compressing… ${pct}%` });
                }
                requestAnimationFrame(drawFrame);
            };

            video.onended = () => recorder.stop();
            video.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };

            video.play().then(() => {
                requestAnimationFrame(drawFrame);
            }).catch(() => {
                URL.revokeObjectURL(objectUrl);
                recorder.stop();
                resolve(file);
            });
        };

        video.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(file); // fallback — don't block the upload
        };
    });
}
