import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('training game art stays dimensional without a moving scan beam', () => {
  const hub = fs.readFileSync(path.join(ROOT, 'pages/hub/training.js'), 'utf8');

  assert.match(hub, /className="sp-card-hud"/);
  assert.doesNotMatch(hub, /sp-card-scanline|sp-card-scan/);
});

test('the primary Training Hub requests responsive canonical artwork', () => {
  const hub = fs.readFileSync(path.join(ROOT, 'pages/hub/training.js'), 'utf8');
  const responsiveArt = fs.readFileSync(
    path.join(ROOT, 'src/components/training/TrainingGameArt.jsx'),
    'utf8',
  );

  assert.match(hub, /import TrainingGameArt/);
  assert.ok(
    [...hub.matchAll(/<TrainingGameArt/g)].length >= 2,
    'the recommended drill and catalog cards must share responsive artwork',
  );
  assert.match(hub, /calc\(100vw - 24px\)/);
  assert.doesNotMatch(hub, /import \{ getGameImage \}/);
  assert.match(responsiveArt, /type="image\/avif"/);
  assert.match(responsiveArt, /type="image\/webp"/);
  assert.doesNotMatch(responsiveArt, /fetchPriority=/);
});

test('hero and HUD overlays have smaller modern-format delivery paths', () => {
  const hub = fs.readFileSync(path.join(ROOT, 'pages/hub/training.js'), 'utf8');
  const assets = [
    'training-orb-hero',
    'training-card-hud-overlay',
  ];

  for (const asset of assets) {
    const png = fs.statSync(path.join(ROOT, `public/images/training/${asset}.png`)).size;
    const webp = fs.statSync(path.join(ROOT, `public/images/training/${asset}.webp`)).size;
    const avif = fs.statSync(path.join(ROOT, `public/images/training/${asset}.avif`)).size;
    assert.ok(webp < png, `${asset}.webp must be smaller than its PNG fallback`);
    assert.ok(avif < png, `${asset}.avif must be smaller than its PNG fallback`);
  }

  assert.match(hub, /training-orb-hero\.avif/);
  assert.match(hub, /training-orb-hero\.webp/);
  assert.match(hub, /training-card-hud-overlay\.avif/);
  assert.match(hub, /training-card-hud-overlay\.webp/);
  assert.match(hub, /image-set\(/);
});
