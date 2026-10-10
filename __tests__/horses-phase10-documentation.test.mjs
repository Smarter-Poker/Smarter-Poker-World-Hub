import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const RUNBOOK = read('docs/horses/STABLE-ADMIN-OPERATOR-RUNBOOK.md');
const CONTRACTS = read('docs/horses/PHASE10-CONTRACTS.md');
const MATRIX = read('docs/horses/STABLE-ADMIN-PERMISSION-MATRIX.md');
const DISCLOSURE = read('docs/horses/STABLE-ADMIN-GLI19-DISCLOSURE.md');
const RESCORE = read('docs/horses/STABLE-ADMIN-FINAL-GAP-RESCORE.md');
const HANDOFF10 = read('docs/horses/HANDOFF-2026-10-05-phase10.md');
const HANDOFF11 = read('docs/horses/HANDOFF-2026-10-06-phase11.md');
const CURRENT = read('docs/HANDOFF_CURRENT_STATE.md');
const PLAN = read('docs/horses/STABLE-ADMIN-OVERHAUL-PLAN.md');
const REGISTRY = read('src/components/horses/tabRegistry.js');
const PERMISSIONS = read('src/lib/horses/permissions.js');

function literalObjects(source, exportName) {
  const match = source.match(new RegExp(`export const ${exportName} = \\[([\\s\\S]*?)\\n\\];`));
  assert.ok(match, `${exportName} must remain a literal array`);
  return [...match[1].matchAll(/\{\s*id:\s*'([^']+)',\s*label:\s*'([^']+)',\s*permission:\s*'([^']+)'/g)]
    .map((entry) => ({ id: entry[1], label: entry[2], permission: entry[3] }));
}

function exportedStringValues(source, exportName) {
  const match = source.match(new RegExp(`export const ${exportName} = Object\\.freeze\\(\\{([\\s\\S]*?)\\n\\}\\);`));
  assert.ok(match, `${exportName} must remain an Object.freeze literal`);
  return [...match[1].matchAll(/[A-Z_]+:\s*'([^']+)'/g)].map((entry) => entry[1]);
}

test('the operator runbook covers every visible top-level tab with its canonical opening permission', () => {
  const tabs = literalObjects(REGISTRY, 'TABS');
  assert.equal(tabs.length, 28);
  for (const tab of tabs) {
    const row = RUNBOOK.split('\n').find((line) => line.startsWith(`| \`${tab.id}\` |`));
    assert.ok(row, `${tab.id} must have a runbook row`);
    assert.ok(row.includes(`| \`${tab.permission}\` |`), `${tab.id} must name its canonical opening permission`);
  }
  for (const section of ['overview', 'clubs', 'revenue', 'ledger', 'finance', 'users', 'unions', 'approvals', 'operations', 'announcements']) {
    assert.ok(RUNBOOK.split('\n').some((line) => line.startsWith(`| \`${section}\` |`)));
  }
});

test('the permission record covers the full canonical vocabulary and every role', () => {
  const vocabulary = exportedStringValues(PERMISSIONS, 'PERMISSIONS');
  assert.equal(vocabulary.length, 22);
  for (const permission of vocabulary) {
    assert.ok(MATRIX.split('\n').some((line) => line.startsWith(`| \`${permission}\` |`)), `${permission} must have a matrix row`);
  }
  for (const role of ['owner', 'operations', 'finance', 'compliance', 'support', 'read_only', 'god', 'superadmin', 'admin']) {
    assert.match(MATRIX.toLowerCase().replaceAll(' ', '_'), new RegExp(role));
  }
  assert.match(MATRIX, /UI visibility is not authorization|Opening a tab grants no mutation authority/i);
  assert.match(MATRIX, /PostgREST/);
});

test('the final re-score accounts for every numbered gap from the original plan exactly once', () => {
  const planIds = [...PLAN.matchAll(/^([FHPIOECAX]\d+) \[/gm)].map((match) => match[1]);
  assert.equal(planIds.length, 83);
  assert.equal(new Set(planIds).size, planIds.length);
  for (const id of planIds) {
    const rows = RESCORE.match(new RegExp(`^\\| ${id} \\|`, 'gm')) || [];
    assert.equal(rows.length, 1, `${id} must have exactly one score row`);
  }
  const scoredIds = [...RESCORE.matchAll(/^\| ([FHPIOECAX]\d+) \|/gm)].map((match) => match[1]);
  assert.deepEqual(new Set(scoredIds), new Set(planIds));
  const scoreRows = [...RESCORE.matchAll(/^\| [FHPIOECAX]\d+ \| (Resolved Elsewhere|Resolved|Partial|Open) \|/gm)]
    .map((match) => match[1]);
  const scoreCounts = Object.fromEntries(
    ['Resolved', 'Resolved Elsewhere', 'Partial', 'Open'].map((score) => [
      score,
      scoreRows.filter((candidate) => candidate === score).length,
    ]),
  );
  for (const [score, count] of Object.entries(scoreCounts)) {
    assert.match(RESCORE, new RegExp(`\\| ${score} \\| ${count} \\|`));
  }
  const partialIds = [...RESCORE.matchAll(/^\| ([FHPIOECAX]\d+) \| Partial \|/gm)]
    .map((match) => match[1]);
  assert.deepEqual(partialIds, ['P3', 'O1', 'O2', 'O7', 'C2', 'C4']);
  const partialProse = RESCORE.match(/The six partial items[\s\S]*?stubs: ([^.]+)\./);
  assert.ok(partialProse, 'the final score must name every partial item');
  assert.deepEqual(
    partialProse[1].replace(/,?\s+and\s+|,\s+/g, ',').split(',').map((id) => id.trim()),
    partialIds,
  );
  assert.match(RESCORE, /\| Total \| 83 \|/);
  assert.doesNotMatch(RESCORE, /^\| [FHPIOECAX]\d+ \| Open \|/m);
});

test('the disclosure pins the never-delete register and required attestation fields', () => {
  for (const term of ['ca_horse_fleet_register', 'owner_entity', 'funding_source', 'created_at', 'registered_at', 'retired_at', 'disclosed']) {
    assert.match(DISCLOSURE, new RegExp(term));
  }
  assert.match(DISCLOSURE, /never deletes|Never delete/i);
  assert.match(DISCLOSURE, /Horses are players|same game rules/i);
  assert.match(DISCLOSURE, /not a representation that a regulator has certified/i);
});

test('the current handoff points to the Phase 11 closeout and retains the ten-phase source map', () => {
  assert.match(CURRENT, /HANDOFF-2026-10-06-phase11\.md/);
  assert.match(CURRENT, /HANDOFF-2026-10-05-phase10\.md/);
  for (let phase = 1; phase <= 10; phase += 1) {
    assert.match(HANDOFF10, new RegExp(`\\| ${phase} \\|`), `Phase ${phase} must be recorded`);
  }
  for (const layer of ['source', 'database', 'publication', 'live behavior']) {
    assert.match(HANDOFF11.toLowerCase(), new RegExp(layer));
  }
  assert.match(HANDOFF11, /No pending row may remain/);
  const deliveryRecord = HANDOFF11
    .split('## Delivery Record')[1]
    .split('No pending row may remain')[0];
  assert.doesNotMatch(deliveryRecord, /\| Pending(?:[ .]|$)/i);
  assert.match(deliveryRecord, /PR #2157/);
  assert.match(deliveryRecord, /aa5c7f548f8dc4e8aa8f070aa42a212414eaacdb/);
  assert.match(deliveryRecord, /production certificate PR #\d+/i);
  assert.match(deliveryRecord, /run \d+/i);
  assert.match(deliveryRecord, /job \d+/i);
  assert.match(deliveryRecord, /stable-admin-production-certificate-\d+-\d+/);
  assert.match(deliveryRecord, /certificate status `?passed`?/i);
  assert.match(deliveryRecord, /stableAcrossRun `?true`?/i);
  assert.match(deliveryRecord, /[0-9a-f]{40}/);
  assert.match(deliveryRecord, /dpl_[A-Za-z0-9]+/);
  assert.match(deliveryRecord, /READY/);
  assert.match(deliveryRecord, /`\/api\/health`/);
  assert.match(deliveryRecord, /database `?ok`?/i);
  assert.match(deliveryRecord, /`\/horses`[^|]*200/i);
  for (const route of ['economy-admin', 'floor-admin', 'integrity-admin', 'platform-admin']) {
    assert.match(deliveryRecord, new RegExp(`${route}[^|]*401`, 'i'));
  }
  assert.match(deliveryRecord, /1440x900/);
  assert.match(deliveryRecord, /375x812/);
  assert.match(deliveryRecord, /28 tabs/);
  for (const surface of ['Live Floor', 'Tournaments', 'Identity Links', 'Platform Incidents', 'Close And Jobs']) {
    assert.match(deliveryRecord, new RegExp(surface, 'i'));
  }
  assert.match(deliveryRecord, /authenticated[^|]*admin APIs[^|]*2xx/i);
  assert.match(deliveryRecord, /no mutations/i);
  assert.match(deliveryRecord, /no page or chunk errors/i);
  assert.match(deliveryRecord, /no horizontal overflow/i);
  for (const version of ['20261006022120', '20261006022123', '20261006024310', '20261006171233']) {
    assert.match(HANDOFF11, new RegExp(version));
  }
  for (const hash of [
    'e03f21038d7b9113b813041406413f63d3909536b11d09eefff297339f86609a',
    '3aac8dc4ac4918ea3ba80f55843aacf7a4884a8d2be401e351ab6cf87b24b336',
    '9c829b3659e0e60b8464c888dcd5b61c732644a41f672f5e05a2372335f93e37',
    '5780f6a072ad2119caf192dcc5df49fad20f987a9c6d622b6b2cf7b3722cf1ec',
  ]) {
    assert.match(HANDOFF11, new RegExp(hash));
  }
  for (const laterPr of ['2185', '2188', '2189', '2191']) {
    assert.match(deliveryRecord, new RegExp(`PR #${laterPr}`));
  }
  for (const consumer of ['Statistics', 'Settings', 'Pipeline']) {
    assert.match(deliveryRecord, new RegExp(consumer));
  }
  assert.match(deliveryRecord, /Global Footer E2E[^|]*passed/i);
  assert.match(HANDOFF11, /SQLSTATE `0A000`/);
  assert.doesNotMatch(HANDOFF11, /Trigger-only\s+functions have no application execute grant/);
  for (const boundary of ['P3', 'C2', 'C4', 'private object store']) {
    assert.match(HANDOFF11, new RegExp(boundary));
  }
});

test('Phase 10 and Phase 11 documents contain no UI-forbidden dash or emoji bytes', () => {
  const joined = [CONTRACTS, RUNBOOK, MATRIX, DISCLOSURE, RESCORE, HANDOFF10, HANDOFF11, CURRENT].join('\n');
  assert.doesNotMatch(joined, /[—–]/u);
  assert.doesNotMatch(joined, /[\u{1F300}-\u{1FAFF}]/u);
});
