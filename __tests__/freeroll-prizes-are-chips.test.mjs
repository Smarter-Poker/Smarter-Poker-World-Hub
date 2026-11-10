// Owner rule (Dan, 2026-11-09): freeroll prizes are chips, not money. A dollar
// sign must never be attached to a Smarter.Poker freeroll prize, and freeroll
// prizes must never be described as cash. This test fails the build if either
// comes back on any public freeroll surface.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SURFACES = [
  'pages/freerolls.js',
  'pages/about.js',
  'pages/404.js',
  'pages/compare/index.js',
  'pages/features/index.js',
  'pages/feed.xml.js',
  'pages/hub/daily-tournaments.js',
  'pages/hub/poker-tools.js',
  'pages/hub/tournaments/this-weekend.js',
  'pages/hub/training/icm-calculator.js',
  'pages/tools/embeds.js',
  'pages/tools/preflop-ranges/index.js',
  'pages/api/ai/freerolls.js',
  'pages/api/calendar/freerolls.ics.js',
  'pages/api/hub-tool-markdown.js',
  'pages/api/og/tool-card.js',
  'public/.well-known/ai-plugin.json',
  'public/api/openapi.json',
  'public/llms.txt',
  'public/llms-full.txt',
  'src/components/landing/LandingProductSummary.js',
  'src/config/hamburgerMenus.js',
  'src/content/glossary/terms.js',
  'src/content/research/reports.js',
  'src/lib/mcp/mcpServer.mjs',
  'src/lib/poker-near-me/calendarExport.mjs',
  'src/lib/seo/hubPageSchema.js',
  'src/lib/seo/markdownIngestion.mjs',
];

// A dollar figure used as a freeroll prize: the daily total, the monthly
// total, or a per-event guarantee written "$500 GTD" / "$500 Guaranteed".
const DOLLAR_PRIZE = /\$(?:2,000|60,000)\+?(?![,\d])|\$\d[\d,]*\+?\s?(?:GTD|Guaranteed)\b/;
const CASH_WORDING = /Real Cash Prizes|Cash Prizes|Real Prize (?:Value|Rewards)/i;

for (const rel of SURFACES) {
  test(`freeroll prizes are chips, never dollars or cash: ${rel}`, () => {
    const lines = fs.readFileSync(path.join(root, rel), 'utf8').split('\n');
    const offenders = [];
    lines.forEach((line, i) => {
      if (!/freeroll/i.test(line)) return;
      if (DOLLAR_PRIZE.test(line) || CASH_WORDING.test(line)) {
        offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 140)}`);
      }
    });
    assert.deepEqual(offenders, [], 'Freeroll prizes must be written in chips with no dollar sign and no cash wording');
  });
}
