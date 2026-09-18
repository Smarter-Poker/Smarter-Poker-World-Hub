/**
 * A PAGE HEAD IS NEVER BEHIND A CLIENT-ONLY WRAPPER (AEO phase 3,
 * 2026-09-17).
 *
 * PageTransition is loaded with dynamic(..., { ssr: false }). Anything
 * inside it is absent from the server-rendered HTML. pages/hub/news.js
 * already carried a comment saying exactly that, about its JSON-LD block,
 * and its own <SEOHead> sat inside the wrapper anyway.
 *
 * Measured on production as OAI-SearchBot, three pages the sitemap
 * promotes shipped no title, no description, no canonical and an empty
 * body:
 *
 *   /hub/news             priority 0.9    title: none    body: empty
 *   /hub/video-library    priority 0.8    title: none    body: empty
 *   /hub/preflop-charts   priority 0.7    title: none    body: empty
 *
 * The only thing in their <head> was the site-wide default from _app,
 * which says "Smarter.Poker" and nothing about the page. A sitemap entry
 * pointing at a page with no title is worse than no entry: it spends
 * crawl budget to teach an engine nothing.
 *
 * This test is a scanner, not a list. It walks every page, finds every
 * component the file loads with ssr:false, and fails if a <SEOHead> is
 * nested inside one of them. A fourth page cannot acquire the bug.
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
    else if (entry.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

/**
 * Comments are stripped before scanning. Several of these files explain the
 * trap in a comment that names the wrapper, and a scanner that reads its own
 * warning as the bug is a scanner nobody keeps.
 */
function withoutComments(src) {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Components this file loads with `dynamic(..., { ssr: false })`. */
function clientOnlyComponents(src) {
  return [...src.matchAll(/const (\w+) = dynamic\([\s\S]{0,300}?ssr:\s*false/g)].map((m) => m[1]);
}

test('no page puts its head inside a component that never renders on the server', () => {
  const offenders = [];
  for (const file of pageFiles()) {
    const src = withoutComments(read(file));
    if (!src.includes('<SEOHead')) continue;
    for (const component of clientOnlyComponents(src)) {
      for (const open of src.matchAll(new RegExp(`<${component}[\\s>]`, 'g'))) {
        const close = src.indexOf(`</${component}>`, open.index);
        if (close === -1) continue;
        if (src.slice(open.index, close).includes('<SEOHead')) {
          offenders.push(`${file}: <SEOHead> inside <${component}>, which is dynamic(ssr:false)`);
          break;
        }
      }
    }
  }
  assert.deepEqual(offenders, [], `a head behind a client-only wrapper never reaches a crawler:\n${offenders.join('\n')}`);
});

test('the three pages that shipped an empty body now say what they are', () => {
  const PAGES = {
    'pages/hub/news.js': 'news',
    'pages/hub/video-library.js': 'video-library',
    // /hub/preflop-charts re-exports this module.
    'pages/hub/memory-games.js': 'preflop-charts',
  };
  const summaries = read('src/components/seo/HubPageSummary.js');
  for (const [file, key] of Object.entries(PAGES)) {
    const src = read(file);
    assert.match(src, /import HubPageSummary from '[^']+HubPageSummary'/, `${file} imports the summary`);
    assert.ok(
      src.includes(`<HubPageSummary page="${key}" as="h1" />`),
      `${file} renders the ${key} summary as its h1`,
    );
    assert.ok(summaries.includes(`${key.includes('-') ? `'${key}'` : key}: {`), `HUB_PAGE_SUMMARIES has ${key}`);
    assert.match(src, /import \{ hubProductSchema \}/, `${file} ships structured data`);
    assert.match(src, /jsonLd=\{[A-Z_]+_SCHEMA\}/, `${file} passes that schema to SEOHead`);
  }
});

test('the preflop page stopped fetching a font sheet it does not use', () => {
  // next/font self-hosts Orbitron and Inter; the link was render blocking
  // and fetched nothing this page read (AEO phase 1).
  assert.doesNotMatch(read('pages/hub/memory-games.js'), /fonts\.googleapis\.com/);
});
