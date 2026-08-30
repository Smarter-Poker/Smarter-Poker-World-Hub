import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const require = createRequire(import.meta.url);
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

function filesUnder(path) {
  const absolute = join(ROOT, path);
  return readdirSync(absolute).flatMap((name) => {
    const child = join(absolute, name);
    if (statSync(child).isDirectory()) {
      return filesUnder(join(path, name));
    }
    return /\.(?:js|jsx|ts|tsx)$/.test(name) ? [join(path, name)] : [];
  });
}

test('protected Training requests use the refresh-aware authenticated transport', () => {
  const files = [
    ...filesUnder('pages/hub/training'),
    ...filesUnder('src/components/training'),
    'src/hooks/useGTOTrainer.js',
    'src/hooks/useTrainingProgress.js',
  ];
  const violations = [];
  const protectedRoute = /\bfetch\s*\(\s*[`'"]\/(?:api\/training|api\/god-mode|api\/jarvis|api\/session\/start)/g;

  for (const file of files) {
    const source = read(file);
    if (protectedRoute.test(source)) violations.push(file);
    protectedRoute.lastIndex = 0;
  }

  assert.deepEqual(violations, [], `raw protected Training fetches: ${violations.join(', ')}`);

  const typedAuth = read('src/lib/authUtils.ts');
  assert.match(typedAuth, /refreshSession\(\)/, 'TS/TSX callers must receive the same 401 recovery as JS callers');
  assert.match(typedAuth, /resp\.status === 401/);
});

test('Training sessions keep one identity for the entire run', () => {
  const hub = read('pages/hub/training.js');
  const arenaRoute = read('pages/hub/training/arena/[gameId].js');

  assert.match(hub, /const \[arenaSessionId, setArenaSessionId\] = useState\(null\)/);
  assert.match(hub, /sessionId=\{arenaSessionId\}/);
  assert.doesNotMatch(hub, /sessionId=\{`session-\$\{Date\.now\(\)\}`\}/);
  assert.match(arenaRoute, /const \[resolvedSessionId, setResolvedSessionId\]/);
  assert.match(arenaRoute, /sessionId=\{resolvedSessionId\}/);
});

test('setup dialogs restore per-game preferences and contain keyboard focus', () => {
  const setup = read('src/components/training/SessionSetupModal.jsx');
  const advanced = read('src/components/training/TrainerConfigModal.jsx');

  assert.match(setup, /readPrefs\(gameId\)/);
  assert.match(setup, /\[isOpen, gameId\]/);
  assert.match(setup, /event\.key !== 'Tab'|e\.key !== 'Tab'/);
  assert.match(setup, /previousFocusRef/);
  assert.match(advanced, /role="dialog"/);
  assert.match(advanced, /aria-modal="true"/);
  assert.match(advanced, /event\.key !== 'Tab'/);
  assert.match(advanced, /borderRadius:\s*0/);
  assert.match(advanced, /sp-trainer-config-row/);
});

test('timer-off and login fallback remain wired exactly', () => {
  const arena = read('src/components/training/GodModeArena.jsx');
  const selector = read('src/components/training/LevelSelector.tsx');

  assert.match(arena, /timerEnabled:\s*trainerConfig\?\.timerEnabled \?\?/);
  assert.match(arena, /timerSeconds:\s*trainerConfig\?\.timerSeconds \?\?/);
  assert.match(selector, /pathname:\s*'\/auth\/login'/);
  assert.match(selector, /query:\s*\{ redirect:/);
  assert.doesNotMatch(selector, /pathname:\s*'\/login'/);
});

test('offline Training saves do not persist bearer credentials', () => {
  const queue = read('src/engine/OfflineSyncQueue.js');
  const save = read('src/components/training/utils/saveSession.js');

  assert.match(queue, /const \{ authedFetch \} = await import\('\.\.\/lib\/authUtils'\)/);
  assert.match(queue, /await authedFetch\(item\.endpoint/);
  assert.doesNotMatch(save, /enqueueMutation\([^\n]+\n[^\n]*Authorization/);
  assert.doesNotMatch(save, /Bearer \$\{accessToken\}/);
});

test('Training secondary surfaces retain keyboard activation and local font wiring', () => {
  const files = [
    ...filesUnder('pages/hub/training'),
    ...filesUnder('src/components/training'),
  ];
  const nonKeyboardControls = [];

  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /fonts\.googleapis\.com/, `${file} must use the global next/font installation`);

    const ast = parser.parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'classProperties', 'optionalChaining'],
    });
    traverse(ast, {
      JSXOpeningElement(path) {
        const node = path.node;
        if (node.name.type !== 'JSXIdentifier' || !['div', 'span'].includes(node.name.name)) return;
        const attributes = node.attributes.filter((attribute) => attribute.type === 'JSXAttribute');
        const names = new Set(attributes.map((attribute) => attribute.name?.name));
        if (names.has('onClick') && !names.has('onKeyDown') && !names.has('aria-modal')) {
          nonKeyboardControls.push(`${file}:${node.loc.start.line}`);
        }
      },
    });
  }

  assert.deepEqual(nonKeyboardControls, [], `mouse-only Training controls: ${nonKeyboardControls.join(', ')}`);

  const art = read('src/components/training/TrainingGameArt.jsx');
  const coach = read('pages/hub/training/coach-mode.js');
  assert.doesNotMatch(art, /<img[\s\S]{0,400}fetchPriority=/);
  assert.doesNotMatch(coach, /<img[^>]+fetchPriority=/);
});

test('legacy table feedback also requires an explicit Next action', () => {
  const table = read('src/components/training/UniversalTrainingTable.tsx');
  assert.match(table, /aria-labelledby="training-feedback-title"/);
  assert.match(table, />\s*Next\s*<\/button>/);
  assert.doesNotMatch(table, /Tap anywhere to continue/i);
});
