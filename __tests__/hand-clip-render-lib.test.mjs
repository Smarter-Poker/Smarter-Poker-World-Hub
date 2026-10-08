// The pure pieces of the Phase 9 clip renderer (src/lib/server/handClipRender.js):
// the C1 payload, the still durations and the ffmpeg concat list they make,
// the exact ffmpeg and poster argument arrays of C6 step 5, the storage paths
// and public URLs of step 6, the length guard, and the scripts the browser runs.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLIP_MAX_MS,
  CLIP_MIN_MS,
  CLIP_PAGE_URL,
  END_HOLD_MS,
  HAND_COLUMNS,
  JOB_NAME,
  PAINT_WAIT_MS,
  SETTLE_WAIT_MS,
  SETTLE_POLL_MS,
  CLIP_TIMEZONE,
  CLIP_FONT_FILE,
  RENDER_DEADLINE_MS,
  SEEK_TIMEOUT_MS,
  STILL_PARAMS,
  buildClipPayload,
  concatListForStills,
  durationGuard,
  ffmpegArgsFor,
  heroInHand,
  pageScripts,
  posterArgsFor,
  publicUrlFor,
  shortReason,
  stillDurationsFor,
  storagePathsFor,
} from '../src/lib/server/handClipRender.js';

const HERO = '44444444-4444-4444-8444-444444444444';
const OTHER = '22222222-2222-4222-8222-222222222222';
const JOB = { id: 'job-1', hand_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', author_id: HERO, kind: 'horse', style: 'felt-720p' };
const HAND = {
  id: JOB.hand_id,
  players: [{ userId: HERO, seat: 1, username: 'x' }, { userId: OTHER, seat: 2, username: 'y' }],
  hole_cards: {},
  game_variant: 'omaha',
};

test('the constants are the C6 numbers', () => {
  assert.equal(JOB_NAME, '/api/cron/render-hand-clips');
  assert.equal(CLIP_PAGE_URL, 'https://smarter.poker/hub/club-arena/replay?clip=1');
  assert.equal(CLIP_MIN_MS, 15000);
  assert.equal(CLIP_MAX_MS, 40000);
  assert.equal(END_HOLD_MS, 1500);
  assert.equal(RENDER_DEADLINE_MS, 270000);
  assert.equal(SEEK_TIMEOUT_MS, 10000);
  assert.equal(PAINT_WAIT_MS, 2000);
  assert.equal(SETTLE_WAIT_MS, 4000);
  assert.equal(SETTLE_POLL_MS, 50);
  assert.equal(CLIP_TIMEZONE, 'America/Chicago');
  assert.equal(CLIP_FONT_FILE, 'NotoSansSymbols2-HandClip.ttf');
  assert.deepEqual({ ...STILL_PARAMS, clip: { ...STILL_PARAMS.clip } }, {
    format: 'jpeg',
    quality: 85,
    captureBeyondViewport: false,
    optimizeForSpeed: true,
    clip: { x: 0, y: 0, width: 1080, height: 1350, scale: 1 },
  });
  for (const col of ['id', 'table_id', 'hand_number', 'game_variant', 'small_blind', 'big_blind', 'players', 'actions', 'board',
    'community_cards', 'community_cards2', 'community_cards3', 'rit_boards', 'pots', 'pot_size', 'winners', 'winners_by_board',
    'winner_name', 'showdown', 'hole_cards', 'bomb_pot', 'kill_pot', 'rake_amount', 'bbj_amount', 'button_seat', 'started_at',
    'ended_at', 'hand_name', 'summary', 'tournament_id', 'version', 'source', 'has_human', 'created_at']) {
    assert.ok(HAND_COLUMNS.split(', ').includes(col), `hand read carries ${col}`);
  }
});

test('heroInHand reads the players array the way the hand_history RLS predicate does', () => {
  assert.equal(heroInHand(HAND, HERO), true);
  assert.equal(heroInHand(HAND, '33333333-3333-4333-8333-333333333333'), false);
  assert.equal(heroInHand({ players: null }, HERO), false);
  assert.equal(heroInHand(null, HERO), false);
  assert.equal(heroInHand(HAND, ''), false);
});

test('buildClipPayload is the C1 shape: facts fill the hero cards only when the row has none', () => {
  const facts = { hole_cards: [{ rank: 'A', suit: 's' }, { rank: 'K', suit: 's' }] };
  const payload = buildClipPayload(HAND, facts, null, JOB);
  assert.deepEqual(payload, {
    v: 1,
    style: 'felt-720p',
    heroId: HERO,
    row: HAND,
    tableName: null,
    privateHoleCards: { [HERO]: facts.hole_cards },
    discardedCards: {},
    minMs: 15000,
    maxMs: 40000,
  });
  assert.equal(buildClipPayload(HAND, facts, null, JOB, { name: 'Main Street' }).tableName, 'Main Street', 'the table name rides along for the share header');
  assert.equal(buildClipPayload(HAND, facts, null, JOB, { name: '  ' }).tableName, null, 'a blank name is no name');
  const withRowCards = buildClipPayload({ ...HAND, hole_cards: { [HERO]: ['As', 'Ks'] } }, facts, null, JOB);
  assert.deepEqual(withRowCards.privateHoleCards, {}, 'the row already carries the hero cards');
  const draw = buildClipPayload(HAND, null, { discarded_card: { rank: '7', suit: 'd' }, seat_number: 1 }, JOB);
  assert.deepEqual(draw.discardedCards, { [HERO]: { rank: '7', suit: 'd' } });
  assert.deepEqual(draw.privateHoleCards, {});
  assert.equal(buildClipPayload(HAND, { hole_cards: [] }, null, JOB).privateHoleCards[HERO], undefined, 'an empty facts row adds nothing');
  assert.equal(buildClipPayload(HAND, null, null, { ...JOB, style: undefined }).style, 'felt-720p');
});

test('stillDurationsFor gives every frame its beat and the last frame its beat plus the hold', () => {
  assert.deepEqual(stillDurationsFor({ beats: [1400, 900, 900, 1400], holdMs: 1500 }), [1400, 900, 900, 2900]);
  assert.deepEqual(stillDurationsFor({ beats: [1400, 900], holdMs: 4100 }), [1400, 5000], 'a longer hold reaches minMs');
  assert.deepEqual(stillDurationsFor({ beats: [120.4, 0], holdMs: -5 }), [120, 1], 'whole milliseconds, never under one, no negative hold');
  assert.deepEqual(stillDurationsFor({ beats: [], holdMs: 1500 }), []);
  assert.deepEqual(stillDurationsFor(null), []);
  const sum = stillDurationsFor({ beats: [1400, 900, 900, 1400], holdMs: 1500 }).reduce((a, b) => a + b, 0);
  assert.equal(sum, 4600 + 1500, 'the stills last exactly what the page planned');
});

test('concatListForStills holds each still for its duration and repeats the last file', () => {
  const list = concatListForStills([
    { path: '/tmp/j/f_0.jpg', durationMs: 1400 },
    { path: '/tmp/j/f_1.jpg', durationMs: 900 },
    { path: '/tmp/j/f_2.jpg', durationMs: 2900 },
  ]);
  assert.equal(list.frames, 3);
  assert.equal(list.durationMs, 5200);
  assert.equal(list.text, [
    'ffconcat version 1.0',
    "file '/tmp/j/f_0.jpg'",
    'duration 1.400',
    "file '/tmp/j/f_1.jpg'",
    'duration 0.900',
    "file '/tmp/j/f_2.jpg'",
    'duration 2.900',
    "file '/tmp/j/f_2.jpg'",
    '',
  ].join('\n'));
  assert.equal(concatListForStills([]).text, 'ffconcat version 1.0\n');
  assert.equal(concatListForStills([]).durationMs, 0);
  const tiny = concatListForStills([{ path: '/a.jpg', durationMs: 0 }, { path: '/b.jpg', durationMs: 0.2 }]);
  assert.match(tiny.text, /duration 0\.001\n/, 'a duration never goes below one millisecond');
  assert.equal(tiny.durationMs, 2);
  const quoted = concatListForStills([{ path: "/tmp/o'k/f.jpg", durationMs: 1000 }]);
  assert.ok(quoted.text.includes("file '/tmp/o'\\''k/f.jpg'"), 'an apostrophe in the path is escaped for the demuxer');
  assert.equal(concatListForStills([{ path: '/a.jpg' }, null, { durationMs: 5 }]).frames, 1, 'entries without a path are dropped');
});

test('ffmpegArgsFor and posterArgsFor are exactly the C6 step 5 commands', () => {
  assert.deepEqual(ffmpegArgsFor('/tmp/j/frames.txt', '/tmp/j/clip.mp4'), [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', '/tmp/j/frames.txt',
    '-vf', 'scale=1080:1350:force_original_aspect_ratio=decrease,pad=1080:1350:(ow-iw)/2:(oh-ih)/2:color=black',
    '-r', '30',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-an',
    '/tmp/j/clip.mp4',
  ]);
  assert.deepEqual(posterArgsFor('/tmp/j/clip.mp4', '/tmp/j/poster.jpg'), [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-ss', '1',
    '-i', '/tmp/j/clip.mp4',
    '-frames:v', '1',
    '-q:v', '3',
    '/tmp/j/poster.jpg',
  ]);
});

test('storagePathsFor and publicUrlFor follow C6 step 6 under the author folder of the social-media bucket', () => {
  assert.deepEqual(storagePathsFor(JOB), {
    video: `videos/${HERO}/hand-clip-${JOB.hand_id}-felt-720p.mp4`,
    poster: `videos/${HERO}/hand-clip-${JOB.hand_id}-felt-720p.jpg`,
  });
  assert.equal(
    publicUrlFor('https://kuklfnapbkmacvwxktbh.supabase.co/', 'videos/a/b.mp4'),
    'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/a/b.mp4',
  );
  assert.match(publicUrlFor(undefined, 'x.jpg'), /^https:\/\/kuklfnapbkmacvwxktbh\.supabase\.co\/storage\/v1\/object\/public\/social-media\/x\.jpg$/);
  // The URL shape the social_posts contract trigger accepts as native (fn_is_platform_public_storage_url).
  assert.match(publicUrlFor('https://kuklfnapbkmacvwxktbh.supabase.co', storagePathsFor(JOB).video), /\/storage\/v1\/object\/public\/social-media\/videos\/[^/]+\/[^/?]+\.mp4$/);
});

test('durationGuard refuses outside 15 to 40 seconds with the C6 reasons', () => {
  assert.equal(durationGuard(14999), 'clip_too_short');
  assert.equal(durationGuard(15000), null);
  assert.equal(durationGuard(27500), null);
  assert.equal(durationGuard(40000), null);
  assert.equal(durationGuard(40001), 'clip_too_long');
  assert.equal(durationGuard(NaN), 'clip_too_short');
  assert.equal(durationGuard(undefined), 'clip_too_short');
  assert.equal(durationGuard(5000, 1000, 6000), null);
});

test('shortReason is one line of at most 300 characters', () => {
  assert.equal(shortReason(new Error('ffmpeg exit 1:  bad\n  input')), 'ffmpeg exit 1: bad input');
  assert.equal(shortReason('upload 500: nope'), 'upload 500: nope');
  assert.equal(shortReason(null), 'unknown error');
  assert.equal(shortReason(new Error('x'.repeat(500))).length, 300);
});

test('the browser scripts inject the payload, read the state and the step, read the plan and seek', async () => {
  const saved = {
    window: globalThis.window,
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
  };
  try {
    globalThis.window = {};
    globalThis.document = { querySelector: () => null };
    pageScripts.inject({ v: 1, heroId: HERO });
    assert.deepEqual(globalThis.window.__SP_CLIP__, { v: 1, heroId: HERO });
    assert.equal(pageScripts.clipState(), null, 'no stage yet');
    assert.equal(pageScripts.clipStep(), null);
    const attrs = { 'data-clip-state': 'ready', 'data-clip-step': '0' };
    globalThis.document = {
      querySelector: (sel) => {
        const name = sel.slice(1, -1);
        return name in attrs ? { getAttribute: (a) => attrs[a] } : null;
      },
    };
    assert.equal(pageScripts.clipState(), 'ready');
    assert.equal(pageScripts.clipStep(), 0);
    attrs['data-clip-step'] = '12';
    assert.equal(pageScripts.clipStep(), 12);
    attrs['data-clip-step'] = 'x';
    assert.equal(pageScripts.clipStep(), null, 'not a frame index');

    assert.equal(pageScripts.plan(), null, 'no __spClip means no plan');
    assert.equal(pageScripts.seek(3), false, 'no __spClip means no seek');
    const sought = [];
    globalThis.window.__spClip = {
      v: 1, state: 'ready', frames: 3, rate: 1, beats: [1400, 900, 1400], holdMs: 1500, plannedMs: 5200,
      seek: (i) => { sought.push(i); return i < 3; },
      start: () => true,
    };
    assert.deepEqual(pageScripts.plan(), { frames: 3, rate: 1, beats: [1400, 900, 1400], holdMs: 1500, plannedMs: 5200 });
    assert.equal(pageScripts.seek(2), true);
    assert.equal(pageScripts.seek(3), false);
    assert.deepEqual(sought, [2, 3]);
    // A plan that does not describe every frame is no plan.
    globalThis.window.__spClip = { frames: 3, beats: [1400, 900], holdMs: 1500 };
    assert.equal(pageScripts.plan(), null, 'frames and beats disagree');
    globalThis.window.__spClip = { frames: 2, beats: [1400, 0], holdMs: 1500 };
    assert.equal(pageScripts.plan(), null, 'a zero beat');
    globalThis.window.__spClip = { frames: 2, beats: [1400, 900], holdMs: -1 };
    assert.equal(pageScripts.plan(), null, 'a negative hold');
    globalThis.window.__spClip = { frames: 0, beats: [], holdMs: 0 };
    assert.equal(pageScripts.plan(), null, 'too_long hands over no beats');

    // painted: two animation frames, or the timeout.
    let rafs = 0;
    globalThis.requestAnimationFrame = (fn) => { rafs += 1; setImmediate(fn); };
    assert.equal(await pageScripts.painted(1000), true);
    assert.equal(rafs, 2);
    globalThis.requestAnimationFrame = () => {};
    assert.equal(await pageScripts.painted(5), false, 'a compositor that never paints does not hang the camera');

    // settled: a card squeeze still running on the felt is waited out, or the timeout.
    let animating = true;
    globalThis.document = {
      querySelector: (sel) => (sel === '[data-rs-animating="on"]' && animating ? {} : null),
    };
    setTimeout(() => { animating = false; }, 30);
    assert.equal(await pageScripts.settled(1000, 5), true, 'the still waits for the new card to turn face up');
    assert.equal(animating, false);
    assert.equal(await pageScripts.settled(1000, 5), true, 'nothing running resolves at once');
    animating = true;
    assert.equal(await pageScripts.settled(20, 5), false, 'a squeeze that never ends does not hang the camera');

    for (const fn of Object.values(pageScripts)) {
      assert.doesNotMatch(fn.toString(), /\b(require|import|process)\b/, 'self-contained for puppeteer serialisation');
    }
  } finally {
    globalThis.window = saved.window;
    globalThis.document = saved.document;
    globalThis.requestAnimationFrame = saved.requestAnimationFrame;
  }
});
