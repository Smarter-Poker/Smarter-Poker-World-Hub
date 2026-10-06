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
const HANDOFF = read('docs/horses/HANDOFF-2026-10-05-phase10.md');
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
  const families = ['F', 'H', 'P', 'I', 'O', 'E', 'C', 'A', 'X'];
  const planIds = [...PLAN.matchAll(/^([FHPIOECAX]\d+) \[/gm)].map((match) => match[1]);
  assert.equal(planIds.length, 83);
  assert.equal(new Set(planIds).size, planIds.length);
  for (const id of planIds) {
    const rows = RESCORE.match(new RegExp(`^\\| ${id} \\|`, 'gm')) || [];
    assert.equal(rows.length, 1, `${id} must have exactly one score row`);
  }
  const scoredIds = [...RESCORE.matchAll(/^\| ([FHPIOECAX]\d+) \|/gm)].map((match) => match[1]);
  assert.deepEqual(new Set(scoredIds), new Set(planIds));
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

test('the current handoff points to the ten-phase continuation and separates delivery layers', () => {
  assert.match(CURRENT, /HANDOFF-2026-10-05-phase10\.md/);
  for (let phase = 1; phase <= 10; phase += 1) {
    assert.match(HANDOFF, new RegExp(`\\| ${phase} \\|`), `Phase ${phase} must be recorded`);
  }
  for (const layer of ['source', 'database', 'publication', 'live behavior']) {
    assert.match(HANDOFF.toLowerCase(), new RegExp(layer));
  }
  assert.match(HANDOFF, /No pending cell above may remain/);
  const deliveryRecord = HANDOFF
    .split('## 9. Final Delivery Record')[1]
    .split('No pending cell above may remain')[0];
  assert.doesNotMatch(deliveryRecord, /\| Pending(?:[ .]|$)/i);
  assert.match(deliveryRecord, /PR #\d+/);
  assert.match(deliveryRecord, /dpl_[A-Za-z0-9]+/);
  assert.match(deliveryRecord, /READY/);
  assert.match(deliveryRecord, /`\/api\/health`/);
  assert.match(deliveryRecord, /12\/12/);
});

test('Phase 10 documents contain no UI-forbidden dash or emoji bytes', () => {
  const joined = [CONTRACTS, RUNBOOK, MATRIX, DISCLOSURE, RESCORE, HANDOFF, CURRENT].join('\n');
  assert.doesNotMatch(joined, /[—–]/u);
  assert.doesNotMatch(joined, /[\u{1F300}-\u{1FAFF}]/u);
});
