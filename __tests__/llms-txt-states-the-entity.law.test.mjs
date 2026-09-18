/**
 * LLMS.TXT STATES THE ENTITY (AEO phase 3, 2026-09-17).
 *
 * /llms.txt is the one file on the site an AI tool reads whole and
 * verbatim, and it was the one surface still describing the platform in
 * the old words: "the ultimate poker platform ... 13+ integrated orbs".
 * It never said the thing that matters most about this business, which is
 * that there is no real-money gambling on it, never named the legal
 * entity, and linked neither the About page nor the glossary.
 *
 * An engine repeats the definition it meets most often. The landing page,
 * the hub summaries and the SoftwareApplication node already say the same
 * sentence; this pins that llms.txt says it too, word for word, so the
 * four cannot drift apart. It also pins the compliance statement and the
 * links a reader needs to go anywhere else.
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
const normalise = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

test('the tagline is the definition the rest of the site gives, word for word', () => {
  const llms = read('public/llms.txt');
  const tagline = llms.match(/^> (.+)$/m)?.[1];
  assert.ok(tagline, 'llms.txt opens with a tagline');

  const head = read('vendor/commander-shared/src/components/seo/SEOHead.js');
  const appDescription = head
    .match(/softwareApp:[\s\S]*?description:\s*\n?\s*'([^']+)'/)?.[1];
  assert.ok(appDescription, 'the SoftwareApplication node carries a description');

  assert.equal(
    normalise(tagline),
    normalise(appDescription),
    'llms.txt and the app schema must give the same definition',
  );
});

test('it says what the platform is not, and who runs it', () => {
  const llms = normalise(read('public/llms.txt'));
  for (const claim of [
    'no real-money gambling',
    'no cash value',
    'smarter software inc',
    'aged 18 and over',
  ]) {
    assert.ok(llms.includes(claim), `llms.txt states "${claim}"`);
  }
});

test('a reader can get anywhere else from it', () => {
  const llms = read('public/llms.txt');
  for (const url of [
    'https://smarter.poker/about',
    'https://smarter.poker/hub',
    'https://smarter.poker/terms',
    'https://smarter.poker/privacy',
    'https://smarter.poker/sitemap.xml',
    'https://smarter.poker/hub/club-arena/sitemap.xml',
    'https://smarter.poker/hub/training/glossary',
  ]) {
    assert.ok(llms.includes(url), `llms.txt links ${url}`);
  }
});

test('every link it gives is ours, and every one of them is https', () => {
  const llms = read('public/llms.txt');
  const urls = [...llms.matchAll(/https?:\/\/[^\s)>\]]+/g)].map((m) => m[0].replace(/[),.;:]+$/, ''));
  assert.ok(urls.length >= 15, `${urls.length} links is a thin map of the site`);
  for (const url of urls) {
    assert.ok(url.startsWith('https://'), `${url} is https`);
    const host = new URL(url).host;
    assert.ok(
      host === 'smarter.poker' || host === 'github.com',
      `${host} is a host we control or publish on`,
    );
  }
  // A link that does not exist is worse than no link: an engine reads this
  // file as a map. Every hub path here must be one the sitemap promotes.
  const sitemap = read('pages/sitemap.xml.js');
  for (const url of urls) {
    const p = new URL(url).pathname;
    if (!p.startsWith('/hub') || p.endsWith('.xml')) continue;
    if (p.startsWith('/hub/club-arena')) continue; // served by the arena build
    assert.ok(sitemap.includes(`path: '${p}'`), `the sitemap does not list ${p}`);
  }
});
