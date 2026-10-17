import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('poker-tools contains valid WebApplication and SoftwareApplication schema with FAQs', () => {
  const pokerToolsPath = path.resolve(process.cwd(), 'pages/hub/poker-tools.js');
  const code = fs.readFileSync(pokerToolsPath, 'utf8');

  assert.ok(code.includes('ODDS_CALCULATOR_SCHEMA'), 'Must define ODDS_CALCULATOR_SCHEMA');
  assert.ok(code.includes('hubProductSchema'), 'Must use hubProductSchema helper');
  assert.ok(code.includes("path: '/hub/poker-tools'"), 'Must declare /hub/poker-tools path');
  assert.ok(code.includes('SEOHead'), 'Must render SEOHead');
  assert.ok(code.includes('HubPageSummary'), 'Must include HubPageSummary crawler copy');
  assert.ok(code.includes('How does the Smarter.Poker Odds Calculator compute equity?'), 'Must have FAQ questions');
});

test('icm-calculator contains valid SoftwareApplication and FAQ schema', () => {
  const icmPath = path.resolve(process.cwd(), 'pages/hub/training/icm-calculator.js');
  const code = fs.readFileSync(icmPath, 'utf8');

  assert.ok(code.includes('ICM_CALCULATOR_SCHEMA'), 'Must define ICM_CALCULATOR_SCHEMA');
  assert.ok(code.includes('hubProductSchema'), 'Must use hubProductSchema helper');
  assert.ok(code.includes("path: '/hub/training/icm-calculator'"), 'Must declare path');
  assert.ok(code.includes('SEOHead'), 'Must render SEOHead');
  assert.ok(code.includes('What is ICM in tournament poker?'), 'Must have tournament ICM FAQs');
});

test('bankroll-manager contains enhanced bankroll and Kelly criterion FAQs', () => {
  const bankrollPath = path.resolve(process.cwd(), 'pages/hub/bankroll-manager.js');
  const code = fs.readFileSync(bankrollPath, 'utf8');

  assert.ok(code.includes('What is the Kelly Criterion in poker bankroll management?'), 'Must have Kelly Criterion FAQ');
  assert.ok(code.includes('How do bankroll requirements differ between cash games and tournaments?'), 'Must have buy-in requirements FAQ');
});

test('preflop charts schema contains push/fold guidance', () => {
  const memoryGamesPath = path.resolve(process.cwd(), 'pages/hub/memory-games.js');
  const code = fs.readFileSync(memoryGamesPath, 'utf8');

  assert.ok(code.includes('What is a push/fold chart in tournament poker?'), 'Must have push/fold FAQ');
});

test('sitemap.xml lists all interactive calculator surfaces', () => {
  const sitemapPath = path.resolve(process.cwd(), 'pages/sitemap.xml.js');
  const code = fs.readFileSync(sitemapPath, 'utf8');

  assert.ok(code.includes("path: '/hub/poker-tools'"), 'Sitemap must list /hub/poker-tools');
  assert.ok(code.includes("path: '/hub/training/icm-calculator'"), 'Sitemap must list /hub/training/icm-calculator');
  assert.ok(code.includes("path: '/hub/training/equity-calculator'"), 'Sitemap must list /hub/training/equity-calculator');
  assert.ok(code.includes("path: '/hub/preflop-charts'"), 'Sitemap must list /hub/preflop-charts');
  assert.ok(code.includes("path: '/hub/bankroll-manager'"), 'Sitemap must list /hub/bankroll-manager');
});
