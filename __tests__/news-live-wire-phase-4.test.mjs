import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const PAGE = read('pages/hub/news.js');
const ARTICLES_API = read('pages/api/news/articles.js');
const SOURCE_BOXES_API = read('pages/api/news/source-boxes.js');
const EVENTS_API = read('pages/api/news/events.js');
const REELS_API = read('pages/api/news/reels.js');
const VIDEOS_API = read('pages/api/news/videos.js');
const AVATAR_CONTEXT = read('src/contexts/AvatarContext.jsx');
const NEWS_BOX = read('src/components/news/NewsBox.js');
const LIVE_WIRE_STYLES = read('src/components/news/LiveWireStyles.js');
const SOCIAL_HELPERS = read('src/lib/socialHelpers.js');
const REELS_PAGE = read('pages/hub/reels.js');
const SAVED_REELS_SERVICE = read('src/services/preferences-service.js');
const MY_REELS_PAGE = read('pages/hub/reels/my-reels.js');
const ARTICLE_READER = read('src/components/social/ArticleReaderModal.jsx');
const PROXY_API = read('pages/api/proxy.js');

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
  assert.match(PAGE, /newsFeedFailed \? getFallbackNews\(\) : \[\]/);
  assert.match(PAGE, /const sourceBoxesUnavailable =/);
  assert.match(PAGE, /sourceBoxesUnavailable \? getFallbackNews\(\)\.slice\(0, 6\) : \[\]/);
  assert.match(PAGE, /className="feed-status-alert" role="alert"/);
  assert.match(LIVE_WIRE_STYLES, /\.live-wire \.feed-status-alert/);
});

test('hot source-box responses omit unused article bodies and search vectors', () => {
  assert.match(SOURCE_BOXES_API, /const SOURCE_BOX_SELECT = 'id, title, slug, excerpt, summary,/);
  assert.doesNotMatch(SOURCE_BOXES_API, /\.select\('\*'\)/);
  assert.doesNotMatch(SOURCE_BOXES_API, /SOURCE_BOX_SELECT[^;]*content/);
  assert.doesNotMatch(SOURCE_BOXES_API, /SOURCE_BOX_SELECT[^;]*search_vector/);
});

test('modal scroll locking and list action names remain accessible', () => {
  assert.match(PAGE, /reelViewerOpen \|\| shareArticle \|\| articleReader\.open/);
  assert.match(PAGE, /\[reelViewerOpen, shareArticle, articleReader\.open\]/);
  assert.match(PAGE, /aria-label=\{bookmarks\.includes\(article\.id\) \? 'Remove bookmark' : 'Bookmark article'\}/);
  assert.match(PAGE, /aria-label="Share article"/);
  assert.match(LIVE_WIRE_STYLES, /\.live-wire \.source-chip \{\s*min-height: 44px;/);
  assert.doesNotMatch(PAGE, /news-intro-seen/);
});

test('events API normalizes real database fields into the News UI contract', () => {
  assert.match(EVENTS_API, /name: e\.event_name \|\| 'Poker Event'/);
  assert.match(EVENTS_API, /event_date: e\.start_date/);
  assert.match(EVENTS_API, /location: \[e\.venue_name, \[e\.city, e\.state\]/);
  assert.match(EVENTS_API, /query = query\.eq\('is_special_event', true\)/);
  assert.doesNotMatch(EVENTS_API, /\.eq\('is_featured', true\)/);
  assert.match(PAGE, /new Date\(event\.event_date\)\.getUTCDate\(\)/);
});

test('public secondary feeds expose explicit allowlisted payloads', () => {
  for (const api of [REELS_API, VIDEOS_API]) {
    assert.match(api, /\.select\('id, author_id, caption, thumbnail_url, video_url, view_count, created_at'\)/);
    assert.doesNotMatch(api, /from\('social_reels'\)[\s\S]{0,100}\.select\('\*'\)/);
  }
  assert.match(EVENTS_API, /\.select\('id, event_name, start_date, start_time, venue_name, city, state, buy_in, guarantee, online_registration_url, is_special_event'\)/);
  assert.doesNotMatch(EVENTS_API, /from\('poker_events'\)[\s\S]{0,100}\.select\('\*'\)/);
  assert.doesNotMatch(REELS_API, /\.\.\.reel/);
});

test('secondary feed failures are errors while legitimate empty feeds remain empty successes', () => {
  for (const api of [EVENTS_API, REELS_API, VIDEOS_API]) {
    assert.match(api, /if \(error\) \{\s*throw error;/);
    assert.match(api, /if \(!data\?\.length\) \{[\s\S]{0,160}return res\.status\(200\)\.json\(\{ success: true, data: \[\] \}\);/);
    assert.match(api, /return res\.status\(500\)\.json\(\{ success: false, error:/);
    assert.doesNotMatch(api, /fallback: true/);
  }
});

test('News sections surface loading, failure, retry and true-empty states', () => {
  assert.match(PAGE, /async function fetchNewsJson\(url\)/);
  assert.match(PAGE, /if \(!response\.ok \|\| payload\?\.success === false\)/);
  assert.match(PAGE, /data: sourceBoxesData, error: sourceBoxesError/);
  assert.match(PAGE, /const sourceBoxesUnavailable = !!sourceBoxesError/);
  assert.match(PAGE, /error: videosError, isLoading: videosLoading, mutate: refreshVideos/);
  assert.match(PAGE, /error: eventsError, isLoading: eventsLoading, mutate: refreshEvents/);
  assert.match(PAGE, /Reels are temporarily unavailable\./);
  assert.match(PAGE, /Videos are temporarily unavailable\./);
  assert.match(PAGE, /Events are temporarily unavailable\./);
  assert.match(PAGE, /onClick=\{\(\) => refreshVideos\(\)\}/);
  assert.match(PAGE, /onClick=\{\(\) => refreshEvents\(\)\}/);
  assert.match(PAGE, /const sidebarEvents = events\.length > 0 \? events\.slice\(0, 3\) : FALLBACK_EVENTS/);
});

test('reel playback accepts every supported YouTube form and uses the player bridge', () => {
  assert.match(SOCIAL_HELPERS, /\^\\\/\(shorts\|embed\|live\)\\\//);
  assert.match(SOCIAL_HELPERS, /searchParams\.get\('v'\)/);
  assert.match(SOCIAL_HELPERS, /\{11\}/);
  assert.match(PAGE, /youtube-nocookie\.com\/embed\/\$\{videoId\}/);
  assert.match(PAGE, /iframeRef: reelYouTubeRef/);
  assert.match(PAGE, /func: 'addEventListener', args: \['onStateChange'\]/);
  assert.match(PAGE, /onTouchEnd=/);
});

test('saved and authored reel collections use the real data contracts', () => {
  assert.match(MY_REELS_PAGE, /\.eq\('author_id', authUser\.id\)/);
  assert.doesNotMatch(MY_REELS_PAGE, /\.eq\('user_id', authUser\.id\)/);
  assert.match(SAVED_REELS_SERVICE, /\.from\('social_reels'\)/);
  assert.match(SAVED_REELS_SERVICE, /\.from\('social_posts'\)/);
  assert.match(SAVED_REELS_SERVICE, /reel: row\.source_type === 'post'/);
});

test('reels pagination and route modes do not skip or ignore requested feeds', () => {
  assert.match(REELS_PAGE, /standardOffset = 60 \+ \(nextPage - 1\) \* 30/);
  assert.match(REELS_PAGE, /horseOffset = 60 \+ \(nextPage - 1\) \* 20/);
  assert.match(REELS_PAGE, /feedMode === 'trending'/);
  assert.match(REELS_PAGE, /feedMode === 'following'/);
  assert.match(REELS_PAGE, /const \[muted, setMuted\] = useState\(true\)/);
  assert.match(REELS_PAGE, /const \[preferencesLoaded, setPreferencesLoaded\] = useState\(false\)/);
  assert.match(REELS_PAGE, /reelsPreferences\.get\(authUser\?\.id\)/);
  assert.match(REELS_PAGE, /autoPlay=\{preferencesLoaded && preferences\.autoplay\}/);
  assert.match(REELS_PAGE, /preferences\.autoplay \? 'loadVideoById' : 'cueVideoById'/);
  assert.match(REELS_PAGE, /if \(!userGesturedThisLoadRef\.current\) return/);
  assert.match(REELS_PAGE, /router\.query\.upload !== '1'/);
  assert.match(REELS_PAGE, /reelsPreferences\.update\(user\?\.id, newPrefs\)/);
  assert.doesNotMatch(REELS_PAGE, /\{\/\* Back button \*\/\}[\s\S]{0,400}href="\/hub\/social-media"/);
  assert.match(REELS_PAGE, /duration < 1/);
  assert.match(REELS_PAGE, /onDurationChange=\{handleNativeVideoMetadata\}/);
  assert.doesNotMatch(REELS_PAGE, /\n\s+loop\n\s+playsInline/);
  assert.doesNotMatch(REELS_PAGE, /user-scalable=no/);
});

test('proxied articles run in an opaque sandbox instead of the app origin', () => {
  assert.match(ARTICLE_READER, /import \{ getYouTubeVideoId \} from '\.\.\/\.\.\/lib\/socialHelpers'/);
  assert.match(ARTICLE_READER, /const youtubeVideoId = getYouTubeVideoId\(url\)/);
  assert.match(ARTICLE_READER, /sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"/);
  assert.doesNotMatch(ARTICLE_READER, /sandbox="[^"]*allow-same-origin/);
  assert.match(PROXY_API, /sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox/);
  assert.match(PROXY_API, /object-src 'none'/);
});

test('share dialog traps and restores focus, and expected VIP timeouts stay quiet', () => {
  assert.match(PAGE, /const shareModalRef = useRef\(null\)/);
  assert.match(PAGE, /document\.addEventListener\('keydown', trapFocus\)/);
  assert.match(PAGE, /requestAnimationFrame\(\(\) => returnTarget\.focus\(\)\)/);
  assert.match(PAGE, /ref=\{shareModalRef\}/);
  assert.match(AVATAR_CONTEXT, /if \(err\?\.name !== 'AbortError'\) console\.warn\('Error fetching VIP status:'/);
});
