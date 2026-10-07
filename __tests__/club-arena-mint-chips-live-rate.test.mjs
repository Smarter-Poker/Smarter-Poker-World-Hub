/**
 * GUARD: __tests__/club-arena-mint-chips-live-rate.test.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * /api/club-arena/mint-chips takes CHIPS and calls fn_mint_chips_from_diamonds,
 * which takes DIAMONDS and charges at public.fn_ca_bridge_rate() (diamonds per
 * chip; 100 since 2026-09-07). The route converted with a literal 1/100 left
 * over from 2026-08-21, so "mint 100 chips" spent 1 diamond and the server
 * credited 0.01 chips (Club Arena changelog 2026-10-06, section 2). The route
 * must read the same rate the server charges at, and refuse when it cannot.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(root, 'pages', 'api', 'club-arena', 'mint-chips.js'), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('the mint route reads the live bridge rate from the database', () => {
  assert.match(code, /callerClient\.rpc\(\s*'fn_ca_bridge_rate'\s*\)/);
  assert.match(code, /const diamondsNeeded = amount \* diamondsPerChip;/);
});

test('the mint route carries no hard-coded chip/diamond rate', () => {
  assert.doesNotMatch(code, /DIAMONDS_PER_CHIP\s*=/);
  assert.doesNotMatch(code, /amount\s*\*\s*\(?\s*1\s*\/\s*100/);
  assert.doesNotMatch(code, /amount\s*\/\s*100\b/);
});

test('an unreadable rate refuses before any diamond is spent', () => {
  const refuse = code.indexOf('The Chip Mint Rate Could Not Be Read');
  const mint = code.indexOf("'fn_mint_chips_from_diamonds'");
  assert.ok(refuse > 0 && mint > 0 && refuse < mint, 'rate refusal must precede the mint call');
});
