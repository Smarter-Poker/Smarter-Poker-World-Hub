/**
 * Personal Assistant resilience regression guards.
 *
 * These are lightweight source contracts for failures that otherwise only
 * appear during a live outage or while using the dev-only God Mode panel.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('hub data hooks expose errors and retry controls', () => {
  const hooks = read('src/hooks/useAssistant.js');
  assert.match(hooks, /getFreshAccessToken/);
  assert.doesNotMatch(hooks, /supabase\.auth\.getSession\s*\(/);
  assert.match(hooks, /return \{ stats, isDemo, isLoading, error, refetch: fetchStats \}/);
  assert.match(hooks, /return \{ sessions, isDemo, isLoading, error, refetch: fetchSessions \}/);
});

test('hub visibly reports and can retry a live-data failure', () => {
  const hub = read('pages/hub/personal-assistant/index.js');
  assert.match(hub, /const dataSyncError = statsError \|\| sessionsError/);
  assert.match(hub, /Live Data Could Not Refresh/);
  assert.match(hub, /retryAssistantData/);
});

test('the hub does not duplicate the hook-owned pa-data-updated refresh', () => {
  const hub = read('pages/hub/personal-assistant/index.js');
  assert.doesNotMatch(hub, /addEventListener\(['"]pa-data-updated['"]/);
});

test('stats and leak refreshes cancel superseded network work', () => {
  const hooks = read('src/hooks/useAssistant.js');
  const stats = hooks.slice(hooks.indexOf('export function useAssistantStats'), hooks.indexOf('export function useLeaks'));
  const leaks = hooks.slice(hooks.indexOf('export function useLeaks'), hooks.indexOf('function formatLeak'));

  for (const source of [stats, leaks]) {
    assert.match(source, /activeAbortRef\.current\?\.abort\(\)/);
    assert.match(source, /signal: controller\.signal/);
    assert.match(source, /err\?\.name === 'AbortError'/);
    assert.match(source, /requestId !== requestIdRef\.current/);
  }
});

test('God Mode provenance survives the page adapter and cannot score quizzes', () => {
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');
  assert.match(sandbox, /forcedMode: mock\.forcedMode === true/);
  assert.match(sandbox, /if \(displayed\?\.forcedMode\)/);
  assert.match(sandbox, /Forced result — drill score not recorded/);
});

test('assistant data waits for the canonical auth identity before loading', () => {
  const hooks = read('src/hooks/useAssistant.js');
  const hub = read('pages/hub/personal-assistant/index.js');
  const leaks = read('pages/hub/personal-assistant/leaks.js');
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');

  assert.match(hooks, /authState\?\.ready !== false/);
  assert.match(hooks, /authUserId \? \{ id: authUserId \} : null/);
  assert.match(hub, /ready: !authInitializing/);
  assert.match(leaks, /useAvatar\(\)/);
  assert.match(leaks, /useLeaks\(null, \{ userId, ready: !authInitializing \}\)/);
  assert.match(sandbox, /useStudyDeck\(20, assistantAuth\)/);
});

test('sandbox analysis is latest-request-wins and stale solves have no side effects', () => {
  const hooks = read('src/hooks/useAssistant.js');
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');

  assert.match(hooks, /activeAbortRef\.current\?\.abort\(\)/);
  assert.match(hooks, /requestId !== requestIdRef\.current/);
  assert.match(hooks, /superseded: true/);
  assert.match(hooks, /skipCoachGrade: options\.skipCoachGrade === true/);
  assert.match(sandbox, /if \(data\?\.superseded\) return/);
  assert.match(sandbox, /if \(results\.skipCoachGrade\) return/);
  assert.doesNotMatch(sandbox, /suppressCoachEffectRef/);
});

test('sandbox history failures render a retryable error instead of an empty state', () => {
  const hooks = read('src/hooks/useAssistant.js');
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');

  assert.match(hooks, /return \{ bookmarks, isLoading, error, refetch: fetchBookmarks \}/);
  assert.match(sandbox, /const loadError = tab === 'sessions' \? sessionsError : bookmarksError/);
  assert.match(sandbox, /filter\(session => session\?\.type === 'sandbox'\)/);
  assert.match(sandbox, /<ErrorState title=\{`Could not load \$\{tab\}`\}/);
});

test('study replay does not depend on a missing PostgREST relationship', () => {
  const hooks = read('src/hooks/useAssistant.js');
  const studyDeck = hooks.slice(hooks.indexOf('export function useStudyDeck'), hooks.indexOf('export function useQuizLeaderboard'));

  assert.match(studyDeck, /\.from\('sandbox_sessions'\)/);
  assert.match(studyDeck, /\.eq\('user_id', user\.id\)/);
  assert.match(studyDeck, /\.from\('sandbox_results'\)/);
  assert.match(studyDeck, /\.in\('session_id', sessionIds\)/);
  assert.doesNotMatch(studyDeck, /sandbox_sessions!inner/);
});

test('every Personal Assistant destination owns a canonical page title', () => {
  for (const file of [
    'pages/hub/personal-assistant/index.js',
    'pages/hub/personal-assistant/leaks.js',
    'pages/hub/personal-assistant/sandbox.js',
  ]) {
    const source = read(file);
    assert.match(source, /<SEOHead/);
    assert.match(source, /canonical=/);
    assert.match(source, /<h1/);
  }
});

test('sandbox inline CSS cannot hydrate as escaped raw style text', () => {
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');
  assert.doesNotMatch(sandbox, /<style>\{`[\s\S]*@import url\(/);
  assert.match(sandbox, /<style dangerouslySetInnerHTML=\{\{ __html: `/);
  assert.match(sandbox, /\.sandbox-workspace > \*/);
});

test('secondary surfaces share the Smarter.Poker command-deck visual system', () => {
  const tokens = read('src/components/sandbox/paTokens.js');
  const kit = read('src/components/sandbox/paKit.jsx');
  const components = read('src/components/sandbox/SandboxComponents.jsx');

  assert.match(tokens, /PA_DESIGN_SPEC v2 — "Jarvis Command Deck"/);
  assert.match(tokens, /accent: '#63E7FF'/);
  assert.match(tokens, /DISPLAY_FONT/);
  assert.match(tokens, /DATA_FONT/);
  assert.match(kit, /pa-sheet-telemetry/);
  assert.match(kit, /pa-chart-panel/);
  assert.match(components, /BottomSheet as CommandBottomSheet/);
  assert.match(components, /<CommandBottomSheet/);
});

test('secondary charts and desktop workspaces own responsive layouts', () => {
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');
  const leaks = read('pages/hub/personal-assistant/leaks.js');
  const components = read('src/components/sandbox/SandboxComponents.jsx');

  assert.match(sandbox, /className="sandbox-workspace"/);
  assert.match(sandbox, /className="sandbox-command-bar"/);
  assert.match(sandbox, /grid-template-columns: 400px minmax\(0, 1fr\)/);
  assert.match(sandbox, /\.sandbox-table-wrap \{[\s\S]*position: sticky/);
  assert.match(leaks, /className="leak-insights-grid"/);
  assert.match(leaks, /className="leak-list-grid"/);
  assert.match(leaks, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.ok((components.match(/className="pa-chart-panel"/g) || []).length >= 6);
  assert.match(components, /className="pa-range-grid"/);
});
