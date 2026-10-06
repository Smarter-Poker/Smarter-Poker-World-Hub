import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  patchOperatorContext,
  readyOperatorContext,
  unknownOperatorContext,
} from '../src/components/horses/stableAdminState.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

test('operator context preserves unknown, empty and explicit null as different answers', () => {
  const unknown = unknownOperatorContext('fallback-id');
  assert.equal(unknown.contextStatus, 'unknown');
  assert.equal(unknown.operatorId, 'fallback-id');
  assert.equal(unknown.permissions, null);
  assert.equal(unknown.navigationBadges, null);
  assert.equal(unknown.socialSettings, null);

  const ready = readyOperatorContext({ permissions: [], policy: null, operatorId: 'operator-id' });
  assert.equal(ready.contextStatus, 'ready');
  assert.deepEqual(ready.permissions, []);
  assert.equal(ready.policy, null);

  const changed = patchOperatorContext(ready, { policy: { approvals_enabled: true } });
  assert.deepEqual(changed.permissions, [], 'an omitted grant list must survive a policy-only save');
  const cleared = patchOperatorContext(changed, { permissions: null });
  assert.equal(cleared.permissions, null, 'explicit null clears rather than preserving');
  const reset = unknownOperatorContext(null, 4);
  assert.equal(reset.sessionGeneration, 4, 'account reset generation is retained');
});

test('the zustand store is session-only and exposes narrow integration selectors', async () => {
  const source = await read('src/stores/stableAdminStore.js');
  assert.match(source, /create\(\(set\) =>/);
  assert.doesNotMatch(source, /persist\s*\(|localStorage|sessionStorage/);
  for (const name of [
    'selectOperatorId', 'selectOperatorRole', 'selectOperatorPermissions',
    'selectOperatorPolicy', 'selectOperatorAloneRule', 'selectPermissionsDegraded',
    'selectCurrentUser', 'selectSessionGeneration', 'selectNavigationBadges',
    'selectSocialSettings', 'selectApplyOperatorContext',
    'resetStableAdminStore',
  ]) assert.match(source, new RegExp(`export (?:const|function) ${name}\\b`), name);
});

test('dynamic panels use explicit top-level imports Next can discover and preload', async () => {
  const source = await read('src/components/horses/dynamicPanels.js');
  const imports = [...source.matchAll(/dynamic\(\s*\(\) => import\('\.\/(\w+Panel)'\)/g)].map((m) => m[1]);
  assert.deepEqual(new Set(imports).size, imports.length, 'one dynamic declaration per panel');
  for (const panel of [
    'FleetPanel', 'EconomyPanel', 'MintPanel', 'StaffPanel', 'ApprovalsPanel',
    'PlayersPanel', 'IntegrityPanel', 'FloorPanel', 'TournamentsPanel',
    'CashierPanel', 'RakePanel', 'PlatformPanel', 'ClubsUnionsPanel',
    'AnnouncementsPanel', 'PipelinePanel', 'AntiAbusePanel', 'BugReportsPanel',
    'GeevesPanel', 'ReviewsPanel', 'ScrapersPanel', 'SqlConsolePanel',
    'HgModerationPanel', 'PromoPanel',
  ]) assert.ok(imports.includes(panel), `${panel} needs a literal dynamic import`);
  assert.doesNotMatch(source, /dynamic\(\s*tab\.load|dynamic\(\s*section\.load/);
  assert.match(source, /ssr:\s*false/);
  assert.match(source, /role="alert"/);
  assert.match(source, /onClick=\{retry\}/);
});

test('virtual tables retain native semantics for short lists and describe large lists', async () => {
  const source = await read('src/components/horses/VirtualDataTable.jsx');
  assert.match(source, /rows\.length > virtualizeAt/);
  assert.match(source, /<DataTable[\s\S]*columns=\{columns\}[\s\S]*rows=\{rows\}/);
  assert.match(source, /import \{ List \} from 'react-window'/);
  assert.match(source, /role="table"/);
  assert.match(source, /aria-rowcount=\{rows\.length \+ 1\}/);
  assert.match(source, /role="columnheader"/);
  assert.match(source, /role="row"/);
  assert.match(source, /role="cell"/);
  assert.match(source, /aria-rowindex=\{index \+ 2\}/);
  assert.match(source, /rowKey=\{rowKey\}/);
  assert.match(source, /overscanCount=\{overscanCount\}/);
});
