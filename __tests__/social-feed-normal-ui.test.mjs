import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  articlePreviewNeedsHydration,
  isArticlePreviewImage,
  mergeArticleMetadata,
  suppliedArticleMetadata,
} from '../src/lib/articlePreviewMetadata.mjs';
import { mergeCanonicalBrowserPost } from '../src/lib/canonicalBrowserPost.mjs';
import { reelCreatorName } from '../src/lib/reelCreatorName.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const article = read('src/components/social/ArticleCard.jsx');
const social = read('pages/hub/social-media/index.js');
const reels = read('src/components/social/ReelsFeedCarousel.jsx');

test('titled image-less horse news still hydrates its actual preview image', () => {
  const supplied = suppliedArticleMetadata({
    title: 'Stop Playing GTO Against Blinds That Fold Too Much',
    image: null,
    siteName: 'Upswing Poker News',
  });
  assert.equal(articlePreviewNeedsHydration('https://upswingpoker.com/example/', supplied), true);
  assert.deepEqual(mergeArticleMetadata(supplied, {
    title: 'Wrong replacement title',
    image: 'https://upswingpoker.com/wp-content/uploads/article.jpg',
  }), {
    ...supplied,
    image: 'https://upswingpoker.com/wp-content/uploads/article.jpg',
  });
  assert.equal(articlePreviewNeedsHydration('https://upswingpoker.com/example/', {
    image: 'https://upswingpoker.com/article.jpg',
  }), false);
  const emoji = 'https://s.w.org/images/core/emoji/17.0.2/72x72/1f609.png';
  assert.equal(isArticlePreviewImage(emoji), false);
  assert.equal(isArticlePreviewImage('https://example.com/wp-includes/images/smilies/icon_wink.gif'), false);
  assert.equal(isArticlePreviewImage('https://example.com/assets/default-placeholder.jpg'), false);
  assert.equal(isArticlePreviewImage('https://user:secret@example.com/article.jpg'), false);
  assert.equal(isArticlePreviewImage('https://upswingpoker.com/wp-content/uploads/story.jpg'), true);
  assert.equal(suppliedArticleMetadata({ title: 'Live Poker Tips', image: emoji }).image, null);
  assert.equal(articlePreviewNeedsHydration('https://upswingpoker.com/live-poker-tips/',
    suppliedArticleMetadata({ title: 'Live Poker Tips', image: emoji })), true);
  assert.equal(mergeArticleMetadata({ title: 'Live Poker Tips', image: emoji }, {
    image: 'https://upswingpoker.com/wp-content/uploads/garrett-story.jpg',
  }).image, 'https://upswingpoker.com/wp-content/uploads/garrett-story.jpg');
  assert.match(article, /newsImageUrl\(metadata\.image\)/);
  assert.match(article, /setMetadata\(supplied\)/);
  assert.match(article, /fetchLinkPreview\(url, \{ requireImage: !supplied\.image \}\)/);
  assert.match(article, /preview=story-image-v3/);
  assert.doesNotMatch(article, /#1a1a2e|#16213e|#0f3460/);
});

test('author copy and article metadata precede media in DOM order', () => {
  const postCard = social.slice(
    social.indexOf('data-post-card="true"'),
    social.indexOf('{/* Action buttons row', social.indexOf('data-post-card="true"'))
  );
  assert.ok(postCard.indexOf('{postBody}') > -1);
  assert.ok(postCard.indexOf('{postBody}') < postCard.indexOf('{/* Media Grid'));
  assert.equal((postCard.match(/\{postBody\}/g) || []).length, 1, 'caption renders once');

  const title = article.indexOf('{displayTitle}');
  const image = article.indexOf('src={displayImage}');
  assert.ok(title > -1 && image > -1 && title < image, 'article title precedes preview image');
  assert.ok(article.indexOf('{metadata.description &&') < image, 'article description precedes preview image');
});

test('shared Reel wrappers use the same plain text-first social card', () => {
  const start = social.indexOf('const sharedReelPath = sharedReelPathForPost(post);');
  const end = social.indexOf('{/* Action buttons row', start);
  const shared = social.slice(start, end);
  const title = shared.indexOf("{post.link_title || 'Watch This Reel On Smarter.Poker'}");
  const image = shared.indexOf('src={post.link_image}');
  assert.ok(title > -1 && image > title, 'shared Reel title precedes its preview image');
  assert.ok(shared.indexOf('{post.link_description}') < image, 'shared Reel description precedes media');
  assert.match(shared, /background: '#fff'/);
  assert.doesNotMatch(shared, /(?:linear|radial|conic)-gradient|boxShadow|<svg\b/);
  assert.match(shared, /router\.push\(sharedReelPath\)/, 'canonical Reel click path stays wired');
});

test('social Reel cards put creator, disclosures and caption before their preview media', () => {
  const reelCard = readFileSync(new URL('../src/components/reels/ReelCard.jsx', import.meta.url), 'utf8');
  assert.match(reels, /<ReelCard[\s\S]*?textFirst/);
  assert.match(reelCard, /const content = textFirst \? <>\{words\}\{media\}<\/> : <>\{media\}\{words\}<\/>;/);
  assert.ok(reelCard.indexOf('const words') < reelCard.indexOf('const content = textFirst'));
  assert.ok(reelCard.indexOf('const media') < reelCard.indexOf('const content = textFirst'));
  const authored = {
    channel_name: 'Original YouTube Source',
    profiles: { display_name: 'Kane Mercer', username: 'kanemercer' },
  };
  assert.equal(reelCreatorName(authored, { preferProfile: true }), 'Kane Mercer');
  assert.equal(reelCreatorName(authored), 'Original YouTube Source');
  assert.equal(reelCreatorName({ channel_name: 'Source Only' }, { preferProfile: true }), 'Source Only');
});

test('social Reel viewer puts author words before player in DOM and layout order', () => {
  const viewer = reels.slice(reels.indexOf('function ReelViewer'), reels.indexOf('// Main Reels Feed Carousel component'));
  const copy = viewer.indexOf('className="vlc-carousel-viewer-copy"');
  const player = viewer.indexOf('className="vlc-carousel-viewer-stage"');
  assert.ok(copy > -1 && player > -1 && copy < player, 'viewer copy precedes player in DOM');
  assert.equal((viewer.match(/currentReel\.caption &&/g) || []).length, 1, 'viewer caption renders once');
  assert.match(reels, /grid-template-areas:\s*'copy'\s*'stage'\s*'details'/);
  assert.match(reels, /grid-template-areas:\s*'copy copy'\s*'stage details'/);
  assert.match(reels, /currentReel\.profiles\.display_name\s*\|\|\s*currentReel\.profiles\.username/);
  assert.doesNotMatch(viewer, /profiles\.full_name/, 'viewer only consumes the safe public persona fields');
});

test('canonical realtime reads honor explicit null clears and preserve absent fields', () => {
  const existing = {
    link_image: 'https://old.example/image.jpg',
    thumbnailUrl: 'https://old.example/thumb.jpg',
    transcodeStatus: 'ready',
    author: { name: 'Old Name', username: 'old', avatar: 'https://old.example/avatar.jpg' },
  };
  const merged = mergeCanonicalBrowserPost(existing, {
    link_image: null,
    transcode_status: null,
    author: { display_name: 'Real Name', username: 'real', avatar_url: null },
  });
  assert.equal(merged.link_image, null);
  assert.equal(merged.transcodeStatus, null);
  assert.equal(merged.author.avatar, null);
  assert.equal(merged.author.name, 'Real Name');
  assert.equal(merged.thumbnailUrl, existing.thumbnailUrl, 'an absent key preserves existing state');
});

test('Social Media contains no Video Library decorative console', () => {
  assert.doesNotMatch(social, /VideoLibraryConsole|AuxiliaryReelsSurfaces/);
  const inline = reels.slice(reels.indexOf('// Main Reels Feed Carousel component'));
  assert.doesNotMatch(inline, /<VideoLibraryConsole\b|eyebrow=|pillInk=|foot="plates"/);
  assert.match(inline, /\.vlc-feed-console-shell \{[\s\S]*?background: #fff;/);
  assert.match(inline, /<button type="button" onClick=\{\(\) => loadReels\(\)\}>Refresh<\/button>/);
});

test('feed never resets itself on a timer, focus, or new-content signal', () => {
  assert.match(social, /data-post-id=\{post\.id\}/);
  assert.doesNotMatch(social, /setInterval\(revalidateVisibleFeed,\s*60_000\)/);
  assert.doesNotMatch(social, /addEventListener\('focus',\s*revalidateVisibleFeed\)/);
  assert.doesNotMatch(reels, /addEventListener\('focus',\s*revalidateVisibleFeed\)/);

  const masterBus = social.slice(
    social.indexOf("window.masterBus.subscribe('SOCIAL_POST'"),
    social.indexOf("window.masterBus.subscribe('SOCIAL_LIKE'")
  );
  assert.match(masterBus, /setNewPostsCount/);
  assert.doesNotMatch(masterBus, /loadFeed/);

  const crossTab = social.slice(
    social.indexOf("listenBroadcast('smarter_poker_social_sync'"),
    social.indexOf("listenBroadcast('smarter_poker_block_sync'")
  );
  assert.match(crossTab, /setNewPostsCount/);
  assert.doesNotMatch(crossTab, /loadFeed/);

  const manualNotice = social.slice(social.indexOf('{newPostsCount > 0 &&'));
  assert.match(manualNotice, /onClick=\{async \(\) => \{[\s\S]*?window\.scrollTo[\s\S]*?await loadFeed\(0, false\)/);
});

test('post deep links pin the target through the caller-scoped post API without waiting on profile hydration', () => {
  const formatter = social.slice(
    social.indexOf('const formatDeepLinkPost = (p) => {'),
    social.indexOf('  // "N new posts" pill', social.indexOf('const formatDeepLinkPost = (p) => {'))
  );
  assert.match(formatter, /contentType: p\.link_url \? \(p\.content_type === 'article' \? 'article' : 'link'\) : p\.content_type/);
  const deepLink = social.slice(
    social.indexOf('// Handle ?post=<postId> deep link'),
    social.indexOf('// Handle ?stream=<streamId> query param')
  );
  assert.match(deepLink, /if \(router\.isReady && router\.query\.post\)/);
  assert.match(deepLink, /const formatted = formatDeepLinkPost\(p\)/);
  assert.doesNotMatch(deepLink, /router\.query\.post && user\?\.id/);
  assert.doesNotMatch(
    deepLink,
    /if \(processedPostIdRef\.current !== postId\) \{\s*processedPostIdRef\.current = postId;/
  );
  assert.match(deepLink, /if \(p\) \{\s*processedPostIdRef\.current = postId;/);
  assert.match(social, /const formatDeepLinkPost = \(p\) =>/);
  assert.match(social, /const requestedPostId = Array\.isArray\(router\.query\.post\)/);
  assert.match(social, /\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[1-5\]\[0-9a-f\]\{3\}/);
  assert.match(social, /const linkedPost = await fetchBrowserPost\(String\(requestedPostId\)\)/);
  assert.match(social, /deepLinkPostRef\.current = formatted;/);
  assert.doesNotMatch(deepLink, /router\.replace\('\/hub\/social-media'/);
  assert.match(deepLink, /Keep \?post= in the URL until the initial feed load has completed/);
});

test('video realtime changes update or remove only the mounted card', () => {
  const branch = social.slice(
    social.indexOf("if (updatedPost.content_type === 'video')"),
    social.indexOf('setPosts((prev) =>\n            prev.map', social.indexOf("if (updatedPost.content_type === 'video')"))
  );
  assert.match(branch, /fetchBrowserPost\(updatedPost\.id\)/);
  assert.match(branch, /videoPostExplicitlyRevoked\(updatedPost\)/);
  assert.match(branch, /mergeCanonicalBrowserPost\(post, fresh\)/);
  assert.match(branch, /if \(!realtimeActive\) return/);
  assert.match(branch, /prev\.filter\(\(post\) => post\.id !== updatedPost\.id\)/);
  assert.doesNotMatch(branch, /loadFeed/);
  assert.match(social, /return \(\) => \{\s*realtimeActive = false;\s*supabase\.removeChannel\(feedChannel\)/);
});

test('privacy invalidation is ID-only, caller-authorized, reconnect-bounded, and never a feed reset', () => {
  const authority = social.slice(
    social.indexOf('// Visibility/deletion authority changes are broadcast'),
    social.indexOf('// Positive YouTube verification expires')
  );
  assert.match(authority, /keys\.join\(','\) === 'id,kind'/);
  assert.match(authority, /notice\.kind === 'post'/);
  assert.match(authority, /fetchBrowserPost\(postId\)/);
  assert.match(authority, /MAX_RECONNECT_POSTS = 100/);
  assert.match(authority, /current\.slice\(0, MAX_RECONNECT_POSTS\)/);
  assert.doesNotMatch(authority, /loadFeed|setInterval/);

  const expiry = social.slice(
    social.indexOf('// Positive YouTube verification expires'),
    social.indexOf('// ═══════════════════════════════════════════════════════════════════════════\n  // REALTIME: Notification')
  );
  assert.match(expiry, /setTimeout\(async \(\) =>/);
  assert.match(expiry, /if \(!active\) return/);
  assert.match(expiry, /active = false/);
  assert.doesNotMatch(expiry, /setInterval|loadFeed/);
});
