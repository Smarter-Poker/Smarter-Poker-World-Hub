/**
 * /horses console - Phase 1 contract tests.
 *
 * TWO KINDS OF ASSERTION, and the split is deliberate.
 *
 * 1. BEHAVIOUR. The decisions that used to live inline in a 6,400-line
 *    component are now pure modules - urlState.js, auditFilters.js,
 *    pagerModel.js - and they are imported and exercised for real. That is the
 *    half of this suite that can actually fail for the right reason. The
 *    review that prompted this pass found the previous version asserting
 *    `exportAllCsv({` appeared in the source while the function it belonged to
 *    had no caller anywhere: 14 of 14 green, the headline deliverable dead.
 *
 * 2. FILE CONTRACTS. There is no node_modules in the snapshot this suite has
 *    to run in, so nothing here can render React or import the page. What is
 *    left is source text - and where that is all there is, the assertion is
 *    written against the WIRING (the string that proves a handler is bound to
 *    a button) rather than against a declaration that may have no caller.
 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import {
  resolveInitialTab,
  resolveInitialSection,
  urlMatchesState,
  nextUrlQuery,
} from '../src/components/horses/urlState.js';
import {
  AUDIT_FILTER_GROUPS,
  auditPrefixesForGroup,
  auditActionFilter,
} from '../src/components/horses/auditFilters.js';
import { pagerModel, rangeLabel } from '../src/components/horses/pagerModel.js';

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
 *  place a colour may be written is a stylesheet. */
const RAW_HEX = /#[0-9a-fA-F]{3,8}\b/;
const RAW_RGBA = /\brgba?\(\s*\d/;

/**
 * Source with comments removed.
 *
 * Negative assertions ("this pattern must NOT appear") have to run against
 * code, not against the comment that explains why the pattern was removed -
 * otherwise documenting a fix is what breaks its test.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

async function componentFiles() {
  const entries = await readdir(new URL(COMPONENT_DIR, ROOT));
  return entries.filter((name) => name.endsWith('.js') || name.endsWith('.jsx'));
}

// ═══════════════════════════════════════════════════════════════════════════
// BEHAVIOUR - urlState
// ═══════════════════════════════════════════════════════════════════════════

test('a deep link resolves to the tab it names', () => {
  assert.equal(resolveInitialTab({ tab: 'mint' }), 'mint');
  assert.equal(resolveInitialTab({ tab: 'clubarena' }), 'clubarena');
  // Next hands over an array for ?tab=a&tab=b.
  assert.equal(resolveInitialTab({ tab: ['audit', 'mint'] }), 'audit');
});

test('an unknown, empty or missing tab falls back to the registry default', () => {
  assert.equal(resolveInitialTab({}), 'stable');
  assert.equal(resolveInitialTab({ tab: '' }), 'stable');
  assert.equal(resolveInitialTab({ tab: 'no-such-tab' }), 'stable');
  assert.equal(resolveInitialTab(undefined), 'stable');
  assert.equal(resolveInitialSection({}), 'overview');
  assert.equal(resolveInitialSection({ section: 'nope' }), 'overview');
  assert.equal(resolveInitialSection({ section: 'ledger' }), 'ledger');
});

test('urlMatchesState treats a bare /horses as the default view', () => {
  // This is what stops the write effect fighting the read effect on a URL
  // that says the same thing in fewer characters.
  assert.equal(urlMatchesState({ activeTab: 'stable', caSection: 'overview' }, {}), true);
  assert.equal(
    urlMatchesState({ activeTab: 'stable', caSection: 'overview' }, { tab: 'stable' }),
    true,
  );
  assert.equal(urlMatchesState({ activeTab: 'mint', caSection: 'overview' }, {}), false);
});

test('THE DEEP-LINK REGRESSION: /horses?tab=mint is never rewritten to ?tab=stable', () => {
  const query = { tab: 'mint' };
  // What the read effect seeds.
  const seeded = { activeTab: resolveInitialTab(query), caSection: resolveInitialSection(query) };
  assert.equal(seeded.activeTab, 'mint');
  // And once seeded, state and URL agree, so nothing is written at all.
  assert.equal(urlMatchesState(seeded, query), true);
  // The write the old code produced - tab: 'stable' over a URL saying mint -
  // is exactly what urlMatchesState reports as a mismatch, and the write
  // effect refuses to act on a mismatch it has not first seen resolved.
  assert.equal(urlMatchesState({ activeTab: 'stable', caSection: 'overview' }, query), false);
});

test('nextUrlQuery writes the tab, keeps unrelated params and drops a stale section', () => {
  assert.deepEqual(
    nextUrlQuery({ activeTab: 'mint', caSection: 'overview' }, { tab: 'stable', ref: 'email' }),
    { tab: 'mint', ref: 'email' },
  );
  // ?section= only means something on Club Arena, and only when it is not the
  // default - a stale section on every other tab is noise in a shared link.
  assert.deepEqual(
    nextUrlQuery({ activeTab: 'clubarena', caSection: 'ledger' }, {}),
    { tab: 'clubarena', section: 'ledger' },
  );
  assert.deepEqual(
    nextUrlQuery({ activeTab: 'clubarena', caSection: 'overview' }, { section: 'ledger' }),
    { tab: 'clubarena' },
  );
  assert.deepEqual(
    nextUrlQuery({ activeTab: 'audit', caSection: 'ledger' }, { section: 'ledger' }),
    { tab: 'audit' },
  );
});

test('nextUrlQuery does not mutate the query it was given', () => {
  const query = { tab: 'stable', section: 'ledger' };
  nextUrlQuery({ activeTab: 'mint', caSection: 'overview' }, query);
  assert.deepEqual(query, { tab: 'stable', section: 'ledger' });
});

// ═══════════════════════════════════════════════════════════════════════════
// BEHAVIOUR - audit filter groups
// ═══════════════════════════════════════════════════════════════════════════

test('every audit filter group maps to an ARRAY of prefixes', () => {
  assert.ok(AUDIT_FILTER_GROUPS.length > 1);
  for (const group of AUDIT_FILTER_GROUPS) {
    assert.equal(typeof group.id, 'string', 'a group needs a select value');
    assert.ok(group.label, 'a group needs a label');
    assert.ok(Array.isArray(group.prefixes), `${group.label}: prefixes must be an array`);
  }
  // "All Actions" is the only group with no prefixes.
  const empty = AUDIT_FILTER_GROUPS.filter((g) => g.prefixes.length === 0);
  assert.deepEqual(empty.map((g) => g.id), ['']);
});

test('the namespaced groups carry their legacy prefix too', () => {
  // The trail was renamed in Phase 1. A group that asked only for the new
  // vocabulary hid every row written before the rename.
  const horses = auditPrefixesForGroup('horse');
  assert.ok(horses.includes('horse.'), 'the new namespace');
  assert.ok(horses.length > 1, 'and at least one legacy prefix beside it');
  assert.ok(auditPrefixesForGroup('settings').includes('settings.'));
  assert.ok(auditPrefixesForGroup('settings').includes('content_settings'));
  assert.ok(auditPrefixesForGroup('promo').includes('promo.'));
});

test('auditActionFilter sends actionPrefixes, and nothing at all for All Actions', () => {
  const all = auditActionFilter('');
  assert.deepEqual(all, {}, 'All Actions must not narrow the query');

  const cashouts = auditActionFilter('cashout');
  assert.ok(Array.isArray(cashouts.actionPrefixes));
  assert.ok(cashouts.actionPrefixes.includes('cashout.'));
  // The singular field rides along so a route that has not been redeployed
  // still filters narrowly rather than ignoring the filter entirely.
  assert.equal(cashouts.actionPrefix, cashouts.actionPrefixes[0]);
});

test('an unknown group id widens rather than silently empties the view', () => {
  assert.deepEqual(auditPrefixesForGroup('a-stale-bookmark'), []);
  assert.deepEqual(auditActionFilter('a-stale-bookmark'), {});
});

test('auditPrefixesForGroup hands back a copy, not the table itself', () => {
  const first = auditPrefixesForGroup('horse');
  first.push('mutated');
  assert.ok(!auditPrefixesForGroup('horse').includes('mutated'));
});

// ═══════════════════════════════════════════════════════════════════════════
// BEHAVIOUR - pagerModel
// ═══════════════════════════════════════════════════════════════════════════

test('a known total is stated in the label', () => {
  const m = pagerModel({ offset: 100, limit: 50, count: 50, total: 312, noun: 'Rows' });
  assert.equal(m.label, 'Showing 101-150 Of 312 Rows');
  assert.equal(m.hasPrevious, true);
  assert.equal(m.hasNext, true);
  assert.equal(m.totalKnown, true);
});

test('total === null means UNKNOWN, and the label does not invent one', () => {
  const m = pagerModel({ offset: 50, limit: 50, count: 50, total: null, noun: 'Reports' });
  assert.equal(m.label, 'Showing 51-100 Reports');
  assert.ok(!m.label.includes('Of'), 'a fabricated total is how a list looks complete');
  assert.equal(m.totalKnown, false);
});

test('with an unknown total, Next comes from the route hasMore flag', () => {
  const base = { offset: 0, limit: 50, count: 50, total: null };
  assert.equal(pagerModel({ ...base, hasMore: false }).hasNext, false,
    'a full last page must not offer a Next that returns nothing');
  assert.equal(pagerModel({ ...base, hasMore: true }).hasNext, true);
  // No flag at all: fall back to "a full page probably has more", which is the
  // same guess the route itself makes.
  assert.equal(pagerModel(base).hasNext, true);
  assert.equal(pagerModel({ ...base, count: 12 }).hasNext, false);
});

test('hasMore wins over a total when the route sent both', () => {
  const m = pagerModel({ offset: 0, limit: 50, count: 50, total: 50, hasMore: true });
  assert.equal(m.hasNext, true, 'the route looked at row limit+1; the client did not');
});

test('an empty page says so without pretending to be page one of nothing', () => {
  assert.equal(pagerModel({ offset: 0, limit: 50, count: 0, total: 0 }).label, 'Showing 0 Of 0 Rows');
  assert.equal(pagerModel({ offset: 0, limit: 50, count: 0, total: null }).label, 'Showing 0 Rows');
  assert.equal(pagerModel({ offset: 0, count: 0 }).hasPrevious, false);
});

test('Previous is offset-driven and rangeLabel is the label alone', () => {
  assert.equal(pagerModel({ offset: 0, count: 10, total: 10 }).hasPrevious, false);
  assert.equal(pagerModel({ offset: 10, count: 10, total: 40 }).hasPrevious, true);
  assert.equal(
    rangeLabel({ offset: 0, count: 3, total: 3, noun: 'Horses' }),
    'Showing 1-3 Of 3 Horses',
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// WIRING - a handler with no caller is the regression this file exists for
// ═══════════════════════════════════════════════════════════════════════════

test('the Audit Export CSV button CALLS exportAuditLog', async () => {
  const src = await read(INDEX);
  // The declaration is not the deliverable. This is.
  assert.match(
    src,
    /onClick=\{exportAuditLog\}/,
    'the Export CSV button must be bound to exportAuditLog, not to an inline downloadCsv',
  );
  // And the page-only export it replaced is gone: no inline toCsv over the
  // 100 rows on screen.
  assert.ok(
    !/toCsv\(auditEntries/.test(src),
    'the page-only audit export must be deleted, not left beside the real one',
  );
  // The walk itself still carries the three columns an auditor needs.
  assert.match(src, /jsonColumns: \['details', 'before_state', 'after_state'\]/);
  assert.match(src, /exportAllCsv\(\{/);
  // The progress state is reachable now.
  assert.match(src, /auditExporting/);
  assert.ok(
    (src.match(/\bauditExporting\b/g) || []).length >= 4,
    'auditExporting must be rendered, not only declared',
  );
});

test('the audit target, from and to filters actually render', async () => {
  const src = await read(INDEX);
  for (const setter of ['setAuditTarget', 'setAuditFrom', 'setAuditTo']) {
    assert.ok(
      (src.match(new RegExp(`\\b${setter}\\b`, 'g')) || []).length >= 2,
      `${setter} is declared and never called - the filter has no input`,
    );
  }
  assert.match(src, /id="audit-target"/);
  assert.match(src, /id="audit-from"/);
  assert.match(src, /id="audit-to"/);
});

test('the audit filter select is driven by the shared group table', async () => {
  const src = await read(INDEX);
  assert.match(src, /AUDIT_FILTER_GROUPS\.map/);
  assert.match(src, /auditActionFilter\(auditPrefix\)/);
  // The two options that were TARGET types rather than action prefixes, and so
  // matched zero rows, must not be filter values of their own any more.
  assert.ok(!/<option value="content_author">/.test(src));
  assert.ok(!/<option value="content_settings">/.test(src));
});

test('no loader is bound bare to onClick, where the event becomes its first argument', async () => {
  const code = stripComments(await read(INDEX));
  // loadMintData(ledgerOffset) and loadGrinderData(offset) both take a number
  // first. onClick={loadMintData} handed them a React synthetic event.
  assert.ok(!/onClick=\{loadMintData\}/.test(code), 'onClick={loadMintData} passes the event as an offset');
  assert.ok(!/onClick=\{loadGrinderData\}/.test(code), 'onClick={loadGrinderData} passes the event as an offset');
  assert.match(code, /loadMintData\(0\)/);
});

test('the Mint idempotency key rotates with the payload', async () => {
  const code = stripComments(await read(INDEX));
  const at = code.indexOf('const mintPayloadKey');
  assert.ok(at > 0, 'the key must be derived from the composed payload');
  const declaration = code.slice(at, at + 300);
  // Every field of the composed operation participates in the key, so it
  // rotates the moment the intent changes and never outlives it.
  for (const field of ['mintAction', 'mintAsset', 'mintTargetKind', 'mintTargetId', 'mintAmount', 'mintReason']) {
    assert.ok(
      new RegExp(`\\b${field}\\b`).test(declaration),
      `${field} must be part of the idempotency key`,
    );
  }
  assert.match(code, /setMintOpId\(newMintOpId\(\)\)/);
});

test('the Mint receipt is built from what the console composed', async () => {
  const src = await read(INDEX);
  // Not read off the raw fn_ca_mint return, which the route never promises.
  assert.match(src, /action: mintConfirm\.action/);
  assert.match(src, /amount: mintConfirm\.amount/);
  assert.match(src, /op_id: mintConfirm\.opId/);
});

test('the Fleet Status panel reads the field names the status branch returns', async () => {
  const src = await read(INDEX);
  for (const field of ['activeTables', 'seatedHorses', 'activeTournaments', 'checkedAt', 'totalHorses']) {
    assert.ok(
      src.includes(`fleetStatus.${field}`),
      `Fleet Status must read fleetStatus.${field}`,
    );
  }
  // failedSources is surfaced: an incomplete reading must not render as four
  // confident tiles.
  assert.match(src, /fleetStatus\.failedSources/);
});

test('the disposable-email caveat reads the path the route actually uses', async () => {
  const src = await read(INDEX);
  assert.match(src, /abuseData\.abuse\?\.stats\?\.disposableScope/);
});

test('the grinder roster is paged by the route, not sliced client-side', async () => {
  const src = await read(INDEX);
  assert.match(src, /const GRINDER_ROSTER_PAGE_SIZE = \d+;/);
  assert.match(src, /\/api\/horses\/grinder-stats\?\$\{params\.toString\(\)\}/);
  assert.match(src, /goGrinderRosterPage/);
  // The two independent paginations over one list are gone.
  assert.ok(!src.includes('pagedGrinderPersonas'), 'the client-side roster slice must be deleted');
  assert.ok(!src.includes('grinderPersonas'), 'the client-side roster list must be deleted');
});

test('Club Arena counts come from the route, never from a page length', async () => {
  const src = await read(INDEX);
  assert.match(src, /memberChipTotal/);
  assert.match(src, /memberCount/);
  // The fabricated club balance is gone.
  assert.ok(
    !/members \|\| \[\]\)\.reduce/.test(src),
    'Chips On Books must not be a sum over the members page',
  );
  // The cashout badge and tile use the exact platform count.
  assert.match(src, /caStats\?\.pendingCashouts/);
  assert.ok(
    !/\{num\(caPendingCashouts\.length, '0'\)\}/.test(src),
    'the Cashout Requests tile must not be a page length',
  );
});

test('every capped list sends its limit explicitly and can say it is capped', async () => {
  const src = await read(INDEX);
  for (const constant of ['CA_OVERVIEW_LIMIT', 'CA_CLUB_LIMIT', 'CA_LEDGER_LIMIT', 'MINT_TARGET_LIMIT']) {
    assert.ok(src.includes(`const ${constant} =`), `${constant} must be declared`);
    assert.ok(
      (src.match(new RegExp(`\\b${constant}\\b`, 'g')) || []).length >= 2,
      `${constant} is declared and never sent`,
    );
  }
  assert.match(src, /section=overview&limit=\$\{CA_OVERVIEW_LIMIT\}/);
  assert.match(src, /section=ledger&limit=\$\{CA_LEDGER_LIMIT\}/);
  // "Showing N Of Total" wherever the route reports truncation.
  assert.match(src, /function ShowingOf\(/);
  assert.ok((src.match(/<ShowingOf/g) || []).length >= 5, 'every capped list needs the note');
  for (const flag of ['circulationTruncated', 'unaccountedSeatExitsTruncated', 'rpcRowCap',
    'pendingCashoutTotalTruncated', 'diamondPurchaseTruncated']) {
    assert.ok(src.includes(flag), `${flag} is returned by a route and must be rendered`);
  }
});

test('a section loads from an effect keyed on the section, not only from a click', async () => {
  const src = await read(INDEX);
  assert.match(
    src,
    /caSection === 'ledger' && !caLedger && !caLedgerLoading[\s\S]{0,40}loadCaLedger\(\)/,
    'arriving at ?section=ledger from a link or from Back must load the ledger',
  );
  assert.match(src, /caSection === 'revenue' && !caRevenue[\s\S]{0,60}loadCaRevenue\(\)/);
});

test('a filter change resets the audit page before it loads, in one effect', async () => {
  const src = await read(INDEX);
  const resetAudit = src.indexOf('setAuditPage(0);');
  const loadOnFilterChange = src.indexOf("if (activeTab === 'audit' && auditLoaded) loadAuditLog();");
  assert.ok(resetAudit > 0 && loadOnFilterChange > 0);
  assert.ok(
    resetAudit < loadOnFilterChange,
    'the page reset must run first, or the load fires against the stale page',
  );
  // One effect, not two: a setAuditPage(0) in a separate effect cannot change
  // the auditPage closure of a load effect running in the same commit, so the
  // old pair sent one request at the stale offset and one at 0. The single
  // effect only resets when the page is off 0 and lets the page change reload.
  assert.match(src, /const filterChanged = auditQuerySeenRef\.current !== auditQuery;/);
  assert.match(src, /if \(filterChanged && auditPage !== 0\) \{\s*setAuditPage\(0\);\s*return;/);
  // And both loaders drop a late response for a superseded request.
  assert.match(src, /auditSeqRef/);
  assert.match(src, /reviewsSeqRef/);
});

test('the Ledger Drift export admits it is a sample', async () => {
  const src = await read(INDEX);
  assert.match(src, /EXPORT NOTE/);
  assert.match(src, /This Is The Sample, Not The Set/);
});

test('the promo expiry survives a round trip through the operator timezone', async () => {
  const src = await read(INDEX);
  assert.match(src, /function toLocalDateTimeInput\(/);
  assert.match(src, /function localInputToIso\(/);
  assert.match(src, /expires_at: toLocalDateTimeInput\(code\.expires_at\)/);
  assert.ok(
    !/String\(code\.expires_at\)\.slice\(0, 16\)/.test(src),
    'slicing a UTC ISO string into a datetime-local input shifts the expiry every save',
  );
});

test('the ticket action cannot mislabel a status the route will not set', async () => {
  const src = await read(INDEX);
  assert.ok(
    !/\{ticket\.status === 'open' \? 'Resolve' : 'Reopen'\}/.test(src),
    'a binary button read "Reopen" on an in_progress ticket and downgraded it',
  );
  assert.match(src, /ticket-status-\$\{ticket\.id\}/);
});

// ═══════════════════════════════════════════════════════════════════════════
// FILE CONTRACTS
// ═══════════════════════════════════════════════════════════════════════════

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
    'urlState',
    'auditFilters',
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

test('the shared stylesheet import is used, not carried as dead weight', async () => {
  const src = await read(INDEX);
  const body = src.replace(/^import[\s\S]*?;$/gm, '');
  assert.ok(
    /\bshared\.[a-zA-Z]/.test(body),
    "the shared.module.css import must be used or removed",
  );
});

test('the nav is a real ARIA tablist and every tab points at the one panel', async () => {
  const src = await read(INDEX);
  assert.match(src, /role="tablist"/);
  assert.match(src, /role="tab"/);
  assert.match(src, /role="tabpanel"/);
  assert.match(src, /aria-selected=/);
  assert.match(src, /aria-labelledby=/);
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
    assert.match(src, new RegExp(`'${key}'`), `tablist should handle ${key}`);
  }
  // ONE panel exists, so aria-controls names one id. Sixteen interpolated ids
  // meant fifteen tabs referenced an element that is not in the document.
  assert.match(src, /const HORSES_PANEL_ID = 'horses-panel';/);
  assert.match(src, /aria-controls=\{HORSES_PANEL_ID\}/);
  const code = stripComments(src);
  assert.ok(!code.includes('horses-panel-${'), 'the per-tab panel ids must be gone');
  // role="tablist" must not sit on a display:contents wrapper, which drops the
  // element out of the accessibility tree in WebKit and Blink.
  assert.ok(
    !/role="tablist"[^>]*display: 'contents'/.test(code),
    'role="tablist" must not be on a display:contents wrapper',
  );
});

test('both dialogs render inside an error boundary', async () => {
  const src = await read(INDEX);
  const boundaries = (src.match(/<ErrorBoundary/g) || []).length;
  assert.ok(boundaries >= 3, `panel plus both dialogs need a boundary, found ${boundaries}`);
  const lastClose = src.lastIndexOf('</ErrorBoundary>');
  const lastModal = src.lastIndexOf('</Modal>');
  assert.ok(lastClose > lastModal, 'the last dialog must close before its boundary does');
});

test('the tab and the Club Arena section are mirrored into the URL', async () => {
  const src = await read(INDEX);
  assert.match(src, /resolveInitialTab\(router\.query\)/);
  assert.match(src, /resolveInitialSection\(router\.query\)/);
  assert.match(src, /router\.replace\(\{ pathname: router\.pathname, query \}, undefined, \{ shallow: true \}\)/);
  // A push for a real navigation is what makes Back undo a jump; a replace on
  // every write overwrites the entry it came from.
  assert.match(src, /router\.push\(\{ pathname: router\.pathname, query \}, undefined, \{ shallow: true \}\)/);
  // The hydration latch, and the guard that stops the write effect acting on a
  // difference it has not seen resolved.
  assert.match(src, /urlHydratedRef/);
  assert.match(src, /urlSyncedRef/);
  assert.match(src, /if \(!urlSyncedRef\.current\) return;/);
  // The registry owns the default section.
  assert.match(src, /useState\(DEFAULT_CA_SECTION\)/);
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
  // The Pipeline panel names itself rather than inheriting the component's
  // Fleet Command Center default.
  assert.match(src, /title="Not Built Yet - The Content Pipeline Has No Trigger"/);
});

test('loading and empty are distinct states on the roster', async () => {
  const src = await read(INDEX);
  assert.match(src, /personasLoading/);
  assert.match(
    src,
    /!personasError && !personasLoading && filteredPersonas\.length === 0/,
    'the empty state must be gated on the load having finished',
  );
});

test('both directions of the bulk activate confirm, through the shared dialog', async () => {
  const src = await read(INDEX);
  assert.match(src, /Activate All \$\{num\(ids\.length\)\} Horses\?/);
  assert.match(src, /Rest All \$\{num\(ids\.length\)\} Horses\?/);
  // And no confirmation anywhere in the console is a window.confirm any more:
  // it has no dialog role, no focus management and cannot carry the
  // thresholdDecision sentence. Comments may still name it.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*\*.*$/gm, '');
  assert.ok(!code.includes('window.confirm('), 'no window.confirm call remains in index.js');
});

test('the console obeys the house rules on dashes, emoji, hex and .single()', async () => {
  const src = await read(INDEX);
  assert.ok(!src.includes(EM_DASH), 'no em dashes (U+2014)');
  assert.ok(!EMOJI.test(src), 'no emoji');
  assert.ok(!RAW_HEX.test(src), 'no raw hex - use T tokens or a CSS class');
  assert.ok(!RAW_RGBA.test(src), 'no raw rgba either - use T tokens or a CSS class');
  assert.ok(!src.includes('.single('), 'no .single() - always .maybeSingle()');
});

test('Modal owns a focus trap and Escape, and measures visibility properly', async () => {
  const src = await read(`${COMPONENT_DIR}Modal.jsx`);
  assert.match(src, /FOCUSABLE/);
  assert.match(src, /'Escape'/);
  assert.match(src, /role="dialog"/);
  assert.match(src, /aria-modal="true"/);
  // Focus restored to the opener on unmount.
  assert.match(src, /activeElement/);
  // offsetParent is null for anything inside a position:fixed subtree, so the
  // trap would have silently stopped trapping.
  assert.ok(
    !stripComments(src).includes('offsetParent'),
    'visibility must not be inferred from offsetParent',
  );
  assert.match(src, /checkVisibility|getClientRects/);
});

test('ConfirmDialog generates its typed-confirmation id', async () => {
  const src = await read(`${COMPONENT_DIR}ConfirmDialog.jsx`);
  assert.ok(!src.includes('"confirm-typed"'), 'a hardcoded id collides if two dialogs coexist');
  assert.match(src, /useId\(\)/);
});

test('every shared component file obeys the house rules', async () => {
  for (const name of await componentFiles()) {
    const src = await read(`${COMPONENT_DIR}${name}`);
    assert.ok(!src.includes(EM_DASH), `${name}: no em dashes (U+2014)`);
    assert.ok(!EMOJI.test(src), `${name}: no emoji`);
    assert.ok(!RAW_HEX.test(src), `${name}: no raw hex outside shared.module.css`);
    assert.ok(!src.includes('.single('), `${name}: no .single()`);
  }
  const css = await read(`${COMPONENT_DIR}shared.module.css`);
  assert.ok(!css.includes(EM_DASH), 'shared.module.css: no em dashes');
  assert.ok(!EMOJI.test(css), 'shared.module.css: no emoji');
});

/**
 * UPDATED IN PHASE 2, and this is the one legitimate reason to touch it: the
 * registry now carries EIGHTEEN tabs, because Phase 2 shipped `staff` and
 * `approvals` (PHASE2-CONTRACTS section 3). The sixteen Phase 1 tabs are
 * still asserted in the same order, so a Phase 1 tab being renamed, reordered
 * or dropped still fails here - which is what this test was written to catch.
 * Only the two new entries at the end are new.
 */
test('tabRegistry exports the sixteen Phase 1 tabs plus the two from Phase 2', async () => {
  const src = await read(`${COMPONENT_DIR}tabRegistry.js`);
  const ids = [...src.matchAll(/\{ id: '([a-z]+)', label:/g)].map((m) => m[1]);
  assert.deepEqual(ids, [
    'stable', 'grinder', 'pipeline', 'settings', 'stats', 'merch', 'promo',
    'economy', 'mint', 'antiabuse', 'clubarena', 'bugreports', 'geeves',
    'reviews', 'scrapers', 'audit',
    // Phase 2.
    'staff', 'approvals',
  ]);
  assert.equal(ids.length, 18);
  assert.match(src, /export const TABS = \[/);
  assert.match(src, /export const DEFAULT_TAB = 'stable'/);
});

test('every paged list on the page renders a real Pager', async () => {
  const src = await read(INDEX);
  const pagers = (src.match(/<Pager\b/g) || []).length;
  assert.ok(
    pagers >= 4,
    `expected a Pager on the Mint ledger, Bug Reports, the grinder roster and the audit log, found ${pagers}`,
  );
  assert.match(src, /goMintLedgerPage\(mintLedgerOffset \+ MINT_LEDGER_PAGE_SIZE\)/);
  // The hand-rolled audit pagination is gone.
  assert.ok(!/`Page \$\{auditPage \+ 1\}`/.test(src), 'the audit log uses the shared Pager now');
  // hasMore is threaded through wherever a route can send it.
  assert.match(src, /hasMore=\{tickets\.hasMore\}/);
  assert.match(src, /hasMore=\{auditHasMore\}/);
});

test('usePagedList carries hasMore alongside a total that may be null', async () => {
  const src = await read(`${COMPONENT_DIR}usePagedList.js`);
  assert.match(src, /setHasMore\(typeof result\?\.hasMore === 'boolean'/);
  assert.match(src, /rows, total, hasMore, limit, offset/);
});

test('bulk selections are chunked at 500 ids per request', async () => {
  const src = await read(INDEX);
  assert.match(src, /const BULK_CHUNK = 500;/);
  assert.match(src, /i \+= BULK_CHUNK/);
});

test('optimistic reverts are by id set, not by whole-roster snapshot', async () => {
  const src = await read(INDEX);
  assert.match(src, /revertActiveForRows/);
  assert.match(src, /restorePersonaRows/);
  assert.ok(
    !/setPersonas\(snapshot\)/.test(src),
    'restoring a captured roster clobbers rows the 2s sync tick refreshed mid-flight',
  );
});
