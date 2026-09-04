/**
 * NOTHING THAT CAN CONTAIN A position:fixed ELEMENT MAY BE AN ACCIDENTAL SCROLLER.
 *
 * The Club Arena half of this bug was reported by Dan three times in six days
 * ("THE FOOTER IS COMING UP ON MOBILE AND ISN'T STAYING LOCKED TO THE FOOTER")
 * and was, every time, this one declaration:
 *
 *     overflow-x: hidden;
 *
 * CSS Overflow 3: when one axis is a non-visible value and the other is
 * `visible`, the `visible` one COMPUTES TO `auto`. That single line silently
 * makes the element a scroll container on BOTH axes, and WebKit then resolves
 * `position: fixed` descendants against IT rather than the viewport.
 *
 * The hub has the same shape. `.pnm-page` carried `overflow-x: hidden` while
 * the same stylesheet positions three fixed elements inside it: the
 * favourite-venue live toast at `top: 80px`, which scrolls away with the
 * content instead of staying put, and two full-bleed `inset: 0` backgrounds,
 * which size to the whole scroll height rather than the screen.
 *
 * Chrome does not do any of this. That is why it survives review, survives
 * jsdom, and only shows up on a phone after it ships — so the declaration is
 * banned outright rather than judged case by case.
 *
 * ALLOWED: a rule that also declares `overflow-y` (or the `overflow`
 * shorthand) is a deliberate scroller and is exempt. `src/index.css` body is
 * the real one — it sets `overflow-y: auto` on purpose.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCOPES = ['styles', 'src/styles'];
const EXTRA_FILES = ['src/index.css'];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return fs.statSync(full).isDirectory() ? walk(full) : [full];
  });
}

test('no stylesheet sets overflow-x: hidden without pairing it with clip', () => {
  const offences = [];

  const files = [
    ...SCOPES.flatMap((s) => walk(path.join(ROOT, s))).filter((f) => f.endsWith('.css')),
    ...EXTRA_FILES.map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f)),
  ];

  {
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      // Innermost brace pairs are the declaration blocks; a media query's own
      // block contains further braces and is skipped by this pattern.
      for (const m of src.matchAll(/\{[^{}]*\}/g)) {
        const block = m[0];
        if (!/^[ \t]*overflow-x:\s*hidden(\s*!important)?;\s*$/m.test(block)) continue;
        if (/overflow-x:\s*clip/.test(block)) continue; // paired, correct
        if (/overflow-y\s*:/.test(block)) continue; // a deliberate scroller
        if (/(^|[\s;{])overflow\s*:/.test(block)) continue; // shorthand, deliberate
        const before = src.slice(0, m.index ?? 0);
        const selector = (before.split(/[}{]/).pop() || '').trim().replace(/\s+/g, ' ').slice(-80);
        offences.push(`${file.replace(`${ROOT}/`, '')}  {${selector}}`);
      }
    }
  }

  assert.deepEqual(
    offences,
    [],
    `These rules make their element an accidental scroll container, which is how a\n` +
      `position:fixed descendant comes unstuck from the viewport on iOS. Add\n` +
      `\`overflow-x: clip;\` on the line after \`overflow-x: hidden;\`, or declare an\n` +
      `explicit overflow-y if the element really is meant to scroll:\n  ` +
      offences.join('\n  ')
  );
});

test('the one deliberate scroller still declares itself', () => {
  // src/index.css's body is the legitimate case: it sets overflow-x: hidden AND
  // overflow-y: auto, so the exemption above applies to it honestly. If somebody
  // drops that explicit overflow-y, the rule silently becomes the accidental
  // kind — and the scan above would then flag it, which is the point. This pins
  // the intent so the exemption is never mistaken for an oversight.
  const src = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');
  const bodyWithOverflowX = [...src.matchAll(/\nbody[^{]*\{[^}]*\}/g)]
    .map((m) => m[0])
    .filter((b) => /overflow-x:\s*hidden/.test(b));
  for (const block of bodyWithOverflowX) {
    assert.match(
      block,
      /overflow-y:\s*(auto|scroll|hidden|clip)/,
      'a body rule sets overflow-x: hidden without declaring overflow-y; that makes <body> ' +
        'an accidental scroll container for every fixed element on the page'
    );
  }
});

const bottomNav = () =>
  fs.readFileSync(path.join(ROOT, 'src/components/ui/BottomNavBar.jsx'), 'utf8');

test('the shared World Hub footer is welded to the viewport bottom', () => {
  const nav = bottomNav();

  assert.match(nav, /position:\s*'fixed',\s*bottom:\s*0,\s*left:\s*0,\s*right:\s*0/);
  assert.match(
    nav,
    /width:\s*'100%',\s*maxWidth:\s*'100vw',\s*margin:\s*0,[\s\S]*?overflow:\s*'hidden',\s*boxSizing:\s*'border-box'/
  );
  // Both footers — the artwork one and the legacy fallback — declare the same
  // weld, and neither may ever translate, rotate or scale for any reason other
  // than the scroll behaviour pinned below.
  assert.equal(
    (nav.match(/translate:\s*'none',\s*transition:\s*'none',\s*animation:\s*'none'/g) || []).length,
    2
  );
  // Nothing animates, ever. `translateY(110%)` in particular was an older
  // auto-hide attempt that parked the bar somewhere it could not come back
  // from; the sanctioned distance is exactly its own height.
  assert.doesNotMatch(nav, /translateY\(110%\)|animation:\s*'(?!none)/);
});

/**
 * EVERY FOOTER HIDES WHILE YOU READ (Dan, 2026-09-04, binding).
 *
 * Dan, verbatim: "the footer on social media needs to disappear when you
 * scroll up and reappear when you scroll down like it does on facebook. it
 * needs to be real time instant change." And then, on seeing it: "any other
 * pages that you can 'scroll up to see more' need this same disappearing
 * footer functionality... implement this everywhere its needed."
 *
 * This test REPLACES an assertion that read `assert.doesNotMatch(nav,
 * /autoHide|setHidden|addEventListener\('scroll/)` — a blanket ban on the
 * behaviour Dan has now asked for. That ban was written for a different
 * failure: the bar coming UNSTUCK from the viewport on iOS because an
 * ancestor had quietly become a scroll container. The test above still pins
 * every part of that, and the ban is narrowed here rather than deleted:
 * movement is on one axis, by exactly one screen height, with no transition
 * and no timer, and it always comes back.
 *
 * If you are here because this test went red: you did not break a rule about
 * hiding, you broke one of those conditions. Read which assertion failed.
 */
test('every footer hides on scroll, instantly, on one axis, and always comes back', () => {
  const nav = bottomNav();
  const registry = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'src/config/world-footer-navigation.json'), 'utf8')
  );

  // No route list, no allowlist: a page that does not scroll never fires a
  // scroll event, so "everywhere it is needed" is the same thing as
  // "everywhere". `hideOnScroll: false` exists only as an escape hatch, and
  // nothing uses it — an entry appearing here is a footer somebody froze.
  const optedOut = [registry.fallback, ...registry.worlds].filter(
    (footer) => footer.hideOnScroll === false
  );
  assert.deepEqual(optedOut.map((footer) => footer.id), []);

  // One axis, one screen height, on BOTH the artwork footer and the fallback.
  assert.equal(
    (nav.match(/transform:\s*hidden\s*\?\s*'translateY\(100%\)'\s*:\s*'none'/g) || []).length,
    2
  );
  assert.match(nav, /useHideOnScroll\(footer\.hideOnScroll !== false, path\)/);
  assert.equal((nav.match(/onFocusCapture=\{reveal\}/g) || []).length, 2);

  const hook = nav.slice(
    nav.indexOf('function useHideOnScroll'),
    nav.indexOf('const artworkDisplayBounds')
  );
  assert.ok(hook.length > 0, 'useHideOnScroll must exist in BottomNavBar');
  // "Real time instant change" is the requirement, so the transform may not be
  // eased, delayed, or queued behind a timer.
  assert.doesNotMatch(hook, /setTimeout|setInterval|transition|ease|duration/);
  assert.match(hook, /requestAnimationFrame/);
  // Visible by default, and restored on every route change, at the top of the
  // document, and when keyboard focus reaches it.
  assert.match(hook, /useState\(false\)/);
  assert.match(hook, /\}, \[resetKey\]\)/);
  assert.match(hook, /if \(y <= 0\) \{\s*setHidden\(false\);/);
  // Scroll events do not bubble. Pages that scroll an inner panel rather than
  // the document are the ones this capture-phase listener exists for, and
  // dropping `capture` silently removes the behaviour from all of them.
  assert.match(
    hook,
    /document\.addEventListener\('scroll', onScroll, \{ capture: true, passive: true \}\)/
  );
  assert.match(
    hook,
    /document\.removeEventListener\('scroll', onScroll, \{ capture: true \}\)/
  );
});

/**
 * THE CROPPED ARTWORK MUST OPT OUT OF THE GLOBAL IMAGE RESET.
 *
 * Each footer image is the whole source canvas, sized LARGER than its stage on
 * purpose so the stage can crop the canvas margin away. A global
 * `img, video { max-width: 100% }` clamped that width back down, and
 * `object-fit: contain` then letterboxed the artwork inside its own box: the
 * frame drew ~2.5% small and ~4px low, so the measured crop stopped lining up
 * with the stage and left a black strip down the right edge and a shaved
 * bottom bevel. Dan reported it as "the bottom of the footer seems distorted
 * and pixelated now".
 */
test('the footer artwork is exempt from the global max-width reset', () => {
  const nav = bottomNav();
  const style = nav.slice(
    nav.indexOf('const artworkImageStyle'),
    nav.indexOf('export const BottomNavSpacer')
  );
  assert.ok(style.length > 0, 'artworkImageStyle must exist in BottomNavBar');
  assert.match(style, /maxWidth:\s*'none'/);
  assert.match(style, /maxHeight:\s*'none'/);
});
