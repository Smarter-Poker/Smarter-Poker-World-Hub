/**
 * #SMARTERDESIGN owner standard, November 27, 2026.
 *
 * 1. Every image header uses the same painted chrome "?" as the Club Arena
 *    Cashier header (header-help-v4.png), and never any other help icon,
 *    tucked into the upper-right corner just inside the steel rim.
 * 2. A Back To Dashboard control is never inside an image header; it sits in
 *    its own row directly above it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import test from 'node:test';

const ROOT = process.cwd();
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) => {
  const rel = path.join(dir, d.name);
  if (d.isDirectory()) return d.name === 'node_modules' ? [] : walk(rel);
  return /\.(jsx?|tsx?)$/.test(d.name) ? [rel] : [];
});

test('the approved chrome help icon is the Club Arena header-help-v4 artwork', () => {
  const bytes = fs.readFileSync(path.join(ROOT, 'public/images/smarterdesign/help-chrome.png'));
  // git blob c11f1314e07d8496eb882ff264582966d8766775 in Smarter-Poker-Club-Arena.
  const blob = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(blob, 'c11f1314e07d8496eb882ff264582966d8766775');
});

test('every image-header help control paints the approved icon and no glyph', () => {
  const help = read('src/components/bankroll/BankrollHelp.jsx');
  assert.match(help, /export const HELP_ICON_SRC = '\/images\/smarterdesign\/help-chrome\.png'/);
  assert.match(help, /<img className=\{styles\.helpIcon\} src=\{HELP_ICON_SRC\}/);
  assert.doesNotMatch(help, />\?<\/button>/);
  const vip = read('src/components/vip/VipKit.jsx');
  assert.match(vip, /src=\{HELP_ICON_SRC\}/);
  assert.doesNotMatch(vip, /<span aria-hidden="true">\?<\/span>/);
  for (const css of ['src/components/bankroll/BankrollHelp.module.css', 'src/components/vip/VipKit.module.css']) {
    const src = read(css);
    const rule = src.slice(src.indexOf('.help {'), src.indexOf('}', src.indexOf('.help {')));
    assert.match(rule, /top: 3px;/, `${css} tucks the icon into the corner`);
    assert.match(rule, /right: 3px;/, `${css} tucks the icon into the corner`);
    assert.match(rule, /place-items: start end;/, `${css} grows the touch target inward`);
    assert.doesNotMatch(rule, /border-radius: 50%|border: 1px solid/, `${css} draws no CSS circle`);
  }
});

test('no Back To Dashboard control is rendered inside an image header', () => {
  const offenders = [];
  for (const file of [...walk('pages'), ...walk('src/components')]) {
    const src = read(file);
    const re = /<BankrollImageHeader\b[\s\S]*?(?:\/>|<\/BankrollImageHeader>)/g;
    for (const m of src.matchAll(re)) {
      if (/Back To Dashboard/.test(m[0])) offenders.push(file);
    }
  }
  assert.deepEqual(offenders, []);
});
