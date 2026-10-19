import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildRssFeedXml } from '../pages/feed.xml.js';

const ROOT = process.cwd();

test('buildRssFeedXml generates valid RSS 2.0 XML with channel metadata, atom:link, and items', () => {
  const xml = buildRssFeedXml();
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<rss version="2\.0" xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom">/);
  assert.match(xml, /<title>Smarter\.Poker Strategy, Tools &amp; Comparisons<\/title>/);
  assert.match(xml, /<link>https:\/\/smarter\.poker<\/link>/);
  assert.match(xml, /<atom:link href="https:\/\/smarter\.poker\/feed\.xml" rel="self" type="application\/rss\+xml" \/>/);

  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  assert.ok(itemMatches.length >= 50, `expected >= 50 RSS items, got ${itemMatches.length}`);

  for (const [, itemBody] of itemMatches) {
    assert.match(itemBody, /<title>[^<]+<\/title>/);
    assert.match(itemBody, /<link>https:\/\/smarter\.poker\/[^<]+<\/link>/);
    assert.match(itemBody, /<guid isPermaLink="true">https:\/\/smarter\.poker\/[^<]+<\/guid>/);
    assert.match(itemBody, /<pubDate>[^<]+<\/pubDate>/);
  }
});

test('pages/feed.xml.js wires sendSitemapXmlResponse for ETag, Last-Modified, and HTTP 304 support', () => {
  const src = fs.readFileSync(path.join(ROOT, 'pages/feed.xml.js'), 'utf8');
  assert.match(src, /sendSitemapXmlResponse/);
  assert.match(src, /res\.setHeader\('Content-Type',\s*'text\/xml'\)/);
});

test('SEOHead declares RSS 2.0 auto-discovery link on indexable pages', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'vendor/commander-shared/src/components/seo/SEOHead.js'),
    'utf8'
  );
  assert.match(
    src,
    /rel="alternate"\s+type="application\/rss\+xml"\s+title="Smarter\.Poker Strategy &amp; Tools RSS Feed"\s+href=\{`\$\{SITE_URL\}\/feed\.xml`\}/
  );
});
