import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const componentPath = path.join(
  root,
  'src/components/marketplace-console/MarketplaceConsole.jsx'
);
const stylesPath = path.join(
  root,
  'src/components/marketplace-console/MarketplaceConsole.module.css'
);
const hookPath = path.join(
  root,
  'src/components/marketplace-console/useMarketplaceConsoleFitText.js'
);
const indexPath = path.join(root, 'src/components/marketplace-console/index.js');
const readmePath = path.join(root, 'src/components/marketplace-console/README.md');
const manifestPath = path.join(root, 'public/images/marketplace-console-v1/manifest.json');

function publicPathToFile(assetPath) {
  return path.join(root, 'public', assetPath.replace(/^\//, ''));
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function pngDimensions(buffer) {
  const pngSignature = '89504e470d0a1a0a';
  assert.equal(buffer.subarray(0, 8).toString('hex'), pngSignature);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

test('the packaged console assets match their recorded provenance', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.sourceTreeCommit, '992b5e11d2cbf9aa4f589ef064b3999b93354935');
  assert.match(manifest.compositionPolicy, /preserve existing Marketplace layouts/i);
  assert.match(manifest.compositionPolicy, /Do not add standalone destination objects/i);
  assert.equal(manifest.approvedCrest, 'spade');
  assert.deepEqual(manifest.excludedCrestVariants, ['club', 'diamond', 'vip', 'flat']);
  assert.equal(manifest.assets.length, 14);

  const families = new Set(manifest.assets.map((asset) => asset.family));
  for (const family of [
    'spade-console',
    'shark-panel',
    'action-primary',
    'navigation',
    'utility',
    'wallet-row',
  ]) {
    assert.ok(families.has(family), `missing ${family}`);
  }
  assert.equal(families.has('destination-selector'), false);
  assert.equal(families.has('vip-plan'), false);

  for (const asset of manifest.assets) {
    const buffer = await readFile(publicPathToFile(asset.packagedPath));
    assert.equal(sha256(buffer), asset.packagedSha256, asset.packagedPath);
    assert.equal(asset.sourceSha256, asset.packagedSha256, asset.packagedPath);
    assert.deepEqual(pngDimensions(buffer), {
      width: asset.width,
      height: asset.height,
    });
  }

  const packagedHashes = manifest.assets.map((asset) => asset.packagedSha256);
  assert.equal(new Set(packagedHashes).size, packagedHashes.length);
});

test('the foundation exposes every required painted hardware component', async () => {
  const [component, index] = await Promise.all([
    readFile(componentPath, 'utf8'),
    readFile(indexPath, 'utf8'),
  ]);

  for (const name of [
    'MarketplacePageConsole',
    'MarketplaceConsoleAction',
    'MarketplaceConsoleNavigationPlate',
    'MarketplaceConsoleUtilityCard',
    'MarketplaceConsolePanel',
    'MarketplaceConsoleMediaCard',
    'MarketplaceConsoleStatusRow',
    'MarketplaceConsoleWalletRow',
  ]) {
    assert.match(component, new RegExp(`export function ${name}\\b`));
    assert.match(index, new RegExp(`\\b${name},`));
  }

  assert.doesNotMatch(
    component,
    /MARKETPLACE_SELECTOR_ART|MarketplaceConsoleSelectorGrid|MARKETPLACE_VIP_PLAN_ART|MarketplaceConsoleVipPlanCard/
  );
  assert.doesNotMatch(
    index,
    /MARKETPLACE_SELECTOR_ART|MarketplaceConsoleSelectorGrid|MARKETPLACE_VIP_PLAN_ART|MarketplaceConsoleVipPlanCard/
  );
  assert.doesNotMatch(component, /export function MarketplaceConsoleNavigation\b/);
  assert.doesNotMatch(component, /CategoryRail|CATEGORY_RAIL/);
});

test('live controls remain semantic, same-tab, and measurable', async () => {
  const [component, hook] = await Promise.all([
    readFile(componentPath, 'utf8'),
    readFile(hookPath, 'utf8'),
  ]);

  assert.match(component, /<button/);
  assert.match(component, /<a/);
  assert.match(component, /<nav/);
  assert.match(component, /aria-current/);
  assert.match(component, /aria-labelledby/);
  assert.match(component, /aria-live/);
  assert.match(component, /import Link from 'next\/link'/);
  assert.match(component, /<SameSurfaceLink/);
  assert.doesNotMatch(component, /window\.open\s*\(/);
  assert.doesNotMatch(component, /target\s*=\s*["']_blank["']/);

  assert.match(hook, /ResizeObserver/);
  assert.match(hook, /getBoundingClientRect\(\)/);
  assert.match(hook, /document\.fonts\.ready/);
  assert.match(hook, /--marketplace-console-fit/);
});

test('the new system cannot fall back to drawn generic chrome', async () => {
  const [component, styles, hook, index, manifest, readme] = await Promise.all([
    readFile(componentPath, 'utf8'),
    readFile(stylesPath, 'utf8'),
    readFile(hookPath, 'utf8'),
    readFile(indexPath, 'utf8'),
    readFile(manifestPath, 'utf8'),
    readFile(readmePath, 'utf8'),
  ]);
  const source = [component, styles, hook, index, manifest, readme].join('\n');

  assert.doesNotMatch(source, /\u2014/);
  assert.doesNotMatch(component, /lucide|heroicons|fontawesome/i);
  assert.doesNotMatch(styles, /(?:linear|radial|conic)-gradient/i);
  assert.doesNotMatch(styles, /(?:box|text)-shadow/i);
  assert.doesNotMatch(styles, /border-radius|border-image/i);
  assert.doesNotMatch(styles, /:hover\b/i);
  assert.doesNotMatch(styles, /text-transform\s*:/i);

  const borderDeclarations = [...styles.matchAll(/\bborder\s*:\s*([^;]+);/gi)].map(
    (match) => match[1].trim()
  );
  assert.ok(borderDeclarations.length > 0);
  assert.ok(borderDeclarations.every((value) => value === '0'));

  assert.match(styles, /container-type:\s*inline-size/);
  assert.match(styles, /cqw/);
  assert.match(styles, /aspect-ratio:\s*1000\s*\/\s*348/);
  assert.match(styles, /aspect-ratio:\s*1772\s*\/\s*436/);
  assert.match(styles, /aspect-ratio:\s*1829\s*\/\s*313/);
  assert.match(styles, /aspect-ratio:\s*1105\s*\/\s*1133/);
  assert.match(styles, /aspect-ratio:\s*1800\s*\/\s*386/);

  const allowedColors = new Set([
    '#000',
    '#45adff',
    '#9aa5b3',
    '#e4e7ec',
    '#f4f7fb',
    '#ff5b6e',
  ]);
  const usedColors = new Set(styles.match(/#[0-9a-f]{3,8}\b/gi));
  assert.deepEqual([...usedColors].sort(), [...allowedColors].sort());
});

test('the page chassis cannot expose one empty painted footer plate', async () => {
  const component = await readFile(componentPath, 'utf8');
  assert.match(component, /hasPrimaryAction !== hasSecondaryAction/);
  assert.match(component, /Requires Two Footer Actions Or None/);
});

test('the foundation upgrades existing layouts without adding destination objects', async () => {
  const readme = await readFile(readmePath, 'utf8');
  assert.match(readme, /Do not repeat `MarketplaceConsoleUtilityCard`/);
  assert.match(readme, /Preserve each Marketplace page's existing layout/);
  assert.match(readme, /instead\s+of adding standalone destination objects/);
  assert.match(readme, /without making\s+every page a one-to-one clone/);
  assert.match(readme, /Supply live labels in Title Case/);
  assert.doesNotMatch(readme, /MarketplaceConsoleSelectorGrid|five selector objects/i);
});

test('rejected destination and VIP replacement artwork is excluded', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const selectors = manifest.assets.filter((asset) => asset.family === 'destination-selector');
  const vipPlans = manifest.assets.filter((asset) => asset.family === 'vip-plan');

  assert.equal(selectors.length, 0);
  assert.equal(vipPlans.length, 0);

  const serialized = JSON.stringify(manifest);
  assert.doesNotMatch(
    serialized,
    /destination-selector|\/selectors\/|vip-plan|\/vip-plans\/|navigation\/(?:section|commerce)-rail\.png|five-bay|four-bay/i
  );
});

test('only the approved spade console head is packaged', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const spadeHeads = manifest.assets.filter(
    (asset) => asset.family === 'spade-console' && asset.role === 'page-head'
  );

  assert.equal(spadeHeads.length, 1);
  assert.match(spadeHeads[0].packagedPath, /\/spade-console\/top\.png$/);
  for (const asset of manifest.assets) {
    assert.doesNotMatch(asset.packagedPath, /top-(?:club|diamond|vip|flat)\.png$/);
  }
});
