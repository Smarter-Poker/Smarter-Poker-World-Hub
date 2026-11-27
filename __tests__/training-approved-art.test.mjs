import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const importSource = (relativePath) => import(`data:text/javascript;base64,${Buffer.from(readFileSync(join(ROOT, relativePath), 'utf8')).toString('base64')}`);
const { TRAINING_LIBRARY } = await importSource('src/data/TRAINING_LIBRARY.js');
const {
  TRAINING_ART, getTrainingArt, getTrainingArtCardLayout,
  sortTrainingArtCards, getTrainingArenaCardSrc,
} = await importSource('src/data/TRAINING_ART.js');

test('the maintained artwork metadata covers all 107 canonical game IDs exactly once', () => {
  const expected = TRAINING_LIBRARY.map(({ id }) => id).sort();
  assert.equal(expected.length, 107);
  assert.equal(new Set(expected).size, 107);
  assert.deepEqual(Object.keys(TRAINING_ART).sort(), expected);
  assert.equal(new Set(Object.values(TRAINING_ART).map(({ subject }) => subject)).size, 107,
    'each game needs its own maintained subject description');
  for (const id of expected) {
    const art = getTrainingArt(id);
    assert.equal(art.id, id);
    assert.ok(art.subject.length > 40, `${id} needs a meaningful game-cover description`);
    assert.ok(Object.isFrozen(art) && Object.isFrozen(art.cards));
    assert.ok([0, 2, 3, 5].includes(art.cards.length), `${id} has an unsupported illustrative hand size`);
    assert.equal(new Set(art.cards).size, art.cards.length, `${id} repeats a card`);
    assert.ok(['none', 'left', 'center', 'right'].includes(art.placement));
    assert.equal(art.cards.length === 0, art.placement === 'none');
  }
});

test('illustrative cards always put the highest rank on the left without mutating the input', () => {
  const input = ['Qh', '2d', 'Ks', 'Tc', 'Ac', 'Js'];
  const original = [...input];
  assert.deepEqual(sortTrainingArtCards(input), ['Ac', 'Ks', 'Qh', 'Js', 'Tc', '2d']);
  assert.deepEqual(input, original);
  assert.deepEqual(sortTrainingArtCards(['Qh', 'Ks']), ['Ks', 'Qh']);
  assert.deepEqual(sortTrainingArtCards(), []);
  const rankValue = { A: 14, K: 13, Q: 12, J: 11, T: 10, 9: 9, 8: 8, 7: 7, 6: 6, 5: 5, 4: 4, 3: 3, 2: 2 };
  for (const art of Object.values(TRAINING_ART)) {
    for (let i = 1; i < art.cards.length; i += 1) {
      assert.ok(rankValue[art.cards[i - 1][0]] >= rankValue[art.cards[i][0]], `${art.id} is not highest-first`);
    }
  }
});

test('native card routing uses only the actual Club Arena two-colour deck and its PNG fallback', () => {
  const examples = {
    As: 'spades_a', Ks: 'spades_k', Qh: 'hearts_q', Jd: 'diamonds_j',
    Tc: 'clubs_10', '7h': 'hearts_7', '2c': 'clubs_2',
  };
  for (const [card, filename] of Object.entries(examples)) {
    assert.equal(getTrainingArenaCardSrc(card), `/hub/club-arena/cards/2color/${filename}.webp`);
    assert.equal(getTrainingArenaCardSrc(card, 'png'), `/hub/club-arena/cards/2color/${filename}.png`);
  }
  for (const card of [null, undefined, '', '1s', 'AX', 'joker', '../cards/As', 'As.webp']) {
    assert.equal(getTrainingArenaCardSrc(card), null);
  }
  assert.equal(getTrainingArenaCardSrc('As', 'svg'), null);
  for (const art of Object.values(TRAINING_ART)) {
    for (const card of art.cards) assert.match(getTrainingArenaCardSrc(card), /^\/hub\/club-arena\/cards\/2color\/(clubs|diamonds|hearts|spades)_(?:[2-9]|10|j|q|k|a)\.webp$/);
  }
});

test('selective hands and board layouts fit within their artwork surfaces', () => {
  const withCards = Object.values(TRAINING_ART).filter(({ cards }) => cards.length);
  assert.ok(withCards.length > 0 && withCards.length < TRAINING_LIBRARY.length / 2,
    'native cards support selected game concepts instead of imposing one catalog template');
  for (const art of withCards) {
    const layout = getTrainingArtCardLayout(art);
    assert.ok(layout.width > 0 && layout.height > 0);
    assert.ok(layout.left - layout.width / 2 >= 0, `${art.id} overflows the left edge`);
    assert.ok(layout.left + layout.width / 2 <= 100, `${art.id} overflows the right edge`);
    assert.ok(layout.bottom >= 0 && layout.bottom + layout.height <= 100, `${art.id} overflows vertically`);
  }
  assert.equal(getTrainingArt('cash-012').cards.length, 5);
  assert.ok(getTrainingArtCardLayout(getTrainingArt('cash-012')).width >= 80,
    'the completed river board needs a readable full-width row');
  assert.deepEqual(getTrainingArt('cash-005').cards, [], 'the native overlay must not obscure the hero-call hand');
  assert.deepEqual(getTrainingArt('psy-001').cards, [], 'mental game artwork does not need an unrelated card pair');
  assert.equal(getTrainingArt('unknown').id, 'quiz-gauntlet');
});
