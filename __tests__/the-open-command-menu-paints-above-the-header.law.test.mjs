/**
 * THE OPEN COMMAND MENU PAINTS ABOVE THE HEADER (2026-11-28)
 *
 * UniversalHeader portals the header to <body> at z 10050 but renders the
 * World command menu in place. Any page wrapper that creates a stacking
 * context caps the open drawer at that wrapper's level: Training's isolated
 * route shell, Preflop Charts and the Video Library header area (z 40) all let
 * the header and guest bar paint over the drawer's title, edit and close
 * controls.
 * e2e/022-world-menu-visual.spec.ts measures the layers in a browser; this
 * pins the two halves of the fix so neither is dropped on its own.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('the drawer exposes its open state', () => {
  assert.match(read('src/components/ui/HamburgerMenu.jsx'), /data-open=\{isOpen \? 'true' : 'false'\}/);
});

test('every ancestor of the open drawer rises to the drawer layer, above the header', () => {
  const menu = read('src/components/ui/HamburgerMenu.jsx');
  const rule = menu.match(/body :has\(\.sp-drawer\[data-open='true'\]\) \{([^}]*)\}/);
  assert.ok(rule, 'the open-drawer ancestor rule is missing from the command menu styles');
  const z = Number(rule[1].match(/z-index:\s*(\d+)\s*!important/)?.[1]);
  assert.ok(z > 10050, `open-drawer ancestors must sit above the portaled header (10050), got ${z}`);
});
