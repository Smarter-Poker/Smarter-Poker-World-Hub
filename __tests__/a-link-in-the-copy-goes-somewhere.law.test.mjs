/**
 * A LINK IN THE COPY GOES SOMEWHERE (AEO phase 3, 2026-09-18).
 *
 * Four links written into shipped copy pointed at routes this app does not
 * have. All four answered 404 on production:
 *
 *   /help                              in the SMS section of /terms, shown
 *                                      to every player who reads the legal
 *                                      pages, as "Visit Our Help Center"
 *   /hub/commander/check-in            the "Check In Now" button in the seat
 *                                      ready email. The route is
 *                                      check-in/[venueId]; the bare path is
 *                                      not a route, so a player told to
 *                                      check in within five minutes had
 *                                      nowhere to go
 *   /admin/support-tickets/<id>        "View Ticket In Admin Panel" in every
 *   /admin/live-help/<id>              support notification. Neither page was
 *                                      ever built
 *
 * None of these are SEO problems. They are broken promises in copy, and the
 * reason a sitemap sweep never found them is that a sitemap only lists the
 * pages that do exist.
 *
 * WHAT THIS CHECKS
 *
 * Every absolute smarter.poker link written as a literal in shipped source
 * resolves to a page this app serves, or to a documented redirect. A link
 * built by interpolation (`/club/${id}`) is a prefix, not a path, and is
 * skipped: its shape is the dynamic route's business.
 *
 * Reads source files; runs in the Build Safety Gate with no install.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every route the pages tree serves, dynamic segments included. */
function routePatterns(dir = 'pages', out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === 'api' || entry.name === 'node_modules') continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) routePatterns(rel, out);
    else if (/\.(js|jsx)$/.test(entry.name)) {
      let route = `/${rel.replace(/^pages\//, '').replace(/\.(js|jsx)$/, '')}`;
      route = route.replace(/\/index$/, '') || '/';
      out.push(route);
    }
  }
  return out;
}

function resolves(link, patterns) {
  const segs = link.replace(/^\//, '').split('/').filter(Boolean);
  for (const pattern of patterns) {
    const ps = pattern.replace(/^\//, '').split('/').filter(Boolean);
    if (ps.length !== segs.length) continue;
    if (ps.every((p, i) => p === segs[i] || p.startsWith('['))) return true;
  }
  return false;
}

/**
 * Paths that are served by something other than a page file, and are
 * confirmed live rather than assumed. Each one is a decision, so each is
 * named here rather than matched by a pattern.
 */
const SERVED_ELSEWHERE = new Set([
  '/hub/club-arena',     // the Poker Arena app, proxied by a rewrite
  '/legal/privacy',      // 308 to /privacy
  '/legal/terms',        // 308 to /terms
  '/profile',            // 308 to /hub/profile
  '/login',              // 308 to the auth route
]);

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', '.next', '.git', 'vendor', 'tests'].includes(entry.name)) continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(rel, out);
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

test('every smarter.poker link written into the copy resolves to a page', () => {
  const patterns = routePatterns();
  const broken = new Map();

  for (const file of [...sourceFiles('pages'), ...sourceFiles('src')]) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of src.matchAll(/https:\/\/smarter\.poker(\/[A-Za-z0-9/_-]*)/g)) {
      const after = src[m.index + m[0].length];
      // `/club/${id}` is a prefix the dynamic route completes, not a path.
      if (after === '$' || after === '{') continue;
      // The capture stops before a dot, so /sitemap.xml arrives as
      // "/sitemap" with a "." next. A file extension follows: not a page.
      if (after === '.') continue;
      const link = m[1].replace(/\/+$/, '');
      if (!link) continue;
      // Files, feeds and endpoints are not pages.
      if (/^\/(api|images|icons|fonts|assets)\b/.test(link)) continue;
      if (/\.(xml|txt|json|png|jpe?g|webp|svg|ico|css|js)$/.test(link)) continue;
      if (SERVED_ELSEWHERE.has(link)) continue;
      if (resolves(link, patterns)) continue;
      if (!broken.has(link)) broken.set(link, new Set());
      broken.get(link).add(file);
    }
  }

  const report = [...broken.entries()].map(([link, files]) => `${link}\n      ${[...files].join('\n      ')}`);
  assert.deepEqual(
    report,
    [],
    'These links are written into shipped copy and point at routes this app '
    + 'does not serve. A reader who follows one gets a 404. Point them at a '
    + 'route that exists, or, if the destination has not been built, say the '
    + 'thing in text instead of promising a page.\n\n  '
    + report.join('\n  '),
  );
});

test('the seat ready email can address a specific venue', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/lib/emailTemplates.js'), 'utf8');
  assert.match(src, /sendSeatReadyEmail\([^)]*venueId/, 'the template takes a venueId');
  assert.doesNotMatch(
    src,
    /smarter\.poker\/hub\/commander\/check-in"/,
    'the bare check-in path is not a route and must not be linked',
  );
});
