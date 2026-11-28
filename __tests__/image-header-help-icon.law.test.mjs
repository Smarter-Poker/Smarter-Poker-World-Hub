/**
 * THE IMAGE-HEADER "?" AND THE BACK LINK (#SMARTERDESIGN, Dan 2026-11-27)
 *
 * Dan, verbatim: "MAKE SURE THAT EVERY SINGLE IMAGE DISPLAY HEADER IS USING
 * THIS SAME DYNAMIC QUESTION MARK ICON AS SEEN IN THE FIRST ATTACHED, AND
 * NEVER ANY OTHER ONE ... THEY SHOULD ALL ALWAYS BE TUCKED INTO THE UPPER
 * RIGHT CORNER AS CLOSE TO THE EDGES AS POSSIBLE WITHOUT TOUCHING THE FRAMES."
 * And: "THERE SHOULD NEVER BE A 'BACK TO DASHBOARD' BUTTON INSIDE THE IMAGE
 * HEADER, IT SHOULD BE ABOVE IT."
 *
 * Before this law, Bankroll Manager and Toke Tracker drew a text "?" in a CSS
 * gradient circle, the VIP masthead drew a second, different CSS circle, and
 * Back To Dashboard was printed inside the image header on every Bankroll,
 * Export and Toke page.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const ICON = '/images/smarterdesign/header-help.webp';

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(jsx?|tsx?)$/.test(name)) yield full;
  }
}
const sources = [...walk(join(root, 'src')), ...walk(join(root, 'pages'))].map((full) => ({
  file: relative(root, full),
  text: readFileSync(full, 'utf8'),
}));

test('the one approved "?" icon exists and is the only one the shared constant names', () => {
  assert.ok(existsSync(join(root, 'public', ICON)), 'the painted chrome "?" ships');
  assert.match(read('src/components/smarterdesign/headerHelp.js'), new RegExp(`SD_HEADER_HELP_ICON = '${ICON.replace(/\./g, '\\.')}'`));
});

test('every image-header help control renders the painted icon, never a text "?"', () => {
  const help = read('src/components/bankroll/BankrollHelp.jsx');
  assert.match(help, /className="sd-header-help" data-focus-custom=""[\s\S]{0,400}<img src=\{SD_HEADER_HELP_ICON\}/);
  assert.doesNotMatch(help, />\s*\?\s*<\/button>/, 'no text "?" in the Bankroll/Toke header');

  const vip = read('src/components/vip/VipKit.jsx');
  assert.match(vip, /className="sd-header-help" data-focus-custom=""[\s\S]{0,300}<img src=\{SD_HEADER_HELP_ICON\}/);
  assert.doesNotMatch(vip, /aria-hidden="true">\?<\/span>/, 'no CSS-circle "?" in the VIP masthead');

  // No other image header may grow its own "?". A header that hosts help must
  // use the shared control.
  for (const { file, text } of sources) {
    if (!/sd-masthead|BankrollImageHeader|VipMasthead|data-vip-masthead/.test(text)) continue;
    assert.doesNotMatch(text, /<(button|a)\b[^>]*>\s*(<span[^>]*>)?\s*\?\s*(<\/span>)?\s*<\/(button|a)>/, `${file}: a text "?" control in an image header`);
  }
});

test('the "?" sits 3px inside the painted rim, top and right, by arithmetic', async () => {
  const css = read('styles/smarterdesign.css');
  const rule = css.match(/\.sd-header-help \{[^}]*\}/)?.[0] ?? '';
  assert.match(rule, /--sd-help-icon: 36px;/);
  assert.match(rule, /--sd-help-gap: 3px;/);
  assert.match(rule, /--sd-help-at: calc\(var\(--sd-help-rim, 3\.5px\) - var\(--sd-help-border, 5px\) \+ var\(--sd-help-gap\) - \(44px - var\(--sd-help-icon\)\) \/ 2\);/);
  assert.match(rule, /position: absolute;/);
  assert.match(rule, /top: var\(--sd-help-at\);/);
  assert.match(rule, /right: var\(--sd-help-at\);/);
  assert.match(rule, /width: 44px;/);
  assert.match(rule, /height: 44px;/);
  // Even the keyboard focus ring stays clear of the rim: it is drawn on a
  // circle exactly behind the 36px icon, not around the 44px target.
  assert.match(css, /\.sd-header-help::after \{[^}]*inset: 4px;[^}]*box-shadow: 0 0 0 2px/);
  assert.match(css, /\.sd-header-help\.sd-header-help\.sd-header-help:focus-visible \{ box-shadow: none; outline: none; \}/);
  // The two frames that host it today both paint chrome-readout.webp at 8px,
  // whose opaque chrome is 9 of its 21px slice = 3.43px (the 3.5px default):
  // the #SMARTERDESIGN masthead (5px CSS border) and the VIP frame (6px).
  assert.match(css, /\.sd-masthead, \.sd-panel, \.smarterdesign \.bankroll-modal \{[^}]*border: 5px solid transparent;[^}]*21 \/ 8px stretch;/);
  const vipCss = read('src/components/vip/VipKit.module.css');
  assert.match(vipCss, /\.frame \{[^}]*border: 6px solid transparent;[^}]*21 \/ 8px stretch;/);
  assert.match(vipCss, /\.masthead :global\(\.sd-header-help\) \{\s*--sd-help-border: 6px;/);
  // The 3.5px default is measured, not assumed: the opaque run of the slice.
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(join(root, 'public/images/smarterdesign/chrome-readout.webp')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * info.channels + 3];
  let opaque = 0;
  while (alphaAt(info.width >> 1, opaque) > 128) opaque += 1;
  assert.ok(Math.abs((opaque / 21) * 8 - 3.5) < 0.25, `painted rim is ${(opaque / 21) * 8}px, not the 3.5px default`);
  // Training's page-wide button skins (square corners, bevels, drop shadows,
  // the brushed-chrome hardware layer) outrank the control's own reset and
  // boxed the icon twice. Every one of them must skip .sd-header-help.
  const training = read('src/styles/worlds/training.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const skins = [...training.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, selector, body]) => ({ selector: selector.trim(), body }))
    .filter(({ selector, body }) => /\.sp-training-page-stage(?:\.sp-training-page-stage)? :where\(button, /.test(selector)
      && !/:focus-visible/.test(selector)
      && /(box-shadow|border-radius|background|border\s*:)/.test(body));
  assert.ok(skins.length >= 4, `expected the Training button skins, found ${skins.length}`);
  for (const { selector } of skins) {
    assert.match(selector, /\.sd-header-help[,)]/, `Training button skin must exclude .sd-header-help: ${selector.slice(0, 140)}`);
  }
  // Training repaints its mastheads with a 2px chrome border; the "?" there
  // takes that frame's numbers so it stays 3px clear of it.
  assert.match(training, /border: 2px solid transparent !important;[^}]*var\(--sd-training-chrome\) border-box/);
  assert.match(training, /:where\(\.sd-panel, \.sd-masthead\)[^{]*\.sd-header-help \{\s*--sd-help-border: 2px;\s*--sd-help-rim: 2px;\s*\}/);
  // The control's skin is guarded in a cascade layer: layered !important beats
  // every unlayered page rule (Training, the store) whatever its specificity.
  const layer = css.slice(css.indexOf('@layer sd-header-help {'));
  assert.ok(css.includes('@layer sd-header-help {'), 'the header-help skin guard is a cascade layer');
  for (const decl of ['border: 0 !important', 'border-radius: 50% !important', 'background: transparent !important', 'box-shadow: none !important', 'outline: none !important']) {
    assert.ok(layer.slice(0, layer.indexOf('\n}\n')).includes(decl), `the layer guards ${decl}`);
  }
  assert.match(layer, /\.sd-header-help:focus-visible\s*\{/, 'the guard covers focus states');
  assert.doesNotMatch(vipCss, /\n\.help \{/, 'the retired VIP help circle stays deleted');
  assert.doesNotMatch(read('src/components/bankroll/BankrollHelp.module.css'), /\.help\b/, 'the retired Bankroll help circle stays deleted');
});

test('Back To Dashboard is never inside an image header; it renders above it', () => {
  for (const { file, text } of sources) {
    for (const m of text.matchAll(/<BankrollImageHeader\b[\s\S]*?(?:\/>|<\/BankrollImageHeader>)/g)) {
      // The return link goes through the `back` prop, which renders above the frame.
      assert.doesNotMatch(m[0], /Back To Dashboard/, `${file}: Back To Dashboard inside the image header`);
    }
    for (const m of text.matchAll(/<header\b[\s\S]*?<\/header>/g)) {
      if (!/sd-masthead|data-vip-masthead/.test(m[0])) continue;
      assert.doesNotMatch(m[0], /Back To Dashboard/, `${file}: Back To Dashboard inside an image header`);
    }
  }
  const header = read('src/components/bankroll/BankrollImageHeader.jsx');
  assert.match(header, /<nav className="sd-header-back" aria-label="Back">[\s\S]*<\/nav>\s*\{header\}/, 'the back row renders before the header');
  for (const file of ['pages/hub/bankroll-manager.js', 'pages/hub/bankroll-manager/export.js', 'src/components/bankroll/toke/TokeWorkspace.jsx']) {
    assert.match(read(file), /back=\{/, `${file} passes its return link through the header's back prop`);
  }
});
