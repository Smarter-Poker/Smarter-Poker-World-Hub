import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parse } from '@babel/parser';

const ROOT = process.cwd();
const read = (relativePath) => readFileSync(path.join(ROOT, relativePath), 'utf8');

const quiz = read('src/world/components/Jarvis/PokerQuiz.tsx');
const drill = read('src/world/components/Jarvis/DrillMode.tsx');
const toolbar = read('src/world/components/Jarvis/JarvisAdvancedToolbar.tsx');

test('reachable Jarvis quiz and drill tools launch canonical Training instead of grading browser answer banks', () => {
  assert.match(quiz, /\/hub\/training\/quiz-gauntlet\?source=jarvis/);
  assert.match(drill, /\/hub\/training\?source=jarvis-drill/);

  for (const [name, source] of [['PokerQuiz', quiz], ['DrillMode', drill]]) {
    assert.doesNotMatch(source, /correct(?:Index|Answer)|SAMPLE_QUESTIONS|DRILL_SCENARIOS|Math\.random|setTimeout/,
      `${name} must not contain a client-owned question key or simulated delivery`);
    assert.doesNotMatch(source, /diamonds?\s+earned|earn(?:ed)?\s+diamonds?/i,
      `${name} must not claim an unverified reward`);
  }

  assert.doesNotMatch(toolbar, /onEarnDiamonds|Earned \$\{amount\} diamonds/i);
});

test('Jarvis launcher sources parse as TypeScript React modules', () => {
  for (const [filename, source] of [
    ['PokerQuiz.tsx', quiz],
    ['DrillMode.tsx', drill],
    ['JarvisAdvancedToolbar.tsx', toolbar],
  ]) {
    assert.doesNotThrow(() => parse(source, {
      sourceType: 'module',
      sourceFilename: filename,
      plugins: ['jsx', 'typescript'],
    }));
  }
});
