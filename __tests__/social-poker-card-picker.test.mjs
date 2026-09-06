import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('the shared composer persists cards through every publishing path', () => {
  const source = read('src/components/social/SharedPostCreator.jsx');
  assert.match(source, /<PokerCardPicker/);
  assert.match(source, /initialMarkup=\{pokerCardsMarkup\}/);
  assert.match(source, /content:\s*\[content\?\.trim\(\), pokerCardsMarkup\]/);
  assert.match(source, /let finalContent = \[cleanContent, pokerCardsMarkup\]/);
  assert.match(source, /localStorage\.setItem\('sp-post-card-draft'/);
  assert.match(source, /localStorage\.removeItem\('sp-post-card-draft'/);
});

test('primary social surfaces render card tokens as cards', () => {
  const surfaces = [
    'src/components/social/SmarterPokerStyleCard.jsx',
    'src/components/social/SocialCard.jsx',
    'src/components/social/ClubPageDashboard.jsx',
    'src/components/social/ClubPagesView.jsx',
    'src/components/social/PublicGameBoard.jsx',
    'src/components/social/ChatWindow.jsx',
    'src/components/social/HashtagRenderer.jsx',
    'src/components/social/Stories.jsx',
  ];
  for (const file of surfaces) {
    const source = read(file);
    assert.match(source, /PokerCardText/, `${file} can leak raw card tokens`);
  }
});

test('picker forbids duplicates and respects hand and board limits', () => {
  const source = read('src/components/social/PokerCardPicker.jsx');
  assert.match(source, /allSelected\.some\(\(selected\) => sameCard\(selected, card\)\)/);
  assert.match(source, /hand\.length >= 6/);
  assert.match(source, /board\.length >= 5/);
  assert.match(source, /Each Card Uses The Club Arena Deck/);
});
