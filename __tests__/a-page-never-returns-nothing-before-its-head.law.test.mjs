/**
 * A PAGE NEVER RETURNS NOTHING BEFORE ITS HEAD (AEO phase 3, 2026-09-18).
 *
 * pages/hub/tours/[code].js opened its render with
 *
 *     if (!router.isReady) return null;
 *
 * and put its <SEOHead> after it. router.isReady is false on the server for
 * a statically optimised page, so that early return is the branch every
 * crawler takes, every time. All 29 tour routes in the sitemap answered 200
 * with 20,764 bytes of framework shell and, measured as OAI-SearchBot:
 *
 *     no title, no description, no canonical, no h1, no structured data,
 *     and zero words of body text
 *
 * The page was not broken for people. It was invisible to everything that
 * does not run JavaScript, which is most of what reads a site now.
 *
 * This is the same defect as a head nested inside dynamic(ssr:false), which
 * a-page-head-is-never-behind-a-client-only-wrapper already forbids, reached
 * a different way. That law looks for a wrapper. An early return needs no
 * wrapper at all, so it walked straight past it.
 *
 * WHAT THIS FORBIDS
 *
 * Returning nothing, from a branch that the server always takes, before the
 * page has said what it is. A loading branch is fine, and common, as long as
 * the head is above it: render the head, then return the spinner.
 *
 * Reads source files; runs in the Build Safety Gate with no install.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function pageFiles(dir = 'pages', out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === 'api' || entry.name === 'node_modules') continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) pageFiles(rel, out);
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

/**
 * Whole comment lines only. A block-comment regex sweep was tried for the
 * sibling law and deleted 33,000 characters of USRobots.js, taking the very
 * thing it was scanning for with them, so this drops lines and nothing else.
 * This file's own explanation contains the exact guard it forbids.
 */
function withoutComments(src) {
  return src
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*'));
    })
    .join('\n');
}

/**
 * A branch the server always takes. router.isReady is false during server
 * render; a bare `mounted` flag set in an effect is false there too, and
 * both are used to defer work until the browser is running.
 */
const SERVER_ALWAYS_TAKES = [
  { re: /if\s*\(\s*!\s*router\.isReady\s*\)\s*return\s+null\s*;/, why: 'if (!router.isReady) return null' },
  { re: /if\s*\(\s*!\s*isReady\s*\)\s*return\s+null\s*;/, why: 'if (!isReady) return null' },
  { re: /if\s*\(\s*!\s*mounted\s*\)\s*return\s+null\s*;/, why: 'if (!mounted) return null' },
  { re: /if\s*\(\s*typeof\s+window\s*===?\s*['"]undefined['"]\s*\)\s*return\s+null\s*;/, why: 'if (typeof window === undefined) return null' },
];

/** Where the page first says what it is. -1 when it never does. */
function headIndex(src) {
  const marks = [/<SEOHead\b/, /<SharedSEOHead\b/, /<title\b/];
  let best = -1;
  for (const re of marks) {
    const m = src.match(re);
    if (m && (best === -1 || m.index < best)) best = m.index;
  }
  return best;
}

/**
 * The body of the page's default export, and nothing else.
 *
 * Scanning the whole file was tried and accused pages/hub/social-media, a
 * page that is completely healthy: 136 words, a title and schema on
 * production. Its `if (typeof window === 'undefined') return null` sits
 * inside a helper 3,000 lines down, not in the page. A law that cannot tell
 * those apart is a law that cries wolf, and this programme has already
 * thrown away two scanners for exactly that.
 *
 * Braces are counted with strings, template literals and line comments
 * skipped, so a `{` inside a string cannot shift the depth.
 */
function defaultExportBody(src) {
  const m = src.match(/export default function\s+\w*\s*\([^)]*\)\s*\{/);
  if (!m) return null;
  const open = m.index + m[0].length - 1;
  let depth = 0;
  let i = open;
  const depths = [];
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      i += 1;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i += 1;
        i += 1;
      }
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
    } else if (c === '{') {
      depth += 1;
    } else if (c === '}') {
      depth -= 1;
      if (depth === 0) { depths.push([i, depth]); break; }
    }
    depths.push([i, depth]);
    i += 1;
  }
  if (depth > 0) return null; // unbalanced: say nothing rather than guess
  const body = src.slice(open, i + 1);
  // depth, relative to the body slice, at each character
  const depthAt = new Array(body.length).fill(0);
  for (const [abs, d] of depths) depthAt[abs - open] = d;
  return { body, depthAt, offset: open };
}

test('no page returns nothing on the server before it has said what it is', () => {
  const offenders = [];
  for (const rel of pageFiles()) {
    const src = withoutComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    const scope = defaultExportBody(src);
    if (!scope) continue;
    const { body, depthAt } = scope;
    // A page with no head at all is a different law's business.
    const head = headIndex(body);
    if (head === -1) continue;
    for (const { re, why } of SERVER_ALWAYS_TAKES) {
      const m = body.match(re);
      if (!m) continue;
      if (m.index > head) continue;          // head first: correct
      if (depthAt[m.index] !== 1) continue;  // nested in a helper, not the page
      offenders.push(`${rel}  (${why})`);
      break;
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'These pages return nothing from a branch the server always takes, and '
    + 'they do it before rendering their head. A crawler that does not run '
    + 'JavaScript gets an empty document with no title. Move the head above '
    + 'the guard: render it, then return the loading state.\n\nOffenders:\n  '
    + offenders.join('\n  '),
  );
});

test('the tour page resolves its identity on the server', () => {
  const src = fs.readFileSync(path.join(ROOT, 'pages/hub/tours/[code].js'), 'utf8');
  // Without a data function Next statically optimises the page, router.query
  // is empty during prerender and isReady is false, which is what made the
  // guard fatal in the first place. The head is built from props now.
  assert.match(src, /export async function getServerSideProps/);
  assert.match(src, /<TourPageSummary\b/);
  assert.match(src, /jsonLd=\{tourSchema\(seo\)\}/);
});
