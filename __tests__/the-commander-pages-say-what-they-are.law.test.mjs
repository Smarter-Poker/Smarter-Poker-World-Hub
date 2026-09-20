/**
 * THE COMMANDER PAGES SAY WHAT THEY ARE (AEO phase 3, 2026-09-17).
 *
 * Measured on production as OAI-SearchBot with scripts and styles
 * stripped, the five Club Commander player pages returned between 59 and
 * 76 words, and every one of those words was a navigation label.
 * /hub/commander read:
 *
 *   "LIVE POKER Find Games And Join Waitlists My Card Check In Leagues
 *    Compete Hands Review Limits Settings Create Page Build VENUES WITH
 *    LIVE GAMES Powered By CLUB COMMANDER ..."
 *
 * Chrome, not a sentence. Club Commander is the product a venue buys and
 * a player searches for, and its own page said nothing about it to anyone
 * who did not run JavaScript.
 *
 * Reads source files; runs in the Build Safety Gate with no install.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

/** page file -> the summary key it must render. */
const PAGES = {
  'pages/hub/commander/index.js': 'commander',
  'pages/hub/commander/venues/index.js': 'commander-venues',
  'pages/hub/commander/tournaments/index.js': 'commander-tournaments',
  'pages/hub/commander/home-games/index.js': 'commander-home-games',
  'pages/hub/commander/leagues/index.js': 'commander-leagues',
};

test('every commander page renders its summary, and imports it', () => {
  for (const [file, key] of Object.entries(PAGES)) {
    const src = read(file);
    assert.match(src, /import HubPageSummary from '[^']+HubPageSummary'/, `${file} imports the summary`);
    assert.ok(src.includes(`<HubPageSummary page="${key}" />`), `${file} renders the ${key} summary`);
  }
});

test('the summary sits outside every client-only wrapper on those pages', () => {
  // A summary inside dynamic(ssr:false) is a summary a crawler never sees,
  // which is the bug this whole phase exists to stop.
  for (const file of Object.keys(PAGES)) {
    const src = read(file)
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
    const clientOnly = [...src.matchAll(/const (\w+) = dynamic\([\s\S]{0,300}?ssr:\s*false/g)].map((m) => m[1]);
    for (const component of clientOnly) {
      for (const open of src.matchAll(new RegExp(`<${component}[\\s>]`, 'g'))) {
        const close = src.indexOf(`</${component}>`, open.index);
        if (close === -1) continue;
        assert.ok(
          !src.slice(open.index, close).includes('<HubPageSummary'),
          `${file}: the summary sits inside <${component}>, which is dynamic(ssr:false)`,
        );
      }
    }
  }
});

test('each summary is worth reading, and points somewhere real', () => {
  const src = read('src/components/seo/HubPageSummary.js');
  for (const key of Object.values(PAGES)) {
    const quoted = key.includes('-') ? `'${key}'` : key;
    assert.ok(src.includes(`${quoted}: {`), `HUB_PAGE_SUMMARIES has an entry for ${key}`);
  }
  // Every lead in the file, old and new, carries enough words to cite.
  for (const [, block] of src.matchAll(/lead:\s*\n?\s*'([^']+)'/g)) {
    const words = block.split(/\s+/).filter(Boolean).length;
    assert.ok(words >= 45, `a lead of ${words} words is too thin: ${block.slice(0, 60)}`);
  }
  // Commander is live poker, so it must not read as online gambling.
  const commanderBlock = src.slice(src.indexOf('  commander: {'), src.indexOf("  'commander-venues'"));
  assert.match(commanderBlock, /free/i, 'the player side is free, and says so');
});

test('the commander copy obeys the house rules', () => {
  assert.doesNotMatch(read('src/components/seo/HubPageSummary.js'), /—/, 'no em dashes in the copy');
});
