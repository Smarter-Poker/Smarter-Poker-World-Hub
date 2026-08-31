import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizePersonalAssistantCopy } from '../src/lib/personal-assistant/copyPolicy.mjs';

const routeFiles = [
  'pages/hub/personal-assistant/index.js',
  'pages/hub/personal-assistant/sandbox.js',
  'pages/hub/personal-assistant/leaks.js',
];

test('Personal Assistant copy normalizer replaces separators and empty-value marks', () => {
  const mark = '\u2014';
  assert.equal(normalizePersonalAssistantCopy(mark), 'Not Available');
  assert.equal(normalizePersonalAssistantCopy(`Ready ${mark} Run Audit`), 'Ready · Run Audit');
  assert.equal(normalizePersonalAssistantCopy('Already Compliant'), 'Already Compliant');
});

test('every Personal Assistant route installs the shared copy policy', async () => {
  for (const file of routeFiles) {
    const source = await readFile(file, 'utf8');
    assert.match(source, /import PersonalAssistantCopyPolicy/);
    assert.match(source, /<PersonalAssistantCopyPolicy\s*\/>/);
  }
});

test('copy policy covers body text, placeholders, dynamic mutations, and accessible labels', async () => {
  const source = await readFile('src/components/personal-assistant/PersonalAssistantCopyPolicy.js', 'utf8');
  assert.match(source, /document\.body/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /characterData: true/);
  assert.match(source, /attributeFilter: \['aria-label', 'aria-description', 'placeholder', 'title', 'data-tooltip'\]/);
  assert.match(source, /text-transform: capitalize !important/);
});
