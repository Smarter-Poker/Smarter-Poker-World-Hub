/**
 * THE SUMMARY CARRIES THE SCHEMA (AEO phase 3, 2026-09-17).
 *
 * Twenty five routes ended the evening with real copy, a title that fits a
 * result, and no structured data at all. Words tell an engine what a page
 * says; schema tells it what the page IS. Writing twenty five graphs by
 * hand would have been twenty five chances for the schema and the copy to
 * drift apart, and the drift is invisible: nothing on screen changes when
 * a description in a JSON-LD block stops matching the paragraph above it.
 *
 * So the graph is built from the copy. The name is the summary's heading
 * with "About " removed, the description is its lead, and there is only
 * one copy of the sentence.
 *
 * This law imports the builder and reads what it actually produces, rather
 * than pattern matching the source, which is why the builder is plain
 * JavaScript in src/lib/seo rather than JSX.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarySchema, SCHEMA_ROUTES } from '../src/lib/seo/summarySchema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

/** The summary entries, read out of the component source. */
function entries() {
  const src = read('src/components/seo/HubPageSummary.js');
  const out = {};
  for (const m of src.matchAll(/^ {2}'?([a-z-]+)'?: \{\n\s*heading:\s*'([^']+)',\n\s*lead:\s*\n?\s*'([^']+)'/gm)) {
    out[m[1]] = { heading: m[2], lead: m[3] };
  }
  return out;
}

test('every route in the schema map has copy to build from', () => {
  const summaries = entries();
  const missing = Object.keys(SCHEMA_ROUTES).filter((key) => !summaries[key]);
  assert.deepEqual(missing, [], `these keys have schema and no copy: ${missing.join(', ')}`);
});

test('each graph is valid, complete and about the right page', () => {
  const summaries = entries();
  const seen = new Set();
  for (const [key, route] of Object.entries(SCHEMA_ROUTES)) {
    const graph = summarySchema(key, summaries[key]);
    assert.ok(graph, `${key} produces a graph`);
    assert.equal(graph['@context'], 'https://schema.org');
    assert.ok(Array.isArray(graph['@graph']) && graph['@graph'].length >= 1, `${key} has nodes`);

    // It must survive being serialised into a script tag.
    const json = JSON.stringify(graph);
    assert.doesNotThrow(() => JSON.parse(json), `${key} serialises`);

    const page = graph['@graph'][0];
    assert.match(page['@id'], new RegExp(`${route.path.replace(/\//g, '\\/')}#page$`), `${key} is about its own route`);
    assert.ok(!seen.has(page['@id']), `${page['@id']} is claimed twice`);
    seen.add(page['@id']);

    // The description is the copy, not a second version of it.
    assert.equal(page.description, summaries[key].lead, `${key} describes itself in its own words`);
    assert.ok(page.name.endsWith(' | Smarter.Poker'), `${key} names the site once`);
    assert.doesNotMatch(page.name, /^About /, `${key} drops the "About" from the heading`);

    // It joins the site graph rather than starting another one.
    assert.equal(page.isPartOf['@id'], 'https://smarter.poker/#website', `${key} is part of the WebSite`);
  }
});

test('the Club Commander pages do not publish two breadcrumb trails', () => {
  // They already ship commanderBreadcrumbs through SEOHead.
  for (const key of Object.keys(SCHEMA_ROUTES)) {
    if (!key.startsWith('commander-')) continue;
    const types = summarySchema(key, { heading: 'About X', lead: 'y' })['@graph'].map((n) => n['@type']);
    assert.ok(!types.includes('BreadcrumbList'), `${key} must not add a second trail`);
  }
  // And everything else does carry one, because a deep page has to say
  // where it sits.
  for (const key of Object.keys(SCHEMA_ROUTES)) {
    if (key.startsWith('commander-')) continue;
    const types = summarySchema(key, { heading: 'About X', lead: 'y' })['@graph'].map((n) => n['@type']);
    assert.ok(types.includes('BreadcrumbList'), `${key} says where it sits`);
  }
});

test('a page that already publishes a graph is not given a second one by accident', () => {
  // Two ld+json blocks on one page are legal and engines merge them, but
  // two of the SAME node is not. A key belongs in the map only if its page
  // ships no jsonLd of its own, or if the map knows it does and stands down
  // from the part that would collide (breadcrumb: false).
  const offenders = [];
  const pagesDir = path.join(ROOT, 'pages');
  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'api' || e.name === 'node_modules') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
  };
  for (const file of walk(pagesDir)) {
    const src = fs.readFileSync(file, 'utf8');
    const rendered = [...src.matchAll(/<HubPageSummary page="([a-z-]+)"/g)].map((m) => m[1]);
    if (!rendered.length) continue;
    const hasOwnJsonLd = /jsonLd=\{/.test(src);
    for (const key of new Set(rendered)) {
      const route = SCHEMA_ROUTES[key];
      if (!route) continue;
      if (hasOwnJsonLd && route.breadcrumb !== false) {
        offenders.push(
          `${path.relative(ROOT, file)} ships its own jsonLd, and ${key} adds a full graph on top of it`,
        );
      }
    }
  }
  assert.deepEqual(offenders, [], `two graphs on one page:\n${offenders.join('\n')}`);
});

test('the component renders the graph it builds', () => {
  const src = read('src/components/seo/HubPageSummary.js');
  assert.match(src, /import \{ summarySchema \}/, 'it imports the builder');
  assert.match(src, /const schema = summarySchema\(page, entry\)/, 'it builds one');
  assert.match(src, /type="application\/ld\+json"/, 'and renders it');
  assert.match(src, /replace\(\/<\/g, '\\\\u003c'\)/, 'escaping any less-than so a caption cannot break out');
});
