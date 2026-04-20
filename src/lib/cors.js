/**
 * cors.js — origin-scoped CORS helper for Smarter.Poker API routes
 * ═════════════════════════════════════════════════════════════════════════
 * Phase 6.1.13 — CORS wildcard lockdown
 *
 * Why: before this module, 21 API routes (including /api/poker/engine/*
 * which returns private hole cards + accepts betting actions) echoed
 * `Access-Control-Allow-Origin: *`. That makes every such endpoint
 * invokable from any origin the user happens to visit — including ad
 * frames — so a malicious page could issue authenticated requests and
 * read private state on behalf of a logged-in user. With an explicit
 * allowlist the browser blocks the cross-origin response entirely.
 *
 * Usage:
 *   const { applyCors } = require('../../../src/lib/cors');
 *   export default async function handler(req, res) {
 *     if (!applyCors(req, res, { methods: 'GET, OPTIONS' })) return;
 *     ... normal handler logic ...
 *   }
 *
 * applyCors returns FALSE when the request was an OPTIONS preflight (in
 * which case it's already written the response and the caller should
 * simply return). It returns TRUE for real requests.
 *
 * Allow list comes from env (`CORS_ALLOWED_ORIGINS`, comma-separated) with
 * safe defaults baked in. Localhost dev origins are always allowed so
 * `npm run dev` doesn't need env tweaks.
 */

const DEFAULT_ORIGINS = [
    'https://smarter.poker',
    'https://www.smarter.poker',
    'https://club.smarter.poker',
    'https://app.smarter.poker',
];

const DEV_ORIGIN_PATTERNS = [
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
];

// Allow Vercel preview URLs (matches *.vercel.app for our team). Cheap
// fallback for WIP branches; tighten if we ever stop using Vercel previews.
const VERCEL_PREVIEW_PATTERN =
    /^https:\/\/[a-z0-9-]+-smarter-poker\.vercel\.app$/;

function parseEnvList(value) {
    if (!value) return [];
    return String(value)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}

function getAllowedOrigins() {
    const fromEnv = parseEnvList(process.env.CORS_ALLOWED_ORIGINS);
    return new Set([...DEFAULT_ORIGINS, ...fromEnv]);
}

function isOriginAllowed(origin) {
    if (!origin) return false;
    if (getAllowedOrigins().has(origin)) return true;
    if (DEV_ORIGIN_PATTERNS.some(re => re.test(origin))) return true;
    if (VERCEL_PREVIEW_PATTERN.test(origin)) return true;
    return false;
}

/**
 * Apply origin-scoped CORS headers and handle the OPTIONS preflight.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {object} [opts]
 * @param {string} [opts.methods] - Methods string for Allow-Methods header.
 * @param {string} [opts.headers] - Headers string for Allow-Headers header.
 * @param {boolean} [opts.credentials=true] - Mirror Allow-Credentials: true.
 * @returns {boolean} true to continue handling, false if preflight handled.
 */
function applyCors(req, res, opts = {}) {
    const methods = opts.methods || 'GET, POST, OPTIONS';
    const headers =
        opts.headers ||
        'Content-Type, Authorization, x-user-id, x-admin-secret, x-request-id, x-idempotency-key';
    const credentials = opts.credentials !== false;

    const origin = req.headers?.origin || '';

    if (isOriginAllowed(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        if (credentials) {
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
    }
    // If origin is not allowed, we deliberately DO NOT set
    // Access-Control-Allow-Origin. The browser will block the response.
    // Same-origin requests (no Origin header) still work normally.

    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', headers);

    if (req.method === 'OPTIONS') {
        // Respond 204 without body to preflights that made it through.
        res.status(204).end();
        return false;
    }
    return true;
}

/**
 * Build a plain object of CORS headers for routes that prefer spreading
 * them into an existing headers literal rather than calling setHeader.
 */
function corsHeaders(req, opts = {}) {
    const origin = req.headers?.origin || '';
    const methods = opts.methods || 'GET, POST, OPTIONS';
    const headers =
        opts.headers ||
        'Content-Type, Authorization, x-user-id, x-admin-secret, x-request-id, x-idempotency-key';
    const h = {
        'Access-Control-Allow-Methods': methods,
        'Access-Control-Allow-Headers': headers,
        Vary: 'Origin',
    };
    if (isOriginAllowed(origin)) {
        h['Access-Control-Allow-Origin'] = origin;
        if (opts.credentials !== false) {
            h['Access-Control-Allow-Credentials'] = 'true';
        }
    }
    return h;
}

module.exports = {
    applyCors,
    corsHeaders,
    isOriginAllowed,
};
