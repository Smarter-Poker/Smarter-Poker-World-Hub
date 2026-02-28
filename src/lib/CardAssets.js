/**
 * Smarter.Poker - Core Poker Engine
 * Module: CardAssets
 * 
 * Maps engine card integers (0-51) to the custom-built card PNG assets
 * located in /public/cards/
 * 
 * Asset Naming Convention:
 *   Face cards: {suit}_{rank}.png
 *     Suits: clubs, diamonds, hearts, spades
 *     Ranks: 2, 3, 4, 5, 6, 7, 8, 9, 10, j, q, k, a
 *   
 *   Card backs: /images/card-backs/{color}.jpg
 *     Colors: black, blue, red, white
 * 
 * Card Dimensions: 150 x 210 px (RGBA PNG)
 */

const { getRank, getSuit, RANKS } = require('./Deck');

// ============ ASSET PATH CONFIGURATION ============

/**
 * Base paths for card assets (relative to /public/).
 * Adjust these if the asset locations change.
 */
const ASSET_CONFIG = {
  /** Path to card face images (from public root) */
  cardFacePath: '/cards',
  
  /** Path to optimized card face images */
  cardFaceOptimizedPath: '/cards/optimized',
  
  /** Path to card back images */
  cardBackPath: '/images/card-backs',
  
  /** Card dimensions in pixels */
  cardWidth: 150,
  cardHeight: 210,
  
  /** Aspect ratio (width / height) */
  aspectRatio: 150 / 210, // ~0.714
};

// ============ SUIT/RANK MAPPING TO FILENAMES ============

/**
 * Engine suit index → filename suit string
 * Engine: 0=clubs, 1=diamonds, 2=hearts, 3=spades
 */
const SUIT_TO_FILENAME = ['clubs', 'diamonds', 'hearts', 'spades'];

/**
 * Engine rank index → filename rank string
 * Engine: 0=2, 1=3, ..., 8=10, 9=J, 10=Q, 11=K, 12=A
 */
const RANK_TO_FILENAME = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k', 'a'];

// ============ CARD BACK OPTIONS ============

const CARD_BACKS = {
  BLACK: 'black',
  BLUE: 'blue',
  RED: 'red',
  WHITE: 'white',
};

const DEFAULT_CARD_BACK = CARD_BACKS.BLUE;

// ============ ASSET LOOKUP FUNCTIONS ============

/**
 * Get the filename for a card (without path).
 * @param {number} card - Card integer (0-51)
 * @returns {string} Filename like "hearts_a.png"
 */
function getCardFilename(card) {
  const suit = SUIT_TO_FILENAME[getSuit(card)];
  const rank = RANK_TO_FILENAME[getRank(card)];
  return `${suit}_${rank}.png`;
}

/**
 * Get the full asset path for a card face image.
 * @param {number} card - Card integer (0-51)
 * @param {Object} [options]
 * @param {boolean} [options.optimized=false] - Use optimized version
 * @param {string} [options.basePath=''] - Prefix path (e.g., '/public' or CDN URL)
 * @returns {string} Full path like "/cards/hearts_a.png"
 */
function getCardImagePath(card, options = {}) {
  const { optimized = false, basePath = '' } = options;
  const dir = optimized ? ASSET_CONFIG.cardFaceOptimizedPath : ASSET_CONFIG.cardFacePath;
  const filename = getCardFilename(card);
  return `${basePath}${dir}/${filename}`;
}

/**
 * Get the asset path for a card back image.
 * @param {string} [color='blue'] - Back color: 'black', 'blue', 'red', 'white'
 * @param {string} [basePath=''] - Prefix path
 * @returns {string} Full path like "/images/card-backs/blue.jpg"
 */
function getCardBackPath(color = DEFAULT_CARD_BACK, basePath = '') {
  if (!Object.values(CARD_BACKS).includes(color)) {
    color = DEFAULT_CARD_BACK;
  }
  return `${basePath}${ASSET_CONFIG.cardBackPath}/${color}.jpg`;
}

/**
 * Get image paths for multiple cards.
 * @param {number[]} cards - Array of card integers
 * @param {Object} [options] - Same as getCardImagePath options
 * @returns {string[]} Array of image paths
 */
function getCardImagePaths(cards, options = {}) {
  return cards.map(card => getCardImagePath(card, options));
}

/**
 * Build the complete asset map for all 52 cards.
 * Useful for preloading all card images at table join.
 * @param {Object} [options]
 * @param {boolean} [options.optimized=false]
 * @param {string} [options.basePath='']
 * @returns {Object} Map of card integer → image path
 */
function buildFullAssetMap(options = {}) {
  const map = {};
  for (let card = 0; card < 52; card++) {
    map[card] = getCardImagePath(card, options);
  }
  // Add card backs
  map.backs = {};
  for (const color of Object.values(CARD_BACKS)) {
    map.backs[color] = getCardBackPath(color, options.basePath || '');
  }
  return map;
}

/**
 * Generate a preload manifest for all card assets.
 * Use this to preload images when a player sits down at a table.
 * @param {Object} [options]
 * @param {boolean} [options.optimized=true] - Use optimized versions for preload
 * @param {string} [options.basePath='']
 * @param {string} [options.cardBack='blue'] - Which card back to preload
 * @returns {string[]} Array of all image URLs to preload
 */
function getPreloadManifest(options = {}) {
  const { optimized = true, basePath = '', cardBack = DEFAULT_CARD_BACK } = options;
  
  const urls = [];
  
  // All 52 card faces
  for (let card = 0; card < 52; card++) {
    urls.push(getCardImagePath(card, { optimized, basePath }));
  }
  
  // Card back
  urls.push(getCardBackPath(cardBack, basePath));
  
  return urls;
}

/**
 * React/Next.js Image component helper.
 * Returns props suitable for <Image> or <img> elements.
 * @param {number|null} card - Card integer, or null for face-down
 * @param {Object} [options]
 * @param {boolean} [options.optimized=false]
 * @param {string} [options.cardBack='blue']
 * @param {number} [options.scale=1] - Scale factor for dimensions
 * @returns {{ src: string, width: number, height: number, alt: string }}
 */
function getCardImageProps(card, options = {}) {
  const { optimized = false, cardBack = DEFAULT_CARD_BACK, scale = 1 } = options;
  const { cardToDisplay, cardToFullName } = require('./Deck');
  
  if (card === null || card === undefined) {
    return {
      src: getCardBackPath(cardBack),
      width: Math.round(ASSET_CONFIG.cardWidth * scale),
      height: Math.round(ASSET_CONFIG.cardHeight * scale),
      alt: 'Card (face down)',
    };
  }
  
  return {
    src: getCardImagePath(card, { optimized }),
    width: Math.round(ASSET_CONFIG.cardWidth * scale),
    height: Math.round(ASSET_CONFIG.cardHeight * scale),
    alt: cardToFullName(card),
  };
}

/**
 * Validate that all expected card assets exist at the given paths.
 * Useful for build-time or startup checks.
 * @param {string} publicDir - Absolute path to the public directory
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateAssets(publicDir) {
  const fs = require('fs');
  const path = require('path');
  const missing = [];
  
  // Check all 52 card faces
  for (let card = 0; card < 52; card++) {
    const filePath = path.join(publicDir, getCardImagePath(card));
    if (!fs.existsSync(filePath)) {
      missing.push(filePath);
    }
  }
  
  // Check optimized versions
  for (let card = 0; card < 52; card++) {
    const filePath = path.join(publicDir, getCardImagePath(card, { optimized: true }));
    if (!fs.existsSync(filePath)) {
      missing.push(filePath);
    }
  }
  
  // Check card backs
  for (const color of Object.values(CARD_BACKS)) {
    const filePath = path.join(publicDir, getCardBackPath(color));
    if (!fs.existsSync(filePath)) {
      missing.push(filePath);
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
    totalExpected: 52 + 52 + 4, // faces + optimized + backs
    found: (52 + 52 + 4) - missing.length,
  };
}

// ============ EXPORTS ============

module.exports = {
  // Configuration
  ASSET_CONFIG,
  CARD_BACKS,
  DEFAULT_CARD_BACK,
  SUIT_TO_FILENAME,
  RANK_TO_FILENAME,
  
  // Core lookups
  getCardFilename,
  getCardImagePath,
  getCardBackPath,
  getCardImagePaths,
  
  // Bulk operations
  buildFullAssetMap,
  getPreloadManifest,
  
  // UI helpers
  getCardImageProps,
  
  // Validation
  validateAssets,
};
