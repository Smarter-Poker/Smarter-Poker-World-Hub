import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const table = fs.readFileSync(
  'src/components/training/games/UniversalDynamicTable.jsx',
  'utf8',
);

test('answer streak celebrations never fabricate diamond currency', () => {
  const start = table.indexOf('// F11: Streak milestone celebrations');
  const end = table.indexOf('// Speed tracking:', start);
  const effect = table.slice(start, end);
  const overlayStart = table.indexOf('{/* STREAK CELEBRATION OVERLAY */}');
  const overlayEnd = table.indexOf('{/* SPEED BONUS TOAST */}', overlayStart);
  const overlay = table.slice(overlayStart, overlayEnd);

  assert.ok(start >= 0 && end > start && overlayStart >= 0 && overlayEnd > overlayStart);
  assert.doesNotMatch(effect, /const rewards|reward\s*:/i);
  assert.doesNotMatch(overlay, /\+\{[^}]*reward|Diamonds?/i);
  assert.match(overlay, /Momentum Milestone Reached/);
});
