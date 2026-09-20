/**
 * TWO PAGES NEVER SHARE A TITLE (AEO phase 3, 2026-09-18).
 *
 * #1894 shortened the eleven Poker Near Me tab titles so they would fit a
 * result. One of them, the venues tab, came out as exactly the string
 * /hub/poker-near-me/lobby already used:
 *
 *     Poker Near Me: Live Poker Rooms And Casinos
 *
 * Two different pages, in the sitemap, competing for the same result with
 * the same words. Fixing a title is not free: it can collide with another.
 *
 * This walks the literal titles a page can ship and fails when two pages
 * would send the same one. It cannot see titles built from data at request
 * time, which is a real limit and is why the full sweep of production is
 * still the thing that finds these; what it does catch is the case where
 * two files are written with the same string, which is what happened.
 *
 * Reads source files; runs in the Build Safety Gate with no install.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function pageFiles(dir = 'pages', out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === 'api' || entry.name === 'node_modules') continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) pageFiles(rel, out);
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

function withoutComments(src) {
  return src
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*'));
    })
    .join('\n');
}

/** Unconditionally noindex: no result to compete for. */
function alwaysNoindex(src) {
  if (/content="noindex/.test(src)) return true;
  const m = src.match(/<SEOHead[\s\S]{0,600}?\bnoindex\b(\s*=\s*\{([^}]*)\})?/);
  if (!m) return false;
  if (m[1] === undefined) return true;
  return m[2].trim() === 'true';
}

/**
 * The titles a page can ship: written inline, or held in a metadata table
 * one import away, which is where the colliding one lived.
 */
function titlesFor(file, src) {
  const out = [...src.matchAll(/<SEOHead[\s\S]{0,600}?title="([^"]+)"/g)].map((m) => m[1]);
  if (/<SEOHead[\s\S]{0,600}?title=\{/.test(src)) {
    for (const imp of src.matchAll(/^import\s+(?:[\w*{},\s]+)\s+from\s+'(\.[^']+)'/gm)) {
      const base = path.posix.join(path.posix.dirname(file), imp[1]);
      for (const cand of [base, `${base}.js`, `${base}.jsx`, `${base}/index.js`]) {
        let mod;
        try {
          if (!fs.statSync(path.join(ROOT, cand)).isFile()) continue;
          mod = read(cand);
        } catch { continue; }
        for (const t of mod.matchAll(/\btitle:\s*'([^']{5,})'/g)) {
          const window = mod.slice(t.index, t.index + 300);
          if (/\bdescription:\s*\n?\s*'/.test(window)) out.push(t[1]);
        }
        break;
      }
    }
  }
  return out;
}

test('no two indexable pages ship the same literal title', () => {
  const owners = new Map();
  for (const file of pageFiles()) {
    const src = withoutComments(read(file));
    if (alwaysNoindex(src)) continue;
    for (const title of new Set(titlesFor(file, src))) {
      if (!owners.has(title)) owners.set(title, new Set());
      owners.get(title).add(file);
    }
  }
  const collisions = [...owners.entries()]
    .filter(([, files]) => files.size > 1)
    .map(([title, files]) => `"${title}"\n      ${[...files].join('\n      ')}`);

  assert.deepEqual(
    collisions,
    [],
    'These pages ship the same title, so they compete for the same result '
    + 'with the same words and an engine has no way to tell which one it '
    + 'wants. Give each page a title that says what that page is.\n\n  '
    + collisions.join('\n  '),
  );
});
