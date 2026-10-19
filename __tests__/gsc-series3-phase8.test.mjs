import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STATIC_PAGES } from '../src/lib/seo/sitemapBuilders.mjs';

const ROOT = process.cwd();

test('Phase 8: Webmaster embed portal page exists on disk', () => {
  const filePath = join(ROOT, 'pages/tools/embeds.js');
  assert.ok(existsSync(filePath), 'pages/tools/embeds.js must exist');
});

test('Phase 8: Webmaster embed portal includes embed snippets for tools', () => {
  const content = readFileSync(join(ROOT, 'pages/tools/embeds.js'), 'utf8');
  assert.ok(content.includes('odds-calculator'), 'Must include Multiway Poker Odds Calculator widget');
  assert.ok(content.includes('icm-calculator'), 'Must include Tournament ICM Calculator widget');
  assert.ok(content.includes('preflop-ranges'), 'Must include GTO Preflop Range Matrix widget');
  assert.ok(content.includes('<iframe src='), 'Must provide iframe embed snippets');
  assert.ok(content.includes('Powered By <a href='), 'Must include attribution backlink in embed code');
  assert.ok(content.includes('https://smarter.poker/tools/embeds'), 'Must declare canonical url');
});

test('Phase 8: STATIC_PAGES and sitemap register /tools/embeds', () => {
  const entry = STATIC_PAGES.find((p) => p.path === '/tools/embeds');
  assert.ok(entry, 'STATIC_PAGES must include /tools/embeds');
  assert.equal(entry.priority, '0.8');

  const sitemapXmlContent = readFileSync(join(ROOT, 'pages/sitemap.xml.js'), 'utf8');
  assert.ok(sitemapXmlContent.includes('/tools/embeds'), 'pages/sitemap.xml.js must list /tools/embeds');
});
