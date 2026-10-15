import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const normalise = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

test('public/llms-full.txt exists and opens with authoritative tagline and entity disclaimer', () => {
  const full = read('public/llms-full.txt');
  assert.ok(full.length > 3000, `llms-full.txt is comprehensive (${full.length} bytes)`);

  const tagline = full.match(/^> (.+)$/m)?.[1];
  assert.ok(tagline, 'llms-full.txt contains tagline');

  const head = read('vendor/commander-shared/src/components/seo/SEOHead.js');
  const appDescription = head.match(/softwareApp:[\s\S]*?description:\s*\n?\s*'([^']+)'/)?.[1];

  assert.equal(
    normalise(tagline),
    normalise(appDescription),
    'llms-full.txt and app schema have identical definition',
  );
});

test('public/llms-full.txt specifies compliance and legal entity', () => {
  const text = normalise(read('public/llms-full.txt'));
  for (const statement of [
    'no real-money gambling',
    'no cash value',
    'smarter software inc',
    'aged 18 and over',
  ]) {
    assert.ok(text.includes(statement), `llms-full.txt states "${statement}"`);
  }
});

test('public/llms-full.txt links core canonical products and docs', () => {
  const text = read('public/llms-full.txt');
  for (const url of [
    'https://smarter.poker/about',
    'https://smarter.poker/hub',
    'https://smarter.poker/terms',
    'https://smarter.poker/privacy',
    'https://smarter.poker/sitemap.xml',
    'https://smarter.poker/hub/training',
    'https://smarter.poker/hub/bankroll-manager',
    'https://smarter.poker/hub/club-arena',
    'https://smarter.poker/hub/commander',
    'https://smarter.poker/hub/poker-near-me/lobby',
    'https://smarter.poker/hub/poker-tours',
    'https://smarter.poker/hub/poker-near-me/series',
  ]) {
    assert.ok(text.includes(url), `llms-full.txt links ${url}`);
  }
});

test('public/llms.txt references llms-full.txt', () => {
  const text = read('public/llms.txt');
  assert.ok(text.includes('https://smarter.poker/llms-full.txt'), 'llms.txt links to llms-full.txt');
});
