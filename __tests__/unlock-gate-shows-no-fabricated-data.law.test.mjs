// LAW (2026-11-27): the shared free-account unlock panel never shows invented data.
//
// SmarterAccountUnlockGate is mounted on roughly 160 public pages, including
// every Video Library watch page. It used to render a blurred "preview" table
// under its headline with hard-coded rows such as
//   04:18 | Flop Check-Raise IP | Call 68% / Raise 32% | Over-Folding 19%
// identical on every video, so it read as real analysis of the video the
// player was watching. Other presets carried invented solver EVs, live table
// counts and waitlists, and a "715+" room count the venue table does not hold.
//
// The panel itself stays (headline, benefits, Create Free Account / Sign In).
// Its teaser is now a list of the features an account unlocks, with no figures.
// Any number left in the panel's copy must be backed by real data: today the
// only one is 107, the canonical TRAINING_LIBRARY game count, asserted below.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from '../tests/helpers/trainingBatchPreloadHarness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GATE_PATH = 'src/components/seo/SmarterAccountUnlockGate.jsx';
const gateSrc = readFileSync(join(ROOT, GATE_PATH), 'utf8');
const kitCss = readFileSync(join(ROOT, 'src/components/seo/SmarterSeoKit.module.css'), 'utf8');

function readPresets() {
  const start = gateSrc.indexOf('const PRESETS = {');
  assert.ok(start >= 0, 'SmarterAccountUnlockGate must define its PRESETS object');
  const end = gateSrc.indexOf('\n};\n', start);
  const literal = gateSrc.slice(start + 'const PRESETS = '.length, end + 2);
  // eslint-disable-next-line no-new-func
  return new Function(`return (${literal});`)();
}

const PRESETS = readPresets();
const { TRAINING_LIBRARY } = await load('src/data/TRAINING_LIBRARY.js');

// Every player-visible string the panel can show, preset by preset.
function visibleStrings(preset) {
  return [
    preset.eyebrow, preset.title, preset.subtitle, preset.ctaLabel, preset.unlockedLabel,
    ...(preset.locked || []), ...(preset.benefits || []),
  ].filter((s) => typeof s === 'string');
}

const FOOTNOTE = (gateSrc.match(/<p className=\{styles\.unlockFootnote\}>\s*([^<]+?)\s*<\/p>/) || [])[1] || '';
const ALL_STRINGS = [...Object.values(PRESETS).flatMap(visibleStrings), FOOTNOTE];

test('the unlock gate renders no data table and accepts no rows or columns', () => {
  assert.doesNotMatch(gateSrc, /<table\b/, 'the unlock gate must not render a preview table');
  assert.doesNotMatch(gateSrc, /\b(rows|columns)\s*[:,=]/, 'the unlock gate must not take or define preview rows/columns');
  assert.doesNotMatch(gateSrc, /unlockPreviewTable|unlockBlurred|View Full Data/, 'the blurred fake-data preview must not return');
  assert.doesNotMatch(kitCss, /\.unlockPreviewTable/, 'the preview table styles must not return');
  for (const [name, preset] of Object.entries(PRESETS)) {
    assert.equal(preset.rows, undefined, `${name} must not define preview rows`);
    assert.equal(preset.columns, undefined, `${name} must not define preview columns`);
    assert.ok(Array.isArray(preset.locked) && preset.locked.length >= 3, `${name} must list the features it unlocks`);
  }
});

test('no fabricated decision rows: no timestamps, percentages, BB figures or invented spots', () => {
  for (const s of ALL_STRINGS) {
    assert.doesNotMatch(s, /\b\d{1,2}:\d{2}\b/, `timestamp in unlock gate copy: "${s}"`);
    assert.doesNotMatch(s, /\d+(\.\d+)?\s*%(?!\s*Free)/, `percentage figure in unlock gate copy: "${s}"`);
    assert.doesNotMatch(s, /[+-]?\d+(\.\d+)?\s*BB\b/i, `BB figure in unlock gate copy: "${s}"`);
    assert.doesNotMatch(s, /Flop Check-Raise|Turn Overbet|River Thin Value|Over-Folding|Under-Bluffing|Missed Value/, `invented decision spot in unlock gate copy: "${s}"`);
  }
  assert.doesNotMatch(gateSrc, /Flop Check-Raise IP|Call 68%|Polarized Value\/Bluff|Bet 50% Pot/);
});

test('every count in the panel copy is backed by real data', () => {
  const BACKED = new Map([['107', TRAINING_LIBRARY.length]]);
  for (const s of ALL_STRINGS) {
    // Ignore "100% Free" (a pricing statement), "1-Tap", "3-Bet"/"4-Bet" (bet names), "6-Max"/"9-Max".
    const cleaned = s.replace(/100% Free/g, '').replace(/\b\d-(Tap|Bet|Max)\b/g, '');
    for (const n of cleaned.match(/\d[\d,.]*\+?/g) || []) {
      assert.ok(BACKED.has(n), `unbacked number "${n}" in unlock gate copy: "${s}"`);
      assert.equal(Number(n), BACKED.get(n), `"${n}" in unlock gate copy no longer matches the real count (${BACKED.get(n)})`);
    }
  }
});

test('the unlock gate copy follows the text rules: no em dashes, no dollar sign, no emoji', () => {
  for (const s of ALL_STRINGS) {
    assert.doesNotMatch(s, /—/, `em dash in unlock gate copy: "${s}"`);
    assert.doesNotMatch(s, /\$/, `dollar sign in unlock gate copy: "${s}"`);
    assert.doesNotMatch(s, /\p{Extended_Pictographic}/u, `emoji in unlock gate copy: "${s}"`);
  }
});

test('the conversion panel itself is kept: headline, benefits and both account buttons', () => {
  assert.match(gateSrc, /className=\{styles\.unlockTitle\}/);
  assert.match(gateSrc, /resolvedBenefits\.map/);
  assert.match(gateSrc, /openQuickSignup\(/);
  assert.match(gateSrc, /Sign In To Existing Account/);
  assert.equal(PRESETS['video-drill'].title, 'Unlock Interactive Hand Quizzes, Bookmarks & Pro Feeds Free');
});
