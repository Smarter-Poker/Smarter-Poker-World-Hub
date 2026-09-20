/**
 * LAW: a page in the sitemap renders its content on the server.
 *
 * DISCOVERABILITY PHASE 7 (2026-09-19). A Googlebot crawl of every sitemap
 * URL found 21 pages serving 78 to 147 words. Their technical SEO was already
 * perfect - one h1, a title, a description over 60 characters, an exact
 * canonical, JSON-LD - and the pages were still empty, for one reason:
 *
 *     const PageTransition = dynamic(..., { ssr: false })
 *
 * with the entire page body inside it. The server rendered the head and
 * nothing else. /hub/news declared itself the poker news hub and served a
 * crawler no headlines; /hub/video-library served none of its 161 titles.
 *
 * The cause had been met twice before without being named: SEOHead was moved
 * out of that wrapper in one fix, the JSON-LD in another, each with a comment
 * explaining that anything inside a client-only wrapper never reaches the
 * server. The conclusion - so do not put the page inside one - was not drawn.
 *
 * These two pages have catalogues worth indexing, so they render them. A game
 * or tool page with no catalogue (memory-games / preflop-charts) is left
 * alone deliberately: server-rendering an interactive surface adds no words,
 * and inventing words to pad it would be a doorway page.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const CATALOGUE_PAGES = ['pages/hub/news.js', 'pages/hub/video-library.js'];

for (const page of CATALOGUE_PAGES) {
  const src = read(page);

  test(`${page} does not hide its body behind a client-only PageTransition`, () => {
    // The import, not the prose: both files carry comments that quote the old
    // `dynamic(..., { ssr: false })` line while explaining why it is gone.
    assert.doesNotMatch(
      src,
      /^\s*const PageTransition = dynamic\(/m,
      'PageTransition must be a static import so the page body reaches the server'
    );
    assert.match(
      src,
      /^import PageTransition from '\.\.\/\.\.\/src\/components\/transitions\/PageTransition';$/m
    );
  });

  test(`${page} does not serve its text at opacity 0`, () => {
    // PageTransition's entrance variant starts at opacity 0. Server-rendered
    // text that waits for JavaScript to become visible is worse than no
    // animation.
    assert.match(src, /<PageTransition disableInitialAnimation>/);
  });

  test(`${page} keeps exactly one h1, and it is the page's own`, () => {
    // HubPageSummary was promoted to h1 on these pages while they rendered no
    // body at all, so it was the only heading a crawler saw. Now that the body
    // renders, two h1s.
    assert.doesNotMatch(
      src,
      /<HubPageSummary[^>]*as="h1"/,
      'the summary block goes back to h2 once the page body renders its own h1'
    );
  });
}

test('the news feed does not need an effect to have something to show', () => {
  const src = read('pages/hub/news.js');
  // The accumulator is filled in useEffect, and effects do not run on the
  // server: rendering only from it served an empty feed however good the data.
  assert.match(src, /const loadedNews = accumulatedNews\.length \? accumulatedNews : firstNewsPage;/);
  assert.match(src, /export const FIRST_PAGE_KEY = /);
  assert.match(src, /export async function getServerSideProps/);
  assert.match(src, /swrFallback\(originFrom\(req\), FIRST_PAGE_KEY\)/);
  // One constant for the key: a fallback filed under a key the hook does not
  // use is ignored in silence.
  assert.doesNotMatch(src, /const NEWS_PAGE_SIZE = 24;\s*\n\s*const/);
});

test('the video library shows the catalogue it already has', () => {
  const src = read('pages/hub/video-library.js');
  // `videos` is seeded from STATIC_CATALOG, whose own comment says it is there
  // to be shown until the fetch resolves. `!catalogLoading &&` meant it never
  // was: the first paint, and every server render, showed six skeletons.
  assert.doesNotMatch(src, /\{!catalogLoading && videos\.map\(/);
  assert.match(src, /\{videos\.map\(\(video, index\) => \{/);
  assert.doesNotMatch(src, /visibleCount=\{catalogLoading \? 0 : videos\.length\}/);
});

test('the SWR fallback never breaks the page it is seeding', () => {
  const src = read('src/lib/seo/swrFallback.mjs');
  // A catalogue page that cannot show its catalogue is a worse page. One that
  // will not render is an outage.
  assert.match(src, /catch \{\s*return \{\};\s*\}/);
  assert.match(src, /data\.success !== true/, 'an error envelope must not be seeded as content');
  assert.match(src, /AbortController/);
});
