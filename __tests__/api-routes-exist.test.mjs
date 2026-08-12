/**
 * API ROUTES — STATIC EXISTENCE GUARD
 * ─────────────────────────────────────────────────────────────────────────
 * Sibling of `menu-routes-exist.test.mjs`, which deliberately skips `/api/*`
 * ("API routes, not pages"). This file closes that gap.
 *
 * WHY IT EXISTS
 * The 2026-08-12 Home Games audit found nine `fetch('/api/...')` call sites
 * pointing at endpoints with no handler, and the failures were invisible in
 * production because the call sites swallow them:
 *
 *     fetch(`/api/commander/home-games/${id}/posts`, { headers })
 *       .catch(() => ({ ok: false }))          // 404 renders as "no posts yet"
 *
 * A dead endpoint therefore looks exactly like an empty feature. Whole
 * surfaces (the host group dashboard, home-game posting, event reviews) were
 * backed entirely by 404s and still "looked fine". This guard makes that a
 * build failure instead of a silent empty state.
 *
 * WHAT IT CHECKS
 * Every statically-analysable `/api/...` string literal under pages/, src/
 * and components/ must resolve to a file in the pages/api tree, using the
 * same resolution rules the Next.js API router uses:
 *
 *   - literal file      pages/api/friends/index.js   -> /api/friends
 *   - directory index   pages/api/friends/index.js   -> /api/friends
 *   - any of .js .jsx .ts .tsx
 *   - dynamic segment   pages/api/venues/[id].js     -> /api/venues/123
 *   - catch-all         pages/api/venues/[...s].js   -> /api/venues/a/b
 *   - optional catch-all
 *
 * WHAT IT DELIBERATELY CANNOT CHECK
 * `/api/commander/*` is rewritten by vercel.json to commander.smarter.poker,
 * an external service in a different repo. Whether THOSE endpoints exist
 * cannot be determined from this repo, so they are reported as proxied and
 * skipped — but the test asserts the rewrite is still present in
 * vercel.json. If someone deletes that rewrite, every proxied call becomes a
 * genuine dead route and this test fails loudly rather than shipping it.
 *
 * Interpolated paths (`${...}`) are resolved structurally: the interpolated
 * segment is treated as a wildcard that any dynamic segment can satisfy, so
 * `/api/poker/venues/${id}` matches `pages/api/poker/venues/[id].js`.
 *
 * PARTIAL-CHECKOUT SAFETY: mirrors menu-routes-exist. Worktrees and audit
 * slices sometimes contain call sites but few handlers; in that case every
 * route looks dead and the output is noise. The test detects a partial
 * pages/api tree and SKIPS with an explanation rather than failing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const API_DIR = path.join(REPO_ROOT, 'pages', 'api');
const SCAN_DIRS = ['pages', 'src', 'components'];
const EXTS = ['.js', '.jsx', '.ts', '.tsx'];

// ═══════════════════════════════════════════════════════════════════════════
// KNOWN_MISSING — '/api/route': 'why this is fine'
// ═══════════════════════════════════════════════════════════════════════════
// Only add a route here when it is genuinely served from somewhere other than
// a file in pages/api — a catch-all handler that registers sub-routes at
// runtime, a rewrite, or middleware. Say which, and say how you verified it.
//
// Do NOT add a route here to make the build green. A dead endpoint is the bug
// this file exists to catch.
// Currently empty: the resolver already handles catch-all handlers (e.g.
// /api/venues/record-geofence is served by pages/api/venues/[...slug].js), so
// no route has needed a manual exemption yet. Keep it that way if you can.
const KNOWN_MISSING = {};

// Prefixes served by an external host via a vercel.json rewrite. Each entry
// MUST have a corresponding rewrite; the assertion below enforces that.
const PROXIED_PREFIXES = ['/api/commander/'];

// ═══════════════════════════════════════════════════════════════════════════
// BASELINE_DEAD — routes that are ALREADY broken as of 2026-08-12
// ═══════════════════════════════════════════════════════════════════════════
// These are real dead endpoints found when this guard was introduced. They are
// listed so the guard can start protecting against NEW regressions today
// without being blocked on fixing all of them first.
//
// This is NOT an escape hatch. Two rules keep it honest:
//   1. Adding a NEW route here requires the same justification as fixing it —
//      prefer fixing. The list must only ever shrink.
//   2. The 'baseline has not gone stale' test FAILS when an entry starts
//      resolving, forcing you to delete it. The baseline cannot rot.
const BASELINE_DEAD = {
  // RESOLVED 2026-08-12 — the eight /api/cron/* entries that were here are
  // gone, because the thing referencing them was itself the bug.
  //
  // pages/api/admin/cron-health.js listed local /api/cron/* endpoints for
  // eight jobs. Six of those handlers exist nowhere; daily-challenge and
  // sentry-triage had moved to Open Claw / the workers repo. Investigating
  // turned up something larger: `cron_health_log` has ZERO rows and NO
  // WRITER anywhere, so that monitor could never report a healthy job and
  // had always answered "0/8_HEALTHY" — permanently crying wolf.
  //
  // The registry now records where each job actually runs instead of naming
  // deleted routes, and reports NO_TELEMETRY rather than alarming. With the
  // stale endpoint strings gone, these literals no longer appear in the
  // codebase at all, so they need no baseline entry.

  '/api/cron/horses-stories': 'horses/trigger-pipeline.js calls a handler that does not exist',

  // Genuine user-facing breakage.
  //
  // FIXED 2026-08-12, removed from this list (kept here as a record of what
  // the guard caught on its first run):
  //   /api/user/profile   — handler created at pages/api/user/profile.js
  //   /api/social/friends — never existed; both call sites in
  //                         pages/hub/venues/[id].js repointed at the real
  //                         /api/friends route, and the missing
  //                         action=status was added to it.
  //
  // Still dead: an acknowledged placeholder. src/hooks/useMessengerService.js
  // says "In production, this would call /api/translate" and the call is
  // fully guarded — it try/catches and falls back to "[LANG] original text",
  // so it degrades cleanly rather than breaking the messenger.
  '/api/translate': 'acknowledged placeholder in useMessengerService.js; guarded with a graceful fallback',
};

const SENTINEL_ROUTES = ['/api/friends', '/api/check-access'];
const MIN_EXPECTED_API_FILES = 40;

// ─────────────────────────────────────────────────────────────────────────
// Source scanning
// ─────────────────────────────────────────────────────────────────────────
function stripComments(src) {
  let out = '';
  let mode = 'code';
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
    if (mode === 'line') { if (c === '\n') { mode = 'code'; out += c; } i += 1; continue; }
    if (mode === 'block') { if (c === '*' && d === '/') { mode = 'code'; i += 2; continue; } if (c === '\n') out += c; i += 1; continue; }
    if (c === '\\') { out += c + (d === undefined ? '' : d); i += 2; continue; }
    if ((mode === 'sq' && c === "'") || (mode === 'dq' && c === '"') || (mode === 'tpl' && c === '`')) mode = 'code';
    out += c; i += 1;
  }
  return out;
}

const STRING_LITERAL = /(['"`])((?:\\.|(?!\1)[^\\])*?)\1/g;

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name === '.git') continue;
      walk(p, out);
    } else if (EXTS.includes(path.extname(e.name))) {
      out.push(p);
    }
  }
  return out;
}

/** Collect every `/api/...` literal across the scanned trees. */
function collectApiRoutes() {
  const found = new Map(); // route -> Set(file)
  for (const dir of SCAN_DIRS) {
    for (const file of walk(path.join(REPO_ROOT, dir))) {
      let src;
      try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }
      if (!src.includes('/api/')) continue;
      const clean = stripComments(src);
      let m;
      STRING_LITERAL.lastIndex = 0;
      while ((m = STRING_LITERAL.exec(clean)) !== null) {
        const raw = m[2];
        if (typeof raw !== 'string' || !raw.startsWith('/api/')) continue;
        // Strip query/hash — they never change which file serves the route.
        const route = raw.split('?')[0].split('#')[0].replace(/\/+$/, '');
        if (route.length <= 5) continue;
        if (!found.has(route)) found.set(route, new Set());
        found.get(route).add(path.relative(REPO_ROOT, file));
      }
    }
  }
  return found;
}

// ─────────────────────────────────────────────────────────────────────────
// Next.js API-route resolution
// ─────────────────────────────────────────────────────────────────────────
function segmentsOf(route) {
  return route.replace(/^\/api\/?/, '').split('/').filter(Boolean);
}

/** true when a path segment is an interpolation placeholder. */
function isWildcard(seg) {
  return seg.includes('${') || /^:/.test(seg) || seg === '[id]' || seg === '[code]';
}

/**
 * Resolve segments against the pages/api directory tree, honouring dynamic,
 * catch-all and optional-catch-all segments.
 */
function resolves(segments, dir = API_DIR) {
  if (segments.length === 0) {
    return EXTS.some((e) => fs.existsSync(path.join(dir, `index${e}`)));
  }
  const [head, ...rest] = segments;

  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return false; }

  const names = entries.map((e) => e.name);
  const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  // Catch-all / optional catch-all at this level swallows the remainder.
  if (names.some((n) => /^\[\[?\.\.\..+?\]\]?\.(js|jsx|ts|tsx)$/.test(n))) return true;

  const isLast = rest.length === 0;

  // 1. exact file match
  if (isLast && !isWildcard(head)) {
    if (EXTS.some((e) => names.includes(`${head}${e}`))) return true;
  }
  // 2. exact directory (+ index if last)
  if (dirNames.includes(head) && !isWildcard(head)) {
    if (isLast && EXTS.some((e) => fs.existsSync(path.join(dir, head, `index${e}`)))) return true;
    if (!isLast && resolves(rest, path.join(dir, head))) return true;
  }
  // 3. dynamic segment file  [x].js
  if (isLast && names.some((n) => /^\[[^.\]]+\]\.(js|jsx|ts|tsx)$/.test(n))) return true;
  // 4. dynamic segment directory  [x]/
  for (const dn of dirNames) {
    if (!/^\[[^.\]]+\]$/.test(dn)) continue;
    if (isLast && EXTS.some((e) => fs.existsSync(path.join(dir, dn, `index${e}`)))) return true;
    if (!isLast && resolves(rest, path.join(dir, dn))) return true;
  }
  // 5. a wildcard head can also match a literal directory
  if (isWildcard(head)) {
    for (const dn of dirNames) {
      if (!isLast && resolves(rest, path.join(dir, dn))) return true;
      if (isLast && EXTS.some((e) => fs.existsSync(path.join(dir, dn, `index${e}`)))) return true;
    }
  }
  return false;
}

const isProxied = (route) => PROXIED_PREFIXES.some((p) => route.startsWith(p));

/**
 * True when the literal maps to a DIRECTORY under pages/api.
 *
 * Such a literal is a base path, not a route: code assigns it to a constant
 * and concatenates children onto it, e.g.
 *
 *     const API_BASE = '/api/poker/engine';   // pages/api/poker/engine/*.js
 *     fetch(`${API_BASE}/action`)
 *
 * The bare path would 404, but nothing ever requests it. Flagging these
 * produces noise that trains people to ignore the guard, so they are
 * excluded. Children are still checked individually wherever they appear as
 * their own literals.
 */
function isBasePathDirectory(route) {
  const dir = path.join(API_DIR, ...segmentsOf(route));
  try { return fs.statSync(dir).isDirectory(); } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────
const apiFileCount = walk(API_DIR).length;
const partial =
  apiFileCount < MIN_EXPECTED_API_FILES ||
  !SENTINEL_ROUTES.every((r) => resolves(segmentsOf(r)));

test('every /api/ route literal resolves to a handler', { skip: partial &&
  `partial checkout: ${apiFileCount} api files, sentinels missing — skipping` }, () => {
  const routes = collectApiRoutes();
  const dead = [];

  for (const [route, files] of routes) {
    if (isProxied(route)) continue;
    if (KNOWN_MISSING[route]) continue;
    if (BASELINE_DEAD[route]) continue;
    if (isBasePathDirectory(route)) continue;
    if (resolves(segmentsOf(route))) continue;
    dead.push(`  ${route}\n      referenced by: ${[...files].slice(0, 4).join(', ')}`);
  }

  assert.equal(
    dead.length,
    0,
    `${dead.length} NEW /api/ route literal(s) have no handler under pages/api.\n` +
      `These 404 at runtime. Call sites usually swallow the failure\n` +
      `(.catch(() => ({ ok: false })), if (res.ok) with no else), so this\n` +
      `renders as an empty feature rather than an error — which is exactly\n` +
      `why it survives code review.\n\n${dead.join('\n')}\n\n` +
      `Fix: create the handler, or correct the URL. Only if it is genuinely\n` +
      `served elsewhere, add it to KNOWN_MISSING with a reason.`
  );
});

test('BASELINE_DEAD has not gone stale (it must only shrink)', { skip: partial && 'partial checkout' }, () => {
  const fixed = Object.keys(BASELINE_DEAD).filter(
    (r) => resolves(segmentsOf(r)) || isBasePathDirectory(r)
  );
  assert.equal(
    fixed.length,
    0,
    `These routes now resolve and must be DELETED from BASELINE_DEAD so the\n` +
      `guard starts protecting them:\n  ${fixed.join('\n  ')}`
  );
});

test('vercel.json still rewrites every proxied /api prefix', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'vercel.json'), 'utf8'));
  const sources = (vercel.rewrites || []).map((r) => r.source);
  for (const prefix of PROXIED_PREFIXES) {
    const ok = sources.some((s) => s.startsWith(prefix.replace(/\/$/, '')));
    assert.ok(
      ok,
      `PROXIED_PREFIXES contains "${prefix}" but vercel.json has no rewrite for it.\n` +
        `Every call to that prefix is now a dead route. Either restore the\n` +
        `rewrite or implement the endpoints locally under pages/api.`
    );
  }
});

test('KNOWN_MISSING has not gone stale', { skip: partial && 'partial checkout' }, () => {
  const stale = Object.keys(KNOWN_MISSING).filter((r) => resolves(segmentsOf(r)));
  assert.equal(
    stale.length,
    0,
    `These routes now have real handlers and must be removed from KNOWN_MISSING:\n  ${stale.join('\n  ')}`
  );
});
