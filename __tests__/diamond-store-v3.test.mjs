import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const component = fs.readFileSync(
  path.join(root, 'src/components/diamond-store/SmarterStoreShowcase.jsx'),
  'utf8'
);
const styles = fs.readFileSync(
  path.join(root, 'src/components/diamond-store/SmarterStoreShowcase.module.css'),
  'utf8'
);
const page = fs.readFileSync(path.join(root, 'pages/hub/diamond-store.js'), 'utf8');

test('connects all five store destinations to the shared showcase', () => {
  for (const id of ['diamonds', 'vip', 'merch', 'rewards', 'club-shop']) {
    assert.match(component, new RegExp(`['\"]${id}['\"]`));
  }
  assert.match(page, /<SmarterStoreShowcase/);
  assert.match(page, /onNavigate=\{\(tabId\) => openTab\(tabId, activeTab\)\}/);
});

test('keeps diamond values centered below art and buys through the existing checkout', () => {
  assert.match(component, /pkg\.diamonds \|\| 0\) \+ \(pkg\.bonus \|\| 0/);
  assert.match(component, /Includes \{Number\(pkg\.bonus\)/);
  assert.match(component, /onClick=\{\(\) => onBuy\(pkg\)\}/);
  assert.match(styles, /\.packageValue\s*\{[^}]*text-align:\s*center/s);
  assert.match(styles, /\.packageValue\s*\{[^}]*position:\s*relative/s);
});

test('uses the dedicated cinematic artwork and sharp-corner treatment', () => {
  for (const asset of [
    'diamond-vault-hero.png',
    'diamond-packages-sheet.png',
    'store-section-heroes.png',
  ]) {
    assert.equal(fs.existsSync(path.join(root, 'public/images/store-v3', asset)), true);
  }
  const radii = [...styles.matchAll(/border-radius:\s*([^;]+);/g)].map((match) => match[1].trim());
  assert.deepEqual(radii, ['0', '0 !important']);
  assert.match(page, /border-radius:\s*0 !important/);
});

test('keeps every redesign rule outside the locked global header', () => {
  assert.match(
    page,
    /<UniversalHeader pageDepth=\{1\} \/>\s*<main className=\{`store-redesign-content \$\{shellStyles\.root\}`\}>/
  );
  assert.doesNotMatch(page, /\.diamond-store-page button/);
  assert.doesNotMatch(page, /\.diamond-store-page a,/);
  assert.match(page, /\.store-redesign-content button/);
});

test('ships a purpose-built mobile layout instead of a stacked desktop grid', () => {
  assert.match(component, /scrollIntoView/);
  assert.match(component, /prefers-reduced-motion: reduce/);
  assert.match(component, /Swipe To Compare Packages/);
  assert.match(styles, /@media \(max-width: 640px\)/);
  assert.match(styles, /\.packageGrid\s*\{[^}]*display:\s*flex/s);
  assert.match(styles, /\.packageGrid\s*\{[^}]*scroll-snap-type:\s*x mandatory/s);
  assert.match(styles, /\.packageCard\s*\{[^}]*flex:\s*0 0 min\(86vw, 360px\)/s);
  assert.match(styles, /\.packageCard button\s*\{[^}]*min-height:\s*50px/s);
  assert.doesNotMatch(styles, /background-position-x:\s*72%/);
});
