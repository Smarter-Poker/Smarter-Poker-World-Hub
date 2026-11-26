/**
 * Smarter.Poker Magazine First-Party Image Vault & 300-DPI Print Master Pipeline
 *
 * Fetches candidate editorial photography through SSRF-hardened manual redirect
 * validation (`assertFetchableUrl`, <= 3 hops, 7000ms timeout, 8MB max bytes),
 * rejects tracking pixels, SVGs, or low-resolution thumbnails (`< 360x220`), and
 * generates both:
 *   - 300-DPI commercial print master JPEG (`<= 2400px` max edge, quality 90, density 300)
 *   - Progressive web flipbook JPEG (`1200x800`, quality 84)
 * stored content-addressed inside Supabase Storage bucket `magazine-assets`.
 *
 * Falls back cleanly to a deterministic pure-vector (zero `<text>`/`<tspan>`)
 * Vanguard editorial plate or `/api/news/email-image?fallback=1&w=960&h=540`
 * if upstream decode or storage upload is unavailable.
 */
import crypto from 'node:crypto';
import sharp from 'sharp';
import { assertFetchableUrl } from '../security/fetchableUrl.js';
import {
    MAGAZINE_STORAGE_BUCKET,
    currentIssuePeriod,
    isValidIssuePeriod,
    stripMagazineDashes,
} from './magazineSchema.mjs';

export const IMAGE_VAULT_MAX_REDIRECTS = 3;
export const IMAGE_VAULT_TIMEOUT_MS = 7000;
export const IMAGE_VAULT_MAX_BYTES = 8 * 1024 * 1024;
export const IMAGE_VAULT_MIN_WIDTH = 360;
export const IMAGE_VAULT_MIN_HEIGHT = 220;
export const IMAGE_VAULT_PRINT_DPI = 300;
export const IMAGE_VAULT_LIMIT_INPUT_PIXELS = 36_000_000;
export const IMAGE_VAULT_FALLBACK_URL = '/api/news/email-image?fallback=1&w=960&h=540';

const ALLOWED_SHARP_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif', 'gif', 'heif']);

const PLACEHOLDER_IMAGE_RE =
    /(?:spacer\.gif|blank\.gif|pixel\.gif|1x1|transparent\.png|default[-_]?avatar|gravatar\.com\/avatar\/0{6,}|\/wp-includes\/images\/media\/default|\.svg(?:[?#]|$))/i;

async function getSupabaseClient(sb) {
    if (sb && typeof sb === 'object') return sb;
    try {
        const { createClient } = await import('../supabaseServerClient.js');
        return createClient();
    } catch {
        return null;
    }
}

function hashSeed(input) {
    return crypto.createHash('sha256').update(String(input || 'smarter-poker-magazine')).digest();
}

/**
 * Pure-vector Vanguard editorial plate SVG.
 * Strictly zero `<text>` or `<tspan>` tags so headless Linux serverless containers
 * render identical pixels without system fonts, and strictly Vanguard palette only.
 */
export function buildVanguardEditorialPlateSvg(width = 1200, height = 800, seedInput = 'vanguard') {
    const w = Math.max(360, Math.round(Number(width) || 1200));
    const h = Math.max(220, Math.round(Number(height) || 800));
    const digest = hashSeed(seedInput);
    const variant = digest[0] % 4;
    const cx = Math.round(w * (0.46 + ((digest[1] % 9) - 4) * 0.01));
    const cy = Math.round(h * (0.46 + ((digest[2] % 9) - 4) * 0.01));
    const unit = Math.min(w, h);
    const outerR = Math.round(unit * 0.24);
    const midR = Math.round(unit * 0.175);
    const diamondR = Math.round(unit * 0.095);
    const innerDiamondR = Math.round(diamondR * 0.48);
    const barWidth = Math.round(w * 0.34);
    const barHeight = Math.max(4, Math.round(unit * 0.008));
    const pad = Math.round(unit * 0.055);

    const gridLines = [];
    const step = Math.max(48, Math.round(unit * 0.1));
    for (let x = pad; x <= w - pad; x += step) {
        gridLines.push(
            `<line x1="${x}" y1="${pad}" x2="${x}" y2="${h - pad}" stroke="#60a5fa" stroke-opacity="0.07" stroke-width="1"/>`
        );
    }
    for (let y = pad; y <= h - pad; y += step) {
        gridLines.push(
            `<line x1="${pad}" y1="${y}" x2="${w - pad}" y2="${y}" stroke="#4fc1b3" stroke-opacity="0.07" stroke-width="1"/>`
        );
    }

    const accentBeams =
        variant % 2 === 0
            ? `<polygon points="0,${h} ${Math.round(w * 0.42)},0 ${Math.round(w * 0.56)},0 ${Math.round(w * 0.14)},${h}" fill="#4fc1b3" fill-opacity="0.06"/>` +
              `<polygon points="${Math.round(w * 0.54)},${h} ${w},${Math.round(h * 0.18)} ${w},${Math.round(h * 0.38)} ${Math.round(w * 0.72)},${h}" fill="#60a5fa" fill-opacity="0.07"/>`
            : `<polygon points="0,0 ${Math.round(w * 0.36)},0 0,${Math.round(h * 0.58)}" fill="#60a5fa" fill-opacity="0.07"/>` +
              `<polygon points="${w},${h} ${Math.round(w * 0.62)},${h} ${w},${Math.round(h * 0.42)}" fill="#4fc1b3" fill-opacity="0.07"/>`;

    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
        `<defs>`,
        `<linearGradient id="vp-bg" x1="0" y1="0" x2="1" y2="1">`,
        `<stop offset="0%" stop-color="#05070a"/>`,
        `<stop offset="52%" stop-color="#0b1520"/>`,
        `<stop offset="100%" stop-color="#05070a"/>`,
        `</linearGradient>`,
        `<linearGradient id="vp-acc" x1="0" y1="0" x2="1" y2="0">`,
        `<stop offset="0%" stop-color="#4fc1b3"/>`,
        `<stop offset="100%" stop-color="#60a5fa"/>`,
        `</linearGradient>`,
        `</defs>`,
        `<rect width="${w}" height="${h}" fill="url(#vp-bg)"/>`,
        accentBeams,
        gridLines.join(''),
        `<rect x="0" y="0" width="${w}" height="${Math.max(6, Math.round(h * 0.01))}" fill="url(#vp-acc)"/>`,
        `<rect x="${pad}" y="${pad}" width="${w - pad * 2}" height="${h - pad * 2}" rx="14" fill="none" stroke="#9fb3c8" stroke-opacity="0.22" stroke-width="2"/>`,
        `<circle cx="${cx}" cy="${cy}" r="${outerR}" fill="#0b1520" stroke="#4fc1b3" stroke-width="${Math.max(3, Math.round(unit * 0.005))}"/>`,
        `<circle cx="${cx}" cy="${cy}" r="${midR}" fill="none" stroke="#60a5fa" stroke-width="${Math.max(2, Math.round(unit * 0.003))}" stroke-dasharray="${Math.round(unit * 0.02)} ${Math.round(unit * 0.012)}"/>`,
        `<polygon points="${cx},${cy - diamondR} ${cx + Math.round(diamondR * 0.78)},${cy} ${cx},${cy + diamondR} ${cx - Math.round(diamondR * 0.78)},${cy}" fill="url(#vp-acc)"/>`,
        `<polygon points="${cx},${cy - innerDiamondR} ${cx + Math.round(innerDiamondR * 0.78)},${cy} ${cx},${cy + innerDiamondR} ${cx - Math.round(innerDiamondR * 0.78)},${cy}" fill="#05070a"/>`,
        `<circle cx="${cx}" cy="${cy}" r="${Math.max(4, Math.round(unit * 0.012))}" fill="#ffffff"/>`,
        `<rect x="${Math.round((w - barWidth) / 2)}" y="${Math.min(h - pad - barHeight * 3, cy + outerR + Math.round(unit * 0.06))}" width="${barWidth}" height="${barHeight}" rx="${Math.round(barHeight / 2)}" fill="url(#vp-acc)" opacity="0.9"/>`,
        `<rect x="${Math.round((w - barWidth * 0.56) / 2)}" y="${Math.min(h - pad - barHeight, cy + outerR + Math.round(unit * 0.088))}" width="${Math.round(barWidth * 0.56)}" height="${Math.max(3, Math.round(barHeight * 0.65))}" rx="2" fill="#9fb3c8" opacity="0.45"/>`,
        `</svg>`,
    ].join('');
}

function isDisallowedSvgOrXmlPayload(buf) {
    if (!buf || buf.byteLength === 0) return true;
    const head = buf.subarray(0, Math.min(512, buf.byteLength)).toString('utf8').trimStart();
    return /^(?:<\?xml\b|<!doctype\b|<svg\b|<html\b)/i.test(head) || /<svg[\s>]/i.test(head);
}

async function readBoundedImageBuffer(response, maxBytes = IMAGE_VAULT_MAX_BYTES) {
    const declaredLen = Number(response.headers?.get?.('content-length') || 0);
    if (declaredLen > maxBytes) {
        throw new Error(`Image exceeds ${maxBytes} bytes`);
    }

    if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        const chunks = [];
        let total = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = Buffer.from(value);
                total += chunk.byteLength;
                if (total > maxBytes) {
                    try {
                        await reader.cancel();
                    } catch {
                        /* ignore cancel failure */
                    }
                    throw new Error(`Image stream exceeded ${maxBytes} bytes`);
                }
                chunks.push(chunk);
            }
        } finally {
            try {
                reader.releaseLock?.();
            } catch {
                /* ignore */
            }
        }
        const combined = Buffer.concat(chunks);
        if (combined.byteLength === 0) throw new Error('Empty image body');
        return combined;
    }

    const arr = await response.arrayBuffer();
    const buf = Buffer.from(arr);
    if (buf.byteLength === 0 || buf.byteLength > maxBytes) {
        throw new Error(`Invalid image byte length: ${buf.byteLength}`);
    }
    return buf;
}

export function isAllowedUpstreamImageContentType(rawContentType) {
    const mime = String(rawContentType || '')
        .toLowerCase()
        .split(';')[0]
        .trim();
    if (!mime) return true;
    if (mime === 'image/svg+xml' || mime.includes('svg')) return false;
    if (mime === 'application/octet-stream' || mime === 'binary/octet-stream') return true;
    return mime.startsWith('image/');
}

/**
 * Fetches a remote image URL with manual SSRF-validated redirects (`<= 3` hops,
 * `7000ms` total timeout across headers AND body stream, `8MB` max payload).
 */
export async function fetchSafeMagazineImageBuffer(
    rawUrl,
    {
        fetchImpl = fetch,
        assertFetchableFn = assertFetchableUrl,
        maxRedirects = IMAGE_VAULT_MAX_REDIRECTS,
        timeoutMs = IMAGE_VAULT_TIMEOUT_MS,
        maxBytes = IMAGE_VAULT_MAX_BYTES,
    } = {}
) {
    const clean = String(rawUrl || '').trim().replace(/&amp;/gi, '&');
    if (!clean || PLACEHOLDER_IMAGE_RE.test(clean)) return null;
    if (/^(?:data:|javascript:|blob:|mailto:|about:)/i.test(clean)) return null;

    let currentUrl = clean.startsWith('//') ? `https:${clean}` : clean;
    const deadlineMs = Date.now() + Math.max(500, Number(timeoutMs) || IMAGE_VAULT_TIMEOUT_MS);

    for (let hop = 0; hop <= maxRedirects; hop += 1) {
        let parsed;
        try {
            parsed = new URL(currentUrl);
        } catch {
            return null;
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
        if (parsed.username || parsed.password) return null;

        const okHost = await assertFetchableFn(parsed);
        if (!okHost) {
            const blockedErr = new Error('SSRF_BLOCKED_HOST');
            blockedErr.code = 'SSRF_BLOCKED_HOST';
            throw blockedErr;
        }

        const remainingMs = deadlineMs - Date.now();
        if (remainingMs <= 50) return null;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.max(250, remainingMs));

        try {
            const response = await fetchImpl(parsed.toString(), {
                method: 'GET',
                redirect: 'manual',
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; SmarterPokerMagazine/1.0; +https://smarter.poker)',
                    Accept: 'image/avif,image/webp,image/apng,image/jpeg,image/png;q=0.9',
                },
            });

            if (!response) return null;

            if (response.status >= 300 && response.status <= 399) {
                const location = response.headers?.get?.('location');
                try {
                    await response.body?.cancel?.();
                } catch {
                    /* ignore */
                }
                if (!location || hop === maxRedirects) return null;
                try {
                    currentUrl = new URL(location, parsed.toString()).toString();
                } catch {
                    return null;
                }
                continue;
            }

            if (!response.ok) {
                try {
                    await response.body?.cancel?.();
                } catch {
                    /* ignore */
                }
                return null;
            }

            const contentType = String(response.headers?.get?.('content-type') || '');
            if (!isAllowedUpstreamImageContentType(contentType)) {
                try {
                    await response.body?.cancel?.();
                } catch {
                    /* ignore */
                }
                return null;
            }

            const buf = await readBoundedImageBuffer(response, maxBytes);
            if (isDisallowedSvgOrXmlPayload(buf)) {
                return null;
            }
            return buf;
        } finally {
            clearTimeout(timer);
        }
    }

    return null;
}

async function uploadToMagazineBucket(client, objectPath, buffer) {
    if (!client?.storage || typeof client.storage.from !== 'function') {
        return null;
    }
    try {
        const bucket = client.storage.from(MAGAZINE_STORAGE_BUCKET);
        if (!bucket || typeof bucket.upload !== 'function') return null;
        const { error } = await bucket.upload(objectPath, buffer, {
            contentType: 'image/jpeg',
            cacheControl: '31536000',
            upsert: true,
        });
        if (error) return null;
        if (typeof bucket.getPublicUrl === 'function') {
            const pub = bucket.getPublicUrl(objectPath);
            const publicUrl = pub?.data?.publicUrl || pub?.publicURL || '';
            if (publicUrl) return String(publicUrl);
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Vaults an editorial or cover image for Smarter.Poker Magazine.
 *
 * Returns `{ vaultedImageUrl, vaultedMasterUrl, storagePath, width, height, usedFallback }`.
 */
export async function vaultMagazineImage(
    sb,
    {
        sourceUrl = '',
        issuePeriod = '',
        hintKey = '',
        fallbackHeadline = '',
        fallbackTag = '',
        fetchImpl = fetch,
        assertFetchableFn = assertFetchableUrl,
        timeoutMs = IMAGE_VAULT_TIMEOUT_MS,
    } = {}
) {
    const client = await getSupabaseClient(sb);
    const period = isValidIssuePeriod(issuePeriod) ? String(issuePeriod).trim() : currentIssuePeriod();
    const seedLabel = stripMagazineDashes(
        hintKey || sourceUrl || fallbackHeadline || fallbackTag || `magazine-${period}`
    );

    let decodedBuffer = null;
    let sourceWidth = 0;
    let sourceHeight = 0;
    let usedFallback = false;

    if (sourceUrl && typeof sourceUrl === 'string' && sourceUrl.trim()) {
        try {
            const rawBuf = await fetchSafeMagazineImageBuffer(sourceUrl, {
                fetchImpl,
                assertFetchableFn,
                timeoutMs,
            });
            if (rawBuf && rawBuf.byteLength > 0 && !isDisallowedSvgOrXmlPayload(rawBuf)) {
                const probe = sharp(rawBuf, {
                    failOn: 'none',
                    animated: false,
                    limitInputPixels: 36_000_000,
                });
                const meta = await probe.metadata();
                const fmt = String(meta?.format || '').toLowerCase();
                const w = Number(meta?.width || 0);
                const h = Number(meta?.height || 0);
                if (
                    ALLOWED_SHARP_FORMATS.has(fmt) &&
                    w >= IMAGE_VAULT_MIN_WIDTH &&
                    h >= IMAGE_VAULT_MIN_HEIGHT
                ) {
                    decodedBuffer = rawBuf;
                    sourceWidth = w;
                    sourceHeight = h;
                }
            }
        } catch {
            decodedBuffer = null;
        }
    }

    let masterBuffer;
    let webBuffer;
    let finalWidth = 1200;
    let finalHeight = 800;
    let contentHashHex;

    if (decodedBuffer) {
        try {
            contentHashHex = crypto.createHash('sha256').update(decodedBuffer).digest('hex');
            const masterResult = await sharp(decodedBuffer, {
                failOn: 'none',
                animated: false,
                limitInputPixels: 36_000_000,
            })
                .rotate()
                .resize({
                    width: 2400,
                    height: 2400,
                    fit: 'inside',
                    withoutEnlargement: true,
                })
                .flatten({ background: '#05070a' })
                .withMetadata({ density: IMAGE_VAULT_PRINT_DPI })
                .jpeg({ quality: 90, progressive: true, mozjpeg: true })
                .toBuffer({ resolveWithObject: true });

            masterBuffer = masterResult.data;
            finalWidth = Number(masterResult.info?.width || sourceWidth || 1200);
            finalHeight = Number(masterResult.info?.height || sourceHeight || 800);

            webBuffer = await sharp(decodedBuffer, {
                failOn: 'none',
                animated: false,
                limitInputPixels: 36_000_000,
            })
                .rotate()
                .resize(1200, 800, {
                    fit: 'cover',
                    position: 'attention',
                })
                .flatten({ background: '#05070a' })
                .jpeg({ quality: 84, progressive: true, mozjpeg: true })
                .toBuffer();
        } catch {
            decodedBuffer = null;
        }
    }

    if (!decodedBuffer || !masterBuffer || !webBuffer) {
        usedFallback = true;
        contentHashHex = crypto
            .createHash('sha256')
            .update(`vanguard-plate:${period}:${seedLabel}`)
            .digest('hex');

        const webSvg = buildVanguardEditorialPlateSvg(1200, 800, `${seedLabel}:web`);
        const masterSvg = buildVanguardEditorialPlateSvg(1600, 2000, `${seedLabel}:master`);

        try {
            masterBuffer = await sharp(Buffer.from(masterSvg, 'utf8'), { limitInputPixels: 36_000_000 })
                .flatten({ background: '#05070a' })
                .withMetadata({ density: IMAGE_VAULT_PRINT_DPI })
                .jpeg({ quality: 90, progressive: true, mozjpeg: true })
                .toBuffer();

            webBuffer = await sharp(Buffer.from(webSvg, 'utf8'), { limitInputPixels: 36_000_000 })
                .flatten({ background: '#05070a' })
                .jpeg({ quality: 84, progressive: true, mozjpeg: true })
                .toBuffer();

            finalWidth = 1600;
            finalHeight = 2000;
        } catch {
            return {
                vaultedImageUrl: IMAGE_VAULT_FALLBACK_URL,
                vaultedMasterUrl: IMAGE_VAULT_FALLBACK_URL,
                storagePath: null,
                width: 960,
                height: 540,
                usedFallback: true,
            };
        }
    }

    const hashPrefix = contentHashHex.slice(0, 24);
    const masterPath = `${period}/${hashPrefix}-master.jpg`;
    const webPath = `${period}/${hashPrefix}-web.jpg`;

    const [uploadedMasterUrl, uploadedWebUrl] = await Promise.all([
        uploadToMagazineBucket(client, masterPath, masterBuffer),
        uploadToMagazineBucket(client, webPath, webBuffer),
    ]);

    if (!uploadedWebUrl || !uploadedMasterUrl) {
        return {
            vaultedImageUrl: uploadedWebUrl || IMAGE_VAULT_FALLBACK_URL,
            vaultedMasterUrl: uploadedMasterUrl || uploadedWebUrl || IMAGE_VAULT_FALLBACK_URL,
            storagePath: uploadedMasterUrl ? masterPath : uploadedWebUrl ? webPath : null,
            width: finalWidth,
            height: finalHeight,
            usedFallback: true,
        };
    }

    return {
        vaultedImageUrl: uploadedWebUrl,
        vaultedMasterUrl: uploadedMasterUrl,
        storagePath: masterPath,
        width: finalWidth,
        height: finalHeight,
        usedFallback,
    };
}
