/**
 * NO "SLIDE TO SEE" ON THE TEN ROLLOUT PAGES.
 *
 * Dan, 2026-08-24 (Club Arena): "FAVORITES AND THE UP/DOWN ARROW ARE CUT OFF
 * AND YOU NEED TO SLIDE TO SEE THEM." His standing rule for every World Hub
 * page, 2026-09-03: everything is laid out, everything always displays, there
 * is no "slide to see" functionality. Mobile-first, 375px first.
 *
 * The signature of a hidden horizontal rail is any one of these three
 * declarations. `overflow-x: auto` alone is not banned (a wide financial table
 * may legitimately scroll, and declares both axes); hiding the scrollbar or
 * snapping the scroll is what turns a scroller into a concealed control.
 *
 * Standard: docs/mobile-standard/ALWAYS-DISPLAYED-MOBILE-STANDARD.md
 * Plan:     docs/mobile-standard/ROLLOUT-PLAN.md
 *
 * ALLOWLIST: pages not yet converted. Each phase's PR removes its own files
 * from this list. Adding a file back is a regression and needs Dan's label.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BANNED = [
  /scrollbar-width\s*:\s*none/i,
  /scrollbarWidth\s*:\s*['"]none['"]/,
  /scroll-snap-type\s*:/i,
  /scrollSnapType\s*:/,
  /::-webkit-scrollbar\s*\{\s*display\s*:\s*none/i,
];

// Phase -> files that must be clean once that phase has merged.
const PHASES = {
  1: [
    'pages/hub/bankroll-manager.js',
    'src/styles/worlds/bankroll.css',
    'src/components/bankroll',
  ],
  2: ['pages/hub/memory-games.js', 'src/styles/worlds/memory-games.css', 'src/components/memory-games'],
  3: [
    'pages/hub/poker-near-me',
    'src/styles/worlds/poker-near-me.css',
    'src/styles/worlds/poker-near-me-lobby.css',
    'styles/poker-near-me.css',
    'src/components/poker-near-me',
  ],
  4: ['pages/hub/personal-assistant', 'src/styles/worlds/PersonalAssistantHub.module.css', 'src/styles/worlds/PersonalAssistantTools.module.css'],
  5: ['pages/hub/training.js', 'pages/hub/training', 'src/styles/worlds/training.css', 'src/components/training'],
  6: ['pages/hub/news.js', 'src/components/news'],
  7: ['pages/hub/trivia', 'src/components/trivia'],
  8: ['pages/hub/diamond-arena.js', 'pages/hub/diamond-arena', 'src/styles/worlds/diamond-arena.css'],
  9: ['pages/hub/video-library.js', 'src/styles/worlds/video-library.css', 'src/components/video-library'],
  10: ['pages/hub/poker-tools.js'],
};

// Phases already merged. Append the phase number in that phase's PR.
const CONVERTED = [1];

function walk(target) {
  const full = path.join(ROOT, target);
  if (!fs.existsSync(full)) return [];
  if (fs.statSync(full).isFile()) return [full];
  return fs.readdirSync(full).flatMap((entry) => walk(path.join(target, entry)));
}

function violations(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  src.split('\n').forEach((line, i) => {
    if (BANNED.some((re) => re.test(line))) out.push(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
  });
  return out;
}

for (const phase of CONVERTED) {
  test(`phase ${phase} pages have no hidden horizontal rails`, () => {
    const files = PHASES[phase].flatMap(walk).filter((f) => /\.(js|jsx|ts|tsx|css)$/.test(f));
    assert.ok(files.length > 0, `phase ${phase} targets exist`);
    const found = files.flatMap(violations);
    assert.deepEqual(found, [], `slide-to-see rail(s) reintroduced:\n${found.join('\n')}`);
  });
}

test('every rollout phase is declared', () => {
  assert.deepEqual(Object.keys(PHASES).map(Number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const p of CONVERTED) assert.ok(PHASES[p], `phase ${p} exists`);
});
