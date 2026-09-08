import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  assert.equal(markup.readablePokerText(text), 'Hand A\u2660K\u2665 | Board Q\u2666J\u26632\u2660');
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
// go through PokerCardText rather than reach the DOM as text.
const CARD_RENDERING_SURFACES = [
  'src/components/social/SmarterPokerStyleCard.jsx',
  'src/components/social/SocialCard.jsx',
  'src/components/social/ClubPageDashboard.jsx',
  'src/components/social/HashtagRenderer.jsx',
  'src/components/social/Stories.jsx',
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
});
