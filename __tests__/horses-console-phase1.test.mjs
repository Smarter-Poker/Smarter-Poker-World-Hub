/**
 * /horses console - Phase 1 contract tests.
 *
 * File-text contracts, deliberately. There is no node_modules in the snapshot
 * this suite has to run in, so nothing here imports React, Next or the page
 * itself; every assertion is made against the source text. That buys less than
 * a render test and it buys it everywhere, including CI before an install.
 *
 * What is pinned here is the set of things a later edit can quietly undo:
 * the shared components actually being wired in (an import nobody calls is the
 * exact shape of the regression), the ARIA tablist, the service-role ticket
 * read, the dead code staying dead, and the house rules on em dashes, emoji
 * and raw hex.
 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

const INDEX = 'pages/horses/index.js';
const COMPONENT_DIR = 'src/components/horses/';

const EM_DASH = '—';

/** Deliberately narrow: pictographs, dingbats and the variation selector that
 *  turns a plain glyph into one. Box drawing (U+2500 block) is NOT emoji and is
 *  used for the section rules in these files. */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;

/** A colour literal. The console's rule is T tokens or a CSS class; the only
 *  place a hex value may be written is the stylesheet itself. */
const RAW_HEX = /#[0-9a-fA-F]{3,8}\b/;

async function componentFiles() {
  const entries = await readdir(new URL(COMPONENT_DIR, ROOT));
  return entries.filter((name) => name.endsWith('.js') || name.endsWith('.jsx'));
}

test('the console imports every shared Phase 1 component', async () => {
  const src = await read(INDEX);
  for (const name of [
    'ErrorBoundary',
    'tabRegistry',
    'Modal',
    'ConfirmDialog',
    'Pager',
    'NotBuiltYet',
    'exportAllCsv',
  ]) {
    assert.match(
      src,
      new RegExp(`from '\\.\\./\\.\\./src/components/horses/${name}'`),
      `${INDEX} should import ${name} from src/components/horses/`,
    );
  }
});

test('every shared component imported by the console is actually used', async () => {
  const src = await read(INDEX);
  const lines = src.split('\n');

  // Import statements may wrap across lines, so match on the whole file and
  // then subtract the clause itself from the occurrence count. `[^;]` keeps a
  // clause from swallowing the imports above it: every statement ends in one.
  const importRe = /import\s+([^;]*?)\s+from\s+'\.\.\/\.\.\/src\/components\/horses\/[^']+';/g;
  const bindings = [];
  for (const match of src.matchAll(importRe)) {
    const clause = match[1];
    for (const named of clause.matchAll(/\{([\s\S]*?)\}/g)) {
      for (const part of named[1].split(',')) {
        const identifier = part.trim().split(/\s+as\s+/).pop().trim();
        if (identifier) bindings.push({ identifier, clause: match[0] });
      }
    }
    const fallback = clause.replace(/\{[\s\S]*?\}/g, '').replace(/,/g, ' ').trim();
    for (const identifier of fallback.split(/\s+/)) {
      if (identifier) bindings.push({ identifier, clause: match[0] });
    }
  }

  assert.ok(bindings.length >= 7, 'expected at least the seven Phase 1 component imports');

  for (const { identifier, clause } of bindings) {
    const word = new RegExp(`\\b${identifier}\\b`, 'g');
    const total = (src.match(word) || []).length;
    const inClause = (clause.match(word) || []).length;
    assert.ok(
      total - inClause > 0,
      `${identifier} is imported into ${INDEX} and never used - CI fails on an unused import`,
    );
  }

  // And nothing may be left referencing the hand-rolled dialog that Modal
  // replaced; modalRef had no declaration left, so it was a ReferenceError.
  assert.ok(!lines.some((line) => line.includes('modalRef')), 'modalRef should be gone');
});

test('the nav is a real ARIA tablist and the panel is a tabpanel', async () => {
  const src = await read(INDEX);
  assert.match(src, /role="tablist"/);
  assert.match(src, /role="tab"/);
  assert.match(src, /role="tabpanel"/);
  assert.match(src, /aria-selected=/);
  assert.match(src, /aria-controls=/);
  assert.match(src, /aria-labelledby=/);
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
    assert.match(src, new RegExp(`'${key}'`), `tablist should handle ${key}`);
  }
});

test('the tab and the Club Arena section are mirrored into the URL', async () => {
  const src = await read(INDEX);
  assert.match(src, /resolveTabFromQuery\(router\.query\.tab\)/);
  assert.match(src, /resolveSectionFromQuery\(router\.query\.section\)/);
  assert.match(src, /router\.replace\(\{ pathname: router\.pathname, query \}, undefined, \{ shallow: true \}\)/);
  // A push for a real navigation is what makes Back undo a jump; a replace on
  // every write overwrites the entry it came from.
  assert.match(src, /router\.push\(\{ pathname: router\.pathname, query \}, undefined, \{ shallow: true \}\)/);
});

test('Bug Reports reads the service-role route, not live_help_tickets from the browser', async () => {
  const src = await read(INDEX);
  assert.match(src, /section: 'tickets'/);
  assert.match(src, /club-arena-admin\?\$\{params\.toString\(\)\}|club-arena-admin/);
  assert.ok(src.includes('section=tickets'), 'the panel should document the section=tickets contract');
  assert.ok(
    !src.includes("from('live_help_tickets')"),
    'live_help_tickets must not be queried from the browser',
  );
});

test('the scraper poll stops for a hidden tab', async () => {
  const src = await read(INDEX);
  assert.ok(src.includes('document.hidden'), 'the scraper interval should skip a hidden tab');
});

test('the dead grinder and pipeline actions are gone, not disabled', async () => {
  const src = await read(INDEX);
  for (const dead of ['handleGrinderAction', 'triggerPipeline', "action: 'launch_all'", 'mass_fund_horses']) {
    assert.ok(!src.includes(dead), `${dead} should no longer exist in ${INDEX}`);
  }
  assert.match(src, /<NotBuiltYet/);
});

test('the console obeys the house rules on dashes, emoji, hex and .single()', async () => {
  const src = await read(INDEX);
  assert.ok(!src.includes(EM_DASH), 'no em dashes (U+2014)');
  assert.ok(!EMOJI.test(src), 'no emoji');
  assert.ok(!RAW_HEX.test(src), 'no raw hex - use T tokens or a CSS class');
  assert.ok(!src.includes('.single('), 'no .single() - always .maybeSingle()');
});

test('Modal owns a focus trap and Escape', async () => {
  const src = await read(`${COMPONENT_DIR}Modal.jsx`);
  assert.match(src, /FOCUSABLE/);
  assert.match(src, /'Escape'/);
  assert.match(src, /role="dialog"/);
  assert.match(src, /aria-modal="true"/);
  // Focus restored to the opener on unmount.
  assert.match(src, /activeElement/);
});

test('every shared component file obeys the house rules', async () => {
  for (const name of await componentFiles()) {
    const src = await read(`${COMPONENT_DIR}${name}`);
    assert.ok(!src.includes(EM_DASH), `${name}: no em dashes (U+2014)`);
    assert.ok(!EMOJI.test(src), `${name}: no emoji`);
    assert.ok(!RAW_HEX.test(src), `${name}: no raw hex outside shared.module.css`);
    assert.ok(!src.includes('.single('), `${name}: no .single()`);
  }
  // The stylesheet is the one place a colour may be written, and today it does
  // not need to: every value is a custom property.
  const css = await read(`${COMPONENT_DIR}shared.module.css`);
  assert.ok(!css.includes(EM_DASH), 'shared.module.css: no em dashes');
  assert.ok(!EMOJI.test(css), 'shared.module.css: no emoji');
});

test('tabRegistry exports the sixteen tabs the console renders', async () => {
  const src = await read(`${COMPONENT_DIR}tabRegistry.js`);
  const ids = [...src.matchAll(/\{ id: '([a-z]+)', label:/g)].map((m) => m[1]);
  assert.deepEqual(ids, [
    'stable', 'grinder', 'pipeline', 'settings', 'stats', 'merch', 'promo',
    'economy', 'mint', 'antiabuse', 'clubarena', 'bugreports', 'geeves',
    'reviews', 'scrapers', 'audit',
  ]);
  assert.equal(ids.length, 16);
  assert.match(src, /export const TABS = \[/);
  assert.match(src, /export const DEFAULT_TAB = 'stable'/);
});

test('the Mint ledger and Bug Reports have real pagers', async () => {
  const src = await read(INDEX);
  const pagers = (src.match(/<Pager\b/g) || []).length;
  assert.ok(pagers >= 2, `expected a Pager on the Mint ledger and on Bug Reports, found ${pagers}`);
  assert.match(src, /goMintLedgerPage\(mintLedgerOffset \+ MINT_LEDGER_PAGE_SIZE\)/);
});

test('the audit CSV walks every page and carries the JSON columns', async () => {
  const src = await read(INDEX);
  assert.match(src, /exportAllCsv\(\{/);
  assert.match(src, /jsonColumns: \['details', 'before_state', 'after_state'\]/);
});

test('bulk selections are chunked at 500 ids per request', async () => {
  const src = await read(INDEX);
  assert.match(src, /const BULK_CHUNK = 500;/);
  assert.match(src, /i \+= BULK_CHUNK/);
});
