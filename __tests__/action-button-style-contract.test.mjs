import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadStyleNormalizer() {
  const relativePath = 'src/components/poker/ActionButton.jsx';
  const source = readFileSync(join(ROOT, relativePath), 'utf8');
  const start = source.indexOf('const BORDER_LINE_STYLES');
  const end = source.indexOf('\nfunction deriveAriaLabel', start);
  assert.ok(start >= 0 && end > start, 'ActionButton border normalizer source is missing');
  const context = vm.createContext({});
  const isolatedSource = source.slice(start, end).replace(
    'export function normalizeActionButtonBorderStyle',
    'function normalizeActionButtonBorderStyle',
  );
  vm.runInContext(
    `${isolatedSource}\n;globalThis.normalizeActionButtonBorderStyle = normalizeActionButtonBorderStyle;`,
    context,
    { filename: relativePath },
  );
  return context.normalizeActionButtonBorderStyle;
}

test('ActionButton expands border shorthand before applying feedback color overrides', () => {
  const normalize = loadStyleNormalizer();
  const base = normalize({ border: '1px solid rgba(146,160,255,0.45)' });
  assert.equal(Object.hasOwn(base, 'border'), false);
  assert.equal(base.borderWidth, '1px');
  assert.equal(base.borderStyle, 'solid');
  assert.equal(base.borderColor, 'rgba(146,160,255,0.45)');

  const feedback = normalize({
    border: '1px solid rgba(146,160,255,0.45)',
    borderColor: 'var(--sp-accent-green)',
  });
  assert.equal(Object.hasOwn(feedback, 'border'), false);
  assert.equal(feedback.borderWidth, '1px');
  assert.equal(feedback.borderStyle, 'solid');
  assert.equal(feedback.borderColor, 'var(--sp-accent-green)');
});

test('ActionButton preserves borderless and longhand caller styles', () => {
  const normalize = loadStyleNormalizer();
  assert.equal(
    JSON.stringify(normalize({ border: 'none', borderColor: 'transparent' })),
    JSON.stringify({ borderWidth: 0, borderStyle: 'none', borderColor: 'transparent' }),
  );
  assert.equal(
    JSON.stringify(normalize({ borderWidth: 2, borderStyle: 'dashed', borderColor: '#fff' })),
    JSON.stringify({ borderWidth: 2, borderStyle: 'dashed', borderColor: '#fff' }),
  );
});
