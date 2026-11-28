/**
 * EVERY HUB SUMMARY CALL NAMES ITS PAGE (2026-11-28).
 *
 * HubPageSummary and HubPageSummarySchema take `page` (or `path`) and look
 * the copy up in HUB_PAGE_SUMMARIES. Anything else is ignored without a
 * warning: the lookup gets `undefined`, returns null, and the component
 * renders nothing at all.
 *
 * That is how /hub/poker-tools shipped `<HubPageSummary surface="poker-tools" />`.
 * The entry existed, the import existed, the JSX was on the page, and the
 * crawler summary was missing from the HTML. Nothing on screen changed, so
 * nobody saw it. A key that names no entry fails the same way.
 *
 * This law reads every call site in pages/ and src/ and requires:
 *   1. a `page` or `path` attribute, and no misspelled stand-in for it;
 *   2. when the value is a string literal, that it resolves to a real entry
 *      through the same resolver the component uses, and that the key is
 *      present in the copy the component renders.
 * A value that is an expression (path={canonicalPath}) cannot be resolved
 * from source, so it is only accepted beside a literal `page`, or when the
 * call sits behind `HUB_PAGE_SUMMARIES[<same expression>] &&` and the
 * expression's fixed prefix names real keys (the Poker Near Me tabs).
 *
 * Reads source files; runs in the Build Safety Gate with no install.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getHubPageSummary } from '../src/lib/seo/hubPageSummariesData.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT = 'src/components/seo/HubPageSummary.js';
const SCAN_DIRS = ['pages', 'src'];
const EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (EXTENSIONS.has(path.extname(entry.name))) out.push(rel);
  }
  return out;
}

/** Read the attributes of a JSX opening tag that starts at `start`. */
function readTag(src, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) {
      if (ch === quote && src[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

/** Return the end index (exclusive) of a balanced {...} starting at i. */
function braceEnd(s, i) {
  let depth = 0;
  for (let j = i; j < s.length; j += 1) {
    if (s[j] === '{') depth += 1;
    else if (s[j] === '}') {
      depth -= 1;
      if (depth === 0) return j + 1;
    }
  }
  return s.length;
}

function attributes(tag) {
  const attrs = {};
  const body = tag.replace(/^<[A-Za-z]+/, '').replace(/\/?>$/, '');
  let i = 0;
  while (i < body.length) {
    if (/\s/.test(body[i])) { i += 1; continue; }
    if (body[i] === '{') {
      const end = braceEnd(body, i);
      attrs['...spread'] = { raw: body.slice(i, end), literal: null };
      i = end;
      continue;
    }
    const nameMatch = body.slice(i).match(/^[A-Za-z_][\w-]*/);
    if (!nameMatch) { i += 1; continue; }
    const name = nameMatch[0];
    i += name.length;
    let raw = null;
    const eq = body.slice(i).match(/^\s*=\s*/);
    if (eq) {
      i += eq[0].length;
      if (body[i] === '"' || body[i] === "'") {
        const close = body.indexOf(body[i], i + 1);
        raw = body.slice(i, close + 1);
        i = close + 1;
      } else if (body[i] === '{') {
        const end = braceEnd(body, i);
        raw = body.slice(i, end);
        i = end;
      }
    }
    let literal = null;
    if (raw && /^["']/.test(raw)) literal = raw.slice(1, -1);
    else if (raw) {
      const inner = raw.slice(1, -1).trim().match(/^(["'`])([^"'`$]*)\1$/);
      if (inner) literal = inner[2];
    }
    attrs[name] = { raw, literal };
  }
  return attrs;
}

function callSites() {
  const sites = [];
  for (const file of SCAN_DIRS.flatMap((dir) => walk(dir))) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of src.matchAll(/<(HubPageSummary(?:Schema)?)(?=[\s/>])/g)) {
      const tag = readTag(src, m.index);
      const line = src.slice(0, m.index).split('\n').length;
      sites.push({ file, line, component: m[1], tag, attrs: attributes(tag) });
    }
  }
  return sites;
}

const componentSource = fs.readFileSync(path.join(ROOT, COMPONENT), 'utf8');
const componentKeys = new Set(
  [...componentSource.matchAll(/^ {2}'?([a-z0-9/-]+)'?: \{\s*$/gm)].map((m) => m[1]),
);

test('the scan finds the call sites it is meant to police', () => {
  const sites = callSites();
  assert.ok(sites.length >= 40, `expected the known call sites, found ${sites.length}`);
  assert.ok(sites.some((s) => s.component === 'HubPageSummarySchema'), 'schema-only calls are scanned too');
  assert.ok(
    sites.some((s) => s.file === path.join('pages', 'hub', 'poker-tools.js')),
    '/hub/poker-tools is one of them',
  );
});

test('every HubPageSummary and HubPageSummarySchema call passes page or path', () => {
  const allowed = new Set(['page', 'path', 'as', 'key']);
  const bad = [];
  for (const site of callSites()) {
    const names = Object.keys(site.attrs);
    if (!names.includes('page') && !names.includes('path')) {
      bad.push(`${site.file}:${site.line} ${site.tag.replace(/\s+/g, ' ')} passes neither page nor path`);
    }
    const unknown = names.filter((n) => !allowed.has(n));
    if (unknown.length) {
      bad.push(`${site.file}:${site.line} passes ${unknown.join(', ')}, which ${site.component} ignores`);
    }
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('every call resolves to a summary the component actually renders', () => {
  const bad = [];
  for (const site of callSites()) {
    const page = site.attrs.page;
    const p = site.attrs.path;
    // The component reads page first and falls back to path.
    const chosen = page || p;
    if (!chosen) continue; // reported by the test above
    if (chosen.literal == null) {
      // A computed key is accepted only when the call is guarded by a lookup
      // of the same expression in HUB_PAGE_SUMMARIES, so a miss renders
      // nothing on purpose, and only when its fixed prefix names real keys.
      const expr = chosen.raw.slice(1, -1).trim();
      const src = fs.readFileSync(path.join(ROOT, site.file), 'utf8');
      const before = src.slice(0, src.split('\n').slice(0, site.line - 1).join('\n').length + 1 + 200);
      const guarded = before.includes(`HUB_PAGE_SUMMARIES[${expr}] &&`);
      const prefix = (expr.match(/^`([^$`]*)\$\{/) || [])[1];
      const prefixed = prefix ? [...componentKeys].filter((k) => k.startsWith(prefix)) : [];
      if (guarded && prefixed.length > 0) continue;
      bad.push(`${site.file}:${site.line} ${chosen === page ? 'page' : 'path'}=${chosen.raw} cannot be resolved from source; pass a literal page`);
      continue;
    }
    const entry = getHubPageSummary(chosen.literal);
    if (!entry) {
      bad.push(`${site.file}:${site.line} "${chosen.literal}" resolves to no HUB_PAGE_SUMMARIES entry`);
      continue;
    }
    if (!entry.heading || !entry.lead) bad.push(`${site.file}:${site.line} "${chosen.literal}" has no heading or lead`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('the copy the data module resolves is the copy the component renders', () => {
  // Two copies of HUB_PAGE_SUMMARIES exist (the component's and the data
  // module the .md routes read). A key in one and not the other would make
  // the resolver above vouch for a call the component renders as nothing.
  const dataSource = fs.readFileSync(path.join(ROOT, 'src/lib/seo/hubPageSummariesData.js'), 'utf8');
  const dataKeys = [...dataSource.matchAll(/^ {2}'?([a-z0-9/-]+)'?: \{\s*$/gm)].map((m) => m[1]);
  const missing = dataKeys.filter((k) => !componentKeys.has(k));
  assert.deepEqual(missing, [], `keys the data module has and the component does not: ${missing.join(', ')}`);
});

test('/hub/poker-tools names its summary with page', () => {
  const src = fs.readFileSync(path.join(ROOT, 'pages/hub/poker-tools.js'), 'utf8');
  assert.match(src, /<HubPageSummary page="poker-tools" \/>/);
  assert.doesNotMatch(src, /<HubPageSummary[^>]*\bsurface=/);
});
