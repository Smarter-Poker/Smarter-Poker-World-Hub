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

export async function compressImage(file, maxDim = 1920, quality = 0.85) {
    if (file.type === 'image/gif' || file.size < 200 * 1024) return file;
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            if (img.width <= maxDim && img.height <= maxDim) { URL.revokeObjectURL(img.src); resolve(file); return; }
            const scale = maxDim / Math.max(img.width, img.height);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                URL.revokeObjectURL(img.src);
                if (blob && blob.size < file.size) {
                    resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
                } else {
                    resolve(file);
                }
            }, 'image/jpeg', quality);
        };
        img.onerror = () => { URL.revokeObjectURL(img.src); resolve(file); };
        img.src = URL.createObjectURL(file);
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// Video Upload Helpers (Direct-to-S3 signed URL uploads)
// ═══════════════════════════════════════════════════════════════════════════

export const sniffMimeType = (file) => {
    if (file.type) return file.type;
    const ext = (file.name || '').split('.').pop().toLowerCase();
    const map = {
        mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v',
        avi: 'video/x-msvideo', webm: 'video/webm',
        '3gp': 'video/3gpp', '3g2': 'video/3gpp2',
        hevc: 'video/hevc', mkv: 'video/x-matroska',
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', webp: 'image/webp',
    };
    return map[ext] || 'application/octet-stream';
};

export const uploadVideoWithProgress = (signedUrl, file, mimeType, onProgress, xhrCallback) => {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', signedUrl);
        xhr.setRequestHeader('Content-Type', mimeType);
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
