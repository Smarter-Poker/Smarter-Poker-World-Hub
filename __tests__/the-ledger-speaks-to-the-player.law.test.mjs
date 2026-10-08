/**
 * THE LEDGER SPEAKS TO THE PLAYER (phase 6 of the diamond wallet programme).
 *
 * The diamond ledger's `description` column is written for two audiences at
 * once - the player and the operator - and the World Hub wallet printed it
 * raw: "Challenge reward: sd_10", the audit sentence behind 418
 * reconciliation credits, "PvP match abandoned - 10diamonds refund". The
 * journal is append-only, so the record stays, and the ledger learned to
 * speak to the player in ONE place shared with Club Arena: `player_line`, a
 * PostgREST computed column over `fn_diamond_ledger_line` (Club Arena
 * migration 20260920142916). The API asks for it by name (a computed column
 * is not part of `*`) and the modal prints it, never the raw description.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const read = (p) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

test('the ledger API asks for player_line with every row', () => {
  const api = read('pages/api/store/diamond-transactions.js');
  assert.match(api, /\.select\('\*, player_line', \{ count: 'exact' \}\)/);
});

/* REPOINTED 2026-10-07, stricter rather than weaker. This pin used to accept
   `tx.player_line || tx.description || config.label`, a middle fallback that
   printed the RAW description whenever player_line was absent. The raw
   description carries operator notes and the internal "The Mint: " prefix
   (Club Arena migration 20261007102421), so the description is now never a
   fallback at all: player_line, else the kind's label. */
test('the modal prints player_line, falls back to the label, and never the raw description', () => {
  const modal = read('src/components/store/DiamondWalletModal.jsx');
  assert.ok(modal.includes('value={tx.player_line || config.label}'));
  assert.doesNotMatch(modal, /tx\.description/);
  assert.ok(modal.includes("tx.player_line && tx.player_line !== config.label"));
  assert.ok(modal.includes('<WalletDescription value={tx.player_line} />'));
  assert.doesNotMatch(modal, /<WalletDescription value=\{tx\.description\} \/>/);
  assert.doesNotMatch(modal, /value=\{tx\.description \|\| config\.label\}/);
  // Search still finds a row by the line the player reads.
  assert.ok(modal.includes("(tx.player_line || '').toLowerCase().includes(q)"));
});
