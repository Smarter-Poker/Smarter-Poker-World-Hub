// The Bankroll Manager page is pages/hub/bankroll-manager.js plus the section
// modules it mounts (src/components/bankroll/sections/, split out 2026-11-28
// so the page is not one 3,500-line module). A law about what the page does
// is a law about all of them: read them together, page first.
//
// Ordering assertions that compare two positions should use one file's own
// source (bankrollManagerFile), because positions across files mean nothing.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BANKROLL_MANAGER_PAGE = 'pages/hub/bankroll-manager.js';
export const BANKROLL_SECTIONS_DIR = 'src/components/bankroll/sections';

export const BANKROLL_MANAGER_FILES = [
  BANKROLL_MANAGER_PAGE,
  ...readdirSync(join(ROOT, BANKROLL_SECTIONS_DIR))
    .filter((name) => /\.(jsx?|mjs)$/.test(name))
    .sort()
    .map((name) => `${BANKROLL_SECTIONS_DIR}/${name}`),
];

export function bankrollManagerFile(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

export function bankrollManagerSource() {
  return BANKROLL_MANAGER_FILES
    .map((rel) => `// ==== ${rel} ====\n${bankrollManagerFile(rel)}`)
    .join('\n');
}
