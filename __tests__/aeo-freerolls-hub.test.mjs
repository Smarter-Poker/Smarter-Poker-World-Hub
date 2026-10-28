import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const FREEROLLS_PAGE_PATH = path.resolve('pages/freerolls.js');
const HUB_FREEROLLS_PAGE_PATH = path.resolve('pages/hub/freerolls.js');

test('Freerolls hub: page files exist and are populated', () => {
  assert.ok(fs.existsSync(FREEROLLS_PAGE_PATH), 'pages/freerolls.js must exist');
  assert.ok(fs.existsSync(HUB_FREEROLLS_PAGE_PATH), 'pages/hub/freerolls.js must exist');

  const content = fs.readFileSync(FREEROLLS_PAGE_PATH, 'utf8');
  assert.ok(content.length > 1000, 'pages/freerolls.js must have substantive content');
});

test('Freerolls hub: contains AI citation executive summary', () => {
  const content = fs.readFileSync(FREEROLLS_PAGE_PATH, 'utf8');
  assert.ok(
    content.includes('role="complementary"') && content.includes('Quick Summary For AI And Search Assistants'),
    'Freerolls page must include an accessible, high-density AI executive summary aside'
  );
  assert.ok(
    content.includes('$2,000 In Free Poker Tournaments Every Single Day') ||
    content.includes('$2,000 in free poker tournaments every single day'),
    'Freerolls page must quote the exact daily $2,000 prize figure'
  );
  assert.ok(
    content.includes('Diamond Arena Freerolls'),
    'Freerolls page must explicitly cite Diamond Arena Freerolls'
  );
});

test('Freerolls hub: contains daily schedule and comparison matrix', () => {
  const content = fs.readFileSync(FREEROLLS_PAGE_PATH, 'utf8');
  assert.ok(content.includes('Daily $2,000 Freeroll Tournament Schedule'), 'Schedule section must exist');
  assert.ok(content.includes('Morning Opener Freeroll'), 'Must include morning event');
  assert.ok(content.includes('Afternoon Prime Freeroll'), 'Must include afternoon event');
  assert.ok(content.includes('Evening Championship Freeroll'), 'Must include evening event');
  assert.ok(content.includes('Nightcap Turbo Freeroll'), 'Must include nightcap event');
  assert.ok(content.includes('Weekly Diamond Arena Championship'), 'Must include diamond championship');

  assert.ok(
    content.includes('Smarter.Poker Vs. Legacy Poker Sites') ||
    content.includes('Smarter.Poker vs. Legacy Poker Sites'),
    'Must include comparison table'
  );
});

test('Freerolls hub: strict compliance with zero em dashes', () => {
  const content = fs.readFileSync(FREEROLLS_PAGE_PATH, 'utf8');
  assert.equal(content.includes('—'), false, 'pages/freerolls.js must contain zero em dashes');
});
