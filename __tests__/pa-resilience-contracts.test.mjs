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

test('God Mode provenance survives the page adapter and cannot score quizzes', () => {
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');
  assert.match(sandbox, /forcedMode: mock\.forcedMode === true/);
  assert.match(sandbox, /if \(displayed\?\.forcedMode\)/);
  assert.match(sandbox, /Forced result — drill score not recorded/);
});
