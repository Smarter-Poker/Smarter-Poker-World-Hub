/**
 * Phase 7 puzzle card: what a puzzle post shows, and what it never shows.
 *
 * A puzzle post is a normal text post whose metadata.puzzle carries the
 * options and the reveal time, never the answer. This renders the REAL feed
 * PostCard (pages/hub/social-media/index.js) and the REAL card
 * (src/components/social/PuzzleAnswerCard.jsx) through the SSR harness that
 * pins the poker-card renderer, so a regex over the source cannot pass in
 * place of the markup a player sees.
 *
 *   open       the option buttons and "Answers Close At <time>", no answer
 *   closed     between reveal_at and the reveal: locked buttons, no answer
 *   revealed   the correct option, the viewer's own result, the explanation
 *   no puzzle  a post without metadata.puzzle renders byte for byte as before
 *              (__tests__/social-puzzle-card.baseline.html was rendered from
 *              the page as it was before the branch existed)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { React, cardImages, elements, loadSurface, render, textOf } from './social-poker-card-harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CARD_FILE = 'src/components/social/PuzzleAnswerCard.jsx';
const FEED_FILE = 'pages/hub/social-media/index.js';
const FEED_EXPOSE = ['PostCard', 'SocialMediaPage'];
const noop = () => {};

const HOUR = 3600 * 1000;
const BOARD = '[[sp-card:2c]][[sp-card:7c]][[sp-card:Ac]][[sp-card:Qc]][[sp-card:2d]]';
const BOARD_ART = ['clubs_2', 'clubs_7', 'clubs_a', 'clubs_q', 'diamonds_2'];
const PROMPT = `Quick one from earlier today. Board ${BOARD}. What is the nuts on this river? The answer comes in about six hours.`;
const EXPLANATION = 'Pocket deuces make quads on the paired river and nothing else gets there.';
const PUZZLE_ID = '4f1c2d3e-5a6b-4c7d-8e9f-a0b1c2d3e4f5';
const OPTIONS = [
  { key: 'A', label: 'any eight nine, for a nine high straight' },
  { key: 'B', label: 'pocket deuces, for quads' },
  { key: 'C', label: 'king of clubs with any club, for the nut flush' },
  { key: 'D', label: 'ace king, for two pair' },
];
const CORRECT = 'B';

const puzzleMeta = (revealAt, extra = {}) => ({
  id: PUZZLE_ID, kind: 'nuts', reveal_at: revealAt, options: OPTIONS, rewardable: true, ...extra,
});
const puzzlePost = (revealAt, extra = {}) => ({
  id: 'p7-post-1', content: PROMPT, authorId: 'horse-1', author: { name: 'Rounder', username: 'rounder' },
  likeCount: 0, commentCount: 0, contentType: 'text', mediaUrls: [],
  metadata: { scheduler: 'phase7', phase7_mode: 'puzzle_nuts', puzzle: puzzleMeta(revealAt, extra) },
});
const cardProps = (post, viewerId = 'viewer-1') => ({ post, currentUserId: viewerId, onLike: noop, onDelete: noop, onComment: noop });

// next/link is a stub in the harness (it renders nothing); the sign-in state
// needs the anchor, so this stands in for it where a test looks for the link.
const linkMock = {
  __esModule: true,
  default: ({ href, style, children }) => React.createElement('a', { href, style }, children),
};

/** The real card, with its named state slots set as a test needs them. */
const loadCard = ({ state = {}, mocks = {} } = {}) =>
  loadSurface(CARD_FILE, { state, mocks: { 'next/link': linkMock, ...mocks } });

/** The real feed PostCard with the real card wired in through the module graph. */
function feedWithCard(card) {
  return loadSurface(FEED_FILE, { expose: FEED_EXPOSE, mocks: { [CARD_FILE]: card.module } });
}

const closeTime = (revealAt) => new Date(revealAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// "Answers Close At 6:15 PM", or "Answers Close At Sep 30, 6:15 PM" when the
// reveal falls on another local day.
const closeLine = (revealAt) => new RegExp(`Answers Close At (?:[A-Z][a-z]{2} \\d{1,2}, )?${escapeRe(closeTime(revealAt))}`);
const optionButtons = (html) => [...html.matchAll(/<button [^>]*data-option="([A-D])"[^>]*>/g)];
const disabledOptions = (html) => optionButtons(html).filter((m) => / disabled=""/.test(m[0])).map((m) => m[1]);

function neverTheAnswer(html, label) {
  assert.doesNotMatch(html, /The Answer: /, `${label}: the answer line must not render`);
  assert.doesNotMatch(html, />Correct</, `${label}: no option may be marked correct`);
  assert.doesNotMatch(html, /You Got It|Not This Time/, `${label}: no result before the reveal`);
  assert.ok(!html.includes(EXPLANATION), `${label}: the explanation must not render`);
  assert.doesNotMatch(html, /data-puzzle-phase="revealed"/, `${label}: not revealed`);
}

// ── Source laws ──

test('the card source carries no emoji, no en or em dash, no timer and no select star', () => {
  const source = readFileSync(join(HERE, '..', CARD_FILE), 'utf8');
  assert.doesNotMatch(source, /[–—]/, 'no U+2013 or U+2014');
  assert.doesNotMatch(source, /\p{Extended_Pictographic}/u, 'no emoji');
  assert.doesNotMatch(source, /select\((['"`])\*\1\)/, 'never select * from a puzzle table');
  assert.match(source, /revealed_at/, 'the reveal is read from the row, not from the clock');
  assert.doesNotMatch(source, /setInterval|setTimeout/, 'no timers, no polling');
});

// ── Open: the buttons and the clock, never the answer ──

test('a puzzle post renders its option buttons and the close time, and not the answer', () => {
  const revealAt = new Date(Date.now() + 3 * HOUR).toISOString();
  const feed = feedWithCard(loadCard());
  const html = render(feed.exposed.PostCard(cardProps(puzzlePost(revealAt))));

  assert.deepEqual(cardImages(html), BOARD_ART, 'the body still draws the board through PokerCardText');
  assert.match(html, /data-puzzle-phase="open"/);
  assert.deepEqual(optionButtons(html).map((m) => m[1]), ['A', 'B', 'C', 'D']);
  for (const option of OPTIONS) assert.ok(html.includes(`>${option.label}</span>`), `option ${option.key} label`);
  assert.deepEqual(disabledOptions(html), [], 'a signed-in viewer who is not the author can answer');
  assert.match(html, closeLine(revealAt), 'the close time on the viewer clock');
  assert.match(html, /Pick One, A Correct Answer Can Earn Diamonds/);
  neverTheAnswer(html, 'open');
});

test('a viewer who already answered sees their pick and locked buttons before the reveal', () => {
  const revealAt = new Date(Date.now() + 3 * HOUR).toISOString();
  const card = loadCard({ state: { myAnswer: { puzzle_id: PUZZLE_ID, user_id: 'viewer-1', option: 'C', is_correct: null, reward_result: null } } });
  const html = render(feedWithCard(card).exposed.PostCard(cardProps(puzzlePost(revealAt))));
  assert.deepEqual(disabledOptions(html), ['A', 'B', 'C', 'D']);
  assert.match(html, /aria-pressed="true"[^>]*data-option="C"/);
  assert.match(html, /Your Answer Is In\. Answers Close At /);
  neverTheAnswer(html, 'answered, open');
});

// ── Closed: between reveal_at and the reveal ──

test('between reveal_at and the reveal the buttons lock and the answer is still not shown', () => {
  const revealAt = new Date(Date.now() - HOUR).toISOString();
  const card = loadCard({ state: { row: { id: PUZZLE_ID, kind: 'nuts', post_id: 'p7-post-1', options: OPTIONS, reveal_at: revealAt, revealed_at: null, correct_option: null, explanation: null, rewardable: true } } });
  const html = render(feedWithCard(card).exposed.PostCard(cardProps(puzzlePost(revealAt))));
  assert.match(html, /data-puzzle-phase="closed"/);
  assert.match(html, /Answers Are Closed, The Answer Is Coming/);
  assert.deepEqual(disabledOptions(html), ['A', 'B', 'C', 'D']);
  neverTheAnswer(html, 'closed');
});

test('a reveal time the card cannot read closes the puzzle instead of opening it', () => {
  const card = loadCard();
  const html = render(feedWithCard(card).exposed.PostCard(cardProps(puzzlePost('not a time'))));
  assert.match(html, /data-puzzle-phase="closed"/);
  assert.deepEqual(disabledOptions(html), ['A', 'B', 'C', 'D']);
});

// ── Revealed: the correct option and the viewer's own result ──

const revealedRow = (revealAt) => ({
  id: PUZZLE_ID, kind: 'nuts', post_id: 'p7-post-1', options: OPTIONS, reveal_at: revealAt,
  revealed_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), correct_option: CORRECT, explanation: EXPLANATION, rewardable: true,
});

test('after the reveal the correct option, the viewer result and the reward line render', () => {
  const revealAt = new Date(Date.now() - 7 * HOUR).toISOString();
  const card = loadCard({ state: {
    row: revealedRow(revealAt),
    myAnswer: { puzzle_id: PUZZLE_ID, user_id: 'viewer-1', option: CORRECT, is_correct: true, reward_result: { success: true, awarded: 10 } },
  } });
  const html = render(feedWithCard(card).exposed.PostCard(cardProps(puzzlePost(revealAt))));
  assert.match(html, /data-puzzle-phase="revealed"/);
  assert.ok(html.includes(`The Answer: <strong>${OPTIONS[1].label}</strong>`), 'the correct option by its label');
  assert.match(html, /data-option="B"[^>]*>(?:(?!<\/button>).)*>Correct</, 'the correct button is marked');
  assert.match(html, /You Got It/);
  assert.match(html, /10 Diamonds Added To Your Balance/);
  assert.ok(html.includes(EXPLANATION), 'the explanation is shown once revealed');
  assert.deepEqual(disabledOptions(html), ['A', 'B', 'C', 'D'], 'nobody answers a revealed puzzle');
});

test('after the reveal a wrong answer reads as not this time, with the pick marked', () => {
  const revealAt = new Date(Date.now() - 7 * HOUR).toISOString();
  const card = loadCard({ state: {
    row: revealedRow(revealAt),
    myAnswer: { puzzle_id: PUZZLE_ID, user_id: 'viewer-1', option: 'A', is_correct: false, reward_result: null },
  } });
  const html = render(feedWithCard(card).exposed.PostCard(cardProps(puzzlePost(revealAt))));
  assert.match(html, /Not This Time/);
  assert.match(html, /data-option="A"[^>]*>(?:(?!<\/button>).)*>Your Pick</);
  assert.doesNotMatch(html, /Diamonds Added/);
});

test('after the reveal a viewer who never answered sees the answer and no reward', () => {
  const revealAt = new Date(Date.now() - 7 * HOUR).toISOString();
  const card = loadCard({ state: { row: revealedRow(revealAt) } });
  const html = render(feedWithCard(card).exposed.PostCard(cardProps(puzzlePost(revealAt))));
  assert.match(html, /You Did Not Answer This One/);
  assert.ok(html.includes(`The Answer: <strong>${OPTIONS[1].label}</strong>`));
  assert.doesNotMatch(html, /Diamonds Added/);
});

// ── Who may answer ──

test('a signed-out viewer is told to sign in and cannot press an option', () => {
  const revealAt = new Date(Date.now() + 3 * HOUR).toISOString();
  const html = render(feedWithCard(loadCard()).exposed.PostCard(cardProps(puzzlePost(revealAt), null)));
  assert.match(html, /<a href="\/auth\/login"[^>]*>Sign In To Answer<\/a>/);
  assert.deepEqual(disabledOptions(html), ['A', 'B', 'C', 'D']);
  neverTheAnswer(html, 'signed out');
});

test('the puzzle author cannot answer their own puzzle', () => {
  const revealAt = new Date(Date.now() + 3 * HOUR).toISOString();
  const html = render(feedWithCard(loadCard()).exposed.PostCard(cardProps(puzzlePost(revealAt), 'horse-1')));
  assert.match(html, /This Is Your Puzzle/);
  assert.deepEqual(disabledOptions(html), ['A', 'B', 'C', 'D']);
});

// ── The answer write: direct supabase-js under RLS, refusals as text ──

function supabaseMock(insertResult) {
  const inserts = [];
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: null, error: null }) };
  const supabase = {
    from: (table) => ({
      ...chain,
      insert: async (row) => { inserts.push({ table, row }); return insertResult; },
    }),
  };
  return { supabase, inserts };
}

async function pressOption(insertResult, key = 'A') {
  const revealAt = new Date(Date.now() + 3 * HOUR).toISOString();
  const { supabase, inserts } = supabaseMock(insertResult);
  const card = loadCard({ mocks: { 'src/lib/supabase.js': { supabase } } });
  const tree = card.module.default({ puzzle: puzzleMeta(revealAt), postId: 'p7-post-1', authorId: 'horse-1', viewerId: 'viewer-1' });
  const button = elements(tree).find((el) => el.type === 'button' && el.props['data-option'] === key);
  assert.ok(button, `option ${key} is a button`);
  assert.equal(button.props.disabled, false);
  await button.props.onClick();
  return { inserts, state: card.state };
}

test('pressing an option inserts one social_puzzle_answers row as the signed-in viewer', async () => {
  const { inserts, state } = await pressOption({ error: null }, 'C');
  assert.deepEqual(inserts, [{ table: 'social_puzzle_answers', row: { puzzle_id: PUZZLE_ID, user_id: 'viewer-1', option: 'C' } }]);
  assert.equal(state.get('myAnswer').option, 'C');
  assert.equal(state.get('notice'), '');
  assert.equal(state.get('submitting'), false);
});

test('a duplicate (23505) reads as already answered and locks the buttons, no modal', async () => {
  const { state } = await pressOption({ error: { code: '23505', message: 'duplicate key value violates unique constraint "social_puzzle_answers_puzzle_id_user_id_key"' } });
  assert.equal(state.get('notice'), 'You Already Answered This One');
  assert.equal(state.get('locked'), true);
  assert.equal(state.get('myAnswer'), null, 'the browser never invents an answer row');
});

test('a trigger refusal reads as answers are closed and locks the buttons', async () => {
  const { state } = await pressOption({ error: { code: 'P0001', message: 'puzzle is closed for answers' } });
  assert.equal(state.get('notice'), 'Answers Are Closed');
  assert.equal(state.get('locked'), true);
});

test('a row-level security refusal reads as sign in to answer and does not lock', async () => {
  const { state } = await pressOption({ error: { code: '42501', message: 'new row violates row-level security policy for table "social_puzzle_answers"' } });
  assert.equal(state.get('notice'), 'Sign In To Answer');
  assert.equal(state.get('locked'), false);
});

test('refusal wording is decided by the database code, not by the browser', () => {
  const { refusalNotice, puzzlePhase, puzzleOptions } = loadCard().module;
  assert.deepEqual(refusalNotice({ code: '23505' }), { text: 'You Already Answered This One', lock: true });
  assert.deepEqual(refusalNotice({ code: 'P0001', message: 'answers are closed' }), { text: 'Answers Are Closed', lock: true });
  assert.deepEqual(refusalNotice({ code: 'P0001', message: 'the author cannot answer their own puzzle' }), { text: 'This Is Your Puzzle', lock: true });
  assert.deepEqual(refusalNotice({ code: 'P0001', message: 'option is not on this puzzle' }), { text: 'That Option Is Not On This Puzzle', lock: false });
  assert.deepEqual(refusalNotice(new Error('fetch failed')), { text: 'Could Not Save Your Answer, Try Again', lock: false });
  assert.equal(puzzlePhase({ reveal_at: 'garbage' }, null), 'closed');
  assert.equal(puzzlePhase({ reveal_at: new Date(Date.now() + HOUR).toISOString() }, { revealed_at: '2026-09-29T00:00:00Z' }), 'revealed');
  assert.deepEqual(puzzleOptions([{ key: 'A', label: 'x' }]), [], 'one option is not a puzzle');
  assert.deepEqual(puzzleOptions([{ key: 'A', label: 'x' }, { key: 'A', label: 'y' }]), [], 'keys are unique');
  assert.deepEqual(puzzleOptions([{ key: 'A', label: 'x' }, { key: 'E', label: 'y' }]), [], 'keys are A to D');
});

test('a puzzle with unreadable options renders no card at all', () => {
  const revealAt = new Date(Date.now() + 3 * HOUR).toISOString();
  const post = puzzlePost(revealAt, { options: [{ key: 'A', label: 'only one' }] });
  const html = render(feedWithCard(loadCard()).exposed.PostCard(cardProps(post)));
  assert.doesNotMatch(html, /data-puzzle-card/);
  assert.deepEqual(cardImages(html), BOARD_ART, 'the post body is untouched');
});

// ── A post without a puzzle renders exactly as before ──

const HAND = 'Hand [[sp-card:As]][[sp-card:Td]] | Board [[sp-card:Kh]][[sp-card:7c]][[sp-card:2s]]';
const feedPost = (content, authorId = 'u2') => ({
  id: 'f1', content, authorId, author: { name: 'Dan', username: 'dan' },
  likeCount: 0, commentCount: 2, contentType: 'text', mediaUrls: [],
});
const feedCardProps = (post) => ({ post, currentUserId: 'u1', onLike: noop, onDelete: noop, onComment: noop });

test('a post without puzzle metadata renders byte for byte as it did before the branch', () => {
  const tripwire = { __esModule: true, default: () => { throw new Error('PuzzleAnswerCard rendered for a post without a puzzle'); } };
  const comments = [
    { id: 'c1', text: `top ${HAND} @amy`, parentId: null, authorName: 'Amy' },
    { id: 'c2', text: 'reply [[sp-card:Qh]] @dan.b', parentId: 'c1', authorName: 'Bo' },
  ];
  const withComments = loadSurface(FEED_FILE, { expose: FEED_EXPOSE, mocks: { [CARD_FILE]: tripwire }, state: { showComments: true, comments } });
  const a = render(withComments.exposed.PostCard(feedCardProps(feedPost('plain post'))));
  const plain = loadSurface(FEED_FILE, { expose: FEED_EXPOSE, mocks: { [CARD_FILE]: tripwire } });
  const b = render(plain.exposed.PostCard(feedCardProps(feedPost(`Checked in at Hard Rock Tampa - ${HAND}`))));
  const now = `${a}\n<!-- fixture 2 -->\n${b}\n`;
  const before = readFileSync(join(HERE, 'social-puzzle-card.baseline.html'), 'utf8');
  assert.equal(now, before);
  assert.doesNotMatch(now, /data-puzzle-card/);
  assert.equal(textOf(withComments.exposed.PostCard(feedCardProps(feedPost('plain post')))).includes('Pick One'), false);
});
