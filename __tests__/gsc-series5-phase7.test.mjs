/**
 * GSC & Organic Growth Series 5 — Phase 7 Tests
 * Verifies:
 *   1. Wordle-Style Shareable Spot Summary (buildOddsSpotSummary + Copy Spot
 *      Summary button) in src/lib/poker/oddsPermalink.js, pages/hub/poker-tools.js,
 *      and pages/tools/preflop-ranges/index.js
 *   2. Conversion Micro-CTAs linking anonymous calculator users to /hub/training
 *      ("Practice Spots Like This In The Free GTO Trainer") and /hub/bankroll-manager
 *      ("Track Sessions In Bankroll Manager")
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseCardListFromParam,
  buildOddsSpotSummary,
} from '../src/lib/poker/oddsPermalink.js';

const ROOT = process.cwd();

test('buildOddsSpotSummary formats multiway equity spots and pages/hub/poker-tools.js wires Copy Spot Summary + Conversion Micro-CTAs', () => {
  const hero = parseCardListFromParam('As,Ks');
  const villain = parseCardListFromParam('Qh,Qd');
  const board = parseCardListFromParam('10s,9s,2c');
  const summary = buildOddsSpotSummary({
    game: 'nlhe',
    hands: [hero, villain],
    board,
    results: [{ equity: 56.4 }, { equity: 43.6 }],
    url: 'https://smarter.poker/hub/poker-tools?game=nlhe&h0=As,Ks&h1=Qh,Qd&board=10s,9s,2c',
  });
  assert.match(summary, /Smarter\.Poker No-Limit Hold'em Equity Spot/);
  assert.match(summary, /Board: 10♠ 9♠ 2♣/);
  assert.match(summary, /Hero \[A♠ K♠\]: 56\.4%/);
  assert.match(summary, /Villain 1 \[Q♥ Q♦\]: 43\.6%/);
  assert.match(summary, /Run This Spot Free: https:\/\/smarter\.poker\/hub\/poker-tools/);

  const src = fs.readFileSync(path.join(ROOT, 'pages/hub/poker-tools.js'), 'utf8');
  assert.match(src, /buildOddsSpotSummary/);
  assert.match(src, /Copy Spot Summary/);
  assert.match(src, /Practice Spots Like This In The Free GTO Trainer/);
  assert.match(src, /Track Sessions In Bankroll Manager/);
  assert.match(src, /href="\/hub\/training"/);
  assert.match(src, /href="\/hub\/bankroll-manager"/);
});

test('pages/tools/preflop-ranges/index.js wires Copy Spot Summary button and Conversion Micro-CTA links', () => {
  const src = fs.readFileSync(path.join(ROOT, 'pages/tools/preflop-ranges/index.js'), 'utf8');
  assert.match(src, /copyRangeSpotSummary/);
  assert.match(src, /Copy Spot Summary/);
  assert.match(src, /Practice Spots Like This In The Free GTO Trainer/);
  assert.match(src, /Track Sessions In Bankroll Manager/);
  assert.match(src, /href="\/hub\/training"/);
  assert.match(src, /href="\/hub\/bankroll-manager"/);
  assert.ok(!src.includes('\u2014'), 'preflop-ranges/index.js must not contain literal em dashes');
});
