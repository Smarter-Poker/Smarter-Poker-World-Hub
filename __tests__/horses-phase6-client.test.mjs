import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse } from '@babel/parser';
import {
  clubArenaLink, compositionOf, eventUrl, evidenceEntries, exactDecimalText, exportState,
  floorAdminUrl, floorDisclosure, moneyText, pageOf, recordExportCompletion, tableUrl,
} from '../src/components/horses/floorAdmin.js';
import { CA_SECTIONS, TABS } from '../src/components/horses/tabRegistry.js';
import { collectAllRows } from '../src/components/horses/exportAllCsv.js';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');
const EXPORT_PANELS = ['FloorPanel.jsx', 'TournamentsPanel.jsx', 'CashierPanel.jsx', 'RakePanel.jsx'];
const PANELS = [...EXPORT_PANELS, 'ClubsUnionsPanel.jsx', 'AnnouncementsPanel.jsx'];

test('all Phase 6 tabs are visible code-split reads with real permissions', async () => {
  const expected = { floor: 'clubs.read', tournaments: 'clubs.read', cashier: 'money.read', rake: 'money.read' };
  const dynamicPanels = await read('src/components/horses/dynamicPanels.js');
  const componentNames = { floor: 'FloorPanel', tournaments: 'TournamentsPanel', cashier: 'CashierPanel', rake: 'RakePanel' };
  for (const [id, permission] of Object.entries(expected)) {
    const tab = TABS.find((entry) => entry.id === id);
    assert.ok(tab, `${id} tab`);
    assert.equal(tab.permission, permission);
    const componentName = componentNames[id];
    assert.match(dynamicPanels, new RegExp(`const ${componentName} = dynamic\\(\\(\\) => import\\('\\.\\/${componentName}'\\)`));
    assert.match(dynamicPanels, new RegExp(`${id}: ${componentName}`));
    assert.notEqual(tab.legacy, true);
  }
  assert.equal(TABS.some((entry) => ['clubs-unions', 'announcements'].includes(entry.id)), false);
  const sectionComponents = { operations: 'ClubsUnionsPanel', announcements: 'AnnouncementsPanel' };
  for (const id of ['operations', 'announcements']) {
    const section = CA_SECTIONS.find(([sectionId]) => sectionId === id);
    assert.ok(section, `${id} Club Arena section`);
    const componentName = sectionComponents[id];
    assert.match(dynamicPanels, new RegExp(`const ${componentName} = dynamic\\(\\(\\) => import\\('\\.\\/${componentName}'\\)`));
    assert.match(dynamicPanels, new RegExp(`${id}: ${componentName}`));
  }
});

test('the route builder preserves section-specific paging names', () => {
  assert.equal(
    floorAdminUrl('floor', { tablesLimit: 100, tablesOffset: 200 }),
    '/api/horses/floor-admin?section=floor&tablesLimit=100&tablesOffset=200',
  );
  assert.equal(tableUrl('table-1', { seatsLimit: 200, seatsOffset: 0 }), '/api/horses/floor-admin?section=table&tableId=table-1&seatsLimit=200&seatsOffset=0');
  assert.equal(eventUrl('event-1'), '/api/horses/floor-admin?section=event&tournamentId=event-1');
});

test('drill-down evidence shaping is bounded and preserves recorded zeroes', () => {
  assert.deepEqual(evidenceEntries({ refund_count: 0, applied: false, note: null }), [
    { key: 'refund_count', label: 'Refund Count', value: '0' },
    { key: 'applied', label: 'Applied', value: 'false' },
    { key: 'note', label: 'Note', value: 'Not Recorded' },
  ]);
  assert.equal(evidenceEntries(Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`field_${index}`, index]))).length, 12);
});

test('partial, diverged and unknown floor disclosures never invent zeroes', () => {
  assert.match(floorDisclosure({ state: 'floor.partial' }).body, /Unknown, Never Zero/);
  assert.match(floorDisclosure({ state: 'floor.unknown' }).title, /Could Not Be Read/);
  const diverged = floorDisclosure({ state: 'floor.diverged', database: { activeTables: 12 }, engine: { activeTables: 4 } });
  assert.match(diverged.body, /Database Active Tables: 12/);
  assert.match(diverged.body, /Engine Active Tables: 4/);
});

test('composition always keeps horse and human counts separately labelled', () => {
  assert.deepEqual(compositionOf({ composition: { occupied: 11, horses: 9, humans: 2 } }), { occupied: 11, horses: 9, humans: 2 });
  assert.deepEqual(compositionOf({ composition: { occupied: 11, horses: null, humans: null } }), { occupied: 11, horses: null, humans: null });
  assert.deepEqual(compositionOf({}), { occupied: null, horses: null, humans: null });
});

test('money formatting never converts through a floating-point number', () => {
  assert.equal(moneyText('123456789012345678.9'), '123,456,789,012,345,678.90');
  assert.equal(moneyText(null), 'Unknown');
  assert.equal(exactDecimalText('9007199254740993.123456'), '9,007,199,254,740,993.123456');
});

test('the pager reads the backend named payload and preserves truncation', () => {
  assert.deepEqual(pageOf({ tables: { rows: [{ id: 1 }], total: 9, truncated: true } }, 'tables'), {
    rows: [{ id: 1 }], total: 9, limit: null, offset: 0, hasMore: false, truncated: true, complete: true,
  });
  assert.equal(pageOf({ tables: { rows: [], total: null } }, 'tables').total, null);
});

test('truncated export is a persistent warning state, never complete', () => {
  const state = exportState({ exported: 100000, total: 120000, complete: false });
  assert.equal(state.state, 'export.truncated');
  assert.match(state.message, /Incomplete/);
});

test('full export advances by the rows the server actually returned when its limit is clamped', async () => {
  const source = Array.from({ length: 450 }, (_, id) => ({ id }));
  const offsets = [];
  const result = await collectAllRows(async (offset, requestedLimit) => {
    offsets.push(offset);
    const serverLimit = Math.min(requestedLimit, 200);
    const rows = source.slice(offset, offset + serverLimit);
    return { rows, total: source.length, offset, limit: serverLimit, hasMore: offset + rows.length < source.length };
  }, { limit: 500, maxPages: 10 });
  assert.deepEqual(offsets, [0, 200, 400]);
  assert.equal(result.rows.length, 450);
  assert.equal(new Set(result.rows.map((row) => row.id)).size, 450);
  assert.equal(result.complete, true);
});

test('cashier and rake unknown states cannot render as healthy empty exports', async () => {
  const cashier = await read('src/components/horses/CashierPanel.jsx');
  const rake = await read('src/components/horses/RakePanel.jsx');
  assert.match(cashier, /cashouts\?\.state === 'queue\.unknown'/);
  assert.match(cashier, /Cashout Queue State Is Unknown\. No Empty Result Is Claimed\./);
  assert.match(cashier, /disabled=\{cashoutsUnknown \|\| cashoutExport\?\.running === true\}/);
  assert.match(rake, /body\?\.state === 'rake\.unknown'/);
  assert.match(rake, /Rake Aggregate State Is Unknown\. No Empty Window Or Total Is Claimed\./);
  assert.match(rake, /disabled=\{rakeUnknown \|\| !aggregateComplete \|\| exportResult\?\.running === true\}/);
});

test('rake exports full-window aggregates with exact decimal strings and freshness disclosure', async () => {
  const panel = await read('src/components/horses/RakePanel.jsx');
  assert.match(panel, /exactDecimalText\(row\.rake_amount\)/);
  assert.match(panel, /Export Full Report/);
  assert.match(panel, /Rake Rollups Are Stale/);
  assert.match(panel, /Includes Horses/);
  assert.match(panel, /<Pager offset=\{rake\.offset\}/);
  assert.doesNotMatch(panel, /parseFloat|Number\(row\.rake_amount\)/);
});

test('links point into actual Club Arena SPA routes', () => {
  assert.equal(clubArenaLink('table', { id: 't1', club_id: 'c1' }), '/hub/club-arena/clubs/c1/table-management');
  assert.equal(clubArenaLink('table', { id: 't1' }), '/hub/club-arena');
  assert.equal(clubArenaLink('tournament', { id: 'e1' }), '/hub/club-arena/tournaments/e1');
  assert.equal(clubArenaLink('cashier', { club_id: 'c1' }), '/hub/club-arena/clubs/c1/cashier');
  assert.equal(clubArenaLink('cashier', {}), '/hub/club-arena/cashier');
  assert.equal(clubArenaLink('club-announcement', { club_id: 'c1' }), '/hub/club-arena/clubs/c1/announcements');
  assert.equal(clubArenaLink('union-announcement', { union_id: 'u1' }), '/hub/club-arena/unions/u1/operations');
});

test('Phase 6 panels parse and ship no browser database writes, generic authority or forbidden copy', async () => {
  for (const name of PANELS) {
    const source = await read(`src/components/horses/${name}`);
    assert.doesNotThrow(() => parse(source, { sourceType: 'module', plugins: ['jsx'] }), name);
    assert.doesNotMatch(source, /\.rpc\s*\(/);
    if (EXPORT_PANELS.includes(name)) assert.match(source, /exportAllCsv/, `${name}: export surface`);
    assert.doesNotMatch(source, /\b(bot|AI Model)\b/i);
    assert.ok(!source.includes('\u2014'), `${name}: no em dash`);
    assert.doesNotMatch(source, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u);
  }
});

test('each client export records one prepared-file receipt before requesting browser delivery', async () => {
  const exportSource = await read('src/components/horses/exportAllCsv.js');
  assert.match(exportSource, /await recordCompletion\(\{ rowCount: shaped\.length, total, complete \}\);[\s\S]*downloadCsv/);
  assert.doesNotMatch(exportSource, /delivery:\s*'completed'/);
  for (const name of EXPORT_PANELS) assert.match(await read(`src/components/horses/${name}`), /recordCompletion:/, `${name}: completion receipt`);
  const calls = [];
  const receipt = await recordExportCompletion(async (url, options) => { calls.push({ url, options }); return { recorded: true }; }, { section: 'floor', filters: { status: 'live' }, rowCount: 2, complete: true });
  assert.equal(receipt.recorded, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].options.body), { action: 'record_export_prepared', exportId: JSON.parse(calls[0].options.body).exportId, section: 'floor', filters: { status: 'live' }, rowCount: 2, complete: true });
});

test('cashier exposes paging, selection mode and the existing authoritative cashout cancellation path', async () => {
  const source = await read('src/components/horses/CashierPanel.jsx');
  assert.match(source, /Age And SLA/); assert.match(source, /Select Cancellations/);
  assert.match(source, /Previous/); assert.match(source, /Next/);
  assert.match(source, /Confirm Listed Cancellations/);
  assert.match(source, /\/api\/club-arena\/approve-cashout/);
  assert.match(source, /retainCashoutTerminalIntent/);
  assert.match(source, /No Bulk Approval Is Available/);
});

test('chip request decisions use the shared confirmation dialog and never browser confirm', async () => {
  const cashier = await read('src/components/horses/CashierPanel.jsx');
  assert.match(cashier, /import ConfirmDialog from '\.\/ConfirmDialog'/);
  assert.match(cashier, /<ConfirmDialog/);
  assert.match(cashier, /requireTyped=\{chipConfirm\.decision === 'approve' \? 'FUND' : null\}/);
  assert.doesNotMatch(cashier, /globalThis\.confirm|window\.confirm/);
});

test('club, union and announcement panels consume all narrowed read sections and compose links', async () => {
  const oversight = await read('src/components/horses/ClubsUnionsPanel.jsx');
  assert.match(oversight, /clubsUrl/); assert.match(oversight, /clubUrl/); assert.match(oversight, /unionsUrl/); assert.match(oversight, /unionUrl/);
  assert.match(oversight, />Previous \{label\}</); assert.match(oversight, />Next \{label\}</);
  assert.match(oversight, /Review And Fund Club/); assert.match(oversight, /At Least 10 Characters/);
  assert.doesNotMatch(oversight, /globalThis\.confirm|window\.confirm/);
  assert.match(oversight, /ConfirmDialog/); assert.match(oversight, /Stop-Loss Versus Deposit/);
  assert.match(oversight, /Rake Share, 30 Days/); assert.match(oversight, /Terminal Or Deleted Clubs Cannot Be Reactivated Here/);
  const announcements = await read('src/components/horses/AnnouncementsPanel.jsx');
  assert.match(announcements, /club-announcement/); assert.match(announcements, /union-announcement/);
  assert.match(announcements, /Pending Deliveries/); assert.match(announcements, /Platform Broadcast Remains Deferred/);
  assert.match(announcements, /Priority:/); assert.match(announcements, /Pin State:/);
  for (const panel of ['FloorPanel.jsx', 'TournamentsPanel.jsx', 'RakePanel.jsx', 'AnnouncementsPanel.jsx']) assert.match(await read(`src/components/horses/${panel}`), /<Pager /, `${panel}: pager`);
});

test('mobile cards and intentional desktop tables are both wired', async () => {
  const css = await read('src/components/horses/shared.module.css');
  assert.match(css, /\.opsCards \{ display: grid; grid-template-columns: 1fr;/);
  assert.match(css, /\.opsDesktop \{ display: none;/);
  assert.match(css, /\.opsFactLabel \{[^}]*font-size: 12px;/);
  assert.match(css, /@media \(min-width: 768px\)[\s\S]*?\.opsCards \{ display: none; \}[\s\S]*?\.opsDesktop \{ display: block;/);
  const floor = await read('src/components/horses/FloorPanel.jsx');
  assert.match(floor, /className=\{styles\.opsCards\}/);
  assert.match(floor, /className=\{styles\.opsDesktop\}/);
  assert.match(floor, /className=\{`\$\{styles\.opsSide\}/);
});

test('floor and tournament lists expose read-only drill-downs with explicit unknown and dry-run states', async () => {
  const floor = await read('src/components/horses/FloorPanel.jsx');
  const tournaments = await read('src/components/horses/TournamentsPanel.jsx');
  assert.match(floor, /tableUrl\(tableId, \{ seatsLimit: 200, seatsOffset: 0 \}\)/);
  assert.match(floor, /View Seats/);
  assert.match(floor, /Type Unknown/);
  assert.match(floor, /No Occupied Seats Were Reported/);
  assert.match(tournaments, /eventUrl\(tournamentId\)/);
  assert.match(tournaments, /View Event Evidence/);
  assert.match(tournaments, /No Overlay Record/);
  assert.match(tournaments, /Cancellation And Refund Receipt/);
  assert.match(tournaments, /Dry Run Only/);
  assert.match(tournaments, /Apply Set To False/);
});
