/**
 * MENU ROUTES — STATIC EXISTENCE GUARD
 * ─────────────────────────────────────────────────────────────────────────
 * `src/config/hamburgerMenus.js` is the single source of truth for every
 * hamburger-menu destination on the World Hub. It is a plain data file — no
 * import of the page it points at — so a page can be deleted, renamed, or
 * never written at all and the menu keeps rendering a link that 404s. A
 * 2026-08 menu audit could not confirm 77 of the routes referenced there;
 * some of them are dead links in production right now.
 *
 * This test extracts every route literal from the menu config and resolves
 * it against the pages/ tree exactly the way the Next.js pages router does:
 *
 *   - literal file            pages/hub/settings.js       -> /hub/settings
 *   - directory index         pages/hub/settings/index.js -> /hub/settings
 *   - any of .js .jsx .ts .tsx
 *   - dynamic segment         pages/hub/[world].js        -> /hub/anything
 *   - catch-all               pages/hub/[...slug].js      -> /hub/a/b/c
 *   - optional catch-all      pages/hub/[[...slug]].js    -> /hub  and /hub/a
 *
 * ?query and #hash are stripped before resolution (they never affect which
 * file serves the route). External links (http, https, mailto, tel, sms,
 * protocol-relative), the bare '#' placeholder, `${...}` template routes and
 * /api/* endpoints are out of scope.
 *
 * Anything that is genuinely served from outside the pages router (a
 * next.config.js rewrite, middleware, a static file in public/, an external
 * host proxied onto our domain) belongs in KNOWN_MISSING below — with a
 * reason. A second test fails if a KNOWN_MISSING entry goes stale, so the
 * allow-list cannot quietly rot into a list of real dead links.
 *
 * PARTIAL-CHECKOUT SAFETY: audits and worktrees sometimes run against a
 * slice of the repo that contains the menu config but only a handful of
 * pages. In that situation every route looks dead and the failure output is
 * pure noise. The test detects a partial pages/ tree (page count below a
 * floor, or the well-known sentinel routes missing) and SKIPS with an
 * explanation instead of failing. It only ever fails against a full tree.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const PAGES_DIR = path.join(REPO_ROOT, 'pages');
const PUBLIC_DIR = path.join(REPO_ROOT, 'public');
const MENU_CONFIG = path.join(REPO_ROOT, 'src/config/hamburgerMenus.js');

const PAGE_EXTS = ['.js', '.jsx', '.ts', '.tsx'];

// ═══════════════════════════════════════════════════════════════════════════
// KNOWN_MISSING — routes that intentionally have no file under pages/
// ═══════════════════════════════════════════════════════════════════════════
// Format: '/route': 'why this is fine'.
//
// ONLY add a route here when it really is served from somewhere other than
// the pages router — a next.config.js rewrite/redirect, middleware, a static
// file under public/, or an external host mapped onto the domain. Say which
// one in the reason string.
//
// Do NOT add a route here just to make the build green. A dead menu link is
// the bug this file exists to catch; silencing it here hides it from the
// next person and from the audit. Fix the link or ship the page.
const KNOWN_MISSING = {
    // Club Arena is a Vite SPA vendored into public/hub/club-arena/, not pages/.
    // next.config.js rewrites().fallback maps every extension-less path under
    // /hub/club-arena/ to /hub/club-arena/index.html, and the SPA's own router
    // resolves these six. Verified 2026-08-03: no pages/hub/club-arena/* files
    // exist, the fallback rewrite is present, and each route name appears in
    // public/hub/club-arena/assets/index-*.js.
    '/hub/club-arena/cashier': 'club-arena SPA route (next.config.js rewrites().fallback -> index.html)',
    '/hub/club-arena/hand-history': 'club-arena SPA route (next.config.js rewrites().fallback -> index.html)',
    '/hub/club-arena/leaderboard': 'club-arena SPA route (next.config.js rewrites().fallback -> index.html)',
    '/hub/club-arena/messages': 'club-arena SPA route (next.config.js rewrites().fallback -> index.html)',
    '/hub/club-arena/player-sessions': 'club-arena SPA route (next.config.js rewrites().fallback -> index.html)',
    '/hub/club-arena/players': 'club-arena SPA route (next.config.js rewrites().fallback -> index.html)',
};

// Well-known routes used to tell a full checkout from a slice. These are
// load-bearing hub pages that have existed for the entire life of the repo.
const SENTINEL_ROUTES = ['/hub', '/hub/settings', '/hub/personal-assistant'];
// A full checkout has far more pages than this; a slice has a handful.
const MIN_EXPECTED_PAGES = 40;

// ─────────────────────────────────────────────────────────────────────────
// Source scanning
// ─────────────────────────────────────────────────────────────────────────

/**
 * Remove // and /* *\/ comments without touching string contents, so route
 * literals quoted inside explanatory comments (the config has several, e.g.
 * "'/hand-histories' was a dead link") are not mistaken for live routes.
 */
function stripComments(src) {
    let out = '';
    let mode = 'code'; // code | line | block | sq | dq | tpl
    for (let i = 0; i < src.length;) {
        const c = src[i];
        const d = src[i + 1];
        if (mode === 'code') {
            if (c === '/' && d === '/') { mode = 'line'; i += 2; continue; }
            if (c === '/' && d === '*') { mode = 'block'; i += 2; continue; }
            if (c === "'") mode = 'sq';
            else if (c === '"') mode = 'dq';
            else if (c === '`') mode = 'tpl';
            out += c; i += 1; continue;
        }
        if (mode === 'line') {
            if (c === '\n') { mode = 'code'; out += c; }
            i += 1; continue;
        }
        if (mode === 'block') {
            if (c === '*' && d === '/') { mode = 'code'; i += 2; continue; }
            if (c === '\n') out += c;
            i += 1; continue;
        }
        // inside a string literal
        if (c === '\\') { out += c + (d === undefined ? '' : d); i += 2; continue; }
        if ((mode === 'sq' && c === "'") || (mode === 'dq' && c === '"') || (mode === 'tpl' && c === '`')) {
            mode = 'code';
        }
        out += c; i += 1;
    }
    return out;
}

const STRING_LITERAL = /(['"`])((?:\\.|(?!\1)[^\\])*?)\1/g;

/** Every quoted literal in the (comment-free) menu config. */
function extractStringLiterals(src) {
    const found = [];
    let m;
    STRING_LITERAL.lastIndex = 0;
    while ((m = STRING_LITERAL.exec(src)) !== null) found.push(m[2]);
    return found;
}

const EXTERNAL_PREFIXES = ['http://', 'https://', '//', 'mailto:', 'tel:', 'sms:', 'data:', 'blob:'];

/** true when a literal is a route this guard is responsible for. */
function isCheckableRoute(raw) {
    if (typeof raw !== 'string' || raw.length === 0) return false;
    if (EXTERNAL_PREFIXES.some((p) => raw.startsWith(p))) return false; // off-site
    if (raw.startsWith('#')) return false;                              // '#' placeholder / same-page anchor
    if (!raw.startsWith('/')) return false;                             // not a route literal at all
    if (raw.includes('${')) return false;                               // interpolated — not statically resolvable
    if (raw === '/api' || raw.startsWith('/api/')) return false;        // API routes, not pages
    if (raw.startsWith('/_next/')) return false;                        // build output
    return true;
}

/** Drop ?query and #hash, collapse '//' and a trailing '/'. */
function normalizeRoute(raw) {
    let r = raw.split('#')[0].split('?')[0];
    r = r.replace(/\/{2,}/g, '/');
    if (r.length > 1 && r.endsWith('/')) r = r.slice(0, -1);
    return r === '' ? '/' : r;
}

function readMenuRoutes() {
    const src = stripComments(fs.readFileSync(MENU_CONFIG, 'utf8'));
    const routes = new Map(); // normalized -> Set(raw literals)
    for (const raw of extractStringLiterals(src)) {
        if (!isCheckableRoute(raw)) continue;
        const norm = normalizeRoute(raw);
        if (!routes.has(norm)) routes.set(norm, new Set());
        routes.get(norm).add(raw);
    }
    return routes;
}

// ─────────────────────────────────────────────────────────────────────────
// pages/ router resolution
// ─────────────────────────────────────────────────────────────────────────

const readDirCache = new Map();
function readDirSafe(dir) {
    if (readDirCache.has(dir)) return readDirCache.get(dir);
    let entries = [];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        entries = [];
    }
    readDirCache.set(dir, entries);
    return entries;
}

/** 'foo.js' -> 'foo'; '[...slug].tsx' -> '[...slug]'. null when not a page ext. */
function pageBasename(name) {
    const ext = path.extname(name);
    if (!PAGE_EXTS.includes(ext)) return null;
    return name.slice(0, -ext.length);
}

const RE_OPTIONAL_CATCH_ALL = /^\[\[\.\.\.[^\]]+\]\]$/; // [[...slug]]
const RE_CATCH_ALL = /^\[\.\.\.[^\]]+\]$/;              // [...slug]
const RE_DYNAMIC = /^\[(?!\[)(?!\.\.\.)[^\]]+\]$/;      // [id]

function pageFilesIn(dir) {
    return readDirSafe(dir)
        .filter((e) => e.isFile())
        .map((e) => pageBasename(e.name))
        .filter((b) => b !== null);
}

/**
 * Walk `segments` down from `dir` the way the pages router resolves a URL.
 * Returns true when some file could serve the route.
 */
function walk(dir, segments) {
    const files = pageFilesIn(dir);
    const dirs = readDirSafe(dir).filter((e) => e.isDirectory()).map((e) => e.name);

    if (segments.length === 0) {
        // /some/path -> directory index, or an optional catch-all that matches zero segments
        if (files.includes('index')) return true;
        if (files.some((f) => RE_OPTIONAL_CATCH_ALL.test(f))) return true;
        return false;
    }

    const [head, ...rest] = segments;
    const isLast = rest.length === 0;

    // 1. literal file (only the final segment can be satisfied by a file)
    if (isLast && files.includes(head)) return true;

    // 2. literal directory
    if (dirs.includes(head) && walk(path.join(dir, head), rest)) return true;

    // 3. dynamic single-segment file  [id].js
    if (isLast && files.some((f) => RE_DYNAMIC.test(f))) return true;

    // 4. dynamic single-segment directory  [id]/...
    for (const d of dirs) {
        if (RE_DYNAMIC.test(d) && walk(path.join(dir, d), rest)) return true;
    }

    // 5. catch-all — absorbs every remaining segment (needs at least one)
    if (files.some((f) => RE_CATCH_ALL.test(f))) return true;

    // 6. optional catch-all — same, and also matches zero (handled above)
    if (files.some((f) => RE_OPTIONAL_CATCH_ALL.test(f))) return true;

    return false;
}

/** A static asset under public/ can legitimately back a '/'-rooted link. */
function resolvesInPublic(route) {
    if (!fs.existsSync(PUBLIC_DIR)) return false;
    const target = path.join(PUBLIC_DIR, route);
    // keep the lookup inside public/
    if (!path.resolve(target).startsWith(path.resolve(PUBLIC_DIR))) return false;
    try {
        return fs.statSync(target).isFile();
    } catch {
        return false;
    }
}

function routeResolves(route) {
    const segments = route.split('/').filter(Boolean);
    if (walk(PAGES_DIR, segments)) return true;
    return resolvesInPublic(route);
}

/** Count real page files (excludes pages/api and _app/_document style files). */
function countPageFiles(dir = PAGES_DIR) {
    let n = 0;
    for (const e of readDirSafe(dir)) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (dir === PAGES_DIR && e.name === 'api') continue;
            n += countPageFiles(full);
        } else if (pageBasename(e.name) !== null && !e.name.startsWith('_')) {
            n += 1;
        }
    }
    return n;
}

/**
 * Returns a reason string when the pages/ tree is clearly not a full
 * checkout, or null when it looks complete.
 */
function partialCheckoutReason() {
    if (!fs.existsSync(PAGES_DIR)) return 'pages/ does not exist in this checkout';
    const pageCount = countPageFiles();
    if (pageCount < MIN_EXPECTED_PAGES) {
        return `only ${pageCount} page file(s) under pages/ (a full checkout has well over ${MIN_EXPECTED_PAGES})`;
    }
    const missingSentinels = SENTINEL_ROUTES.filter((r) => !routeResolves(r));
    if (missingSentinels.length >= Math.ceil(SENTINEL_ROUTES.length / 2)) {
        return `well-known routes are absent (${missingSentinels.join(', ')}) — pages/ is a slice, not the full tree`;
    }
    return null;
}

const SKIP_HINT = 'Nothing was verified. Re-run this guard against a full checkout.';

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

test('hamburger menu config is present and yields route literals', () => {
    assert.ok(
        fs.existsSync(MENU_CONFIG),
        'src/config/hamburgerMenus.js is missing — every hamburger menu on the World Hub renders from it.',
    );
    const routes = readMenuRoutes();
    assert.ok(
        routes.size > 0,
        'No route literals could be extracted from src/config/hamburgerMenus.js.\n'
        + 'Either the config was gutted or its href format changed and this guard\n'
        + 'is now scanning for something that no longer exists — in which case it is\n'
        + 'silently passing and must be updated.',
    );
});

test('every menu route resolves to a real page under pages/', (t) => {
    const partial = partialCheckoutReason();
    if (partial) {
        t.skip(`Partial checkout: ${partial}. ${SKIP_HINT}`);
        return;
    }

    const routes = readMenuRoutes();
    const dead = [];
    for (const [route, rawSet] of routes) {
        if (routeResolves(route)) continue;
        if (Object.prototype.hasOwnProperty.call(KNOWN_MISSING, route)) continue;
        dead.push({ route, linkedAs: [...rawSet].sort() });
    }
    dead.sort((a, b) => a.route.localeCompare(b.route));

    assert.deepEqual(
        dead,
        [],
        `${dead.length} hamburger-menu route(s) do not resolve to any file under pages/.\n`
        + 'Each one renders as a tappable menu row that 404s.\n\n'
        + dead.map((d) => `  ${d.route}\n      linked as: ${d.linkedAs.join(', ')}`).join('\n')
        + '\n\nFix by (a) shipping the page, (b) correcting the href in\n'
        + 'src/config/hamburgerMenus.js, (c) deleting the menu row, or — only if the\n'
        + 'route is genuinely served outside the pages router — adding it to\n'
        + 'KNOWN_MISSING in this file with a reason.',
    );
});

test('KNOWN_MISSING has no stale entries', (t) => {
    const entries = Object.keys(KNOWN_MISSING);
    if (entries.length === 0) return; // nothing to rot

    const routes = readMenuRoutes();
    const stale = [];

    for (const route of entries) {
        const reason = KNOWN_MISSING[route];

        if (normalizeRoute(route) !== route) {
            stale.push(`${route} — not normalized; drop the ?query/#hash/trailing slash`);
            continue;
        }
        if (typeof reason !== 'string' || reason.trim().length < 10) {
            stale.push(`${route} — needs a real reason explaining where it IS served from`);
            continue;
        }
        if (!routes.has(route)) {
            stale.push(`${route} — no longer referenced by src/config/hamburgerMenus.js; remove the entry`);
            continue;
        }
    }

    // "It exists now" can only be judged against a full tree.
    const partial = partialCheckoutReason();
    if (!partial) {
        for (const route of entries) {
            if (routeResolves(route)) {
                stale.push(`${route} — now resolves under pages/; remove the allow-list entry`);
            }
        }
    }

    stale.sort();
    assert.deepEqual(
        stale,
        [],
        'KNOWN_MISSING in __tests__/menu-routes-exist.test.mjs is out of date.\n'
        + 'Stale allow-list entries mask real dead links.\n\n'
        + stale.map((s) => `  - ${s}`).join('\n')
        + (partial ? `\n\n(Resolution checks were skipped: ${partial})` : ''),
    );
});
