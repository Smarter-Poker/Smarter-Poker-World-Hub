/**
 * LAW: the shared shell artwork is in the server HTML, never gated on mount,
 * and the World footer art is announced from the head.
 *
 * 2026-11-28. On the mobile budget (Global Footer E2E, iPhone 13 WebKit,
 * 375-390px) the Largest Contentful Paint of most World roots is shared shell
 * artwork: `img.bn-artwork-image` (BottomNavBar) or
 * `img.approved-global-header__art` (UniversalHeader). /hub/training missed
 * 2.5 s at 3.8-8.0 s, /hub/news 3.5 s at 3.5-4.0 s and /hub/preflop-charts
 * 2.5 s at 2.504 s, passing only on retry.
 *
 * Measured on the production build (diagnostic dispatch 46141845761, three
 * samples per root): both <picture>s are already in the server HTML and the
 * art is not swapped after hydration. What was late was DISCOVERY of the
 * footer art: it sits at the very end of a ~270 KB document, so its request
 * began 230-340 ms in, behind the deferred scripts, and WebKit could not
 * finish and paint it until hydration released the main thread (painted
 * 1.2-3.5 s). The footer therefore preloads its own <source> from the head,
 * with the exact srcset, sizes and type the <picture> selects, so the preload
 * and the <img> are one request. With the art in hand early, the remaining
 * delay was decoding="async": WebKit painted the stage empty, decoded off the
 * main thread and showed the art one frame later, and behind the page's
 * post-hydration work that frame came 0.8-1.6 s later. The footer art now
 * decodes in the frame that paints it, as the header art already did.
 *
 * This law keeps the three facts that make that work:
 *  1. the footer <picture>/<img> and the header <picture>/<img> are rendered
 *     unconditionally on the server render path (no mount gate, no lazy
 *     loading, no client-only dynamic import);
 *  2. the footer's head preload is built from the same `sources[0]` the
 *     <picture> renders, so it can never fetch a different file;
 *  3. every World footer has exactly one generated source for it to name.
 *
 * Nothing here changes how the shell looks: the header disc and hairline
 * (CLAUDE.md 10.4) and the fixed footer (rule 15) are pinned by their own laws.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

const footerSource = read('src/components/ui/BottomNavBar.jsx');
const headerSource = read('src/components/ui/UniversalHeader.js');
const appSource = read('pages/_app.js');
const footerConfig = JSON.parse(read('src/config/world-footer-navigation.json'));

function functionBody(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `${signature} not found`);
  const next = source.indexOf('\nfunction ', start + signature.length);
  return source.slice(start, next < 0 ? undefined : next);
}

const MOUNT_GATES = /\b(isMounted|hasMounted|mounted|isHydrated|hydrated|isClient)\b/;

test('the World footer art is rendered on the server render path, not after mount', () => {
  const body = functionBody(footerSource, 'function ArtworkBottomNav(');
  const returned = body.slice(body.indexOf('  return ('));
  const picture = returned.indexOf('<picture>');
  assert.ok(picture > 0, 'ArtworkBottomNav renders a <picture>');
  const beforePicture = returned.slice(0, picture);
  // Nothing between the return and the <picture> may make it conditional.
  assert.doesNotMatch(beforePicture.replace(/\/\/.*$/gm, ''), /&&|\?\s*\(|\?\s*</, 'the footer <picture> sits behind a condition');
  assert.doesNotMatch(body, MOUNT_GATES, 'ArtworkBottomNav must not read a mount flag');
  const img = returned.slice(picture, returned.indexOf('</picture>'));
  assert.match(img, /className="bn-artwork-image"/);
  assert.match(img, /srcSet=\{source\.srcSet\}/);
  assert.match(img, /sizes=\{source\.sizes\}/);
  assert.doesNotMatch(img, /loading=/, 'the footer art must not be lazy');
  // decoding="async" let WebKit paint the stage empty and show the art a
  // frame later, behind the post-hydration work (0.8-1.6 s on the budget).
  assert.match(img, /decoding="sync"/, 'the footer art decodes in the frame that paints it');
});

test('the World footer art is announced from the head with the exact <source> it renders', () => {
  const body = functionBody(footerSource, 'function ArtworkBottomNav(');
  assert.match(footerSource, /^import Head from 'next\/head';$/m);
  assert.match(body, /const preloadSource = \(artwork\.sources \|\| \[\]\)\[0\] \|\| null;/);
  const head = body.slice(body.indexOf('<Head>'), body.indexOf('</Head>'));
  assert.ok(head.length > 0, 'ArtworkBottomNav renders a <Head> preload');
  assert.match(head, /rel="preload"/);
  assert.match(head, /as="image"/);
  assert.match(head, /type=\{preloadSource\.type\}/);
  assert.match(head, /imageSrcSet=\{preloadSource\.srcSet\}/);
  assert.match(head, /imageSizes=\{preloadSource\.sizes\}/);
  assert.match(head, /key="world-footer-artwork"/);
  // The preload must not fall back to the full PNG when a derivative exists:
  // an href beside imageSrcSet is what a browser without imagesrcset fetches.
  const derivativeLink = head.slice(0, head.indexOf(') : ('));
  assert.doesNotMatch(derivativeLink, /href=/);
});

test('every World footer has exactly one generated source for the preload to name', () => {
  const worlds = footerConfig.worlds.filter((world) => world.artwork);
  assert.ok(worlds.length >= 12, `expected the World footers, found ${worlds.length}`);
  for (const world of worlds) {
    const sources = world.artwork.sources || [];
    assert.equal(sources.length, 1, `${world.id} must have one <source> so the preload and the <picture> agree`);
    assert.equal(sources[0].type, 'image/webp', `${world.id}`);
    assert.match(sources[0].sizes, /^\d+(\.\d+)?vw$/, `${world.id} sizes`);
    assert.match(sources[0].srcSet, / \d+w(, |$)/, `${world.id} srcSet`);
  }
});

test('the approved header art is in the server HTML and is fetched at high priority', () => {
  // renderHeader keeps the header inline until mount; the server output and
  // the first client render therefore both contain the <picture>.
  assert.match(
    headerSource,
    /const renderHeader = \(header\) => isMounted \? createPortal\(header, document\.body\) : header;/,
  );
  const call = headerSource.indexOf('{renderHeader(');
  assert.ok(call > 0, 'the header is rendered through renderHeader');
  const header = headerSource.slice(call, headerSource.indexOf('</header>', call));
  const picture = header.indexOf('<picture className="approved-global-header__picture">');
  assert.ok(picture > 0, 'the header <picture> is part of the rendered header');
  assert.doesNotMatch(header.slice(0, picture), /&&|\?\s*\(/, 'the header <picture> sits behind a condition');
  const img = header.slice(picture, header.indexOf('</picture>', picture));
  assert.match(img, /className="approved-global-header__art"/);
  assert.match(img, /fetchpriority="high"/);
  assert.doesNotMatch(img, /loading=/, 'the header art must not be lazy');
});

test('_app imports both shell components statically, never as client-only dynamics', () => {
  assert.match(appSource, /^import UniversalHeader from '\.\.\/src\/components\/ui\/UniversalHeader';$/m);
  assert.match(appSource, /^import BottomNavBar, \{ BottomNavSpacer \} from '\.\.\/src\/components\/ui\/BottomNavBar';$/m);
  assert.doesNotMatch(appSource, /dynamic\(\s*\(\)\s*=>\s*import\(['"][^'"]*(UniversalHeader|BottomNavBar)['"]\)/);
  const show = appSource.slice(appSource.indexOf('const showBottomNav = Boolean('), appSource.indexOf(');', appSource.indexOf('const showBottomNav = Boolean(')));
  assert.ok(show.length > 0);
  assert.doesNotMatch(show, MOUNT_GATES, 'the footer must not wait for mount to render');
});
