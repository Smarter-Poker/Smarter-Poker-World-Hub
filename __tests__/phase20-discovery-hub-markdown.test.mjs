import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  renderDailyTournamentsMarkdown,
  renderEventsCalendarMarkdown,
  renderPokerToursMarkdown,
  renderPokerSeriesMarkdown,
  renderPokerNearMeMarkdown,
} from '../src/lib/seo/markdownIngestion.mjs';
import handler from '../pages/api/discovery-markdown.js';

function createMockRes() {
  const headers = {};
  let statusCode = 200;
  let body = '';
  return {
    headers,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    setHeader(k, v) {
      headers[k] = v;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    send(payload) {
      body = payload;
      return this;
    },
  };
}

test('Phase 20: discovery hub markdown renderers emit clean Title Case Markdown without em dashes', () => {
  const docs = [
    renderDailyTournamentsMarkdown(),
    renderEventsCalendarMarkdown(),
    renderPokerToursMarkdown(),
    renderPokerSeriesMarkdown(),
    renderPokerNearMeMarkdown({ canonicalUrl: 'https://smarter.poker/hub/poker-near-me/venues' }),
  ];

  for (const md of docs) {
    assert.ok(md.length > 500, 'Markdown output must be comprehensive');
    assert.ok(!md.includes('—'), 'Markdown output must not contain em dashes');
    assert.ok(md.includes('https://smarter.poker/hub/'), 'Markdown output must include canonical hub links');
  }
});

test('Phase 20: /api/discovery-markdown serves all 5 discovery hubs with text/markdown Content-Type', () => {
  const slugs = ['daily-tournaments', 'events-calendar', 'poker-tours', 'poker-series', 'venues'];
  for (const slug of slugs) {
    const res = createMockRes();
    handler({ query: { slug } }, res);
    assert.equal(res.statusCode, 200, `slug=${slug} should return 200`);
    assert.equal(res.headers['Content-Type'], 'text/markdown; charset=utf-8');
    assert.ok(res.body.startsWith('# Smarter.Poker '), `slug=${slug} should start with H1`);
  }

  const res404 = createMockRes();
  handler({ query: { slug: 'nonexistent-hub' } }, res404);
  assert.equal(res404.statusCode, 404);
});

test('Phase 20: next.config.js rewrites discovery hub .md URLs and SEOHead maps alternate links', () => {
  const nextConfig = fs.readFileSync(path.resolve('next.config.js'), 'utf8');
  for (const route of [
    '/hub/daily-tournaments.md',
    '/hub/events-calendar.md',
    '/hub/poker-tours.md',
    '/hub/poker-series.md',
    '/hub/poker-near-me/venues.md',
  ]) {
    assert.ok(nextConfig.includes(`source: '${route}'`), `next.config.js must rewrite ${route}`);
  }

  const seoHead = fs.readFileSync(path.resolve('src/components/seo/SEOHead.js'), 'utf8');
  assert.ok(seoHead.includes("pathname === '/hub/daily-tournaments'"));
  assert.ok(seoHead.includes("pathname === '/hub/events-calendar'"));
  assert.ok(seoHead.includes("pathname === '/hub/poker-tours'"));
  assert.ok(seoHead.includes("pathname === '/hub/poker-series'"));
  assert.ok(seoHead.includes("https://smarter.poker/hub/poker-near-me/venues.md"));
});
