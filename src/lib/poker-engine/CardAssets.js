/**
 * CardAssets — Card image path helpers
 * 
 * Maps numeric card IDs (0-51) to PNG file paths in /public/cards/.
 * Convention: {suit}_{rank}.png (e.g. hearts_a.png, spades_10.png)
 */

const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k', 'a'];

/**
 * Get the image path for a card by its numeric ID.
 * Cards are indexed 0-51: suit = floor(id/13), rank = id%13
 * @param {number} cardId - 0–51
 * @returns {string} URL path like "/cards/hearts_a.png"
 */
function getCardImagePath(cardId) {
  if (cardId == null || cardId < 0 || cardId > 51) return '/cards/back.png';
  const suit = SUITS[Math.floor(cardId / 13)];
  const rank = RANKS[cardId % 13];
  return `/cards/${suit}_${rank}.png`;
}

/**
 * Get the card back image path.
 * @param {string} [style='default'] - Card back style name
 * @returns {string} URL path
 */
function getCardBackPath(style = 'default') {
  return `/cards/backs/${style}.png`;
}

/**
 * Generate a full map of card IDs → image paths.
 * @returns {Object<number, string>}
 */
function getAllCardPaths() {
  const paths = {};
  for (let i = 0; i < 52; i++) {
    paths[i] = getCardImagePath(i);
  }
  return paths;
}

/**
 * Card display name from ID (e.g. "A♠", "10♥").
 * @param {number} cardId - 0–51
 * @returns {string}
 */
function getCardName(cardId) {
  if (cardId == null || cardId < 0 || cardId > 51) return '??';
  const suitSymbols = ['♣', '♦', '♥', '♠'];
  const rankNames = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  return `${rankNames[cardId % 13]}${suitSymbols[Math.floor(cardId / 13)]}`;
}

module.exports = {
  SUITS,
  RANKS,
  getCardImagePath,
  getCardBackPath,
  getAllCardPaths,
  getCardName,
};
