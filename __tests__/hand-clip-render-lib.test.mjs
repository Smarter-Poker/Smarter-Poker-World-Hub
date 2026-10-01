// The pure pieces of the Phase 9 clip renderer (src/lib/server/handClipRender.js):
// the C1 payload, the ffmpeg concat list and its durations, the exact ffmpeg
// and poster argument arrays of C6 step 5, the storage paths and public URLs
// of step 6, the length guard, and the scripts the browser runs.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLIP_MAX_MS,
  CLIP_MIN_MS,
  CLIP_PAGE_URL,
  END_HOLD_MS,
  HAND_COLUMNS,
  JOB_NAME,
  RENDER_DEADLINE_MS,
  SCREENCAST_PARAMS,
  buildClipPayload,
  concatListFor,
  durationGuard,
  endHoldFor,
  ffmpegArgsFor,
  heroInHand,
  pageScripts,
  posterArgsFor,
  publicUrlFor,
  shortReason,
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
  assert.deepEqual({ ...SCREENCAST_PARAMS }, { format: 'jpeg', quality: 85, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
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
    privateHoleCards: { [HERO]: facts.hole_cards },
    discardedCards: {},
    minMs: 15000,
    maxMs: 40000,
  });
  const withRowCards = buildClipPayload({ ...HAND, hole_cards: { [HERO]: ['As', 'Ks'] } }, facts, null, JOB);
  assert.deepEqual(withRowCards.privateHoleCards, {}, 'the row already carries the hero cards');
  const draw = buildClipPayload(HAND, null, { discarded_card: { rank: '7', suit: 'd' }, seat_number: 1 }, JOB);
  assert.deepEqual(draw.discardedCards, { [HERO]: { rank: '7', suit: 'd' } });
  assert.deepEqual(draw.privateHoleCards, {});
  assert.equal(buildClipPayload(HAND, { hole_cards: [] }, null, JOB).privateHoleCards[HERO], undefined, 'an empty facts row adds nothing');
  assert.equal(buildClipPayload(HAND, null, null, { ...JOB, style: undefined }).style, 'felt-720p');
});

test('concatListFor holds each frame until the next timestamp, holds the last one, and repeats the last file', () => {
  const frames = [
    { path: '/tmp/j/f_1.jpg', timestamp: 1700000000.100 },
    { path: '/tmp/j/f_0.jpg', timestamp: 1700000000.000 },
    { path: '/tmp/j/f_2.jpg', timestamp: 1700000000.350 },
  ];
  const list = concatListFor(frames, 1500);
  assert.equal(list.frames, 3);
  assert.equal(list.durationMs, 1850, '100 + 250 + 1500');
  assert.equal(list.text, [
    'ffconcat version 1.0',
    "file '/tmp/j/f_0.jpg'",
    'duration 0.100',
    "file '/tmp/j/f_1.jpg'",
    'duration 0.250',
    "file '/tmp/j/f_2.jpg'",
    'duration 1.500',
    "file '/tmp/j/f_2.jpg'",
    '',
  ].join('\n'));
  assert.equal(concatListFor([], 1500).text, 'ffconcat version 1.0\n');
  assert.equal(concatListFor([], 1500).durationMs, 0);
  const same = concatListFor([{ path: '/a.jpg', timestamp: 5 }, { path: '/b.jpg', timestamp: 5 }], 1500);
  assert.match(same.text, /duration 0\.001\n/, 'a zero gap is clamped so the demuxer keeps the frame');
  const quoted = concatListFor([{ path: "/tmp/o'k/f.jpg", timestamp: 1 }], 1500);
  assert.ok(quoted.text.includes("file '/tmp/o'\\''k/f.jpg'"), 'an apostrophe in the path is escaped for the demuxer');
  assert.equal(concatListFor([{ path: '/a.jpg', timestamp: 1 }], 0).durationMs, 1, 'the hold never goes below one millisecond');
});

test('endHoldFor stretches the hold to what the page planned and never below the 1.5 s end hold', () => {
  const frames = [{ timestamp: 100 }, { timestamp: 110 }];
  assert.equal(endHoldFor(frames, 20000), 10000, 'a 10 s span planned at 20 s holds 10 s');
  assert.equal(endHoldFor(frames, 11000), 1500, 'a plan close to the span keeps the 1.5 s hold');
  assert.equal(endHoldFor(frames, null), 1500);
  assert.equal(endHoldFor([], 20000), 1500);
});

test('ffmpegArgsFor and posterArgsFor are exactly the C6 step 5 commands', () => {
  assert.deepEqual(ffmpegArgsFor('/tmp/j/frames.txt', '/tmp/j/clip.mp4'), [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', '/tmp/j/frames.txt',
    '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black',
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

test('the browser scripts inject the payload, read the clip state and start the clip', () => {
  const saved = { window: globalThis.window, document: globalThis.document };
  try {
    globalThis.window = {};
    globalThis.document = { querySelector: () => null };
    pageScripts.inject({ v: 1, heroId: HERO });
    assert.deepEqual(globalThis.window.__SP_CLIP__, { v: 1, heroId: HERO });
    assert.equal(pageScripts.clipState(), null, 'no stage yet');
    globalThis.document = { querySelector: (sel) => (sel === '[data-clip-state]' ? { getAttribute: () => 'ready' } : null) };
    assert.equal(pageScripts.clipState(), 'ready');
    assert.equal(pageScripts.plannedMs(), null);
    assert.equal(pageScripts.start(), false, 'no __spClip means no start');
    let started = 0;
    globalThis.window.__spClip = { v: 1, plannedMs: 21500, start: () => { started += 1; return true; } };
    assert.equal(pageScripts.plannedMs(), 21500);
    assert.equal(pageScripts.start(), true);
    assert.equal(started, 1);
    for (const fn of Object.values(pageScripts)) {
      assert.doesNotMatch(fn.toString(), /\b(require|import|process)\b/, 'self-contained for puppeteer serialisation');
    }
  } finally {
    globalThis.window = saved.window;
    globalThis.document = saved.document;
  }
});
