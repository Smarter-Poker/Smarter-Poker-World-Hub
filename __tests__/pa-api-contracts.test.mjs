/**
 * PERSONAL ASSISTANT — API ROUTE CONTRACTS
 * ─────────────────────────────────────────────────────────────────────────
 * Static contract guard over every API route the PA surface owns
 * (pages/api/assistant/**, pages/api/sandbox/**).
 *
 * Each rule below corresponds to a defect this codebase has ACTUALLY shipped,
 * so each one is a regression alarm rather than a style preference:
 *
 *   1. RATE LIMITED. Every route that reaches the database must rate limit,
 *      and it must do so BEFORE the DB work. analyze.js — the most expensive
 *      endpoint here (solver queries plus a Grok fallback) — ran its limiter
 *      after JWT validation and a context-authority check, so every request
 *      in a flood bought one or two DB round-trips before the limiter that
 *      exists to stop it. weekly-spot.js and archetypes.js had no limiter at
 *      all and need no auth; their edge cache is not a substitute, because a
 *      unique query string per request bypasses the CDN entirely.
 *
 *   2. NO IDENTITY FROM THE BODY OR QUERY. userId must come from the
 *      Authorization header only. A `req.query.userId` fallback was a live
 *      IDOR on the leaks route (hardened 2026-03-07) — anyone could read
 *      anyone's leaks by editing a URL.
 *
 *   3. NO `.single()` (Immutable Rule 1). It throws PGRST116 on zero rows;
 *      `.maybeSingle()` is the only safe form.
 *
 *   4. NO RAW `@supabase/supabase-js` IMPORT (Immutable Rule 4). API routes
 *      use src/lib/supabaseServerClient, which carries the JWT decode
 *      fallback; a raw client bypasses that resilience.
 *
 *   5. TOP-LEVEL try/catch. Every handler must contain one, so an unexpected
 *      throw becomes JSON rather than a stack trace and a 500 HTML page.
 *
 * Static analysis, deliberately: these routes import webpack-resolved modules
 * and cannot be executed under `node --test` without a bundler. Reading the
 * source is what makes this guard cheap enough to run on every build.
 *
 * Run: node --test __tests__/pa-api-contracts.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_ROOTS = ['pages/api/assistant', 'pages/api/sandbox'];

/** Routes exempt from a specific rule, each with the reason it is exempt. */
const EXEMPT = {
    // Retired endpoint: a bare 410, touches nothing.
    'pages/api/assistant/setup-database.js': ['rateLimit', 'tryCatch'],
    // Pure dispatcher: it owns no DB work and every _routes/* target rate
    // limits itself. Adding a second limiter here would double-count callers.
    // It is NOT exempt from tryCatch — it is the last boundary where an
    // unexpected throw can still be turned into JSON.
    'pages/api/sandbox/[...path].js': ['rateLimit'],
};

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (entry.name.endsWith('.js')) out.push(full);
    }
    return out;
}

const ROUTES = API_ROOTS
    .map(r => path.join(ROOT, r))
    .filter(d => fs.existsSync(d))
    .flatMap(d => walk(d))
    .map(f => ({ rel: path.relative(ROOT, f).split(path.sep).join('/'), src: fs.readFileSync(f, 'utf8') }))
    .sort((a, b) => a.rel.localeCompare(b.rel));

const exempt = (rel, rule) => (EXEMPT[rel] || []).includes(rule);

test('the PA API surface is discoverable (guard is actually pointed at something)', () => {
    assert.ok(ROUTES.length >= 20, `expected the PA API surface, found ${ROUTES.length} routes — has the tree moved?`);
});

test('RULE 1: every DB-touching route rate limits', () => {
    const offenders = ROUTES.filter(({ rel, src }) => {
        if (exempt(rel, 'rateLimit')) return false;
        const limits = /applyRateLimit\s*\(|rateLimit\s*\(/.test(src);
        return !limits;
    }).map(r => r.rel);

    assert.deepEqual(offenders, [],
        `these PA routes have no rate limiter — an unauthenticated flood reaches the database directly:\n  ${offenders.join('\n  ')}`);
});

test('RULE 1b: the rate limiter runs BEFORE any database work', () => {
    const offenders = [];
    for (const { rel, src } of ROUTES) {
        if (exempt(rel, 'rateLimit')) continue;

        // Position inside the default handler only — helper functions defined
        // above it legitimately mention supabase before the limiter appears.
        const handlerAt = src.indexOf('export default');
        if (handlerAt === -1) continue;
        const body = src.slice(handlerAt);

        const limitAt = body.search(/applyRateLimit\s*\(|rateLimit\s*\(/);
        if (limitAt === -1) continue; // RULE 1 already reports this

        // First database/auth touch inside the handler.
        const dbAt = body.search(/getSupabase\s*\(\)|getServerUserWithFallback\s*\(|checkSandboxAccess\s*\(|supabase\s*\.\s*from\s*\(/);
        if (dbAt !== -1 && dbAt < limitAt) {
            offenders.push(rel);
        }
    }
    assert.deepEqual(offenders, [],
        `these routes do database work BEFORE rate limiting, so a flood is paid for by the DB:\n  ${offenders.join('\n  ')}`);
});

test('RULE 2: identity never comes from the request body or query (IDOR)', () => {
    // A comment explaining the removed fallback is fine; live code is not.
    const BAD = /(?<!\/\/[^\n]*)\b(req\.query\.user_?[Ii]d|req\.body\.user_?[Ii]d)\b/;
    const offenders = ROUTES.filter(({ src }) => {
        const codeOnly = src.split('\n')
            .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
            .join('\n');
        return BAD.test(codeOnly);
    }).map(r => r.rel);

    assert.deepEqual(offenders, [],
        `these routes take identity from client-controlled input — the known IDOR class:\n  ${offenders.join('\n  ')}`);
});

test('RULE 3: no .single() — it throws PGRST116 on zero rows', () => {
    const offenders = ROUTES.filter(({ src }) => /(?<!maybe)\.single\s*\(/.test(src)).map(r => r.rel);
    assert.deepEqual(offenders, [], `use .maybeSingle():\n  ${offenders.join('\n  ')}`);
});

test('RULE 4: no raw @supabase/supabase-js import in API routes', () => {
    const offenders = ROUTES
        .filter(({ src }) => /from\s+['"]@supabase\/supabase-js['"]/.test(src))
        .map(r => r.rel);
    assert.deepEqual(offenders, [],
        `import from src/lib/supabaseServerClient instead:\n  ${offenders.join('\n  ')}`);
});

test('RULE 5: every handler has a top-level try/catch', () => {
    const offenders = ROUTES.filter(({ rel, src }) => {
        if (exempt(rel, 'tryCatch')) return false;
        const handlerAt = src.indexOf('export default');
        if (handlerAt === -1) return false;
        const body = src.slice(handlerAt);
        return !/\btry\s*\{/.test(body) || !/\bcatch\s*\(/.test(body);
    }).map(r => r.rel);

    assert.deepEqual(offenders, [],
        `an unexpected throw here becomes an HTML 500 instead of JSON:\n  ${offenders.join('\n  ')}`);
});

test('the exemption list stays honest (no stale entries)', () => {
    const known = new Set(ROUTES.map(r => r.rel));
    const stale = Object.keys(EXEMPT).filter(rel => !known.has(rel));
    assert.deepEqual(stale, [],
        `these exemptions name routes that no longer exist — delete them:\n  ${stale.join('\n  ')}`);
});
