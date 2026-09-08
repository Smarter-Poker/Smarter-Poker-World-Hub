/**
 * A RINGED AVATAR IS A CIRCLE (Dan, 2026-09-08, BINDING)
 *
 * Dan: the profile image holder next to "Post As <club>" was an oval on every
 * club page and a circle on Profile. Both were the same avatar component.
 *
 * The cause is not the avatar. It is the WRAPPER that draws the ring. A
 * block-level wrapper puts an inline-block child on a text baseline, and the
 * descender space under that baseline is added to the wrapper's height and not
 * its width. Measured on production before the fix: 44 x 52.6. Profile looked
 * correct only because it draws no ring, so the gap was invisible.
 *
 * On mobile there is a second source of the same distortion:
 * `a { min-height: 44px }` in the responsive block. A ring wrapper that is an
 * <a> inherits it.
 *
 * So this law pins three things:
 *   1. the .sp-avatar-ring escape hatch exists and still removes the gap;
 *   2. the catch-alls that protect wrappers which do not carry the class;
 *   3. no wrapper anywhere draws a ring around an avatar as a block element.
 *
 * (3) is the one that matters. (1) and (2) are the mechanism; (3) is the rule.
 *
 * Sibling law: __tests__/the-footer-keeps-its-artworks-shape.law.test.mjs
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const CSS = read('src/index.css');
const AVATAR = read('src/components/social/SharedAvatar.jsx');

test('.sp-avatar-ring still removes the baseline gap', () => {
  const block = CSS.match(/\.sp-avatar-ring\s*\{([\s\S]*?)\}/);
  assert.ok(block, '.sp-avatar-ring is gone - it is what makes a ringed avatar square');
  const body = block[1];
  assert.match(body, /display:\s*inline-flex/, 'the ring must be inline-flex, not block');
  assert.match(body, /line-height:\s*0/, 'line-height:0 is what removes the descender gap');
  assert.match(body, /min-height:\s*unset/, 'must opt out of the mobile 44px min-height');
});

test('the inline-style catch-alls still protect wrappers without the class', () => {
  // Anchors: added 2026-09-08. Buttons: pre-existing. Both need the same guard.
  const anchorRule = CSS.match(/a\[style\*="border-radius: 50%"\][\s\S]{0,400}?\{([\s\S]*?)\}/);
  assert.ok(anchorRule, 'the <a> circle catch-all is gone - the mobile min-height rule reaches it');
  assert.match(anchorRule[1], /min-height:\s*unset/, 'the anchor catch-all must unset min-height');
  assert.match(anchorRule[1], /line-height:\s*0/, 'the anchor catch-all must zero line-height');

  assert.match(CSS, /button\[style\*="border-radius: 50%"\]/, 'the button circle catch-all is gone');
});

test('.sp-avatar itself is still pinned square', () => {
  const block = CSS.match(/\.sp-avatar,\s*\n\.sp-avatar img\s*\{([\s\S]*?)\}/);
  assert.ok(block, '.sp-avatar enforcement block is gone');
  assert.match(block[1], /aspect-ratio:\s*1\s*\/\s*1/, '.sp-avatar must stay 1:1');
  assert.match(block[1], /border-radius:\s*50%/, '.sp-avatar must stay round');
  assert.match(block[1], /flex-shrink:\s*0/, '.sp-avatar must never be squeezed by a flex parent');

  for (const prop of ['width', 'height', 'minWidth', 'minHeight', 'aspectRatio', 'flexShrink']) {
    assert.match(AVATAR, new RegExp(`${prop}:`), `SharedAvatar dropped ${prop}`);
  }
});

/**
 * Walk every surface that renders avatars and find inline styles that draw a
 * ring - a 50% border-radius with a border - directly around an <Avatar>. Each
 * one must either carry .sp-avatar-ring or set a flex display itself. A plain
 * block wrapper is the bug.
 */
function walk(dir, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name);
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) walk(rel, out);
    else if (/\.(jsx?|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

test('no wrapper draws a ring around an avatar as a block element', () => {
  const files = [...walk('src/components/social'), ...walk('src/components/ui'), ...walk('pages/hub')];
  assert.ok(files.length > 50, `scan did not run - only ${files.length} files seen`);

  /*
   * Extract the element's OWN opening tag, not a window of nearby lines. The
   * first version of this law used a 14-line window, and the club ring branch
   * passed while reverted to display:'block' because that window reached into
   * the adjacent home-group branch and found ITS sp-avatar-ring. A guard that
   * reads its neighbour's homework is not a guard.
   */
  function openingTagAt(src, idx) {
    let start = idx;
    while (start > 0) {
      start = src.lastIndexOf('<', start - 1);
      if (start < 0) return null;
      if (/[A-Za-z]/.test(src[start + 1] || '')) break;
    }
    if (start < 0) return null;
    let depth = 0;
    for (let i = start; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) return { start, end: i };
    }
    return null;
  }

  const offenders = [];
  let ringsChecked = 0;

  for (const file of files) {
    const src = read(file);
    const re = /borderRadius:\s*'50%'/g;
    let m;
    while ((m = re.exec(src))) {
      const tag = openingTagAt(src, m.index);
      if (!tag) continue;
      if (m.index > tag.end) continue;           // radius belongs to a child, not this tag

      const attrs = src.slice(tag.start, tag.end + 1);
      const after = src.slice(tag.end + 1, tag.end + 500);

      /*
       * The avatar must be this element's DIRECT content. A loose forward
       * search matched the sidebar's close button, whose 500-char window
       * reached down into an unrelated identity-switcher avatar.
       */
      const firstChild = after.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').trimStart();
      if (!/^<(Avatar|SharedAvatar)\b/.test(firstChild)) continue;

      /*
       * `border: 'none'` draws no ring, so there is no ring to distort - the
       * avatar's own .sp-avatar rules already keep it round. Only a real
       * border makes the wrapper's box visible.
       */
      const border = attrs.match(/border:\s*(`[^`]*`|'[^']*')/);
      if (!border || /^['`](none|0)['`]?$/.test(border[1].replace(/[`']/g, ''))) continue;

      ringsChecked++;
      const guarded = /sp-avatar-ring/.test(attrs) || /display:\s*'(inline-)?flex'/.test(attrs);
      if (!guarded) {
        offenders.push(`${relative('.', file)}:${src.slice(0, tag.start).split('\n').length}`);
      }
    }
  }

  // Control: if this drops to zero the scan has stopped seeing rings and would
  // pass no matter what the code does.
  assert.ok(ringsChecked > 0, 'found no ringed avatars at all - the scan is not working');

  assert.deepEqual(
    offenders,
    [],
    'these wrappers draw a ring around an avatar without a flex display, so the ' +
      'inline-block baseline gap makes them ovals. Add className="sp-avatar-ring":\n  ' +
      offenders.join('\n  ')
  );
});
