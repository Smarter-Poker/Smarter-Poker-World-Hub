import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { React, cardImages, elements, inert, loadSurface, render, textOf } from './social-poker-card-harness.mjs';
import {
  RECENT_CLUB_ARENA_HAND_LIMIT,
  clubArenaHandForComposer,
  fetchRecentClubArenaHands,
  normalizeClubArenaCard,
} from '../src/lib/clubArenaHandImport.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const markupSource = read('src/lib/pokerCardMarkup.js');
const markup = await import(`data:text/javascript;base64,${Buffer.from(markupSource).toString('base64')}`);

test('all 52 cards resolve to the canonical Club Arena deck', () => {
  const ranks = '23456789TJQKA';
  const suits = 'hdcs';
  const urls = new Set();
  for (const rank of ranks) {
    for (const suit of suits) {
      const url = markup.clubArenaCardUrl(rank, suit);
      assert.match(url, /^\/hub\/club-arena\/cards\/2color\/(?:hearts|diamonds|clubs|spades)_(?:[2-9]|10|j|q|k|a)\.webp$/);
      urls.add(url);
    }
  }
  assert.equal(urls.size, 52);
});

test('a hold-em hand and flop round-trip without exposing storage markup', () => {
  const text = markup.formatPokerCards(
    [{ rank: 'A', suit: 's' }, { rank: 'K', suit: 'h' }],
    [{ rank: 'Q', suit: 'd' }, { rank: 'J', suit: 'c' }, { rank: '2', suit: 's' }]
  );
  assert.equal(text, 'Hand [[sp-card:As]][[sp-card:Kh]] | Board [[sp-card:Qd]][[sp-card:Jc]][[sp-card:2s]]');
  assert.deepEqual(markup.parsePokerCards(text), {
    hand: [{ rank: 'A', suit: 's' }, { rank: 'K', suit: 'h' }],
    board: [{ rank: 'Q', suit: 'd' }, { rank: 'J', suit: 'c' }, { rank: '2', suit: 's' }],
  });
  assert.equal(
    markup.readablePokerText(text),
    'Hand: Ace of spades, King of hearts | Board: Queen of diamonds, Jack of clubs, 2 of spades'
  );
});

test('invalid card notation remains harmless text', () => {
  const input = 'Bluff? [[sp-card:1s]] [[sp-card:AZ]]';
  assert.deepEqual(markup.tokenizePokerText(input), [{ type: 'text', value: input }]);
  assert.equal(markup.pokerCardToken({ rank: '1', suit: 's' }), '');
  assert.equal(markup.clubArenaCardUrl('A', 'x'), null);
});

test('hostile or stale selections are normalized at the data boundary', () => {
  const hand = [
    { rank: 'A', suit: 's' }, { rank: 'A', suit: 's' }, { rank: 'K', suit: 'h' },
    { rank: 'Q', suit: 'd' }, { rank: 'J', suit: 'c' }, { rank: 'T', suit: 's' },
    { rank: '9', suit: 'h' }, { rank: '8', suit: 'd' }, { rank: '1', suit: 'c' },
  ];
  const board = [
    { rank: 'A', suit: 's' }, { rank: '7', suit: 's' }, { rank: '6', suit: 'h' },
    { rank: '5', suit: 'd' }, { rank: '4', suit: 'c' }, { rank: '3', suit: 's' },
    { rank: '2', suit: 'h' },
  ];
  assert.deepEqual(markup.normalizePokerCardSelection(hand, board), {
    hand: hand.filter((_, index) => ![1, 7, 8].includes(index)),
    board: board.slice(1, 6),
  });
  const formatted = markup.formatPokerCards(hand, board);
  assert.equal((formatted.match(/\[\[sp-card:/g) || []).length, 11);
  assert.deepEqual(markup.parsePokerCards(formatted), markup.normalizePokerCardSelection(hand, board));
  assert.equal(markup.normalizePokerCardMarkup(`${formatted}[[sp-card:As]]`), formatted);
});

test('saved card presets persist in separate account-owned browser caches', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const hand = 'Hand [[sp-card:As]][[sp-card:Kh]]';
  const dan = markup.createPokerCardPreset([], ' Big Slick ', hand, 'preset-1');
  assert.equal(markup.persistPokerCardPresets(storage, 'account-a', dan), true);
  assert.deepEqual(markup.loadPokerCardPresets(storage, 'account-a'), [{ id: 'preset-1', name: 'Big Slick', markup: hand }]);
  assert.deepEqual(markup.loadPokerCardPresets(storage, 'account-b'), []);
  assert.notEqual(markup.pokerCardPresetStorageKey('account-a'), markup.pokerCardPresetStorageKey('account-b'));
});

test('saved card preset create, rename, use and delete data stays canonical', () => {
  const flop = 'Hand [[sp-card:As]][[sp-card:Kh]] | Board [[sp-card:Qd]][[sp-card:Jc]][[sp-card:2s]]';
  const created = markup.createPokerCardPreset([], 'Tournament Hand', flop, 'preset-2');
  const renamed = markup.renamePokerCardPreset(created, 'preset-2', 'Final Table');
  assert.deepEqual(markup.parsePokerCards(renamed[0].markup), markup.parsePokerCards(flop));
  assert.equal(renamed[0].name, 'Final Table');
  assert.deepEqual(markup.deletePokerCardPreset(renamed, 'preset-2'), []);
  assert.throws(() => markup.createPokerCardPreset(renamed, 'final table', flop, 'preset-3'), /Already Exists/);
});

test('saved card presets reject partial boards and discard corrupt persisted entries', () => {
  assert.throws(
    () => markup.createPokerCardPreset([], 'Broken Flop', 'Board [[sp-card:As]][[sp-card:Kh]]', 'preset-4'),
    /Complete Hand Or Board/
  );
  const storage = {
    getItem: () => '{not-json',
    setItem: () => { throw new Error('storage unavailable'); },
  };
  assert.deepEqual(markup.loadPokerCardPresets(storage, 'account-a'), []);
  assert.equal(markup.persistPokerCardPresets(storage, 'account-a', []), false);
  assert.deepEqual(markup.normalizePokerCardPresets([
    { id: 'bad', name: '', markup: 'Hand [[sp-card:As]]' },
    { id: 'good', name: 'Aces', markup: 'Hand [[sp-card:As]][[sp-card:Ah]]' },
    { id: 'duplicate-name', name: 'aces', markup: 'Hand [[sp-card:Ks]][[sp-card:Kh]]' },
  ]), [{ id: 'good', name: 'Aces', markup: 'Hand [[sp-card:As]][[sp-card:Ah]]' }]);
});

test('Club Arena import normalizes production card objects and long board strings without exposing opponents', () => {
  const hero = '11111111-1111-4111-8111-111111111111';
  const opponent = '22222222-2222-4222-8222-222222222222';
  const imported = clubArenaHandForComposer({
    id: 'hand-1',
    hand_number: 712,
    created_at: '2026-10-08T12:00:00.000Z',
    hole_cards: {
      [hero]: [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'hearts' }],
      [opponent]: [{ rank: 'K', suit: 'clubs' }, { rank: 'K', suit: 'diamonds' }],
    },
    community_cards: ['2clubs', '7diamonds', 'Thearts', 'Jspades', 'Qclubs'],
  }, hero);
  assert.deepEqual(imported.hand, [{ rank: 'A', suit: 's' }, { rank: 'K', suit: 'h' }]);
  assert.deepEqual(imported.board, [
    { rank: '2', suit: 'c' }, { rank: '7', suit: 'd' }, { rank: 'T', suit: 'h' },
    { rank: 'J', suit: 's' }, { rank: 'Q', suit: 'c' },
  ]);
  assert.deepEqual(Object.keys(imported).sort(), ['board', 'hand', 'id', 'label']);
  assert.doesNotMatch(JSON.stringify(imported), new RegExp(opponent));
  assert.deepEqual(normalizeClubArenaCard({ rank: 'K', suit: 'diamonds' }), { rank: 'K', suit: 'd' });
  assert.deepEqual(normalizeClubArenaCard('Thearts'), { rank: 'T', suit: 'h' });
});

test('Club Arena import rejects malformed cards, duplicates and incomplete streets', () => {
  const owner = 'owner';
  const base = { id: 'h', hole_cards: { owner: [{ rank: 'A', suit: 's' }, { rank: 'K', suit: 'h' }] } };
  assert.equal(clubArenaHandForComposer({ ...base, community_cards: ['2c', '7d'] }, owner), null);
  assert.equal(clubArenaHandForComposer({ ...base, community_cards: ['2c', '7d', 'broken'] }, owner), null);
  assert.equal(clubArenaHandForComposer({ ...base, community_cards: ['As', '7d', 'Th'] }, owner), null);
  assert.equal(clubArenaHandForComposer({ ...base, hole_cards: { owner: [{ rank: 'A', suit: 's' }] } }, owner), null);
  assert.equal(clubArenaHandForComposer({ ...base, hole_cards: { stranger: [{ rank: 'A', suit: 's' }, { rank: 'K', suit: 'h' }] } }, owner), null);
});

test('recent Club Arena import uses participant RLS plus own-row facts and returns a bounded safe DTO', async () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const calls = [];
  const handRows = [{
    id: 'hand-1', hand_number: 4, created_at: '2026-10-08T12:00:00Z',
    community_cards: ['2clubs', '7diamonds', 'Thearts'], board: null,
  }];
  const db = {
    from(table) {
      calls.push(['from', table]);
      const chain = {
        select(columns) { calls.push([table, 'select', columns]); return this; },
        filter(column, operator, value) { calls.push([table, 'filter', column, operator, value]); return this; },
        order(column, options) { calls.push([table, 'order', column, options]); return this; },
        in(column, value) { calls.push([table, 'in', column, value]); return this; },
        async limit(value) {
          calls.push([table, 'limit', value]);
          if (table === 'ca_hand_facts') return {
            data: [
              { hand_id: 'hand-1', user_id: 'attacker', hole_cards: [{ rank: 'Q', suit: 's' }, { rank: 'Q', suit: 'h' }] },
              { hand_id: 'hand-1', user_id: owner, played_at: '2026-10-08T12:00:00Z', hole_cards: [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'hearts' }] },
            ],
            error: null,
          };
          return { data: handRows, error: null };
        },
      };
      return chain;
    },
  };
  const result = await fetchRecentClubArenaHands(db, owner, 500);
  assert.equal(result.hands.length, 1);
  assert.deepEqual(result.hands[0].hand, [{ rank: 'A', suit: 's' }, { rank: 'K', suit: 'h' }]);
  assert.equal(calls.find((call) => call[0] === 'ca_hand_facts' && call[1] === 'limit')[2], RECENT_CLUB_ARENA_HAND_LIMIT);
  assert.deepEqual(calls.find((call) => call[0] === 'ca_hand_facts' && call[1] === 'order').slice(2), [
    'played_at', { ascending: false },
  ]);
  const handSelect = calls.find((call) => call[0] === 'hand_history' && call[1] === 'select')[2];
  assert.doesNotMatch(handSelect, /players|hole_cards/);
  assert.deepEqual(calls.find((call) => call[0] === 'hand_history' && call[1] === 'in').slice(2), ['id', ['hand-1']]);
  assert.equal(calls.some((call) => call[1] === 'filter'), false);
  assert.doesNotMatch(JSON.stringify(result), /attacker/);
});

test('the picker wires a one-tap, mobile-safe Club Arena importer with explicit states', () => {
  const picker = read('src/components/social/PokerCardPicker.jsx');
  const importer = read('src/lib/clubArenaHandImport.mjs');
  const composer = read('src/components/social/SharedPostCreator.jsx');
  assert.match(picker, /fetchRecentClubArenaHands\(supabase, accountId\)/);
  assert.match(picker, /onClick=\{\(\) => importRecentHand\(recentHand\)\}/);
  assert.match(picker, /aria-label=\{`Import \$\{recentHand\.label\}`\}/);
  assert.match(picker, /Recent Club Arena Hands/);
  assert.match(picker, /role="status"/);
  assert.match(picker, /role="alert"/);
  assert.match(picker, /minHeight: 52/);
  assert.match(composer, /accountId=\{user\?\.id \|\| null\}/);
  assert.match(importer, /\.from\('hand_history'\)/);
  assert.match(importer, /\.from\('ca_hand_facts'\)/);
  assert.doesNotMatch(importer, /\.eq\(['"]user_id/);
  assert.doesNotMatch(importer, /service[_-]?role|\/api\/club-arena\/my-hands/i);
});

test('feed truncation never exposes or splits card storage tokens', () => {
  const card = '[[sp-card:As]]';
  assert.deepEqual(markup.truncatePokerText(`1234${card}after`, 5), {
    text: `1234${card}`,
    truncated: true,
  });
  assert.deepEqual(markup.truncatePokerText(`12345${card}`, 5), {
    text: '12345',
    truncated: true,
  });
  assert.deepEqual(markup.truncatePokerText(card, 1), { text: card, truncated: false });
});

test('the shared composer persists cards through every publishing path', () => {
  const source = read('src/components/social/SharedPostCreator.jsx');
  assert.match(source, /<PokerCardPicker/);
  assert.match(source, /initialMarkup=\{pokerCardsMarkup\}/);
  assert.match(source, /content:\s*\[content\?\.trim\(\), pokerCardsMarkup\]/);
  assert.match(source, /let finalContent = \[cleanContent, pokerCardsMarkup\]/);
  assert.match(source, /localStorage\.setItem\('sp-post-card-draft'/);
  assert.match(source, /localStorage\.removeItem\('sp-post-card-draft'/);
  assert.match(source, /normalizePokerCardMarkup\(cardDraft\)/);
  assert.match(source, /normalizePokerCardMarkup\(markup\)/);
});

// Surfaces that render a user's post body, so a raw card token like "Ah" must
// go through PokerCardText rather than reach the DOM as text. The ones fixed on
// 2026-09-21 are also rendered for real further down this file.
//
// SmarterPokerStyleCard.jsx left this list the same day. Only its SPAvatar and
// SP_COLORS exports are imported (ClubArenaMessenger); its default export, the
// card that renders a post, is mounted nowhere, so the entry asserted a surface
// no reader can see. A test below fails if anything mounts it again, which is
// when it belongs back here.
const CARD_RENDERING_SURFACES = [
  'src/components/social/ClubPageDashboard.jsx',
  'src/components/social/HashtagRenderer.jsx',
  'src/components/social/Stories.jsx',
  'pages/hub/social-media/index.js',
  'pages/hub/social-pages/[pageId].js',
  'pages/club/[id].js',
  'src/components/social/SharePostModal.jsx',
  'src/components/social/SharedPostCard.jsx',
];

// These three were in the list above until 2026-09-08 and no longer belong in
// it, because they no longer render a post body at all. Each opened with a
// verbatim copy of the feed page - banner, LinkPreviewCard and the whole
// PostCard - which #1601 removed as unreachable; ClubPagesView is a page
// browser (search, filter, follow) and PublicGameBoard is a table list, and
// neither renders user text now. ChatWindow was deleted outright on the same
// day once its last dynamic() importer went.
//
// They are moved here rather than dropped, so that re-introducing body
// rendering without PokerCardText fails instead of passing silently.
const NO_LONGER_RENDERS_POST_BODIES = [
  // SocialCard.jsx: deleted 2026-09-10 as unreachable from any page, in the
  // 39-file sweep. Unlike the three below it DID render post bodies and DID use
  // PokerCardText - so if it is ever restored it belongs back in
  // CARD_RENDERING_SURFACES above, not here. Listed so the deletion is on the
  // record rather than a name that quietly vanished from a list.
  'src/components/social/SocialCard.jsx',
  'src/components/social/ClubPagesView.jsx',
  'src/components/social/PublicGameBoard.jsx',
  'src/components/social/ChatWindow.jsx', // deleted 2026-09-08
];

const RENDERS_BODY = /post\.content|comment\.content|item\.content|msg\.(?:text|content)|message\.(?:text|content)|dangerouslySetInnerHTML/;

test('primary social surfaces render card tokens as cards', () => {
  for (const file of CARD_RENDERING_SURFACES) {
    const source = read(file);
    assert.match(source, /PokerCardText/, `${file} can leak raw card tokens`);
  }
  const mainFeed = read('pages/hub/social-media/index.js');
  assert.match(mainFeed, /truncatePokerText\(displayText, TRUNCATE_LENGTH\)/);
  assert.match(mainFeed, /<PokerCardText key=\{i\} text=\{part\} \/>/);
  const uploadGhost = read('src/components/social/GhostPostCard.jsx');
  assert.match(uploadGhost, /truncatePokerText\(content, 200\)/);
  assert.match(uploadGhost, /<PokerCardText text=\{displayContent\.text\} \/>/);
});

test('every enumerated raw social-content surface routes its body through PokerCardText', () => {
  const contracts = new Map([
    ['pages/hub/home-games/[slug].js', /<PokerCardText text=\{p\.content\} \/>/],
    ['pages/hub/reels.js', /<PokerCardText text=\{comment\.content\} \/>/],
    ['src/components/social/Reels.jsx', /<PokerCardText text=\{comment\.content\} \/>/],
    ['src/components/social/ReelsFeedCarousel.jsx', /<ConsoleCopy><PokerCardText text=\{comment\.content\} \/><\/ConsoleCopy>/],
    ['src/components/social/SmarterPokerStyleCard.jsx', /<PokerCardText text=\{comment\.text \|\| comment\.content\} \/>/],
  ]);
  for (const [file, contract] of contracts) {
    const source = read(file);
    assert.match(source, /import PokerCardText/);
    assert.match(source, contract, `${file} still renders raw social content`);
  }
});

test('the surfaces removed from the card list really render no post body', () => {
  let checked = 0;
  const offenders = [];
  for (const file of NO_LONGER_RENDERS_POST_BODIES) {
    // A deleted file renders nothing. That is the honest pass condition.
    if (!existsSync(join(ROOT, file))) continue;
    checked++;
    const source = read(file);
    // If it started rendering bodies again, it must use PokerCardText.
    if (RENDERS_BODY.test(source) && !/PokerCardText/.test(source)) offenders.push(file);
  }
  // Control: if every entry vanished this would pass while checking nothing.
  assert.ok(checked >= 2, `only ${checked} of the removed surfaces still exist - re-check this list`);
  assert.deepEqual(
    offenders,
    [],
    'these render a post body again without PokerCardText and must go back into ' +
      'CARD_RENDERING_SURFACES:\n  ' + offenders.join('\n  ')
  );
});

test('picker forbids duplicates and respects hand and board limits', () => {
  const source = read('src/components/social/PokerCardPicker.jsx');
  assert.match(source, /allSelected\.some\(\(selected\) => sameCard\(selected, card\)\)/);
  assert.match(source, /hand\.length >= 6/);
  assert.match(source, /board\.length >= 5/);
  assert.match(source, /Each Card Uses The Club Arena Deck/);
  assert.match(source, /Build The Flop/);
  assert.match(source, /Flop Complete · Add The Turn/);
  assert.match(source, /Turn Added · Add The River/);
  assert.match(source, /River Complete/);
  assert.match(source, /aria-pressed=\{zone === area\.id\}/);
  assert.match(source, /const LONG_PRESS_MS = 420/);
  assert.match(source, /onPointerDown=\{\(\) => beginLongPress\(rank\)\}/);
  assert.match(source, /1 Means 10/);
  assert.match(source, /aria-controls="quick-rank-suits"/);
  assert.match(source, /if \(choose\(card\)\) setQuickRank\(null\)/);
  assert.match(source, /repeat\(auto-fit, minmax\(44px, 1fr\)\)/);
  assert.doesNotMatch(source, /<span[\s\S]{0,160}role="button"/);
  assert.match(source, /loadAppSettings\(accountId\)/);
  assert.match(source, /saveAppSetting\('poker_card_presets'/);
  assert.match(source, /minHeight: 44/);
});

test('SmarterPokerStyleCard stays off the card list only while nothing mounts it', () => {
  const found = spawnSync('git', ['grep', '--untracked', '-l', 'SmarterPokerStyleCard', '--', 'pages', 'src'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(found.error, undefined);
  assert.ok(found.status === 0 || found.status === 1, found.stderr);
  // A default import or a dynamic import() of the file mounts the post card.
  const MOUNTS = /import\s+[\w$]+\s*(?:,\s*\{[^}]*\})?\s*from\s*['"][^'"]*\/SmarterPokerStyleCard(?:\.jsx)?['"]|import\(\s*['"][^'"]*\/SmarterPokerStyleCard(?:\.jsx)?['"]\s*\)/;
  const mounts = found.stdout.split('\n').filter(Boolean).filter((file) => MOUNTS.test(read(file)));
  assert.deepEqual(mounts, [], 'SmarterPokerStyleCard is mounted again: put it back in CARD_RENDERING_SURFACES');
});

// ─────────────────────────────────────────────────────────────────────────
// RENDERED SURFACES (2026-09-21)
//
// The composer stored cards correctly, but eleven places that print post text
// printed the storage markup instead: comments and replies on the feed and on
// social pages, the social page post body, pinned strip, Top Post card and
// check-in badge, the public club page, the feed search results, the share
// sheet preview, the Club Arena messenger card, and the text sent to X,
// WhatsApp and SMS. Each is rendered here from its real source file (see
// social-poker-card-harness.mjs) and must show Club Arena artwork, never
// "[[sp-card:", and never half a token where a snippet is cut.
// ─────────────────────────────────────────────────────────────────────────
const HAND = 'Hand [[sp-card:As]][[sp-card:Td]] | Board [[sp-card:Kh]][[sp-card:7c]][[sp-card:2s]]';
const HAND_ART = ['spades_a', 'diamonds_10', 'hearts_k', 'clubs_7', 'spades_2'];
const HAND_WORDS = 'Hand: Ace of spades, 10 of diamonds | Board: King of hearts, 7 of clubs, 2 of spades';
// Text whose plain slice(0, limit) ends inside the card token, at "[[sp-card".
const cutInside = (limit, card) => `${'x'.repeat(limit - 10)} ${card} and more words after the card`;
// An edit that repeated a card and deleted into the last token.
const BROKEN_EDIT = 'nice hand\nHand [[sp-card:As]][[sp-card:As]][[sp-card:Kd]] | Board [[sp-card:Kd]][[sp-card:Q';
const EDIT_SAVED = 'nice hand\nHand [[sp-card:As]][[sp-card:Kd]]';
const noMarkup = (text, where) => assert.doesNotMatch(text, /sp-card/, `${where} shows card storage markup`);
const noop = () => {};

test('text that leaves the app reads the cards as words', () => {
  assert.equal(markup.readablePokerText(`nice pot\n${HAND}`), `nice pot\n${HAND_WORDS}`);
  assert.equal(
    markup.readablePokerText('I had [[sp-card:As]] [[sp-card:Kd]] and won'),
    'I had Ace of spades, King of diamonds and won'
  );
  assert.equal(markup.readablePokerText('Board [[sp-card:Tc]]'), 'Board: 10 of clubs');
  assert.equal(markup.readablePokerText('Bluff? [[sp-card:1s]] [[sp-card:AZ]]'), 'Bluff? [[sp-card:1s]] [[sp-card:AZ]]');
  assert.equal(markup.readablePokerText(null), '');
  // With a limit the cut falls in the text or between whole cards: the result is
  // always the longest such prefix, never "[[sp-card:" and never "Ace of sp".
  const full = markup.readablePokerText(`gg ${HAND}`);
  assert.equal(full, `gg ${HAND_WORDS}`);
  const cardEnds = [...full.matchAll(/(?:Ace|King|Queen|Jack|10|[2-9]) of (?:spades|hearts|diamonds|clubs)/g)]
    .map((match) => match.index + match[0].length);
  const cuts = [0, 1, 2, 3, ...cardEnds];
  for (let limit = 0; limit <= full.length + 1; limit += 1) {
    const expected = full.slice(0, Math.max(...cuts.filter((cut) => cut <= limit)));
    assert.equal(markup.readablePokerText(`gg ${HAND}`, limit), expected, `cut at ${limit}`);
  }
});

test('a card whose WebP and PNG both fail still reads 10, not T', () => {
  const { module } = loadSurface('src/components/social/PokerCardText.jsx', { state: { fallback: 2 } });
  const ten = render(module.PokerCardImage({ rank: 'T', suit: 'h' }));
  assert.match(ten, /role="img" aria-label="Ten of hearts"/);
  assert.match(ten, />10h<\/span>$/);
  assert.match(render(module.PokerCardImage({ rank: 'A', suit: 's' })), />As<\/span>$/);
});

test('a snippet is cut between whole cards and still shows them as art', () => {
  const { module } = loadSurface('src/components/social/PokerCardText.jsx');
  const text = 'ab [[sp-card:As]]c[[sp-card:Td]][[sp-card:Kh]] de';
  for (let maxLength = 1; maxLength <= 11; maxLength += 1) {
    const cut = markup.truncatePokerText(text, maxLength);
    const html = render(React.createElement(module.PokerCardSnippet, { text, maxLength }));
    noMarkup(html, `snippet of ${maxLength}`);
    assert.equal(cardImages(html).length, (cut.text.match(/\[\[sp-card:/g) || []).length, `cards at ${maxLength}`);
    assert.equal(html.endsWith('...'), cut.truncated, `ellipsis at ${maxLength}`);
  }
});

test('an edit is normalized before it is stored', () => {
  const normalize = markup.normalizePokerPostContent;
  assert.equal(normalize(`nice pot\n${HAND}`), `nice pot\n${HAND}`);
  assert.equal(normalize(BROKEN_EDIT), EDIT_SAVED);
  assert.equal(normalize('Hand [[sp-card:As]] | Board [[sp-card:As]][[sp-card:Kd]]'), 'Hand [[sp-card:As]] | Board [[sp-card:Kd]]');
  assert.equal(
    normalize('gg\nHand[[sp-card:As]] [[sp-card:Kd]]|Board [[sp-card:Qh]]'),
    'gg\nHand [[sp-card:As]][[sp-card:Kd]] | Board [[sp-card:Qh]]'
  );
  const sevenHoleCards = '2345678'.split('').map((rank) => `[[sp-card:${rank}h]]`).join('');
  assert.equal(normalize(`Hand ${sevenHoleCards}`), `Hand ${sevenHoleCards.slice(0, -'[[sp-card:8h]]'.length)}`);
  assert.equal(normalize('Checked in at Hard Rock Tampa - Hand [[sp-card:A'), 'Checked in at Hard Rock Tampa');
  // Only the composer's own card line is rebuilt: "Hand" in the middle of a sentence is words.
  assert.equal(normalize('Great Hand [[sp-card:A'), 'Great Hand');
  assert.equal(normalize('great [[sp-card:1s]] hand [[sp-card:As]] ok'), 'great hand [[sp-card:As]] ok');
  assert.equal(normalize('Hand of the night - Board meeting at 5'), 'Hand of the night - Board meeting at 5');
  assert.equal(normalize('Hand [[sp-card:A'), '');
  for (const text of [BROKEN_EDIT, `nice pot\n${HAND}`, 'gg\nHand [[sp-card:As][[sp-card:Kd]]']) {
    assert.equal(normalize(normalize(text)), normalize(text), `idempotent for ${JSON.stringify(text)}`);
  }
});

test('the check-in badge reads the words of a post, not its card markup', () => {
  const strip = markup.stripPokerCardMarkup;
  assert.equal(strip(`Checked in at Hard Rock Tampa - ${HAND}`), 'Checked in at Hard Rock Tampa');
  assert.equal(strip(`Checked in at Hard Rock Tampa - fun night\n${HAND}`), 'Checked in at Hard Rock Tampa - fun night');
  assert.equal(strip('Checked in at Hard Rock Tampa - Tampa, FL'), 'Checked in at Hard Rock Tampa - Tampa, FL');
  assert.equal(strip('Checked in at Hard Rock Tampa - won with [[sp-card:As]] again'), 'Checked in at Hard Rock Tampa - won with again');
});

// ── Social pages (pages/hub/social-pages/[pageId].js), which host the composer ──
const PAGE_FILE = 'pages/hub/social-pages/[pageId].js';
const PAGE_EXPOSE = ['PostCard', 'SocialPageDetail'];
const pagePost = (content) => ({
  id: 'p1', content, author_id: 'u2', author: { full_name: 'Dan' },
  like_count: 0, comment_count: 2, created_at: '2026-09-21T12:00:00Z', media_urls: [],
});
const pageCardProps = (post, overrides = {}) => ({
  post, user: { id: 'u1', user_metadata: {} }, page: { id: 'pg', name: 'Hard Rock', slug: 'hard-rock' },
  isPageOwner: false, onLike: noop, onComment: noop, onDelete: noop, onPin: noop, onEdit: noop, onDeleteComment: noop,
  ...overrides,
});

test('social pages: a post, its comments and their replies show the Club Arena cards', () => {
  const comments = [
    { id: 'c1', content: `top ${HAND} @amy`, parent_id: null, user_id: 'u3', author: { full_name: 'Amy' } },
    { id: 'c2', content: 'reply [[sp-card:Qh]] @dan.b', parent_id: 'c1', user_id: 'u4', author: { full_name: 'Bo' } },
  ];
  const { exposed } = loadSurface(PAGE_FILE, { expose: PAGE_EXPOSE, state: { showComments: true, comments } });
  const html = render(exposed.PostCard(pageCardProps(pagePost(`nice pot @dan.b\n${HAND}`))));
  noMarkup(html, 'social page post card');
  assert.deepEqual(cardImages(html), [...HAND_ART, ...HAND_ART, 'hearts_q']);
  assert.match(html, /href="\/hub\/user\/amy"/, 'a comment @mention still links');
  assert.match(html, /href="\/hub\/user\/dan\.b"/, 'a reply @mention still links');
});

test('social pages: See More never cuts a card in half', () => {
  const { exposed } = loadSurface(PAGE_FILE, { expose: PAGE_EXPOSE });
  const html = render(exposed.PostCard(pageCardProps(pagePost(cutInside(300, '[[sp-card:As]]')))));
  noMarkup(html, 'social page See More');
  assert.deepEqual(cardImages(html), ['spades_a']);
  assert.match(html, /See More/);
});

test('social pages: a cards-only check-in badge names the venue and leaves the cards to the post', () => {
  const { exposed } = loadSurface(PAGE_FILE, { expose: PAGE_EXPOSE });
  const html = render(exposed.PostCard(pageCardProps(pagePost(`Checked in at Hard Rock Tampa - ${HAND}`))));
  noMarkup(html, 'social page check-in badge');
  assert.match(html, />Hard Rock Tampa<\/div>/);
  assert.deepEqual(cardImages(html), HAND_ART);
});

test('social pages: the X, WhatsApp and SMS links carry the cards as words', () => {
  const sheet = loadSurface(PAGE_FILE, { expose: PAGE_EXPOSE, state: { showShareModal: true } });
  const links = elements(sheet.exposed.PostCard(pageCardProps(pagePost(`nice pot\n${HAND}`))))
    .filter((element) => element.type === 'a')
    .map((element) => decodeURIComponent(element.props.href));
  const x = links.find((link) => link.startsWith('https://twitter.com/'));
  const whatsapp = links.find((link) => link.startsWith('https://wa.me/'));
  const sms = links.find((link) => link.startsWith('sms:'));
  for (const link of [x, whatsapp, sms]) noMarkup(link, link.split('?')[0]);
  assert.ok(x.endsWith(`&text=nice pot\n${HAND_WORDS}`), x);
  assert.ok(whatsapp.startsWith(`https://wa.me/?text=nice pot\n${HAND_WORDS} `), whatsapp);
  // SMS keeps 80 characters: it stops before a card that would not fit whole.
  assert.equal(sms, 'sms:?body=nice pot\nHand: Ace of spades, 10 of diamonds | Board: King of hearts, 7 of clubs ');
});

test('social pages: Share To My Feed stores the post text without cutting a card in half', async () => {
  const feed = loadSurface(PAGE_FILE, { expose: PAGE_EXPOSE, state: { showShareModal: true } });
  const tree = feed.exposed.PostCard(pageCardProps(pagePost(cutInside(200, '[[sp-card:Qd]]'))));
  await elements(tree).find((element) => element.type === 'button' && textOf(element).includes('Share To My Feed')).props.onClick();
  const shared = feed.fetchCalls.find((call) => call.init.method === 'POST' && call.url === '/api/social/pages/posts');
  assert.equal(shared.body.content, `Shared from Hard Rock: ${'x'.repeat(190)} [[sp-card:Qd]] and mor\n\n`);
});

test('social pages: an edited post is saved with its card line rebuilt, never a broken token', async () => {
  const saved = [];
  const surface = loadSurface(PAGE_FILE, { expose: PAGE_EXPOSE, state: { editing: true, editContent: BROKEN_EDIT } });
  const tree = surface.exposed.PostCard(pageCardProps(pagePost('nice hand'), { onEdit: (id, content) => saved.push(content) }));
  await elements(tree).find((element) => element.type === 'button' && textOf(element) === 'Save').props.onClick();
  const put = surface.fetchCalls.find((call) => call.init.method === 'PUT');
  assert.equal(put.body.content, EDIT_SAVED);
  assert.deepEqual(saved, [EDIT_SAVED]);
});

// The whole page, loaded and past its skeleton, as its owner sees it.
const socialPageTree = () => {
  const posts = [{
    id: 'pp1', content: `pinned ${HAND}`, is_pinned: true, like_count: 3, comment_count: 1,
    created_at: '2026-09-21T12:00:00Z', media_urls: [], author: { full_name: 'Dan' },
  }];
  const page = { id: 'pg', name: 'Hard Rock', slug: 'hard-rock', follower_count: 3, page_type: 'venue' };
  const { exposed } = loadSurface(PAGE_FILE, {
    expose: PAGE_EXPOSE,
    state: { loading: false, userRole: 'owner', activeTab: 'posts', posts, page },
  });
  return exposed.SocialPageDetail();
};

test('social pages: the pinned strip shows cards, not markup', () => {
  const pinned = render(elements(socialPageTree()).find((element) => element.key === 'pp1' && element.props.role === 'button'));
  noMarkup(pinned, 'pinned strip');
  assert.deepEqual(cardImages(pinned), HAND_ART);
});

test('social pages: the owner Top Post card shows cards, not markup', () => {
  const topPost = render(elements(socialPageTree()).find((element) => element.type === 'div' && /^Top Post/.test(textOf(element))));
  noMarkup(topPost, 'Top Post card');
  assert.deepEqual(cardImages(topPost), HAND_ART);
});

test('public club page: a venue post shows the Club Arena cards', () => {
  const { exposed } = loadSurface('pages/club/[id].js', { expose: ['PostCard'] });
  const post = { id: 'v1', content: `High hand tonight\n${HAND}`, author_name: 'Hard Rock', created_at: '2026-09-21T12:00:00Z', image_urls: [] };
  const html = render(exposed.PostCard({ post, onLike: noop, onComment: noop, isLiked: false, onShare: noop }));
  noMarkup(html, 'public club page');
  assert.deepEqual(cardImages(html), HAND_ART);
});

// ── Main feed (pages/hub/social-media/index.js) ──
const FEED_FILE = 'pages/hub/social-media/index.js';
const FEED_EXPOSE = ['PostCard', 'SocialMediaPage'];
const feedPost = (content, authorId = 'u2') => ({
  id: 'f1', content, authorId, author: { name: 'Dan', username: 'dan' },
  likeCount: 0, commentCount: 2, contentType: 'text', mediaUrls: [],
});
const feedCardProps = (post) => ({ post, currentUserId: 'u1', onLike: noop, onDelete: noop, onComment: noop });

test('main feed: comments and replies show cards and keep their @mentions', () => {
  const comments = [
    { id: 'c1', text: `top ${HAND} @amy`, parentId: null, authorName: 'Amy' },
    { id: 'c2', text: 'reply [[sp-card:Qh]] @dan.b', parentId: 'c1', authorName: 'Bo' },
  ];
  const { exposed } = loadSurface(FEED_FILE, { expose: FEED_EXPOSE, state: { showComments: true, comments } });
  const html = render(exposed.PostCard(feedCardProps(feedPost('plain post'))));
  noMarkup(html, 'main feed comments');
  assert.deepEqual(cardImages(html), [...HAND_ART, 'hearts_q']);
  assert.match(html, /href="\/hub\/user\/amy"/, 'a comment @mention still links');
  assert.match(html, /href="\/hub\/user\/dan\.b"/, 'a reply @mention still links');
});

test('main feed: a cards-only check-in badge names the venue and leaves the cards to the post', () => {
  const { exposed } = loadSurface(FEED_FILE, { expose: FEED_EXPOSE });
  const html = render(exposed.PostCard(feedCardProps(feedPost(`Checked in at Hard Rock Tampa - ${HAND}`))));
  noMarkup(html, 'main feed check-in badge');
  assert.match(html, />Hard Rock Tampa<\/div>/);
  assert.deepEqual(cardImages(html), HAND_ART);
});

test('main feed: an inline edit is saved with its card line rebuilt, never a broken token', async () => {
  const updates = [];
  const query = { eq: () => query, error: null };
  const supabase = { from: () => ({ update: (row) => { updates.push(row); return query; } }) };
  const surface = loadSurface(FEED_FILE, {
    expose: FEED_EXPOSE,
    mocks: { '../../../src/lib/supabase': { supabase } },
    state: { editing: true, editContent: BROKEN_EDIT },
  });
  const tree = surface.exposed.PostCard(feedCardProps(feedPost('nice hand', 'u1')));
  await elements(tree).find((element) => element.type === 'button' && textOf(element) === 'Save').props.onClick();
  assert.deepEqual(updates, [{ content: EDIT_SAVED }]);
  assert.equal(surface.state.get('displayContent'), EDIT_SAVED);
});

test('main feed: a search result snippet shows cards and never cuts one in half', () => {
  const store = new Proxy({ showGlobalSearch: true }, { get: (target, key) => (key in target ? target[key] : inert()) });
  const hit = { id: 's1', content: cutInside(100, '[[sp-card:Kh]]'), author: { username: 'dan' } };
  const { exposed } = loadSurface(FEED_FILE, {
    expose: FEED_EXPOSE,
    mocks: { '../../../src/stores/socialStore': { useSocialStore: (select) => select(store) } },
    state: { loading: false, globalSearchQuery: 'pot', globalSearchResults: { users: [], posts: [hit] } },
  });
  const html = render(elements(exposed.SocialMediaPage()).find((element) => element.key === 's1'));
  noMarkup(html, 'main feed search result');
  assert.deepEqual(cardImages(html), ['hearts_k']);
  assert.match(html, /\.\.\.<\/div><\/div>$/);
});

// ── Share sheet, messenger card and the edit modal ──
const SHARE_FILE = 'src/components/social/SharePostModal.jsx';
const sharedPost = (content) => ({ id: 'p1', content, author: { name: 'Dan', username: 'dan' }, mediaUrls: [] });
const shareProps = (post) => ({ post, authorUsername: 'dan', currentUser: { id: 'u1' }, onClose: noop, onShared: noop });

test('share sheet: the post preview shows cards and never cuts one in half', () => {
  const { module } = loadSurface(SHARE_FILE);
  const html = render(module.default(shareProps(sharedPost(cutInside(200, '[[sp-card:Qd]]')))));
  noMarkup(html, 'share sheet preview');
  assert.deepEqual(cardImages(html), ['diamonds_q']);
});

test('share sheet: X and WhatsApp carry the cards as words', async () => {
  const opened = [];
  const window = { open: (url) => opened.push(decodeURIComponent(url)), location: { origin: 'https://smarter.poker' } };
  const surface = loadSurface(SHARE_FILE, { state: { tab: 'external' }, globals: { window } });
  const tree = surface.module.default(shareProps(sharedPost(`nice pot\n${HAND}`)));
  for (const id of ['twitter', 'whatsapp']) {
    await elements(tree).find((element) => element.type === 'button' && element.key === id).props.onClick();
  }
  assert.deepEqual(opened, [
    `https://twitter.com/intent/tweet?url=https://smarter.poker/hub/post/p1&text=nice pot\n${HAND_WORDS}`,
    `https://wa.me/?text=nice pot\n${HAND_WORDS} https://smarter.poker/hub/post/p1`,
  ]);
});

test('share sheet: the chat preview description carries the cards as words', () => {
  const { exposed } = loadSurface(SHARE_FILE, { expose: ['buildRichSharePayload'] });
  const url = 'https://smarter.poker/hub/post/p1';
  const preview = (content) => exposed.buildRichSharePayload(sharedPost(content), url, '').media_metadata.preview_description;
  assert.equal(preview(`nice pot\n${HAND}`), `nice pot\n${HAND_WORDS}`);
  // 280 characters: the words stop before a card that would not fit whole.
  assert.equal(preview(`${'x'.repeat(265)} ${HAND}`), `${'x'.repeat(265)} `);
});

const MESSENGER_CARD = 'src/components/social/SharedPostCard.jsx';

test('messenger shared post card: the snippet shows cards and never cuts one in half', () => {
  const fetched = loadSurface(MESSENGER_CARD, {
    state: { loading: false, post: { id: 'p1', content: cutInside(160, '[[sp-card:Jc]]'), media_urls: [] } },
  });
  const html = render(fetched.module.default({ postId: 'p1', isOwn: false }));
  noMarkup(html, 'messenger shared post card');
  assert.deepEqual(cardImages(html), ['clubs_j']);
  assert.ok(html.includes(`${String.fromCharCode(0x2026)}</div>`), 'a cut snippet ends in an ellipsis');
});

test('messenger shared post card: a stored preview description still becomes art, not markup', () => {
  const rich = render(loadSurface(MESSENGER_CARD).module.default({
    postId: 'p1', isOwn: false,
    mediaMetadata: { preview_title: 'Dan on Smarter.Poker', preview_description: `nice pot ${HAND}` },
  }));
  noMarkup(rich, 'messenger rich preview');
  assert.deepEqual(cardImages(rich), HAND_ART);
});

test('edit post modal: a save rebuilds the card line and never stores a broken token', async () => {
  const updates = [];
  const saved = [];
  const supabase = {
    from: () => ({
      update: (row) => {
        updates.push(row);
        return { eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: 'p1' }, error: null }) }) }) };
      },
    }),
  };
  const { module } = loadSurface('src/components/social/EditPostModal.jsx', { state: { content: BROKEN_EDIT } });
  const tree = module.default({ post: { id: 'p1', content: 'nice hand' }, onClose: noop, onSaved: (post) => saved.push(post.content), supabase });
  await elements(tree).find((element) => element.type === 'button' && textOf(element) === 'Save').props.onClick();
  assert.equal(updates.length, 1);
  assert.equal(updates[0].content, EDIT_SAVED);
  assert.deepEqual(saved, [EDIT_SAVED]);
});
