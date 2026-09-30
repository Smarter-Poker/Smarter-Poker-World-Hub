/**
 * Phase 8.1: a video post in the feed.
 *
 * FeedVideoPlayer (src/components/social/FeedVideoPlayer.jsx) is rendered for
 * real through the poker-card harness: a native row plays in a <video> with
 * one 44px Unmute / Mute control that remembers the choice under the key the
 * Reels carousel uses (sp:reels:muted); a YouTube row stays the poster that
 * opens Reels. The feed PostCard renders a video post's text under the media
 * (it is the caption) while every other post keeps its text above.
 *
 * The 50 percent IntersectionObserver play/pause lives in an effect, and
 * effects never run under the harness, so that part is pinned at the source.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { React, cardImages, elements, loadSurface, render } from './social-poker-card-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const noop = () => {};

const PLAYER_FILE = 'src/components/social/FeedVideoPlayer.jsx';
const SHARED_FILE = 'src/components/social/SharedVideoComponents.jsx';
const PAGE_FILE = 'pages/hub/social-media/index.js';
const MUTED_KEY = 'sp:reels:muted';

const NATIVE_URL = 'https://cdn.smarter.poker/clips/river-bluff.mp4';
const YOUTUBE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const POSTER = 'https://cdn.smarter.poker/clips/river-bluff-cover.jpg';

// The shared video pieces are inert stubs under the harness; these stand-ins
// keep the wrapper's children and make the poster's props visible.
const sharedMock = () => ({
  VideoPostWrapper: ({ children }) => React.createElement('div', { 'data-video-wrapper': 'true' }, children),
  FeedVideoPoster: (props) => React.createElement('img', {
    'data-feed-poster': 'true',
    'data-video-url': props.videoUrl || '',
    src: props.thumbnailUrl || '',
    alt: '',
  }),
});

function storage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
  };
}

const loadPlayer = ({ state = {}, store = storage() } = {}) => {
  const surface = loadSurface(PLAYER_FILE, {
    state,
    mocks: { [SHARED_FILE]: sharedMock() },
    globals: { window: {}, localStorage: store },
  });
  return { ...surface, store, Player: surface.module.default };
};

const nativePost = (extra = {}) => ({ id: 'v1', contentType: 'video', mediaUrls: [NATIVE_URL], ...extra });
const youtubePost = (extra = {}) => ({ id: 'y1', contentType: 'video', mediaUrls: [YOUTUBE_URL], ...extra });

const videoOf = (tree) => elements(tree).find((element) => element.type === 'video');
const muteButtonOf = (tree) => elements(tree).find((element) => element.type === 'button');
const clickEvent = () => {
  const event = { stopped: 0, prevented: 0 };
  event.stopPropagation = () => { event.stopped += 1; };
  event.preventDefault = () => { event.prevented += 1; };
  return event;
};

test('a native row is a muted video with its poster and one 44px Unmute control', () => {
  const { Player } = loadPlayer();
  const tree = Player({ post: nativePost(), posterUrl: POSTER });
  assert.equal(tree.props['data-feed-video'], 'native');

  const video = videoOf(tree);
  assert.ok(video, 'a <video> element');
  assert.equal(video.props.src, `${NATIVE_URL}#t=0.001`, 'the first-frame fragment iOS needs');
  assert.equal(video.props.poster, POSTER);
  assert.equal(video.props.muted, true, 'muted until the viewer says otherwise');
  assert.equal(video.props.playsInline, true);
  assert.equal(video.props.loop, true);
  assert.equal(video.props.preload, 'metadata');

  const button = muteButtonOf(tree);
  assert.ok(button, 'the mute control');
  assert.equal(button.props.type, 'button');
  assert.equal(button.props['aria-label'], 'Unmute');
  assert.equal(button.props.style.width, 44);
  assert.equal(button.props.style.height, 44);
  assert.equal(button.props.style.minWidth, 44);
  assert.equal(button.props.style.minHeight, 44);
  assert.equal(button.props.style.position, 'absolute', 'over a corner of the tile');

  const html = render(tree);
  assert.match(html, /<video [^>]*src="https:\/\/cdn\.smarter\.poker\/clips\/river-bluff\.mp4#t=0\.001"/);
  assert.match(html, /<button [^>]*aria-label="Unmute"/);
  assert.ok(!html.includes('data-feed-poster'), 'no poster component while the video plays');
});

test('the control toggles Unmute and Mute, mutes the element, stops the tile click and remembers the choice', () => {
  const { Player, state, store } = loadPlayer();
  const props = { post: nativePost(), posterUrl: POSTER };
  const first = Player(props);

  // The tile around the control opens Reels; the control must not reach it.
  const event = clickEvent();
  muteButtonOf(first).props.onClick(event);
  assert.equal(event.stopped, 1);
  assert.equal(event.prevented, 1);
  assert.equal(state.get('muted'), false);
  assert.equal(store.getItem(MUTED_KEY), '0', 'unmuted is remembered under the Reels key');

  const second = Player(props);
  assert.equal(muteButtonOf(second).props['aria-label'], 'Mute');
  assert.equal(videoOf(second).props.muted, false);

  muteButtonOf(second).props.onClick(clickEvent());
  assert.equal(state.get('muted'), true);
  assert.equal(store.getItem(MUTED_KEY), '1');
  assert.equal(muteButtonOf(Player(props)).props['aria-label'], 'Unmute');
});

test('a remembered unmute applies on the next visit, and a broken localStorage never breaks the control', () => {
  const remembered = loadPlayer({ store: storage({ [MUTED_KEY]: '0' }) });
  const tree = remembered.Player({ post: nativePost(), posterUrl: null });
  assert.equal(muteButtonOf(tree).props['aria-label'], 'Mute');
  assert.equal(videoOf(tree).props.muted, false);
  assert.equal(videoOf(tree).props.poster, undefined, 'no poster when there is none');

  const broken = {
    getItem: () => { throw new Error('storage disabled'); },
    setItem: () => { throw new Error('storage disabled'); },
  };
  const { Player, state } = loadPlayer({ store: broken });
  const muted = Player({ post: nativePost(), posterUrl: POSTER });
  assert.equal(muteButtonOf(muted).props['aria-label'], 'Unmute', 'muted when nothing can be read');
  muteButtonOf(muted).props.onClick(clickEvent());
  assert.equal(state.get('muted'), false, 'the toggle still works when the write throws');
});

test('a YouTube row stays a poster that opens Reels: no video element, no mute control', () => {
  const { Player } = loadPlayer();
  const opened = [];
  const tree = Player({ post: youtubePost(), posterUrl: POSTER, onOpen: (post) => opened.push(post.id) });
  assert.equal(tree.props['data-feed-video'], 'poster');
  assert.equal(videoOf(tree), undefined);
  assert.equal(muteButtonOf(tree), undefined);
  const html = render(tree);
  assert.match(html, /<img [^>]*data-feed-poster="true"/);
  assert.match(html, /data-video-url="https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ"/);
  assert.match(html, /src="https:\/\/cdn\.smarter\.poker\/clips\/river-bluff-cover\.jpg"/);
  tree.props.onClick();
  assert.deepEqual(opened, ['y1']);

  // An embed row is a poster whatever its URL looks like; a dead src falls
  // back to the poster too.
  const embed = Player({ post: nativePost({ playbackType: 'youtube_embed' }), posterUrl: null });
  assert.equal(embed.props['data-feed-video'], 'poster');
  const failed = loadPlayer({ state: { videoFailed: true } });
  assert.equal(failed.Player({ post: nativePost(), posterUrl: POSTER }).props['data-feed-video'], 'poster');
  const noMedia = Player({ post: { id: 'x', contentType: 'video', mediaUrls: [] }, posterUrl: null });
  assert.equal(noMedia.props['data-feed-video'], 'poster');
});

test('the source keeps the 50 percent play/pause observer and the shared mute key', () => {
  const player = read(PLAYER_FILE);
  assert.match(player, /new IntersectionObserver\(/);
  assert.match(player, /\{ threshold: 0\.5 \}/);
  assert.match(player, /entry\.isIntersecting/);
  assert.match(player, /video\.play\(\)/);
  assert.match(player, /video\.pause\(\)/);
  assert.match(player, /observer\.disconnect\(\)/);
  assert.match(player, /export const REELS_MUTED_KEY = 'sp:reels:muted';/);
  assert.match(read('src/components/social/ReelsFeedCarousel.jsx'), /sp:reels:muted/, 'the Reels carousel still uses the same key');
  assert.match(player, /videoRef\.current\.muted = next/);
  assert.match(player, /event\.stopPropagation\(\)/);
  assert.ok(!/is_horse|origin_type|metadata\.scheduler/.test(player));
  const dashes = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);
  assert.ok(!dashes.test(player));
  assert.ok(!/\p{Extended_Pictographic}/u.test(player));
});

// ── The feed PostCard ──
const noMarkup = (html) => assert.ok(!html.includes('[[sp-card:'), 'raw card markup reached the DOM');

function loadCard() {
  const player = loadPlayer();
  return loadSurface(PAGE_FILE, {
    expose: ['PostCard'],
    mocks: { [SHARED_FILE]: sharedMock(), [PLAYER_FILE]: player.module },
    globals: { localStorage: player.store },
  });
}
const cardProps = (post) => ({ post, currentUserId: 'u1', onLike: noop, onDelete: noop, onComment: noop });
const feedPost = (extra) => ({
  id: 'p1',
  authorId: 'u2',
  author: { name: 'A Player', username: 'a_player' },
  likeCount: 0,
  commentCount: 0,
  ...extra,
});
// One surface per card: the harness keeps named state (displayContent) for
// the life of a loaded surface, so a second card would show the first's text.
const renderCard = (post) => render(loadCard().exposed.PostCard(cardProps(feedPost(post))));

test('a video post renders its caption after the media, through the feed video player, with its cover frame as the poster', () => {
  const caption = 'Rivered the nuts [[sp-card:As]] and got paid';
  const html = renderCard({
    content: caption,
    contentType: 'video',
    mediaUrls: [NATIVE_URL],
    thumbnailUrl: null,
    coverFrameUrl: POSTER,
  });
  noMarkup(html);
  const videoAt = html.indexOf('<video ');
  const captionAt = html.indexOf('Rivered the nuts');
  assert.ok(videoAt >= 0, 'the native video element renders inside the card');
  assert.ok(captionAt >= 0, 'the caption renders');
  assert.ok(videoAt < captionAt, 'the caption comes after the media');
  assert.deepEqual(cardImages(html), ['spades_a'], 'the caption still goes through PokerCardText');
  assert.match(html, /<video [^>]*poster="https:\/\/cdn\.smarter\.poker\/clips\/river-bluff-cover\.jpg"/, 'the cover frame is the poster when there is no thumbnail');
  assert.match(html, /aria-label="Unmute"/);
  assert.equal((html.match(/Rivered the nuts/g) || []).length, 1, 'the caption renders once');
});

test('the thumbnail wins over the cover frame, and a YouTube video post keeps its poster', () => {
  const thumb = 'https://cdn.smarter.poker/thumbs/p1.jpg';
  const html = renderCard({
    content: 'Watch this',
    contentType: 'video',
    mediaUrls: [NATIVE_URL],
    thumbnailUrl: thumb,
    coverFrameUrl: POSTER,
  });
  assert.match(html, new RegExp(`<video [^>]*poster="${thumb.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"`));
  assert.ok(html.indexOf('<video ') < html.indexOf('Watch this'), 'the caption follows the media');

  const youtube = renderCard({
    content: 'A final table',
    contentType: 'video',
    mediaUrls: [YOUTUBE_URL],
    thumbnailUrl: null,
    coverFrameUrl: null,
  });
  assert.ok(!youtube.includes('<video '), 'YouTube stays a poster');
  assert.match(youtube, /data-feed-poster="true"/);
  const posterAt = youtube.indexOf('data-feed-poster');
  const captionAt = youtube.indexOf('A final table');
  assert.ok(posterAt >= 0 && captionAt >= 0);
  assert.ok(posterAt < captionAt, 'the caption still follows the media');
});

test('every other post keeps its text above the media', () => {
  const photo = renderCard({
    content: 'Table selfie [[sp-card:Kh]]',
    contentType: 'image',
    mediaUrls: ['https://cdn.smarter.poker/photos/p1.jpg'],
  });
  noMarkup(photo);
  const textAt = photo.indexOf('Table selfie');
  const imageAt = photo.indexOf('src="https://cdn.smarter.poker/photos/p1.jpg"');
  assert.ok(textAt >= 0 && imageAt >= 0);
  assert.ok(textAt < imageAt, 'a photo post reads text first');
  assert.equal((photo.match(/Table selfie/g) || []).length, 1);

  const text = renderCard({ content: 'Just words', contentType: 'text', mediaUrls: [] });
  assert.equal((text.match(/Just words/g) || []).length, 1, 'a text post renders its body exactly once');
  assert.ok(!text.includes('<video '));
});

test('the page hands every video tile to the feed video player and no longer mounts the bare poster', () => {
  const page = read(PAGE_FILE);
  assert.match(page, /import FeedVideoPlayer from '\.\.\/\.\.\/\.\.\/src\/components\/social\/FeedVideoPlayer';/);
  assert.equal((page.match(/<FeedVideoPlayer\b/g) || []).length, 2, 'the 1-up and the 2-up video tiles');
  assert.equal((page.match(/<FeedVideoPoster\b/g) || []).length, 0);
  assert.equal((page.match(/posterUrl=\{post\.thumbnailUrl \|\| post\.thumbnail_url \|\| post\.coverFrameUrl \|\| null\}/g) || []).length, 2);
  assert.match(page, /\{post\.contentType === 'video' && postBody\}/);
  assert.match(page, /\{post\.contentType !== 'video' && postBody\}/);
  const above = page.indexOf("{post.contentType !== 'video' && postBody}");
  const below = page.indexOf("{post.contentType === 'video' && postBody}");
  const grid = page.indexOf("post.contentType === 'video' ? (");
  assert.ok(above > 0 && grid > above && below > grid, 'text above the grid for every post, below it for a video post');
});
