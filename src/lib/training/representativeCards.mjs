const CARD_RE = /^[2-9TJQKA][cdhs]$/i;
const HAND_CLASS_RE = /^([2-9TJQKA])([2-9TJQKA])([so])?$/i;

function excludedCardSet(value) {
  const cards = Array.isArray(value)
    ? value
    : String(value || '').match(/[2-9TJQKA][cdhs]/gi) || [];
  return new Set(cards.filter((card) => CARD_RE.test(String(card))).map((card) => String(card).toLowerCase()));
}

/**
 * Render one legal representative combo for an abstract hand class.
 *
 * This is presentation-only and never changes the question's strategy. It is
 * appropriate for a preflop chart whose source decision is keyed by a class
 * such as AKs, but returns null rather than displaying a blocked or unrelated
 * combo when the supplied board excludes every valid representative.
 */
export function handNotationToRepresentativeCards(notation, excludedCards = []) {
  const value = String(notation || '').replace(/\s+/g, '');
  const excluded = excludedCardSet(excludedCards);
  const available = (rank, suit) => !excluded.has(`${rank}${suit}`.toLowerCase());

  if (value.length === 4) {
    const exact = [value.slice(0, 2), value.slice(2, 4)]
      .map((card) => `${card[0].toUpperCase()}${card[1].toLowerCase()}`);
    if (
      exact.every((card) => CARD_RE.test(card) && !excluded.has(card.toLowerCase()))
      && exact[0].toLowerCase() !== exact[1].toLowerCase()
    ) return exact;
    return null;
  }

  const match = value.match(HAND_CLASS_RE);
  if (!match) return null;
  const [, firstRank, secondRank, suffix = 'o'] = match;
  const r1 = firstRank.toUpperCase();
  const r2 = secondRank.toUpperCase();
  const suits = ['s', 'h', 'd', 'c'];

  if (r1 === r2) {
    const openSuits = suits.filter((suit) => available(r1, suit));
    return openSuits.length >= 2
      ? [`${r1}${openSuits[0]}`, `${r2}${openSuits[1]}`]
      : null;
  }
  if (suffix.toLowerCase() === 's') {
    const suit = suits.find((candidate) => available(r1, candidate) && available(r2, candidate));
    return suit ? [`${r1}${suit}`, `${r2}${suit}`] : null;
  }
  for (const firstSuit of suits) {
    if (!available(r1, firstSuit)) continue;
    for (const secondSuit of suits) {
      if (firstSuit !== secondSuit && available(r2, secondSuit)) {
        return [`${r1}${firstSuit}`, `${r2}${secondSuit}`];
      }
    }
  }
  return null;
}

export default handNotationToRepresentativeCards;
