import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

// Guards for the 2026-10-12 live-site sweep. Each one pins a defect that was
// live on smarter.poker and is easy to bring back.
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('every table felt and background the theme bridge names is shipped', () => {
  // public/hub/table-theme was deleted on 2026-09-02 along with the vendored
  // Club Arena copy next to it, so every training table and the assistant
  // sandbox painted with no felt for six weeks.
  const theme = read('src/lib/clubArenaTheme.js');
  const files = [...new Set(theme.match(/'(?:skin|bg)_[a-z0-9_]+\.(?:png|jpg|webp)'/g).map((f) => f.slice(1, -1)))];
  assert.ok(files.length > 20, 'expected the felt and background catalogs');
  const missing = files.filter((f) => {
    const dir = f.startsWith('skin_') ? 'tables' : 'backgrounds';
    return !existsSync(new URL(`../public/hub/table-theme/${dir}/${f}`, import.meta.url));
  });
  assert.deepEqual(missing, []);
});

test('the reel category rail scrolls itself sideways, never the page', () => {
  // scrollIntoView({ block: 'nearest' }) also scrolled the document, dragging
  // Social Media ~640px down on every load and hiding the footer.
  const carousel = read('src/components/social/ReelsFeedCarousel.jsx');
  assert.doesNotMatch(carousel, /#vlc-reel-category-\$\{selectedCategoryId\}`\)\s*\?\.scrollIntoView/);
  assert.match(carousel, /rail\.scrollLeft = left;/);
});

test('settings renders the same first frame on the server and in the browser', () => {
  const settings = read('pages/hub/settings.js');
  assert.match(settings, /const \[isMobile, setIsMobile\] = useState\(false\);/);
  assert.doesNotMatch(settings, /useState\(\(\) => \{\s*if \(typeof window === 'undefined'\)/);
});

test('cached news HTML carries no clock-relative text', () => {
  // /hub/news HTML is cached for minutes; "8h ago" rendered on the server
  // disagreed with the browser and threw React #425/#418.
  const page = read('pages/hub/news.js');
  const box = read('src/components/news/NewsBox.js');
  assert.match(box, /\{hasMounted \? timeAgo\(article\.published_at\) : ''\}/);
  assert.match(page, /const breakingNews = hasMounted && news\.find/);
  assert.match(page, /const showHeader = hasMounted && storySort === 'latest'/);
  assert.doesNotMatch(page, /<span>\{timeAgo\(/);
});

test('a signed-out social visit does not call the stream cleanup route', () => {
  const social = read('pages/hub/social-media/index.js');
  assert.match(social, /if \(!token\) return;\s*fetch\('\/api\/live\/cleanup-stale'/);
});
