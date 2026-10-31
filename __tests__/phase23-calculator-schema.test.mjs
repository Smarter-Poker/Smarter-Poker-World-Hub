import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Phase 23: all interactive calculators and range labs emit hubProductSchema with SoftwareApplication, HowTo, and FAQPage', () => {
  const files = [
    'pages/hub/training/icm-calculator.js',
    'pages/hub/training/equity-calculator.js',
    'pages/hub/poker-tools.js',
    'pages/tools/preflop-ranges/index.js',
    'pages/hub/memory-games.js',
  ];

  for (const rel of files) {
    const src = fs.readFileSync(path.resolve(rel), 'utf8');
    assert.ok(src.includes('hubProductSchema('), `${rel} must use hubProductSchema()`);
    assert.ok(src.includes('faqs:'), `${rel} must provide faqs to hubProductSchema`);
    assert.ok(src.includes('howTo:'), `${rel} must provide howTo steps to hubProductSchema`);
  }
});
