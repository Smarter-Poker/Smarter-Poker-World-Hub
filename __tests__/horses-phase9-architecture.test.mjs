import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { TABS, visibleTabs } from '../src/components/horses/tabRegistry.js';
import {
  patchOperatorContext,
  readyOperatorContext,
  unknownOperatorContext,
} from '../src/components/horses/stableAdminState.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

const LEGACY_REDIRECTS = new Map([
  ['pages/horses/sql-console.js', 'sql-console'],
  ['pages/horses/hg-moderation.js', 'hg-moderation'],
  ['pages/horses/hand-reviews.js', 'hand-reviews'],
]);

test('the Phase 9 registry has 28 real, pure-data tabs', () => {
  const rendered = visibleTabs(TABS);
  assert.equal(rendered.length, 28);
  assert.equal(new Set(rendered.map((tab) => tab.id)).size, 28, 'tab ids must be unique');
  assert.equal(new Set(rendered.map((tab) => tab.label)).size, 28, 'tab labels must be unique');

  for (const tab of rendered) {
    assert.equal(typeof tab.id, 'string', `${tab.label} needs an id`);
    assert.equal(typeof tab.label, 'string', `${tab.id} needs a label`);
    assert.equal(typeof tab.permission, 'string', `${tab.id} needs a permission`);
    assert.equal(Object.hasOwn(tab, 'legacy'), false, `${tab.id} still carries legacy state`);
    assert.equal(Object.hasOwn(tab, 'load'), false, `${tab.id} still carries a runtime loader`);
  }

  assert.equal(rendered.find((tab) => tab.id === 'fleet')?.aliases?.includes('grinder'), true);
  assert.equal(rendered.find((tab) => tab.id === 'sql-console')?.permission, 'sql.execute');
  assert.equal(rendered.find((tab) => tab.id === 'hg-moderation')?.permission, 'players.read');
  assert.equal(rendered.find((tab) => tab.id === 'hand-reviews')?.permission, 'fleet.read');
});

test('every tab resolves through one explicit top-level dynamic declaration', async () => {
  const source = await read('src/components/horses/dynamicPanels.js');
  const declarations = new Map(
    [...source.matchAll(/const\s+(\w+Panel)\s*=\s*dynamic\([\s\S]*?import\('\.\/(\w+Panel)'\)[\s\S]*?\);/g)]
      .map((match) => [match[1], match[2]]),
  );
  for (const [declared, imported] of declarations) {
    assert.equal(declared, imported, `${declared} must import its matching module explicitly`);
  }

  const mapBody = source.match(/export const TAB_PANEL_COMPONENTS = Object\.freeze\(\{([\s\S]*?)\}\);/)?.[1];
  assert.ok(mapBody, 'the tab component map must remain explicit');
  const entries = [...mapBody.matchAll(/^\s*(?:'([^']+)'|([a-z][\w-]*)):\s*(\w+Panel),?\s*$/gm)]
    .map((match) => [match[1] || match[2], match[3]]);
  assert.equal(entries.length, 28, 'one explicit component entry is required per rendered tab');
  assert.deepEqual(new Set(entries.map(([id]) => id)), new Set(visibleTabs(TABS).map((tab) => tab.id)));
  for (const [id, component] of entries) {
    assert.ok(declarations.has(component), `${id} maps to undeclared ${component}`);
  }

  assert.doesNotMatch(source, /dynamic\(\s*(?:tab|section)\.load/);
  assert.match(source, /ssr:\s*false/);
  assert.match(source, /role="alert"/);
  assert.match(source, /onClick=\{retry\}/);
});

test('the shell has one registry panel seam and no external or inline legacy tab bodies', async () => {
  const [shell, registry] = await Promise.all([
    read('pages/horses/index.js'),
    read('src/components/horses/tabRegistry.js'),
  ]);
  assert.doesNotMatch(registry, /\bEXTERNAL_LINKS\b/);
  assert.doesNotMatch(shell, /\bEXTERNAL_LINKS\b/);
  const panelVariable = shell.match(/const\s+(\w+)\s*=\s*activeTabEntry\s*\?\s*panelComponentFor\(activeTabEntry\.id\)\s*:\s*null/)?.[1];
  assert.ok(panelVariable, 'the active tab must resolve through panelComponentFor');
  assert.match(shell, new RegExp(`<${panelVariable}\\s+[\\s\\S]*?authFetch=\\{authFetch\\}`));

  for (const tab of visibleTabs(TABS)) {
    const escaped = tab.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.doesNotMatch(
      shell,
      new RegExp(`\\{activeTab === ['"]${escaped}['"] && \\(`),
      `${tab.id} still has an inline shell-owned body`,
    );
  }
});

test('legacy standalone routes are non-permanent server redirect wrappers', async () => {
  for (const [path, tab] of LEGACY_REDIRECTS) {
    const source = await read(path);
    assert.match(source, /export async function getServerSideProps\(\{ query \}\)/, path);
    assert.match(source, new RegExp(`redirectedQuery\\(query, ['"]${tab}['"]\\)`), path);
    assert.match(source, /destination:\s*`\/horses\?\$\{/, path);
    assert.match(source, /permanent:\s*false/, path);
    assert.match(source, /export default function \w+Redirect\(\)\s*\{\s*return null;\s*\}/, path);
    assert.doesNotMatch(source, /useRouter|useEffect|window\.location|<Head|<main/, path);
  }
});

test('shared operator state preserves null, empty, patch and account-reset semantics', async () => {
  const unknown = unknownOperatorContext('operator-a', 7);
  assert.equal(unknown.permissions, null);
  assert.equal(unknown.policy, null);
  assert.equal(unknown.aloneRule, null);
  assert.equal(unknown.sessionGeneration, 7);

  const ready = readyOperatorContext({
    operatorId: 'operator-a',
    permissions: [],
    navigationBadges: { openTickets: 2 },
    socialSettings: { engine_enabled: true },
  }, null, 7);
  assert.deepEqual(ready.permissions, [], 'an authoritative empty grant list is not unknown');
  const patched = patchOperatorContext(ready, { policy: { approvals_enabled: true } });
  assert.deepEqual(patched.permissions, []);
  assert.deepEqual(patched.navigationBadges, { openTickets: 2 });
  const cleared = patchOperatorContext(patched, { permissions: null });
  assert.equal(cleared.permissions, null, 'explicit null must clear a shared answer');

  const reset = unknownOperatorContext(null, ready.sessionGeneration + 1);
  assert.equal(reset.operatorId, null);
  assert.equal(reset.currentUser, null);
  assert.equal(reset.permissions, null);
  assert.equal(reset.navigationBadges, null);
  assert.equal(reset.socialSettings, null);
  assert.equal(reset.sessionGeneration, 8);

  const store = await read('src/stores/stableAdminStore.js');
  assert.doesNotMatch(store, /persist\s*\(|localStorage|sessionStorage/);
  assert.match(store, /resetOperatorContext:[\s\S]*unknownOperatorContext\(fallbackOperatorId, state\.sessionGeneration \+ 1\)/);
  const executableStore = store
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of ['activeTab', 'caSection', 'sqlHistory', 'modalDraft', 'filters']) {
    assert.doesNotMatch(executableStore, new RegExp(`\\b${forbidden}\\b`), `${forbidden} is panel-local state`);
  }
});

test('the named-role database helper gates every folded RPC with canonical permissions', async () => {
  const migration = await read('supabase/migrations/20261005231629_stable_admin_phase9_named_operator_database_gates.sql');
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.fn_ca_operator_has_permission\(/);
  assert.match(migration, /auth\.uid\(\) <> p_user_id/);
  assert.match(migration, /public\.fn_ca_operator_permissions\(p_user_id\)/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.fn_ca_operator_has_permission\(uuid, text\)[\s\S]*FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.fn_ca_operator_has_permission\(uuid, text\)[\s\S]*TO authenticated, service_role/);
  assert.match(migration, /fn_is_horse_admin[\s\S]*'fleet\.read'/);
  assert.equal(migration.includes(String.raw`\\(`), false, 'PostgreSQL regex literals must not use JavaScript double escaping');
  assert.equal(migration.includes(String.raw`\\[`), false, 'PostgreSQL array regex literals must not use JavaScript double escaping');
  assert.equal(migration.includes(String.raw`\(`), true, 'literal parentheses remain escaped for PostgreSQL regex');
  assert.match(migration, /\(\[A-Za-z_\]\[A-Za-z0-9_.\]\*\\\.\)\?role/, 'bare and qualified role columns must both match');

  const gates = [
    ['get_home_content_report_detail(uuid,uuid)', 'players.read'],
    ['list_home_content_reports(uuid,text,text,integer,integer)', 'players.read'],
    ['resolve_home_content_report(uuid,text,text,uuid)', 'moderation.write'],
    ['fn_get_home_games_onboarding_status_admin(uuid,uuid)', 'players.read'],
    ['fn_anonymize_hg_user_content(uuid,uuid)', 'gdpr.erase'],
    ['list_home_ban_appeals_admin(uuid,text,uuid,integer,integer)', 'players.read'],
    ['review_home_ban_appeal(uuid,text,text,uuid)', 'moderation.write'],
  ];
  for (const [signature, permission] of gates) {
    assert.match(migration, new RegExp(`${signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"),\\s]+['"]${permission.replace('.', '\\.')}['"]`));
  }
  assert.match(migration, /Post-apply gate missing from/);
});

test('every folded caller-scoped RPC is executable by authenticated but never anon', async () => {
  const grants = await read('supabase/migrations/20261005232042_stable_admin_phase9_rpc_execute_grants.sql');
  const signatures = [
    'get_home_content_report_detail(uuid, uuid)',
    'list_home_content_reports(uuid, text, text, integer, integer)',
    'resolve_home_content_report(uuid, text, text, uuid)',
    'fn_get_home_games_onboarding_status_admin(uuid, uuid)',
    'fn_anonymize_hg_user_content(uuid, uuid)',
    'list_home_ban_appeals_admin(uuid, text, uuid, integer, integer)',
    'review_home_ban_appeal(uuid, text, text, uuid)',
  ];
  for (const signature of signatures) {
    const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(grants, new RegExp(`REVOKE ALL ON FUNCTION public\\.${escaped} FROM PUBLIC, anon`));
    assert.match(grants, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${escaped} TO authenticated, service_role`));
  }
  assert.match(grants, /fn_ca_operator_has_permission/);
  assert.match(grants, /has_function_privilege\('authenticated'/);
  assert.match(grants, /has_function_privilege\('anon'/);
});

test('the production PostgREST proof is isolated, credential-backed and manually dispatchable', async () => {
  const [probe, workflow] = await Promise.all([
    read('scripts/ci/horses-phase9-postgrest-live.mjs'),
    read('.github/workflows/e2e-tests.yml'),
  ]);
  assert.match(probe, /signInWithPassword/);
  assert.match(probe, /fn_ca_operator_has_permission/);
  assert.match(probe, /mismatchedIdentityRefused/);
  assert.match(probe, /unknownPermissionRefused/);
  assert.match(probe, /anonymousRefused/);
  assert.doesNotMatch(probe, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(workflow, /options: \[full, horses-phase9-postgrest,/);
  assert.match(workflow, /node scripts\/ci\/horses-phase9-postgrest-live\.mjs/);
  assert.match(workflow, /TEST_USER_PASSWORD: \$\{\{ secrets\.TEST_USER_PASSWORD \}\}/);
});

test('the production build runs the Phase 9 lazy-bundle checker', async () => {
  const checkerPath = new URL('scripts/check-horses-phase9-bundles.mjs', ROOT);
  assert.equal(existsSync(checkerPath), true, 'bundle checker is required once Phase 9 adds it');
  const [checker, pkgSource] = await Promise.all([
    read('scripts/check-horses-phase9-bundles.mjs'),
    read('package.json'),
  ]);
  const pkg = JSON.parse(pkgSource);
  assert.match(pkg.scripts?.build || '', /node scripts\/check-horses-phase9-bundles\.mjs/);
  assert.match(checker, /\.next\/build-manifest\.json/);
  assert.match(checker, /react-loadable-manifest\.json/);
  assert.match(checker, /initialFiles\.has\(file\)/);
  assert.match(checker, /baselinePageBytes/);
});


test('the existing production-build browser gate enforces desktop and mobile console navigation', async () => {
  const workflow = await read('.github/workflows/global-footer-e2e.yml');
  assert.match(workflow, /npx playwright test e2e\/025-horses-console-phase9\.spec\.ts --project=chromium --project=mobile-chrome --no-deps --workers=1/);
  assert.match(workflow, /PLAYWRIGHT_BASE_URL: http:\/\/127\.0\.0\.1:\$\{\{ steps\.port\.outputs\.port \}\}/);
});
