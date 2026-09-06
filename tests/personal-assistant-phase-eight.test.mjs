import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseNativeSolverImport,
  NativeSolverImportError,
} from '../src/lib/sandbox/nativeSolverImport.mjs';
import {
  openDeletionChallenge,
  sealDeletionChallenge,
} from '../src/lib/personal-assistant/dataLifecycle.mjs';
import {
  canaryAssignment,
  evaluateCanaryHealth,
} from '../src/lib/personal-assistant/engineCanary.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('native solver import accepts strict Sandbox JSON without inventing state', () => {
  const parsed = parseNativeSolverImport(JSON.stringify({
    board: ['Kh', 'Jd', '3c'],
    heroPosition: 'CO',
    potSize: 75,
    effStack: 120,
    villains: [{ position: 'BB', range: 'AA,KK,AKs' }],
  }), { fileName: 'spot.json' });
  assert.equal(parsed.provider, 'Smarter.Poker');
  assert.equal(parsed.state.heroPosition, 'CO');
  assert.equal(parsed.state.potSize, 75);
  assert.deepEqual(parsed.state.board.flop, ['Kh', 'Jd', '3c']);
  assert.deepEqual(parsed.warnings, []);
});

test('native solver import reads PioSolver text and GTO+ table exports', () => {
  const pio = parseNativeSolverImport(`PioSOLVER\nBoard: Ah Kd 7c\nPot: 18.5\nEffective Stack: 92\nHero Position: BTN\nVillain Position: BB\nVillain Range: AA,KK,AKs`, { fileName: 'node.txt' });
  assert.equal(pio.provider, 'PioSolver');
  assert.equal(pio.state.villains[0].position, 'BB');
  assert.equal(pio.state.effStack, 92);

  const earlyPosition = parseNativeSolverImport(`PioSOLVER\nBoard: Ah Kd 7c\nPot: 18.5\nEffective Stack: 92\nHero Position: UTG+1\nVillain Position: BB`);
  assert.equal(earlyPosition.state.heroPosition, 'UTG1');

  const gto = parseNativeSolverImport('Flop,Turn,River,Hero Position,Villain Position,Pot,Effective Stack,Villain Range\nAs Kd 7h,,,SB,BB,12,88,"QQ+,AKs"', { fileName: 'gto-plus.csv' });
  assert.equal(gto.provider, 'GTO+');
  assert.equal(gto.state.heroPosition, 'SB');
  assert.equal(gto.state.potSize, 12);
  assert.equal(gto.state.villains[0].range, 'QQ+,AKs');
});

test('native solver import rejects binary trees, duplicate cards, and missing required fields', () => {
  assert.throws(() => parseNativeSolverImport('\u0000CFR\u0001binary', { fileName: 'tree.cfr' }), NativeSolverImportError);
  assert.throws(() => parseNativeSolverImport(JSON.stringify({
    board: ['Ah', 'Ah', '3c'], heroPosition: 'CO', potSize: 10, effStack: 100,
    villains: [{ position: 'BB' }],
  })), /Duplicate Card/);
  assert.throws(() => parseNativeSolverImport('{"board":["Ah","Kd","3c"]}'), /Hero Position/);
});

test('deletion challenges are owner-bound, scope-bound, expiring, and tamper evident', () => {
  const now = Date.parse('2026-09-06T12:00:00.000Z');
  const secret = 'phase-eight-test-secret-with-enough-entropy';
  const token = sealDeletionChallenge({ userId: 'owner-a', scope: 'analysis', now, secret });
  assert.deepEqual(openDeletionChallenge(token, { userId: 'owner-a', scope: 'analysis', now: now + 1000, secret }), {
    userId: 'owner-a', scope: 'analysis', expiresAt: now + 10 * 60 * 1000,
  });
  assert.throws(() => openDeletionChallenge(token, { userId: 'owner-b', scope: 'analysis', now, secret }), /Invalid Deletion Challenge/);
  assert.throws(() => openDeletionChallenge(`${token}x`, { userId: 'owner-a', scope: 'analysis', now, secret }), /Invalid Deletion Challenge/);
  assert.throws(() => openDeletionChallenge(token, { userId: 'owner-a', scope: 'analysis', now: now + 11 * 60 * 1000, secret }), /Expired Deletion Challenge/);
});

test('engine canary assignment is stable and health thresholds fail closed', () => {
  assert.equal(canaryAssignment('owner-a', { candidatePercent: 0 }).cohort, 'stable');
  assert.equal(canaryAssignment('owner-a', { candidatePercent: 100 }).cohort, 'candidate');
  assert.deepEqual(canaryAssignment('owner-a', { candidatePercent: 37 }), canaryAssignment('owner-a', { candidatePercent: 37 }));
  assert.equal(evaluateCanaryHealth({ samples: 99, failures: 0, mismatches: 0, p95Ms: 250 }).decision, 'hold');
  assert.equal(evaluateCanaryHealth({ samples: 100, failures: 3, mismatches: 0, p95Ms: 1000 }).decision, 'rollback');
  assert.equal(evaluateCanaryHealth({ samples: 100, failures: 0, mismatches: 6, p95Ms: 1000 }).decision, 'rollback');
  assert.equal(evaluateCanaryHealth({ samples: 100, failures: 0, mismatches: 0, p95Ms: 8100 }).decision, 'rollback');
  assert.equal(evaluateCanaryHealth({ samples: 100, failures: 0, mismatches: 0, p95Ms: 250 }).decision, 'promote');
});

test('Phase 8 lifecycle, recovery, canary, and legacy retirement are permanently wired', () => {
  const api = read('pages/api/assistant/data-controls.js');
  const workspace = read('src/components/personal-assistant/CoachingWorkspace.jsx');
  const importUi = read('src/components/sandbox/ExternalSolverImport.jsx');
  const watchdog = read('scripts/verify-pa-production-hardening.mjs');
  const recovery = read('scripts/verify-pa-data-recovery.mjs');
  const retentionRoute = read('pages/api/assistant/retention-maintenance.js');
  const retentionMigration = read('supabase/migrations/20260906190000_personal_assistant_retention_scheduler.sql');
  const retentionSchemaReload = read('supabase/migrations/20260906190500_personal_assistant_retention_schema_reload.sql');
  const dispatcher = read('scripts/openclaw-cron-dispatcher.py');
  const migration = read('supabase/migrations/20260906130000_personal_assistant_phase_eight_lifecycle.sql');
  const legacyRetirement = read('supabase/migrations/20260906101500_retire_legacy_solver_option_rpcs.sql');
  const pkg = JSON.parse(read('package.json'));

  assert.match(api, /getServerUserWithFallback/);
  assert.match(api, /openDeletionChallenge/);
  assert.match(api, /purge_personal_assistant_data/);
  assert.match(api, /Content-Disposition/);
  assert.doesNotMatch(api, /req\.query\.mode === 'export'/);
  assert.doesNotMatch(api.match(/async function summary[\s\S]*?\n}/)?.[0] || '', /apply_personal_assistant_retention/);
  assert.match(api, /body\.action === 'export'/);
  assert.match(recovery, /method: 'POST'/);
  assert.match(recovery, /action: 'export'/);
  assert.match(retentionRoute, /validateCronAuth/);
  assert.match(retentionRoute, /withCronHealth\('personal-assistant-retention'/);
  assert.match(retentionRoute, /applyRateLimit\(req, res, LIMITS\.write\)/);
  assert.match(retentionRoute, /apply_personal_assistant_retention_batch/);
  assert.match(retentionMigration, /FOR UPDATE SKIP LOCKED/);
  assert.match(retentionMigration, /REVOKE ALL ON FUNCTION public\.apply_personal_assistant_retention_batch/);
  assert.match(retentionSchemaReload, /NOTIFY pgrst, 'reload schema'/);
  assert.match(dispatcher, /\/api\/assistant\/retention-maintenance/);
  assert.match(workspace, /Data And Privacy/);
  assert.match(workspace, /Download Verified Export/);
  assert.match(importUi, /accept="\.json,\.csv,\.txt,\.pio"/);
  assert.match(importUi, /parseNativeSolverImport/);
  assert.match(watchdog, /\/api\/assistant\/data-controls/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.purge_personal_assistant_data/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.apply_personal_assistant_retention/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /-- ROLLBACK:/);
  assert.match(legacyRetirement, /DROP FUNCTION IF EXISTS public\.fn_pio_options_from_solver/);
  assert.match(pkg.scripts['test:leak-engine'], /personal-assistant-phase-eight\.test\.mjs/);
});
