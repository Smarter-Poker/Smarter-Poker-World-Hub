import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildFreerollGoogleCalendarUrl } from '../src/lib/poker-near-me/calendarExport.mjs';

test('AEO Deep Dive: Compare Hub renders persistent DOM tables and semantic details FAQs', () => {
  const filePath = path.resolve('pages/compare/index.js');
  assert.ok(fs.existsSync(filePath), 'pages/compare/index.js must exist');
  const content = fs.readFileSync(filePath, 'utf8');

  // Must have isVisible helper to render all 4 sections in DOM
  assert.ok(content.includes('isVisible'), 'Must include isVisible helper for SSR persistence');
  assert.ok(content.includes('id="freerolls"'), 'Must include id="freerolls"');
  assert.ok(content.includes('id="icm"'), 'Must include id="icm"');
  assert.ok(content.includes('id="odds"'), 'Must include id="odds"');
  assert.ok(content.includes('id="directory"'), 'Must include id="directory"');

  // Must include View All Comparisons tab
  assert.ok(content.includes('View All Comparisons'), 'Must include View All Comparisons button');

  // Must use native semantic details and summary elements for 100% server HTML presence
  assert.ok(content.includes('<details'), 'Must use native semantic details element');
  assert.ok(content.includes('<summary'), 'Must use native semantic summary element');
});

test('AEO Deep Dive: Freerolls Hub includes live countdown, tournament deep-links, and semantic FAQs', () => {
  const filePath = path.resolve('pages/freerolls.js');
  assert.ok(fs.existsSync(filePath), 'pages/freerolls.js must exist');
  const content = fs.readFileSync(filePath, 'utf8');

  // Must include NextFreerollCountdown component
  assert.ok(content.includes('NextFreerollCountdown'), 'Must include NextFreerollCountdown');
  assert.ok(content.includes('America/Chicago'), 'Countdown must calculate based on America/Chicago timezone');

  // Must link directly to tournament mode
  assert.ok(content.includes('/hub/club-arena?mode=tournament'), 'Must deep-link to tournament mode');

  // Must include Google Calendar web intent link
  assert.ok(content.includes('calendar.google.com/calendar/render'), 'Must include Google Calendar web intent link');

  // Must use semantic details and summary for FAQs
  assert.ok(content.includes('<details'), 'Must use semantic details element');
  assert.ok(content.includes('<summary'), 'Must use semantic summary element');
});

test('AEO Deep Dive: buildFreerollGoogleCalendarUrl helper works correctly', () => {
  const url = buildFreerollGoogleCalendarUrl();
  assert.ok(url.startsWith('https://calendar.google.com/calendar/render?'), 'Must return valid Google Calendar intent URL');
  assert.ok(url.includes('RRULE%3AFREQ%3DDAILY') || url.includes('RRULE:FREQ=DAILY'), 'Must specify daily recurrence');
  assert.ok(url.includes('Smarter.Poker'), 'Must mention Smarter.Poker');
});

test('AEO Deep Dive: AI Crawlers and Discovery manifests ground Freerolls and Comparisons', () => {
  // public/llms.txt
  const llmsTxt = fs.readFileSync(path.resolve('public/llms.txt'), 'utf8');
  assert.ok(llmsTxt.includes('https://smarter.poker/freerolls'), 'llms.txt must include freerolls url');
  assert.ok(llmsTxt.includes('https://smarter.poker/compare'), 'llms.txt must include compare url');
  assert.ok(llmsTxt.includes('$2,000'), 'llms.txt must include $2,000 guarantee');
  assert.ok(llmsTxt.includes('https://smarter.poker/openapi.json'), 'llms.txt must reference root openapi alias');

  // public/llms-full.txt
  const llmsFullTxt = fs.readFileSync(path.resolve('public/llms-full.txt'), 'utf8');
  assert.ok(llmsFullTxt.includes('https://smarter.poker/freerolls'), 'llms-full.txt must include freerolls url');
  assert.ok(llmsFullTxt.includes('https://smarter.poker/compare'), 'llms-full.txt must include compare url');
  assert.ok(llmsFullTxt.includes('Daily $2,000 Freerolls'), 'llms-full.txt must have freerolls section');

  // public/ai.txt
  const aiTxt = fs.readFileSync(path.resolve('public/ai.txt'), 'utf8');
  assert.ok(aiTxt.includes('Allow: /freerolls.md'), 'ai.txt must allow freerolls.md');
  assert.ok(aiTxt.includes('Allow: /freerolls.ics'), 'ai.txt must allow freerolls.ics');
  assert.ok(aiTxt.includes('Allow: /openapi.json'), 'ai.txt must allow openapi.json');
  assert.ok(!aiTxt.includes('—'), 'ai.txt must not contain em dashes');

  // public/.well-known/ai-plugin.json
  const pluginJson = JSON.parse(fs.readFileSync(path.resolve('public/.well-known/ai-plugin.json'), 'utf8'));
  assert.ok(pluginJson.api.url.includes('openapi.json'), 'ai-plugin.json must point to openapi specification');
  assert.ok(pluginJson.description_for_model.includes('freeroll'), 'description_for_model must mention freerolls');
});

test('AEO Deep Dive: next.config.js includes clean root openapi rewrite', () => {
  const nextConfig = fs.readFileSync(path.resolve('next.config.js'), 'utf8');
  assert.ok(
    nextConfig.includes("source: '/openapi.json'") && nextConfig.includes("destination: '/api/openapi.json'"),
    'next.config.js must rewrite /openapi.json to /api/openapi.json'
  );
});
