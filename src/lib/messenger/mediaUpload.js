/*
 * MESSENGER MEDIA UPLOAD ENGINE (2026-11-25)
 *
 * Client-side preparation and upload for Messenger photos, videos, and voice notes:
 *   1. Resolves MIME/kind with iOS Photo Library extension fallback via messageMedia.mjs.
 *   2. Converts iPhone HEIC/HEIF photos to EXIF-oriented JPEG when the browser can
 *      decode them (iOS/macOS Safari) so every Chrome/Firefox/Android recipient sees
 *      the photo inline instead of a broken image icon.
 *   3. Extracts natural width & height for images and videos so MessageBubble can
 *      reserve the exact aspect-ratio and avoid cumulative layout shift (CLS).
 *   4. Uploads videos via resumable TUS (tus-js-client, 6 MB chunks, retryDelays)
 *      when upload-url returns tusEndpoint + valid JWT + anon key, following the
 *      header rules in src/lib/backgroundVideoUpload.js (constructor headers only,
 *      no onBeforeRequest setHeader append bug, no stale resume fingerprints).
 *   5. Uploads images, audio, and fallback videos via XMLHttpRequest PUT with real
 *      0..100% progress callbacks and AbortSignal cancellation.
 */
import * as tus from 'tus-js-client';
import { resolveUploadMedia } from './messageMedia.mjs';

const HEIC_MIME_RE = /^image\/hei[cf]$/i;
const HEIC_EXT_RE = /\.hei[cf]$/i;
const MAX_CONVERT_DIM = 3000;
const TUS_CHUNK_BYTES = 6 * 1024 * 1024;
const DIMENSION_TIMEOUT_MS = 4000;

export function isHeicFile(file, mimeType = '') {
    const resolvedMime = String(mimeType || file?.type || '').split(';')[0].trim().toLowerCase();
    return HEIC_MIME_RE.test(resolvedMime) || HEIC_EXT_RE.test(String(file?.name || ''));
}

function isJwtShape(token) {
    return typeof token === 'string' && token.split('.').length === 3 && token.length > 40;
}

function readImageDimensionsViaElement(blob) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        const timer = setTimeout(() => {
            URL.revokeObjectURL(url);
            reject(new Error('Image Decode Timed Out'));
        }, DIMENSION_TIMEOUT_MS);
        img.onload = () => {
            clearTimeout(timer);
            URL.revokeObjectURL(url);
            resolve({ img, width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
        };
        img.onerror = () => {
            clearTimeout(timer);
            URL.revokeObjectURL(url);
            reject(new Error('Image Decode Failed'));
        };
        img.src = url;
    });
}

function readVideoDimensions(file) {
    if (typeof document === 'undefined' || typeof URL === 'undefined') return Promise.resolve(null);
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        let settled = false;
        const done = (dims) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            video.onloadedmetadata = null;
            video.onerror = null;
            video.removeAttribute('src');
            try { video.load(); } catch { /* ignore */ }
            URL.revokeObjectURL(url);
            resolve(dims);
        };
        const timer = setTimeout(() => done(null), DIMENSION_TIMEOUT_MS);
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        video.onloadedmetadata = () => {
            const width = Math.round(video.videoWidth || 0);
            const height = Math.round(video.videoHeight || 0);
            done(width > 0 && height > 0 ? { width, height } : null);
        };
        video.onerror = () => done(null);
        video.src = url;
    });
}

async function renderSourceToJpegFile(source, rawWidth, rawHeight, originalName) {
    const longest = Math.max(rawWidth, rawHeight);
    const scale = longest > MAX_CONVERT_DIM ? MAX_CONVERT_DIM / longest : 1;
    const width = Math.max(1, Math.round(rawWidth * scale));
    const height = Math.max(1, Math.round(rawHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas Unavailable');
    ctx.drawImage(source, 0, 0, width, height);
    const jpegBlob = await new Promise((resolve, reject) => {
        canvas.toBlob(
            blob => (blob ? resolve(blob) : reject(new Error('JPEG Conversion Failed'))),
            'image/jpeg',
            0.9,
        );
    });
    canvas.width = 0;
    canvas.height = 0;
    const baseName = String(originalName || `photo_${Date.now()}`).replace(/\.[^.]+$/, '');
    const convertedFile = typeof File === 'function'
        ? new File([jpegBlob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
        : jpegBlob;
    return { file: convertedFile, fileName: `${baseName}.jpg`, mimeType: 'image/jpeg', width, height };
}

/**
 * Prepare a selected/pasted/dropped image or video file for upload:
 * - Resolves kind/mimeType (including iOS extension fallback).
 * - Converts HEIC/HEIF -> JPEG when the browser can decode it.
 * - Captures exact width & height metadata for CLS-free rendering.
 */
export async function prepareMessengerUploadFile(rawFile) {
    const resolved = resolveUploadMedia(rawFile);
    if (!resolved) return null;
    const isVideo = resolved.kind === 'video';
    const fallbackName = rawFile.name || `media_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`;

    if (isVideo) {
        const dims = await readVideoDimensions(rawFile);
        return {
            file: rawFile,
            kind: 'video',
            mimeType: resolved.mimeType,
            fileName: fallbackName,
            width: dims?.width || null,
            height: dims?.height || null,
            convertedFromHeic: false,
            heicUnsupportedInBrowser: false,
        };
    }

    const heic = isHeicFile(rawFile, resolved.mimeType);
    let width = null;
    let height = null;

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        if (typeof createImageBitmap === 'function') {
            let bitmap = null;
            try {
                bitmap = await createImageBitmap(rawFile, { imageOrientation: 'from-image' });
            } catch {
                try { bitmap = await createImageBitmap(rawFile); } catch { bitmap = null; }
            }
            if (bitmap) {
                try {
                    width = bitmap.width || null;
                    height = bitmap.height || null;
                    if (heic && width > 0 && height > 0) {
                        const converted = await renderSourceToJpegFile(bitmap, width, height, fallbackName);
                        return {
                            ...converted,
                            kind: 'image',
                            convertedFromHeic: true,
                            heicUnsupportedInBrowser: false,
                        };
                    }
                } catch {
                    /* fall through to original file */
                } finally {
                    if (typeof bitmap.close === 'function') bitmap.close();
                }
            }
        }

        if (!width || !height || heic) {
            try {
                const decoded = await readImageDimensionsViaElement(rawFile);
                width = decoded.width || width;
                height = decoded.height || height;
                if (heic && width > 0 && height > 0) {
                    const converted = await renderSourceToJpegFile(decoded.img, width, height, fallbackName);
                    return {
                        ...converted,
                        kind: 'image',
                        convertedFromHeic: true,
                        heicUnsupportedInBrowser: false,
                    };
                }
            } catch {
                if (heic) {
                    return {
                        file: rawFile,
                        kind: 'image',
                        mimeType: resolved.mimeType,
                        fileName: fallbackName,
                        width: null,
                        height: null,
                        convertedFromHeic: false,
                        heicUnsupportedInBrowser: true,
                    };
                }
            }
        }
    }

    return {
        file: rawFile,
        kind: 'image',
        mimeType: resolved.mimeType,
        fileName: fallbackName,
        width: width > 0 ? Math.round(width) : null,
        height: height > 0 ? Math.round(height) : null,
        convertedFromHeic: false,
        heicUnsupportedInBrowser: false,
    };
}

function createAbortError() {
    const err = new Error('Upload Cancelled');
    err.name = 'AbortError';
    return err;
}

function uploadViaXhr(file, signedUrl, mimeType, { onProgress, signal, timeoutMs = 5 * 60 * 1000 } = {}) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(createAbortError());
            return;
        }
        const xhr = new XMLHttpRequest();
        let settled = false;
        const finish = (fn, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', handleAbort);
            fn(value);
        };
        const handleAbort = () => {
            try { xhr.abort(); } catch { /* ignore */ }
            finish(reject, createAbortError());
        };
        const timer = setTimeout(() => {
            try { xhr.abort(); } catch { /* ignore */ }
            finish(reject, new Error('Upload Timed Out'));
        }, timeoutMs);
        signal?.addEventListener('abort', handleAbort, { once: true });

        xhr.open('PUT', signedUrl, true);
        xhr.setRequestHeader('Content-Type', mimeType);
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && event.total > 0) {
                const pct = Math.max(0, Math.min(99, Math.round((event.loaded / event.total) * 100)));
                onProgress?.(pct);
            }
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                onProgress?.(100);
                finish(resolve, null);
            } else {
                finish(reject, new Error('Upload Did Not Complete'));
            }
        };
        xhr.onerror = () => finish(reject, new Error('Upload Did Not Complete'));
        xhr.onabort = () => finish(reject, createAbortError());
        xhr.send(file);
    });
}

function uploadViaTus(file, uploadMeta, mimeType, accessToken, { onProgress, signal, timeoutMs = 10 * 60 * 1000 } = {}) {
    const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
    if (!uploadMeta?.tusEndpoint || !uploadMeta?.bucket || !uploadMeta?.path || !isJwtShape(accessToken) || anonKey.length < 20) {
        return null;
    }

    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(createAbortError());
            return;
        }
        let settled = false;
        let maxPct = 0;
        const cleanMime = String(mimeType || '').split(';')[0].trim() || 'video/mp4';
        const headers = {
            Authorization: `Bearer ${accessToken}`,
            apikey: anonKey,
            'x-upsert': 'true',
        };
        if (uploadMeta.token) headers['x-signature'] = uploadMeta.token;

        const finish = (fn, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', handleAbort);
            fn(value);
        };

        const upload = new tus.Upload(file, {
            endpoint: uploadMeta.tusEndpoint,
            chunkSize: TUS_CHUNK_BYTES,
            retryDelays: [0, 2000, 5000, 10000],
            removeFingerprintOnSuccess: true,
            metadata: {
                bucketName: uploadMeta.bucket,
                objectName: uploadMeta.path,
                contentType: cleanMime,
                cacheControl: '3600',
            },
            headers,
            onProgress: (bytesUploaded, bytesTotal) => {
                if (bytesTotal > 0) {
                    const pct = Math.max(maxPct, Math.min(99, Math.round((bytesUploaded / bytesTotal) * 100)));
                    maxPct = pct;
                    onProgress?.(pct);
                }
            },
            onSuccess: () => {
                onProgress?.(100);
                finish(resolve, null);
            },
            onError: (err) => {
                const msg = String(err?.message || err || '');
                if (/abort|cancel/i.test(msg)) finish(reject, createAbortError());
                else finish(reject, new Error('Upload Did Not Complete'));
            },
        });

        const handleAbort = () => {
            try { upload.abort(); } catch { /* ignore */ }
            finish(reject, createAbortError());
        };
        const timer = setTimeout(() => {
            try { upload.abort(); } catch { /* ignore */ }
            finish(reject, new Error('Upload Timed Out'));
        }, timeoutMs);
        signal?.addEventListener('abort', handleAbort, { once: true });
        upload.start();
    });
}

/**
 * Upload a prepared media file to Supabase Storage with live progress and cancel.
 * Videos prefer resumable TUS (6 MB chunks, auto-retry); images, voice notes, and
 * environments without TUS metadata fall back to XHR PUT with upload progress.
 */
export async function uploadFileWithProgress(file, uploadMeta, {
    kind = 'image',
    mimeType,
    accessToken,
    onProgress,
    signal,
    timeoutMs,
} = {}) {
    if (kind === 'video') {
        const tusPromise = uploadViaTus(file, uploadMeta, mimeType, accessToken, {
            onProgress,
            signal,
            timeoutMs: timeoutMs || 10 * 60 * 1000,
        });
        if (tusPromise) return tusPromise;
    }
    if (!uploadMeta?.signedUrl) throw new Error('Upload Could Not Be Started');
    return uploadViaXhr(file, uploadMeta.signedUrl, mimeType, {
        onProgress,
        signal,
        timeoutMs: timeoutMs || 5 * 60 * 1000,
    });
}
