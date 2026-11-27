/**
 * Virtual Sandbox Restoration & Hardening Verification Suite
 * ═══════════════════════════════════════════════════════════════════════════
 * Guards:
 *   1. Babel JSX parse & static/dynamic relative import resolution across all
 *      restored Virtual Sandbox files.
 *   2. All 7 original Sept 5 Virtual Sandbox workspace capabilities wired in
 *      pages/hub/personal-assistant/sandbox.js.
 *   3. Zero retired /api/assistant/sandbox/analyze calls, zero GodModePanel,
 *      zero fabricated GTO grades / EV / streaks / training progress.
 *   4. All 3 disclosed workspace limits visibly rendered.
 *   5. Canonical auth (useAvatar + getFreshAccessToken, !authInitializing),
 *      server-enforced live-play gate (checkSandboxAccess), request deadlines /
 *      abortable fetch / stale-result protection / uncertain-write recovery,
 *      and canonical persistenceContract (readPersistenceResponse + persisted).
 *   6. Locked header/footer/SEO/mobile-phase-4/asset contracts.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const RESTORED_FILES = [
  'pages/hub/personal-assistant/sandbox.js',
  'src/components/sandbox/SandboxPokerTable.jsx',
  'src/components/sandbox/SaveHandModal.jsx',
  'src/components/sandbox/StudyFolders.jsx',
  'src/components/sandbox/ImportHHModal.jsx',
  'src/components/sandbox/VillainPresetPicker.jsx',
  'src/components/sandbox/EquityHeatmapOverlay.jsx',
  'src/components/sandbox/ExportCard.jsx',
  'src/components/sandbox/ShareScenarioModal.jsx',
  'src/components/sandbox/SessionReport.jsx',
  'src/components/sandbox/SessionAnalytics.jsx',
  'src/components/sandbox/paKit.jsx',
  'pages/api/sandbox/_routes/save-hand.js',
  'pages/api/sandbox/_routes/saved-hands.js',
];

function resolveRelativeModule(fromFile, spec) {
  const base = path.resolve(path.dirname(path.join(ROOT, fromFile)), spec);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.js'),
    path.join(base, 'index.jsx'),
  ];
  return candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile()) || null;
}

test('all restored Virtual Sandbox files parse cleanly with @babel/parser', () => {
  for (const rel of RESTORED_FILES) {
    assert.doesNotThrow(
      () => parse(read(rel), {
        sourceType: 'module',
        plugins: ['jsx', 'typescript', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
      }),
      `Failed to parse ${rel}`,
    );
  }
});

test('all relative static and dynamic imports in restored sandbox files resolve on disk', () => {
  const broken = [];
  const importRe = /(?:from\s+['"](\.[^'"]+)['"]|import\s*\(\s*['"](\.[^'"]+)['"]\s*\))/g;
  for (const rel of RESTORED_FILES) {
    const src = read(rel);
    for (const m of src.matchAll(importRe)) {
      const spec = m[1] || m[2];
      if (!resolveRelativeModule(rel, spec)) {
        broken.push(`${rel} -> ${spec}`);
      }
    }
  }
  assert.deepEqual(broken, [], `Unresolved relative imports:\n  ${broken.join('\n  ')}`);
});

test('all 7 restored Virtual Sandbox workspace capabilities are wired in sandbox.js', () => {
  const src = read('pages/hub/personal-assistant/sandbox.js');

  // 1. Native poker table and card/board setup
  assert.match(src, /SandboxPokerTable/);
  assert.match(src, /<MemoSandboxPokerTable/);
  assert.match(src, /<CardPickerSheet/);
  assert.match(src, /<SetupSheet/);

  // 2. Opponent ranges and presets
  assert.match(src, /VillainPresetPicker/);
  assert.match(src, /RangeExplorer/);
  assert.match(src, /RangeHeatGrid/);
  assert.match(src, /VillainReadCard/);
  assert.match(src, /PreflopChartOverlay/);

  // 3. Action builder and replay
  assert.match(src, /ActionHistoryBuilder/);
  assert.match(src, /StreetTimeline/);
  assert.match(src, /ActionReplayBar/);
  assert.match(src, /HandReplay/);
  assert.match(src, /computeHandState/);

  // 4. Equity and runouts (including multiway)
  assert.match(src, /calculateEquityAsync/);
  assert.match(src, /simulateRunoutsAsync/);
  assert.match(src, /EquityHeatmapOverlay/);
  assert.match(src, /RunoutChart/);
  assert.match(src, /villains:\s*resolvedVillainRanges/);

  // 5. Saved studies and folders
  assert.match(src, /SaveHandModal/);
  assert.match(src, /StudyFolders/);
  assert.match(src, /useBookmarks/);
  assert.match(src, /\/api\/sandbox\/saved-hands/);
  assert.match(read('src/components/sandbox/SaveHandModal.jsx'), /\/api\/sandbox\/save-hand/);

  // 6. Templates and imports
  assert.match(src, /TemplatesSheet/);
  assert.match(src, /\/api\/assistant\/sandbox\/sandbox-templates/);
  assert.match(src, /ImportHHModal/);
  assert.match(src, /ExternalSolverImport/);
  assert.match(read('src/components/sandbox/ImportHHModal.jsx'), /parseHandHistory/);

  // 7. Session tools, image export, and internal sharing
  assert.match(src, /ExportCard/);
  assert.match(src, /ShareScenarioModal/);
  assert.match(src, /SessionReport/);
  assert.match(src, /SessionAnalytics/);
});

test('honesty boundary: zero retired analyze calls, zero GodModePanel, zero fabricated grades', () => {
  const src = read('pages/hub/personal-assistant/sandbox.js');
  const analyzeApi = read('pages/api/assistant/sandbox/analyze.js');

  assert.match(analyzeApi, /status\(410\)/);
  assert.match(analyzeApi, /SANDBOX_ANALYSIS_REQUIRES_VERIFIED_EVIDENCE/);

  assert.match(src, /data-training-authority="authored-sandbox-ungraded"/);
  assert.doesNotMatch(src, /\/api\/assistant\/sandbox\/analyze/);
  assert.doesNotMatch(src, /GodModePanel|useSandboxAnalysis|useQuizLeaderboard|localSolve|gradeAction|CoachFeedback|CoachActionPicker|CoachVerdict|QuizPanel|TiltMonitor/);
  assert.match(src, /\/hub\/training\?source=personal-assistant-sandbox/);
  assert.match(src, /\/hub\/training\/spot-trainer\?source=personal-assistant-sandbox/);
  assert.match(src, /\/hub\/training\/hand-history-upload\?source=personal-assistant-sandbox/);
  assert.match(src, /\/hub\/personal-assistant\/leaks\?source=personal-assistant-sandbox/);
});

test('all 3 disclosed limits are visibly rendered in the workspace', () => {
  const src = read('pages/hub/personal-assistant/sandbox.js');
  assert.match(src, /Multiway Equity Is Available\./);
  assert.match(src, /The Original Action Builder Is Heads-Up\./);
  assert.match(src, /Legacy Hand-History Parsing Does Not Preserve Precise Historical Wager Sizes\./);
  assert.match(
    read('src/components/sandbox/ImportHHModal.jsx'),
    /Legacy Hand-History Parsing Does Not Preserve Precise Historical Wager Sizes\./,
  );
});

test('canonical auth, active-play gate, deadlines, cancellation, and persistence contracts are enforced', () => {
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');
  const saveModal = read('src/components/sandbox/SaveHandModal.jsx');
  const folders = read('src/components/sandbox/StudyFolders.jsx');
  const shareModal = read('src/components/sandbox/ShareScenarioModal.jsx');
  const saveRoute = read('pages/api/sandbox/_routes/save-hand.js');
  const listRoute = read('pages/api/sandbox/_routes/saved-hands.js');
  const kit = read('src/components/sandbox/paKit.jsx');

  // Canonical auth
  assert.match(sandbox, /useAvatar\(\)/);
  assert.match(sandbox, /getFreshAccessToken/);
  assert.match(sandbox, /!authInitializing/);
  assert.doesNotMatch(sandbox, /supabase\.auth\.getSession\s*\(/);
  assert.match(saveModal, /getFreshAccessToken/);
  assert.match(folders, /getFreshAccessToken/);
  assert.match(shareModal, /getFreshAccessToken/);

  // Active-play gate (server-enforced + UI awareness)
  assert.match(saveRoute, /checkSandboxAccess/);
  assert.match(saveRoute, /SANDBOX_BLOCKED_LIVE_PLAY/);
  assert.match(listRoute, /checkSandboxAccess/);
  assert.match(listRoute, /SANDBOX_BLOCKED_LIVE_PLAY/);
  assert.match(sandbox, /activePlayBlock/);
  assert.match(sandbox, /Active Play Restriction Enforced/);

  // Request deadlines, cancellation & stale-result protection
  assert.match(kit, /defaultTimeoutMs/);
  assert.match(kit, /setTimeout/);
  assert.match(kit, /new AbortController/);
  assert.match(sandbox, /useAbortableFetch/);
  assert.match(sandbox, /equityReqIdRef/);
  assert.match(sandbox, /runoutReqIdRef/);
  assert.match(sandbox, /templatesReqIdRef/);
  assert.match(sandbox, /AbortController/);

  // Persistence contract & uncertain-write recovery
  for (const fileSrc of [sandbox, saveModal, folders, shareModal]) {
    assert.match(fileSrc, /readPersistenceResponse/);
    assert.match(fileSrc, /result\.success\s*&&\s*result\.persisted/);
  }
  assert.match(saveModal, /clientSaveStamp/);
  assert.match(sandbox, /clientSaveStamp/);
  assert.match(saveRoute, /persistedResult/);
  assert.match(saveRoute, /persistenceFailure/);
});

test('layout, global header/footer shell, SEO, responsive CSS, and WebP assets stay intact', () => {
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');
  const table = read('src/components/sandbox/SandboxPokerTable.jsx');

  assert.match(sandbox, /<HubPageShell\b/);
  assert.match(sandbox, /<UniversalHeader\b/);
  assert.match(sandbox, /<HamburgerMenu\b/);
  assert.match(sandbox, /<SEOHead[\s\S]*canonical="\/hub\/personal-assistant\/sandbox"/);
  assert.match(sandbox, /<h1\b/);
  assert.match(sandbox, /<PersonalAssistantCopyPolicy\s*\/>/);
  assert.match(sandbox, /<style jsx>\{`/);
  assert.match(sandbox, /className="sandbox-workspace"/);
  assert.match(sandbox, /className="sandbox-command-bar"/);
  assert.match(sandbox, /overflow-x:\s*clip;/);
  assert.match(sandbox, /min-height:\s*100dvh;/);
  assert.doesNotMatch(sandbox, /100vh|overflow-x:\s*hidden|overflowX:\s*'hidden'|window\.innerWidth|matchMedia\(/);
  assert.match(sandbox, /@media \(max-width: 768px\)[\s\S]*grid-template-columns: 1fr/);
  assert.match(sandbox, /data-tutorial="evidence-gate"/);
  assert.match(sandbox, /data-tutorial="sandbox-destinations"/);

  // WebP avatar paths in SandboxPokerTable
  for (const avatar of ['free_fox', 'free_shark', 'free_ninja', 'free_viking', 'free_lion', 'free_owl']) {
    assert.match(table, new RegExp(`/avatars/table/${avatar}\\.webp`));
    assert.doesNotMatch(table, new RegExp(`/avatars/table/${avatar}\\.png`));
  }
});
