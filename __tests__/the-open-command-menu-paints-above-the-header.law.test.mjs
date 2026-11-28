/**
 * THE OPEN COMMAND MENU PAINTS ABOVE THE HEADER (2026-11-28)
 *
 * UniversalHeader portals the header to <body> at z 10050 but renders the
 * World command menu in place. On Training the route shell is isolated
 * (isolation: isolate keeps its z-index:-1 decorations inside it), so the open
 * drawer was capped at the shell's level and the header and guest bar painted
 * over its title, edit and close controls on every Training page.
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

test('the isolated Training shell rises above the header while its drawer is open', () => {
  const css = read('src/styles/worlds/training.css');
  assert.match(css, /body\.world-training \.sp-training-route-shell \{[^}]*isolation: isolate;/);
  const rule = css.match(/body\.world-training \.sp-training-route-shell:has\(\.sp-drawer\[data-open='true'\]\) \{([^}]*)\}/);
  assert.ok(rule, 'the open-drawer rule on the Training route shell is missing');
  const z = Number(rule[1].match(/z-index:\s*(\d+)/)?.[1]);
  assert.ok(z > 10050, `the open shell must sit above the portaled header (10050), got ${z}`);
});
