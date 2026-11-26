/**
 * Smarter.Poker First-Party Email & Web Wire Image Proxy Engine
 *
 * Solves every root cause of broken, blocked, distorted, or missing images
 * across email clients (Gmail / Google Workspace / Apple Mail / Outlook) and
 * Smarter.Poker web surfaces (`/hub/wire`, `/hub/wire/[edition]`, `/hub/article`,
 * `/admin/newsletter`):
 *
 *   1. First-Party Origin Alignment & CSP Compliance:
 *      Every image URL is served from `https://smarter.poker/api/news/email-image`,
 *      satisfying `Content-Security-Policy: img-src 'self' https://*.smarter.poker`
 *      and sender-domain alignment in Workspace/corporate inboxes.
 *   2. HMAC-SHA256 URL Signing (Zero Referer Fragility, Zero Open-Proxy Abuse):
 *      Unlike `/api/proxy` (which returns 403 when `Referer: https://mail.google.com/`
 *      and rate-limits shared GoogleImageProxy IPs at 30/min), URLs minted by
 *      Smarter.Poker carry a 43-char HMAC-SHA256 signature (`s`) so any email client
 *      or browser can load them without Referer restrictions while unauthenticated
 *      open-proxy probing is rejected with 403.
 *   3. Universal Format & Aspect Normalization (`sharp` -> Progressive JPEG):
 *      Transcodes `.webp`, `.avif`, transparent `.png`, `.gif`, and multi-megabyte
 *      camera dumps into crisp, aspect-locked `224x156` (2x Retina for `112x78` /
 *      `104x72`) or `960x540` (`hero`) progressive `image/jpeg` payloads (<30 KB),
 *      eliminating Outlook `.webp` failures, Gmail proxy timeouts, and stripped
 *      `object-fit: cover` distortion.
 *   4. Guaranteed Visual Fallback (Zero Broken Image Icons):
 *      If an article lacks an upstream `image_url`, or an external publisher CDN
 *      404s, 403s, times out, returns HTML, or serves a 1x1 tracking pixel,
 *      renders a crisp vector-geometric Smarter.Poker Vanguard card (`HTTP 200`,
 *      `image/jpeg`) with zero system-font dependencies.
 */
import crypto from 'node:crypto';
import sharp from 'sharp';
import { assertFetchableUrl, fetchGuarded } from '../security/fetchableUrl.js';
import { SPOT_OF_THE_WEEK_CATALOG } from './weeklyWireCatalog.mjs';
import { buildSpotFeltSvg } from './spotCardSvg.mjs';

export const EMAIL_IMAGE_PATH = '/api/news/email-image';
export const DEFAULT_SITE_ORIGIN = 'https://smarter.poker';

const DIMENSIONS = {
    thumb: { width: 224, height: 156 },
    hero: { width: 960, height: 540 },
    crest: { width: 72, height: 72 },
};

const MAX_UPSTREAM_BYTES = 8 * 1024 * 1024; // 8 MB upstream read ceiling
const UPSTREAM_TIMEOUT_MS = 6500;
const SIG_LENGTH = 43; // base64url(32-byte HMAC-SHA256)

// Placeholder / tracking-pixel URL substrings that should never be treated as real art
const PLACEHOLDER_URL_RE =
    /(?:spacer\.gif|blank\.gif|pixel\.gif|1x1|transparent\.png|default[-_]?avatar|gravatar\.com\/avatar\/0{6,}|\/wp-includes\/images\/media\/default)/i;

// Pre-encoded minimal valid 1x1 dark-slate (#0b1118) PNG as an unbreakable last-resort
// byte buffer if native image rasterization ever encountered an unexpected runtime error.
const EMERGENCY_PNG_BUFFER = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGD4DwABBAEAW926VwAAAABJRU5ErkJggg==',
    'base64'
);

function isProductionRuntime() {
    return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

export function resolveEmailImageSecret(explicitSecret = '') {
    const configured = String(
        explicitSecret ||
            process.env.NEWSLETTER_IMAGE_SECRET ||
            process.env.NEWSLETTER_UNSUBSCRIBE_SECRET ||
            process.env.CRON_SECRET ||
            process.env.SUPABASE_SERVICE_ROLE_KEY ||
            ''
    ).trim();
    if (configured) return configured;
    if (isProductionRuntime()) return '';
    // Deterministic dev/test-only fallback when running isolated unit tests without .env
    return 'sp-dev-test-email-image-hmac-secret-v1';
}

function toBase64Url(bufOrStr) {
    const buf = Buffer.isBuffer(bufOrStr) ? bufOrStr : Buffer.from(String(bufOrStr), 'utf8');
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded) {
    const normalized = String(encoded || '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(normalized + pad, 'base64').toString('utf8');
}

/**
 * Clean and validate a candidate remote/local image URL, rejecting javascript:/data:,
 * malformed strings, and known tracking-pixel/placeholder filenames.
 */
export function normalizeCandidateImageUrl(rawUrl, { siteUrl = DEFAULT_SITE_ORIGIN } = {}) {
    if (typeof rawUrl !== 'string') return '';
    let trimmed = rawUrl.trim().replace(/&amp;/gi, '&');
    if (!trimmed) return '';
    if (/^(?:data:|javascript:|blob:|mailto:|about:)/i.test(trimmed)) return '';
    if (PLACEHOLDER_URL_RE.test(trimmed)) return '';

    const cleanSite = String(siteUrl || DEFAULT_SITE_ORIGIN).replace(/\/+$/, '');
    if (trimmed.startsWith('//')) {
        trimmed = `https:${trimmed}`;
    } else if (trimmed.startsWith('/')) {
        // Avoid double-wrapping our own email-image proxy URL
        if (trimmed.startsWith(EMAIL_IMAGE_PATH)) return `${cleanSite}${trimmed}`;
        trimmed = `${cleanSite}${trimmed}`;
    }

    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
        if (!parsed.hostname || !parsed.hostname.includes('.')) return '';
        // If already a signed smarter.poker email-image URL, return as-is
        if (
            (parsed.hostname === 'smarter.poker' || parsed.hostname.endsWith('.smarter.poker')) &&
            parsed.pathname === EMAIL_IMAGE_PATH
        ) {
            return parsed.toString();
        }
        return parsed.toString();
    } catch {
        return '';
    }
}

export function normalizeImageMode(mode) {
    if (mode === 'hero') return 'hero';
    if (mode === 'crest') return 'crest';
    return 'thumb';
}

export function computeEmailImageSignature(encodedUrl, mode = 'thumb', { secret = '' } = {}) {
    const key = resolveEmailImageSecret(secret);
    if (!key || !encodedUrl) return '';
    const cleanMode = normalizeImageMode(mode);
    return toBase64Url(
        crypto.createHmac('sha256', key).update(`sp-img:v1:${cleanMode}:${encodedUrl}`).digest()
    );
}

export function verifyEmailImageSignature(encodedUrl, signature, mode = 'thumb', { secret = '' } = {}) {
    if (typeof encodedUrl !== 'string' || !encodedUrl || encodedUrl.length > 4096) return null;
    if (typeof signature !== 'string' || signature.length !== SIG_LENGTH) return null;

    const expected = computeEmailImageSignature(encodedUrl, mode, { secret });
    if (!expected || expected.length !== SIG_LENGTH) return null;

    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return null;
    }

    try {
        const decoded = fromBase64Url(encodedUrl).trim();
        const parsed = new URL(decoded);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
        return parsed.toString();
    } catch {
        return null;
    }
}

/**
 * Build a guaranteed-200 first-party Smarter.Poker image URL for emails and web views.
 * Always returns an `https://smarter.poker/api/news/email-image?...` (or relative path
 * when `relative: true`) URL - falling back to `?fallback=1` when `rawUrl` is absent
 * or un-signable.
 */
export function buildSignedEmailImageUrl(
    rawUrl,
    { siteUrl = DEFAULT_SITE_ORIGIN, mode = 'thumb', relative = false, secret = '' } = {}
) {
    const cleanSite = relative ? '' : String(siteUrl || DEFAULT_SITE_ORIGIN).replace(/\/+$/, '');
    const cleanMode = normalizeImageMode(mode);

    if (cleanMode === 'crest') {
        return `${cleanSite}${EMAIL_IMAGE_PATH}?brand=crest`;
    }

    const normalized = normalizeCandidateImageUrl(rawUrl, {
        siteUrl: String(siteUrl || DEFAULT_SITE_ORIGIN).replace(/\/+$/, ''),
    });

    if (!normalized) {
        return `${cleanSite}${EMAIL_IMAGE_PATH}?fallback=1&m=${cleanMode}`;
    }

    // Preserve already-built email-image URLs without double-wrapping
    try {
        const existing = new URL(normalized);
        if (existing.pathname === EMAIL_IMAGE_PATH) {
            return relative ? `${existing.pathname}${existing.search}` : existing.toString();
        }
    } catch {
        /* continue */
    }

    const encoded = toBase64Url(normalized);
    const sig = computeEmailImageSignature(encoded, cleanMode, { secret });
    if (!sig) {
        return `${cleanSite}${EMAIL_IMAGE_PATH}?fallback=1&m=${cleanMode}`;
    }

    return `${cleanSite}${EMAIL_IMAGE_PATH}?m=${cleanMode}&u=${encodeURIComponent(encoded)}&s=${encodeURIComponent(sig)}`;
}

export function buildMastheadCrestUrl({ siteUrl = DEFAULT_SITE_ORIGIN, relative = false } = {}) {
    const cleanSite = relative ? '' : String(siteUrl || DEFAULT_SITE_ORIGIN).replace(/\/+$/, '');
    return `${cleanSite}${EMAIL_IMAGE_PATH}?brand=crest`;
}

/**
 * Pure vector SVG (zero `<text>` elements, so zero fontconfig/librsvg font dependency
 * on headless Linux serverless containers) for Smarter.Poker Vanguard fallback cards
 * and the Weekly Wire masthead emblem.
 */
function buildVanguardFallbackSvg(width, height) {
    const cx = Math.round(width / 2);
    const cy = Math.round(height / 2);
    const scale = Math.min(width / 224, height / 156);
    const rOuter = Math.round(34 * scale);
    const rInner = Math.round(25 * scale);
    const diamondHalf = Math.round(13 * scale);
    const barW = Math.round(56 * scale);
    const barH = Math.max(3, Math.round(4 * scale));

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1520"/>
      <stop offset="55%" stop-color="#0f1e2e"/>
      <stop offset="100%" stop-color="#081018"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#4fc1b3"/>
      <stop offset="100%" stop-color="#60a5fa"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${width}" height="${Math.max(3, Math.round(4 * scale))}" fill="url(#accent)"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${Math.round(8 * scale)}" fill="none" stroke="#1e3448" stroke-width="2"/>
  <circle cx="${cx}" cy="${cy - Math.round(6 * scale)}" r="${rOuter}" fill="#0d2230" stroke="#4fc1b3" stroke-width="${Math.max(2, Math.round(2.2 * scale))}"/>
  <circle cx="${cx}" cy="${cy - Math.round(6 * scale)}" r="${rInner}" fill="none" stroke="#60a5fa" stroke-width="${Math.max(1, Math.round(1.4 * scale))}" stroke-dasharray="${Math.max(3, Math.round(4 * scale))} ${Math.max(2, Math.round(3 * scale))}"/>
  <polygon points="${cx},${cy - Math.round(6 * scale) - diamondHalf} ${cx + diamondHalf},${cy - Math.round(6 * scale)} ${cx},${cy - Math.round(6 * scale) + diamondHalf} ${cx - diamondHalf},${cy - Math.round(6 * scale)}" fill="#4fc1b3"/>
  <polygon points="${cx},${cy - Math.round(6 * scale) - Math.round(diamondHalf * 0.52)} ${cx + Math.round(diamondHalf * 0.52)},${cy - Math.round(6 * scale)} ${cx},${cy - Math.round(6 * scale) + Math.round(diamondHalf * 0.52)} ${cx - Math.round(diamondHalf * 0.52)},${cy - Math.round(6 * scale)}" fill="#ffffff"/>
  <rect x="${cx - barW}" y="${cy + rOuter + Math.round(6 * scale)}" width="${barW * 2}" height="${barH}" rx="${Math.round(barH / 2)}" fill="url(#accent)" opacity="0.85"/>
</svg>`;
}

function buildMastheadCrestSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
  <defs>
    <linearGradient id="cbg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d2230"/>
      <stop offset="100%" stop-color="#09131d"/>
    </linearGradient>
    <linearGradient id="cacc" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4fc1b3"/>
      <stop offset="100%" stop-color="#60a5fa"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="68" height="68" rx="16" fill="url(#cbg)" stroke="url(#cacc)" stroke-width="3"/>
  <circle cx="36" cy="36" r="22" fill="none" stroke="#1f3a52" stroke-width="2"/>
  <polygon points="36,16 52,36 36,56 20,36" fill="url(#cacc)"/>
  <polygon points="36,25 45,36 36,47 27,36" fill="#09131d"/>
  <circle cx="36" cy="36" r="4.5" fill="#ffffff"/>
</svg>`;
}

let _cachedFallbackThumb = null;
let _cachedFallbackHero = null;
let _cachedCrestPng = null;

export async function renderVanguardFallbackImage(mode = 'thumb') {
    const cleanMode = normalizeImageMode(mode);
    try {
        if (cleanMode === 'crest') {
            if (!_cachedCrestPng) {
                _cachedCrestPng = await sharp(Buffer.from(buildMastheadCrestSvg()))
                    .png({ compressionLevel: 9 })
                    .toBuffer();
            }
            return { buffer: _cachedCrestPng, contentType: 'image/png', status: 'crest' };
        }
        if (cleanMode === 'hero') {
            if (!_cachedFallbackHero) {
                const { width, height } = DIMENSIONS.hero;
                _cachedFallbackHero = await sharp(Buffer.from(buildVanguardFallbackSvg(width, height)))
                    .jpeg({ quality: 88, progressive: true })
                    .toBuffer();
            }
            return { buffer: _cachedFallbackHero, contentType: 'image/jpeg', status: 'fallback' };
        }
        if (!_cachedFallbackThumb) {
            const { width, height } = DIMENSIONS.thumb;
            _cachedFallbackThumb = await sharp(Buffer.from(buildVanguardFallbackSvg(width, height)))
                .jpeg({ quality: 88, progressive: true })
                .toBuffer();
        }
        return { buffer: _cachedFallbackThumb, contentType: 'image/jpeg', status: 'fallback' };
    } catch {
        return { buffer: EMERGENCY_PNG_BUFFER, contentType: 'image/png', status: 'emergency_fallback' };
    }
}

async function readBoundedBuffer(response, maxBytes = MAX_UPSTREAM_BYTES) {
    const contentLen = Number(response.headers?.get?.('content-length') || 0);
    if (contentLen > maxBytes) {
        throw new Error(`Upstream image exceeds ${maxBytes} bytes`);
    }
    const arr = await response.arrayBuffer();
    const buf = Buffer.from(arr);
    if (buf.byteLength === 0 || buf.byteLength > maxBytes) {
        throw new Error(`Invalid upstream byte length: ${buf.byteLength}`);
    }
    return buf;
}

/**
 * Fetch an already-verified upstream URL, validate it is a real non-pixel image,
 * and transcode/crop it to exact Retina `image/jpeg` dimensions. On ANY upstream
 * or decode failure, seamlessly returns the Smarter.Poker Vanguard fallback card.
 */
export async function fetchAndNormalizeEmailImage(
    targetUrl,
    {
        mode = 'thumb',
        fetchGuardedFn = fetchGuarded,
        assertFetchableFn = assertFetchableUrl,
        timeoutMs = UPSTREAM_TIMEOUT_MS,
    } = {}
) {
    const cleanMode = normalizeImageMode(mode);
    const dims = DIMENSIONS[cleanMode] || DIMENSIONS.thumb;

    let parsed;
    try {
        parsed = new URL(String(targetUrl || '').trim());
    } catch {
        return renderVanguardFallbackImage(cleanMode);
    }

    const allowed = await assertFetchableFn(parsed);
    if (!allowed) {
        const blockedErr = new Error('BLOCKED_HOST');
        blockedErr.code = 'BLOCKED_HOST';
        throw blockedErr;
    }

    let timer = null;
    try {
        const controller = new AbortController();
        timer = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetchGuardedFn(parsed.toString(), {
            signal: controller.signal,
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });

        if (!response || !response.ok) {
            return renderVanguardFallbackImage(cleanMode);
        }

        const upstreamCt = String(response.headers?.get?.('content-type') || '').toLowerCase();
        if (upstreamCt.includes('text/html') || upstreamCt.includes('application/json')) {
            return renderVanguardFallbackImage(cleanMode);
        }

        const rawBuffer = await readBoundedBuffer(response, MAX_UPSTREAM_BYTES);
        const pipeline = sharp(rawBuffer, { failOn: 'none', animated: false });
        const metadata = await pipeline.metadata();

        if (!metadata?.width || !metadata?.height || metadata.width < 32 || metadata.height < 32) {
            return renderVanguardFallbackImage(cleanMode);
        }

        const jpegBuffer = await pipeline
            .rotate()
            .resize(dims.width, dims.height, {
                fit: 'cover',
                position: 'attention',
            })
            .flatten({ background: '#0b1118' })
            .jpeg({ quality: 85, progressive: true, mozjpeg: true })
            .toBuffer();

        if (!jpegBuffer || jpegBuffer.byteLength < 100) {
            return renderVanguardFallbackImage(cleanMode);
        }

        return {
            buffer: jpegBuffer,
            contentType: 'image/jpeg',
            status: 'ok',
        };
    } catch (err) {
        if (err?.code === 'BLOCKED_HOST') throw err;
        return renderVanguardFallbackImage(cleanMode);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

// ---------------------------------------------------------------------------
// Spot Of The Week poker-felt card graphic (`?spot=<slug>&s=<sig>`)
// ---------------------------------------------------------------------------

export const SPOT_IMAGE_DIMENSIONS = { width: 600, height: 240 };

function cleanSpotSlug(spotSlug) {
    return typeof spotSlug === 'string' ? spotSlug.trim() : '';
}

export function computeSpotCardImageSignature(spotSlug, { secret = '' } = {}) {
    const key = resolveEmailImageSecret(secret);
    const cleanSlug = cleanSpotSlug(spotSlug);
    if (!key || !cleanSlug) return '';
    return toBase64Url(crypto.createHmac('sha256', key).update('sp-spot:v1:' + cleanSlug).digest());
}

/** Returns the matching catalog spot when the signature is valid, otherwise `null`. */
export function verifySpotCardImageSignature(spotSlug, signature, { secret = '' } = {}) {
    const cleanSlug = cleanSpotSlug(spotSlug);
    if (!cleanSlug || cleanSlug.length > 200) return null;
    if (typeof signature !== 'string' || signature.length !== SIG_LENGTH) return null;

    const expected = computeSpotCardImageSignature(cleanSlug, { secret });
    if (!expected || expected.length !== SIG_LENGTH) return null;

    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;

    return SPOT_OF_THE_WEEK_CATALOG.find((s) => s.slug === cleanSlug) || null;
}

export function buildSpotCardImageUrl(
    spotSlug,
    { siteUrl = DEFAULT_SITE_ORIGIN, relative = false, secret = '' } = {}
) {
    const cleanSite = relative ? '' : String(siteUrl || DEFAULT_SITE_ORIGIN).replace(/\/+$/, '');
    const cleanSlug = cleanSpotSlug(spotSlug);
    const known = SPOT_OF_THE_WEEK_CATALOG.some((s) => s.slug === cleanSlug);
    const sig = known ? computeSpotCardImageSignature(cleanSlug, { secret }) : '';
    if (!known || !sig) {
        return `${cleanSite}${EMAIL_IMAGE_PATH}?fallback=1&m=hero`;
    }
    return `${cleanSite}${EMAIL_IMAGE_PATH}?spot=${encodeURIComponent(cleanSlug)}&s=${encodeURIComponent(sig)}`;
}

/** Rasterize the pure-vector poker-felt SVG into a progressive 600x240 JPEG. */
export async function renderSpotCardImage(spot) {
    try {
        const { width, height } = SPOT_IMAGE_DIMENSIONS;
        const buffer = await sharp(Buffer.from(buildSpotFeltSvg(spot, { width, height })))
            .resize(width, height)
            .flatten({ background: '#060d14' })
            .jpeg({ quality: 88, progressive: true, chromaSubsampling: '4:4:4' })
            .toBuffer();
        return { buffer, contentType: 'image/jpeg', status: 'spot' };
    } catch {
        return { buffer: EMERGENCY_PNG_BUFFER, contentType: 'image/png', status: 'emergency_fallback' };
    }
}
