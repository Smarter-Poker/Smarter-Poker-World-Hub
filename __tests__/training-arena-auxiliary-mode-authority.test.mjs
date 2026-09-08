import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const arena = fs.readFileSync('src/components/training/GodModeArena.jsx', 'utf8');

test('Arena lobby exposes only the signed server-graded Training mode', () => {
  const selectorStart = arena.indexOf('{/* Difficulty + Timer Selectors */}');
  const launchStart = arena.indexOf('{/* START BUTTON */}', selectorStart);
  const lobbyControls = arena.slice(selectorStart, launchStart);

  assert.ok(selectorStart >= 0 && launchStart > selectorStart);
  assert.doesNotMatch(lobbyControls, /Flashcards|Speed Drill|Import HH|setTrainingMode/);
  assert.doesNotMatch(arena, /\btrainingMode\b|setTrainingMode/);
  assert.match(arena, /: 'Start Training →'\}/);
  assert.match(arena, /setGamePhase\('playing'\)/);
});

test('legacy mode props cannot activate browser-authored grading surfaces', () => {
  const propSyncStart = arena.indexOf('useEffect(() => {\n    if (!initialConfig) return;');
  const propSyncEnd = arena.indexOf('// \u25cf\u25cf\u25cf Phase 2: Adaptive Difficulty Level', propSyncStart);
  const sync = arena.slice(propSyncStart, propSyncEnd);

  assert.match(sync, /setGamePhase\('playing'\)/);
  assert.doesNotMatch(sync, /next\.mode === '(?:import|drill)'/);
  assert.doesNotMatch(arena, /initialTrainingPhase|HandHistoryImportModal|FlashcardMode|DrillMode/);
  assert.doesNotMatch(arena, /importedQuestion|importedFeedback|generateQuickFireQuestion/);
});
