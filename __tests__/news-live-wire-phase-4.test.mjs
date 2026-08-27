import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const PAGE = read('pages/hub/news.js');
const ARTICLES_API = read('pages/api/news/articles.js');
const SOURCE_BOXES_API = read('pages/api/news/source-boxes.js');
const NEWS_BOX = read('src/components/news/NewsBox.js');
const LIVE_WIRE_STYLES = read('src/components/news/LiveWireStyles.js');

test('Most Read is one server-ranked paginated feed, not a loaded-page-only reorder', () => {
  assert.match(ARTICLES_API, /safeQ\(req\.query\.sort\) === 'popular'/);
  assert.match(ARTICLES_API, /\.order\('views', \{ ascending: false, nullsFirst: false \}\)/);
  assert.match(ARTICLES_API, /\.order\('published_at', \{ ascending: false \}\)/);
  assert.match(ARTICLES_API, /pagination: \{ limit, offset, total, hasMore, sort \}/);
  assert.match(PAGE, /newsFilterKey = `\$\{activeTab\}\|\$\{debouncedSearch\}\|\$\{storySort\}\|\$\{activeSourceFilters\.join\(','\)\}`/);
  assert.match(PAGE, /newsParams\.set\('sort', 'popular'\)/);
  assert.match(PAGE, /if \(storySort === 'popular'\) return \(\(b\.views \|\| 0\) - \(a\.views \|\| 0\)\) \|\| publishedDelta/);
});

test('source cards and article pages reject synthetic rows at every interaction boundary', () => {
  assert.match(PAGE, /function isRealArticle\(article\)/);
  assert.match(PAGE, /if \(!isRealArticle\(article\)\) return/);
  assert.match(PAGE, /onOpen=\{isRealArticle\(article\) \? openArticle : undefined\}/);
  assert.match(PAGE, /onBookmark=\{isRealArticle\(article\) \? toggleBookmark : undefined\}/);
  assert.match(PAGE, /onShare=\{isRealArticle\(article\) \? handleShare : undefined\}/);
  assert.match(NEWS_BOX, /const canOpen = typeof onOpen === 'function'/);
  assert.match(NEWS_BOX, /\{canOpen && \(/);
  assert.match(NEWS_BOX, /\{\(onBookmark \|\| onShare\) && \(/);
});

test('article opening is immediate and view tracking remains non-blocking', () => {
  assert.match(PAGE, /const openArticle = \(article\) =>/);
  assert.match(PAGE, /markAsRead\(article\.id\);[\s\S]*?void fetch\('\/api\/news\/articles'/);
  assert.match(PAGE, /keepalive: true/);
  assert.doesNotMatch(PAGE, /await fetch\('\/api\/news\/articles'/);
});

test('multi-source selections round-trip through a shareable allowlisted URL', () => {
  assert.match(PAGE, /function parseSourceQuery\(value\)/);
  assert.match(PAGE, /return VALID_SOURCES\.filter/);
  assert.match(PAGE, /source: active\.join\(','\)/);
  assert.match(PAGE, /newsFilterKey = `\$\{activeTab\}\|\$\{debouncedSearch\}\|\$\{storySort\}\|\$\{activeSourceFilters\.join\(','\)\}`/);
  assert.match(PAGE, /source === 'Card Player' \? \['Card Player', 'CardPlayer'\]/);
  assert.match(PAGE, /newsParams\.set\('source', serverSources\.join\(','\)\)/);
  assert.match(ARTICLES_API, /if \(safeSources\.length > 1\) out = out\.in\('source_name', safeSources\)/);
  assert.match(PAGE, /Object\.fromEntries\(selectedSources\.map\(source => \[source, true\]\)\)/);
  assert.match(PAGE, /aria-pressed=\{!!sourceFilters\[src\]\}/);
});

test('failed feeds are explicit while successful empty feeds stay truthful', () => {
  assert.match(PAGE, /const newsFeedFailed = !!newsError/);
  assert.match(PAGE, /newsFeedFailed \? FALLBACK_NEWS : \[\]/);
  assert.match(PAGE, /const sourceBoxesUnavailable =/);
  assert.match(PAGE, /sourceBoxesUnavailable \? FALLBACK_NEWS\.slice\(0, 6\) : \[\]/);
  assert.match(PAGE, /className="feed-status-alert" role="alert"/);
  assert.match(LIVE_WIRE_STYLES, /\.live-wire \.feed-status-alert/);
});

test('hot source-box responses omit unused article bodies and search vectors', () => {
  const payloadHelper = SOURCE_BOXES_API.slice(
    SOURCE_BOXES_API.indexOf('function toSourceBoxPayload'),
    SOURCE_BOXES_API.indexOf('/**\n * Resolve the latest article')
  );
  assert.match(payloadHelper, /const \{ content, search_vector, \.\.\.rest \} = article/);
  assert.match(SOURCE_BOXES_API, /\.\.\.toSourceBoxPayload\(article\)/);
});

test('modal scroll locking and list action names remain accessible', () => {
  assert.match(PAGE, /reelViewerOpen \|\| shareArticle \|\| articleReader\.open/);
  assert.match(PAGE, /\[reelViewerOpen, shareArticle, articleReader\.open\]/);
  assert.match(PAGE, /aria-label=\{bookmarks\.includes\(article\.id\) \? 'Remove bookmark' : 'Bookmark article'\}/);
  assert.match(PAGE, /aria-label="Share article"/);
  assert.match(LIVE_WIRE_STYLES, /\.live-wire \.source-chip \{\s*min-height: 44px;/);
  assert.doesNotMatch(PAGE, /news-intro-seen/);
});
