import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const page = readFileSync(resolve(root, 'pages/hub/diamond-store.js'), 'utf8');
const styles = readFileSync(
  resolve(root, 'src/components/diamond-store/DiamondStoreShell.module.css'),
  'utf8'
);

test('VIP benefits have same-page jump links and collapsible category groups', () => {
  assert.match(page, /aria-label="VIP Page Sections"/);
  assert.match(page, /href="#vip-benefits-platform"/);
  assert.match(page, /href="#vip-benefits-arena"/);
  assert.match(page, /href="#vip-faq"/);
  assert.match(page, /className=\{shellStyles\.vipBenefitGroup\}/);
  assert.match(page, /<details[\s\S]*?id=\{group\.id\}[\s\S]*?open/);
  assert.match(page, /id="vip-faq"/);
});

test('VIP category navigation retains touch targets and visible keyboard focus', () => {
  assert.match(styles, /\.vipBenefitJumpNav a[\s\S]*?min-height: 44px/);
  assert.match(styles, /\.vipBenefitJumpNav a:focus-visible/);
  assert.match(styles, /\.vipBenefitGroup summary:focus-visible/);
  assert.match(styles, /scroll-margin-top: 110px/);
});
