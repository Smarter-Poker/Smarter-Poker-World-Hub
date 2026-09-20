import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const showcase = read('src/components/diamond-store/SmarterStoreShowcase.jsx');
const page = read('pages/hub/diamond-store.js');
const cards = read('src/components/store/StoreCards.js');
const consoleControls = read('src/components/marketplace-console/MarketplaceConsole.jsx');
const merch = read('src/components/store/MerchStore.jsx');
const shell = read('src/components/diamond-store/DiamondStoreShell.module.css');

test('announces active store navigation and complete package purchase names', () => {
  assert.match(showcase, /import Link from 'next\/link'/);
  assert.match(showcase, /className=\{`\$\{styles\.tab\}/);
  assert.match(showcase, /aria-current=\{id === activeTab \? 'page' : undefined\}/);
  assert.match(showcase, /href=\{TAB_ROUTES\[id\]\}/);
  assert.doesNotMatch(showcase, /MarketplaceConsoleSelectorGrid|MARKETPLACE_SELECTOR_ART/);
  assert.doesNotMatch(showcase, /target=["']_blank["']|Opens In New Tab/);
  assert.doesNotMatch(consoleControls, /target=["']_blank["']|window\.open/);
  assert.match(showcase, /className=\{styles\.packageUnit\}>Diamonds/);
  assert.match(showcase, /Diamonds For \$\$\{Number\(pkg\.price/);
});

test('makes VIP plan selection and checkout native keyboard controls', () => {
  assert.match(cards, /export function VIPCard[\s\S]*?<button/);
  assert.match(cards, /aria-pressed=\{isSelected\}/);
  assert.match(cards, /src="\/images\/vip-card\.webp"/);
  assert.doesNotMatch(cards, /MarketplaceConsoleVipPlanCard|<Gem[^>]*vip/i);
  assert.doesNotMatch(
    cards,
    /export function VIPCard[\s\S]*?<div\s+onClick=\{\(\) => onSelect\(plan\.id\)\}/
  );
  assert.match(
    page,
    /<button\s+type="button"\s+disabled=\{[^}]*isProcessing[^}]*\}[\s\S]{0,200}?aria-busy=\{isProcessing\}/
  );
});

test('traps and restores focus for every purchase and operator confirmation dialog', () => {
  assert.match(page, /function useDialogFocus/);
  assert.match(page, /event\.key === 'Escape'/);
  assert.match(page, /dialog\.querySelectorAll/);
  assert.match(page, /returnFocusRef\.current\?\.focus\?\.\(\)/);
  for (const dialogRef of [
    'pendingSpendDialogRef',
    'clubShopDialogRef',
    'clubShopDeleteDialogRef',
  ]) {
    assert.match(page, new RegExp(`useDialogFocus\\([\\s\\S]{0,120}${dialogRef}`));
    assert.match(page, new RegExp(`ref=\\{${dialogRef}\\}[\\s\\S]{0,160}role="dialog"`));
  }
  assert.equal((page.match(/role="dialog"/g) || []).length, 3);
  assert.equal((page.match(/aria-modal="true"/g) || []).length, 3);
});

test('exposes rewards, club filters, fields, and status changes semantically', () => {
  assert.match(page, /role="tablist"\s+aria-label="Smarter Rewards Sections"/);
  assert.equal((page.match(/role="tab"/g) || []).length, 3);
  assert.equal((page.match(/role="tabpanel"/g) || []).length, 3);
  assert.match(page, /aria-pressed=\{clubShopSubTab === st\.key\}/);
  assert.match(page, /aria-pressed=\{clubShopCategory === cat\}/);
  for (const label of [
    'Search Club Shop Items',
    'Sort Club Shop Items',
    'Item Name',
    'Price In Diamonds',
    'Item Description',
    'Item Category',
    'Item Image URL',
  ]) {
    assert.match(page, new RegExp(`aria-label=["']${label}["']`));
  }
  assert.match(page, /role="status"\s+aria-live="polite"/);
});

test('gives merchandise cards useful structure and product-specific purchase names', () => {
  assert.match(merch, /<article[\s\S]{0,240}aria-labelledby=\{titleId\}/);
  // The product name is still the card's labelling heading. Its level is no
  // longer fixed at h4: a detail page renders no category h3, so the card takes
  // that level instead of skipping it. See
  // __tests__/marketplace-accessibility-outline-and-targets.test.mjs.
  assert.match(merch, /const ProductHeading = `h\$\{headingLevel\}`;/);
  assert.match(merch, /<ProductHeading\s+id=\{titleId\}/);
  assert.match(merch, /aria-label=\{`Buy \$\{product\.name\} With Card For/);
  assert.match(
    merch,
    /aria-label=\{`Buy \$\{product\.name\} With \$\{fmt\(diamondCost\)\} Diamonds`\}/
  );
  assert.match(merch, /role="alert"/);
  assert.match(merch, /role="status"/);
});

test('adds a scoped metallic mobile shell without touching the global header', () => {
  assert.match(
    page,
    /<UniversalHeader pageDepth=\{1\} \/>\s*<main\s+className=\{`store-redesign-content \$\{shellStyles\.root\}`\}\s+data-marketplace-route=\{TAB_ROUTES\[activeTab\]\}[\s\S]{0,120}?data-title-case-strategy="css"\s*>/
  );
  assert.match(shell, /\.root[\s\S]*?:is\([\s\S]*?\):focus-visible\s*\{/);
  assert.match(shell, /\.planRail > button\s*\{[^}]*flex:\s*0 0 min\(82vw, 320px\)/s);
  assert.match(
    shell,
    /\.responsiveGrid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) !important/s
  );
  assert.match(shell, /min-height:\s*44px/);
  assert.doesNotMatch(shell, /:global\([^)]*header|\.UniversalHeader/);
});
