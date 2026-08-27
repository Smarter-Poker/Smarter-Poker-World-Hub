import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const table = fs.readFileSync('src/components/poker/TrainingGameTable.jsx', 'utf8');
const arena = fs.readFileSync('src/components/training/GodModeArena.jsx', 'utf8');
const trainingCss = fs.readFileSync('src/styles/worlds/training.css', 'utf8');

test('opponent seats render a Club Arena card fan with explicit spread geometry', () => {
  assert.match(table, /function CardBackFan/);
  assert.match(table, /--fan-offset/);
  assert.match(table, /--fan-angle/);
  assert.match(table, /bottom:calc\(100% \+ 3px\)/);
  assert.match(table, /holeCardCount=\{Math\.max\(2, heroCards\.length\)\}/);
});

test('mobile arena keeps the primary action reachable without horizontal overflow', () => {
  assert.match(arena, /className="sp-arena-lobby__launch"/);
  assert.match(trainingCss, /\.sp-arena-lobby__launch\s*\{[\s\S]*?position: fixed;/);
  assert.match(trainingCss, /padding: 16px 12px 108px !important;/);
});

test('the remaining lobby tier value is normalized before title casing', () => {
  assert.match(arena, /String\(levelDef\.tier \|\| ''\)\.toLowerCase\(\)/);
});
