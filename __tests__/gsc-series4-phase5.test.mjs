import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeSitemapEtag,
  extractLatestLastmodHttpDate,
  sendSitemapXmlResponse,
  generateSitemapIndexXml,
} from '../src/lib/seo/sitemapBuilders.mjs';

const ROOT = process.cwd();

function createMockRes() {
  const headers = {};
  let body = '';
  return {
    statusCode: 200,
    ended: false,
    setHeader(name, value) {
      headers[name] = value;
    },
    getHeader(name) {
      return headers[name];
    },
    write(chunk) {
      body += chunk;
    },
    end() {
      this.ended = true;
    },
    getHeaders() {
      return headers;
    },
    getBody() {
      return body;
    },
  };
}

test('computeSitemapEtag produces deterministic quoted SHA-256 ETag string', () => {
  const xml = generateSitemapIndexXml([{ loc: '/sitemap-core.xml', lastmod: '2026-10-15' }]);
  const etag1 = computeSitemapEtag(xml);
  const etag2 = computeSitemapEtag(xml);
  assert.equal(etag1, etag2);
  assert.match(etag1, /^"[0-9a-f]{32}"$/);
});

test('extractLatestLastmodHttpDate extracts the latest <lastmod> date as RFC-7231 HTTP-date', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://smarter.poker/a</loc><lastmod>2026-09-01</lastmod></url>
  <url><loc>https://smarter.poker/b</loc><lastmod>2026-10-15</lastmod></url>
  <url><loc>https://smarter.poker/c</loc><lastmod>2026-10-10</lastmod></url>
</urlset>`;
  const httpDate = extractLatestLastmodHttpDate(xml);
  assert.equal(httpDate, new Date('2026-10-15T00:00:00.000Z').toUTCString());
});

test('sendSitemapXmlResponse returns 200 with ETag and Last-Modified headers on initial request', () => {
  const xml = generateSitemapIndexXml([{ loc: '/sitemap-core.xml', lastmod: '2026-10-15' }]);
  const req = { headers: {} };
  const res = createMockRes();
  const notModified = sendSitemapXmlResponse(req, res, xml);

  assert.equal(res.statusCode, 200);
  assert.equal(notModified, false);
  assert.equal(res.getHeader('ETag'), computeSitemapEtag(xml));
  assert.equal(res.getHeader('Last-Modified'), extractLatestLastmodHttpDate(xml));
  assert.equal(res.getBody(), xml);
  assert.equal(res.ended, true);
});

test('sendSitemapXmlResponse returns 304 Not Modified with empty body when If-None-Match matches ETag', () => {
  const xml = generateSitemapIndexXml([{ loc: '/sitemap-core.xml', lastmod: '2026-10-15' }]);
  const etag = computeSitemapEtag(xml);
  const req = { headers: { 'if-none-match': etag } };
  const res = createMockRes();
  const notModified = sendSitemapXmlResponse(req, res, xml);

  assert.equal(res.statusCode, 304);
  assert.equal(notModified, true);
  assert.equal(res.getHeader('ETag'), etag);
  assert.equal(res.getBody(), '');
  assert.equal(res.ended, true);
});

test('sendSitemapXmlResponse returns 304 Not Modified when If-Modified-Since is >= Last-Modified', () => {
  const xml = generateSitemapIndexXml([{ loc: '/sitemap-core.xml', lastmod: '2026-10-15' }]);
  const req = {
    headers: {
      'if-modified-since': new Date('2026-10-16T00:00:00.000Z').toUTCString(),
    },
  };
  const res = createMockRes();
  const notModified = sendSitemapXmlResponse(req, res, xml);

  assert.equal(res.statusCode, 304);
  assert.equal(notModified, true);
  assert.equal(res.getBody(), '');
  assert.equal(res.ended, true);
});

test('all 9 sitemap Next.js routes wire sendSitemapXmlResponse for ETag / Last-Modified / 304 support', () => {
  const routes = [
    'pages/sitemap_index.xml.js',
    'pages/sitemap-core.xml.js',
    'pages/sitemap-compare.xml.js',
    'pages/sitemap-learn.xml.js',
    'pages/sitemap-venues.xml.js',
    'pages/sitemap-tournaments.xml.js',
    'pages/sitemap-series.xml.js',
    'pages/sitemap-videos.xml.js',
    'pages/sitemap.xml.js',
  ];
  for (const rel of routes) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(
      src.includes('sendSitemapXmlResponse'),
      `${rel} must invoke sendSitemapXmlResponse`
    );
  }
});
