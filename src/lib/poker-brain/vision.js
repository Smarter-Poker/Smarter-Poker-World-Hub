/**
 * CardDetectionEngine - Real-time Playing Card Detection for Online Poker
 *
 * A TensorFlow.js-powered vision engine for detecting playing cards, pot sizes,
 * and game state from online poker client screenshots. Runs entirely on-device
 * with color-based fallback detection and optional YOLO model integration.
 */

// ============================================================================
// RANK CHARACTER TEMPLATES (7x10 pixel bitmaps)
// ============================================================================

const RANK_TEMPLATES = {
  'A': [
    [0, 0, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 0],
    [1, 1, 0, 0, 0, 1, 1],
    [1, 1, 1, 1, 1, 1, 1],
    [1, 1, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 0, 1, 1],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
  ],
  'K': [
    [1, 1, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 1, 1, 0],
    [1, 1, 0, 1, 1, 0, 0],
    [1, 1, 1, 1, 0, 0, 0],
    [1, 1, 1, 1, 0, 0, 0],
    [1, 1, 0, 1, 1, 0, 0],
    [1, 1, 0, 0, 1, 1, 0],
    [1, 1, 0, 0, 0, 1, 1],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
  ],
  'Q': [
    [0, 1, 1, 1, 1, 1, 0],
    [1, 1, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 1, 1, 1],
    [0, 1, 1, 1, 1, 0, 1],
    [0, 0, 0, 0, 0, 0, 1],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
  ],
  'J': [
    [0, 0, 0, 1, 1, 1, 1],
    [0, 0, 0, 0, 1, 1, 0],
    [0, 0, 0, 0, 1, 1, 0],
    [0, 0, 0, 0, 1, 1, 0],
    [1, 1, 0, 0, 1, 1, 0],
    [1, 1, 0, 0, 1, 1, 0],
    [1, 1, 0, 0, 1, 1, 0],
    [0, 1, 1, 1, 1, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
  ],
  'T': [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 1, 1, 0, 0],
    [0, 0, 0, 1, 1, 0, 0],
    [0, 0, 0, 1, 1, 0, 0],
    [0, 0, 0, 1, 1, 0, 0],
    [0, 0, 0, 1, 1, 0, 0],
    [0, 0, 0, 1, 1, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
  ],
  '9': [
    [0, 1, 1, 1, 1, 1, 0],
    [1, 1, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 0, 1, 1],
    [1, 1, 1, 1, 1, 1, 1],
    [0, 1, 0, 0, 0, 1, 1],
    [0, 0, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 0, 1, 1],
    [0, 1, 1, 1, 1, 1, 0],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
  ],
  '8': [
    [0, 1, 1, 1, 1, 1, 0],
    [1, 1, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 0, 1, 1],
    [0, 1, 1, 1, 1, 1, 0],
    [1, 1, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 0, 1, 1],
    [0, 1, 1, 1, 1, 1, 0],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
  ],
  '7': [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 1, 1],
    [0, 0, 0, 0, 1, 1, 0],
    [0, 0, 0, 1, 1, 0, 0],
    [0, 0, 1, 1, 0, 0, 0],
    [0, 1, 1, 0, 0, 0, 0],
    [1, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
  ],
  '6': [
    [0, 0, 1, 1, 1, 1, 0],
    [0, 1, 1, 0, 0, 0, 0],
    [1, 1, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 0],
    [1, 1, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 0, 1, 1],
    [0, 1, 1, 1, 1, 1, 0],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
  ],
  '5': [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1],
    [1, 1, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 0],
    [0, 0, 0, 0, 0, 1, 1],
    [0, 0, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 0, 1, 1],
    [0, 1, 1, 1, 1, 1, 0],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
  ],
  '4': [
    [1, 1, 0, 0, 1, 1, 0],
    [1, 1, 0, 0, 1, 1, 0],
    [1, 1, 0, 0, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 1, 1, 0],
    [0, 0, 0, 0, 1, 1, 0],
    [0, 0, 0, 0, 1, 1, 0],
    [0, 0, 0, 0, 1, 1, 0],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
  ],
  '3': [
    [0, 1, 1, 1, 1, 1, 0],
    [1, 1, 0, 0, 0, 1, 1],
    [0, 0, 0, 0, 0, 1, 1],
    [0, 0, 1, 1, 1, 1, 0],
    [0, 0, 0, 0, 0, 1, 1],
    [0, 0, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 0, 1, 1],
    [0, 1, 1, 1, 1, 1, 0],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
  ],
  '2': [
    [0, 1, 1, 1, 1, 1, 0],
    [1, 1, 0, 0, 0, 1, 1],
    [0, 0, 0, 0, 0, 1, 1],
    [0, 0, 0, 0, 1, 1, 0],
    [0, 0, 0, 1, 1, 0, 0],
    [0, 0, 1, 1, 0, 0, 0],
    [0, 1, 1, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
  ],
};

// ============================================================================
// SUIT SHAPE TEMPLATES (distinguish hearts/diamonds and spades/clubs)
// ============================================================================

const SUIT_TEMPLATES = {
  'h': { // heart - rounder, wider at top
    pattern: [
      [1, 1, 0, 0, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [0, 1, 1, 1, 1, 0],
      [0, 0, 1, 1, 0, 0],
      [0, 0, 0, 1, 0, 0],
    ],
    color: { r: 200, g: 0, b: 0 }, // red
  },
  'd': { // diamond - pointy top and bottom
    pattern: [
      [0, 0, 1, 1, 0, 0],
      [0, 1, 1, 1, 1, 0],
      [1, 1, 0, 0, 1, 1],
      [1, 1, 0, 0, 1, 1],
      [0, 1, 1, 1, 1, 0],
      [0, 0, 1, 1, 0, 0],
    ],
    color: { r: 200, g: 0, b: 0 }, // red
  },
  's': { // spade - pointy bottom
    pattern: [
      [0, 1, 1, 1, 1, 0],
      [1, 1, 0, 0, 1, 1],
      [1, 1, 0, 0, 1, 1],
      [0, 1, 1, 1, 1, 0],
      [0, 0, 1, 1, 0, 0],
      [0, 0, 1, 1, 0, 0],
    ],
    color: { r: 0, g: 0, b: 0 }, // black
  },
  'c': { // club - bumpy rounded
    pattern: [
      [0, 0, 1, 1, 0, 0],
      [0, 1, 1, 1, 1, 0],
      [1, 1, 1, 1, 1, 1],
      [0, 1, 1, 1, 1, 0],
      [0, 0, 1, 1, 0, 0],
      [0, 0, 1, 1, 0, 0],
    ],
    color: { r: 0, g: 0, b: 0 }, // black
  },
};

// ============================================================================
// POKER CLIENT PROFILES
// ============================================================================

export const CLIENT_PROFILES = {
  pokerstars: {
    name: 'PokerStars',
    description: 'PokerStars Standard Tables',
    holeCardRegions: [
      { x: 0.42, y: 0.72, w: 0.06, h: 0.10 },
      { x: 0.50, y: 0.72, w: 0.06, h: 0.10 },
    ],
    boardCardRegions: [
      { x: 0.30, y: 0.42, w: 0.06, h: 0.10 },
      { x: 0.38, y: 0.42, w: 0.06, h: 0.10 },
      { x: 0.46, y: 0.42, w: 0.06, h: 0.10 },
      { x: 0.54, y: 0.42, w: 0.06, h: 0.10 },
      { x: 0.62, y: 0.42, w: 0.06, h: 0.10 },
    ],
    playerPositions: [
      { x: 0.50, y: 0.85, label: 'button' },
      { x: 0.72, y: 0.65, label: 'sb' },
      { x: 0.84, y: 0.35, label: 'utg' },
      { x: 0.50, y: 0.05, label: 'co' },
      { x: 0.16, y: 0.35, label: 'mp' },
      { x: 0.28, y: 0.65, label: 'bb' },
    ],
    potRegion: { x: 0.40, y: 0.35, w: 0.20, h: 0.06 },
    betRegions: [
      { x: 0.50, y: 0.60, w: 0.12, h: 0.08 },
      { x: 0.72, y: 0.50, w: 0.12, h: 0.08 },
      { x: 0.84, y: 0.20, w: 0.12, h: 0.08 },
      { x: 0.50, y: 0.15, w: 0.12, h: 0.08 },
      { x: 0.16, y: 0.20, w: 0.12, h: 0.08 },
      { x: 0.28, y: 0.50, w: 0.12, h: 0.08 },
    ],
    cardBackgroundColor: { r: 255, g: 255, b: 255, tolerance: 40 },
    rankCharRegion: { x: 0.05, y: 0.05, w: 0.35, h: 0.25 },
    suitCharRegion: { x: 0.05, y: 0.30, w: 0.35, h: 0.25 },
  },
  ggpoker: {
    name: 'GGPoker',
    description: 'GGPoker Tables',
    holeCardRegions: [
      { x: 0.40, y: 0.75, w: 0.08, h: 0.12 },
      { x: 0.52, y: 0.75, w: 0.08, h: 0.12 },
    ],
    boardCardRegions: [
      { x: 0.25, y: 0.42, w: 0.08, h: 0.12 },
      { x: 0.37, y: 0.42, w: 0.08, h: 0.12 },
      { x: 0.49, y: 0.42, w: 0.08, h: 0.12 },
      { x: 0.61, y: 0.42, w: 0.08, h: 0.12 },
      { x: 0.73, y: 0.42, w: 0.08, h: 0.12 },
    ],
    playerPositions: [
      { x: 0.50, y: 0.88, label: 'button' },
      { x: 0.75, y: 0.65, label: 'sb' },
      { x: 0.88, y: 0.30, label: 'utg' },
      { x: 0.50, y: 0.02, label: 'co' },
      { x: 0.12, y: 0.30, label: 'mp' },
      { x: 0.25, y: 0.65, label: 'bb' },
    ],
    potRegion: { x: 0.38, y: 0.35, w: 0.24, h: 0.08 },
    betRegions: [
      { x: 0.50, y: 0.62, w: 0.14, h: 0.10 },
      { x: 0.75, y: 0.48, w: 0.14, h: 0.10 },
      { x: 0.88, y: 0.15, w: 0.10, h: 0.08 },
      { x: 0.50, y: 0.15, w: 0.14, h: 0.10 },
      { x: 0.12, y: 0.15, w: 0.10, h: 0.08 },
      { x: 0.25, y: 0.48, w: 0.14, h: 0.10 },
    ],
    cardBackgroundColor: { r: 255, g: 255, b: 255, tolerance: 45 },
    rankCharRegion: { x: 0.04, y: 0.06, w: 0.40, h: 0.28 },
    suitCharRegion: { x: 0.04, y: 0.32, w: 0.40, h: 0.28 },
  },
  wptonline: {
    name: 'WPT Online (BetRivers)',
    description: 'WPT Online Tables',
    holeCardRegions: [
      { x: 0.41, y: 0.70, w: 0.07, h: 0.11 },
      { x: 0.51, y: 0.70, w: 0.07, h: 0.11 },
    ],
    boardCardRegions: [
      { x: 0.28, y: 0.40, w: 0.07, h: 0.11 },
      { x: 0.38, y: 0.40, w: 0.07, h: 0.11 },
      { x: 0.48, y: 0.40, w: 0.07, h: 0.11 },
      { x: 0.58, y: 0.40, w: 0.07, h: 0.11 },
      { x: 0.68, y: 0.40, w: 0.07, h: 0.11 },
    ],
    playerPositions: [
      { x: 0.50, y: 0.82, label: 'button' },
      { x: 0.70, y: 0.60, label: 'sb' },
      { x: 0.82, y: 0.30, label: 'utg' },
      { x: 0.50, y: 0.08, label: 'co' },
      { x: 0.18, y: 0.30, label: 'mp' },
      { x: 0.30, y: 0.60, label: 'bb' },
    ],
    potRegion: { x: 0.38, y: 0.32, w: 0.24, h: 0.07 },
    betRegions: [
      { x: 0.50, y: 0.58, w: 0.12, h: 0.10 },
      { x: 0.70, y: 0.45, w: 0.12, h: 0.10 },
      { x: 0.82, y: 0.15, w: 0.12, h: 0.10 },
      { x: 0.50, y: 0.12, w: 0.12, h: 0.10 },
      { x: 0.18, y: 0.15, w: 0.12, h: 0.10 },
      { x: 0.30, y: 0.45, w: 0.12, h: 0.10 },
    ],
    cardBackgroundColor: { r: 255, g: 255, b: 255, tolerance: 40 },
    rankCharRegion: { x: 0.05, y: 0.05, w: 0.38, h: 0.26 },
    suitCharRegion: { x: 0.05, y: 0.31, w: 0.38, h: 0.26 },
  },
  partypoker: {
    name: 'partypoker',
    description: 'partypoker Tables',
    holeCardRegions: [
      { x: 0.43, y: 0.71, w: 0.06, h: 0.10 },
      { x: 0.51, y: 0.71, w: 0.06, h: 0.10 },
    ],
    boardCardRegions: [
      { x: 0.31, y: 0.41, w: 0.06, h: 0.10 },
      { x: 0.39, y: 0.41, w: 0.06, h: 0.10 },
      { x: 0.47, y: 0.41, w: 0.06, h: 0.10 },
      { x: 0.55, y: 0.41, w: 0.06, h: 0.10 },
      { x: 0.63, y: 0.41, w: 0.06, h: 0.10 },
    ],
    playerPositions: [
      { x: 0.50, y: 0.84, label: 'button' },
      { x: 0.71, y: 0.63, label: 'sb' },
      { x: 0.83, y: 0.32, label: 'utg' },
      { x: 0.50, y: 0.04, label: 'co' },
      { x: 0.17, y: 0.32, label: 'mp' },
      { x: 0.29, y: 0.63, label: 'bb' },
    ],
    potRegion: { x: 0.40, y: 0.35, w: 0.20, h: 0.06 },
    betRegions: [
      { x: 0.50, y: 0.59, w: 0.12, h: 0.08 },
      { x: 0.71, y: 0.48, w: 0.12, h: 0.08 },
      { x: 0.83, y: 0.18, w: 0.12, h: 0.08 },
      { x: 0.50, y: 0.13, w: 0.12, h: 0.08 },
      { x: 0.17, y: 0.18, w: 0.12, h: 0.08 },
      { x: 0.29, y: 0.48, w: 0.12, h: 0.08 },
    ],
    cardBackgroundColor: { r: 255, g: 255, b: 255, tolerance: 40 },
    rankCharRegion: { x: 0.05, y: 0.05, w: 0.35, h: 0.25 },
    suitCharRegion: { x: 0.05, y: 0.30, w: 0.35, h: 0.25 },
  },
  '888poker': {
    name: '888poker',
    description: '888poker Tables',
    holeCardRegions: [
      { x: 0.40, y: 0.73, w: 0.07, h: 0.11 },
      { x: 0.50, y: 0.73, w: 0.07, h: 0.11 },
    ],
    boardCardRegions: [
      { x: 0.27, y: 0.43, w: 0.07, h: 0.11 },
      { x: 0.37, y: 0.43, w: 0.07, h: 0.11 },
      { x: 0.47, y: 0.43, w: 0.07, h: 0.11 },
      { x: 0.57, y: 0.43, w: 0.07, h: 0.11 },
      { x: 0.67, y: 0.43, w: 0.07, h: 0.11 },
    ],
    playerPositions: [
      { x: 0.50, y: 0.85, label: 'button' },
      { x: 0.72, y: 0.64, label: 'sb' },
      { x: 0.84, y: 0.32, label: 'utg' },
      { x: 0.50, y: 0.06, label: 'co' },
      { x: 0.16, y: 0.32, label: 'mp' },
      { x: 0.28, y: 0.64, label: 'bb' },
    ],
    potRegion: { x: 0.38, y: 0.36, w: 0.24, h: 0.07 },
    betRegions: [
      { x: 0.50, y: 0.61, w: 0.12, h: 0.09 },
      { x: 0.72, y: 0.49, w: 0.12, h: 0.09 },
      { x: 0.84, y: 0.19, w: 0.12, h: 0.09 },
      { x: 0.50, y: 0.14, w: 0.12, h: 0.09 },
      { x: 0.16, y: 0.19, w: 0.12, h: 0.09 },
      { x: 0.28, y: 0.49, w: 0.12, h: 0.09 },
    ],
    cardBackgroundColor: { r: 255, g: 255, b: 255, tolerance: 40 },
    rankCharRegion: { x: 0.05, y: 0.06, w: 0.36, h: 0.26 },
    suitCharRegion: { x: 0.05, y: 0.32, w: 0.36, h: 0.26 },
  },
  generic: {
    name: 'Generic / Unknown Client',
    description: 'Fallback profile for unknown poker clients',
    holeCardRegions: [
      { x: 0.35, y: 0.70, w: 0.08, h: 0.12 },
      { x: 0.48, y: 0.70, w: 0.08, h: 0.12 },
    ],
    boardCardRegions: [
      { x: 0.20, y: 0.38, w: 0.08, h: 0.12 },
      { x: 0.33, y: 0.38, w: 0.08, h: 0.12 },
      { x: 0.46, y: 0.38, w: 0.08, h: 0.12 },
      { x: 0.59, y: 0.38, w: 0.08, h: 0.12 },
      { x: 0.72, y: 0.38, w: 0.08, h: 0.12 },
    ],
    playerPositions: [
      { x: 0.50, y: 0.86, label: 'button' },
      { x: 0.74, y: 0.66, label: 'sb' },
      { x: 0.86, y: 0.28, label: 'utg' },
      { x: 0.50, y: 0.02, label: 'co' },
      { x: 0.14, y: 0.28, label: 'mp' },
      { x: 0.26, y: 0.66, label: 'bb' },
    ],
    potRegion: { x: 0.38, y: 0.32, w: 0.24, h: 0.08 },
    betRegions: [
      { x: 0.50, y: 0.58, w: 0.14, h: 0.10 },
      { x: 0.74, y: 0.46, w: 0.14, h: 0.10 },
      { x: 0.86, y: 0.14, w: 0.12, h: 0.08 },
      { x: 0.50, y: 0.12, w: 0.14, h: 0.10 },
      { x: 0.14, y: 0.14, w: 0.12, h: 0.08 },
      { x: 0.26, y: 0.46, w: 0.14, h: 0.10 },
    ],
    cardBackgroundColor: { r: 255, g: 255, b: 255, tolerance: 50 },
    rankCharRegion: { x: 0.04, y: 0.04, w: 0.42, h: 0.30 },
    suitCharRegion: { x: 0.04, y: 0.34, w: 0.42, h: 0.30 },
  },
  custom: {
    name: 'Custom Profile',
    description: 'User-defined custom poker client profile',
    holeCardRegions: [
      { x: 0.42, y: 0.72, w: 0.06, h: 0.10 },
      { x: 0.50, y: 0.72, w: 0.06, h: 0.10 },
    ],
    boardCardRegions: [
      { x: 0.30, y: 0.42, w: 0.06, h: 0.10 },
      { x: 0.38, y: 0.42, w: 0.06, h: 0.10 },
      { x: 0.46, y: 0.42, w: 0.06, h: 0.10 },
      { x: 0.54, y: 0.42, w: 0.06, h: 0.10 },
      { x: 0.62, y: 0.42, w: 0.06, h: 0.10 },
    ],
    playerPositions: [],
    potRegion: null,
    betRegions: [],
    cardBackgroundColor: { r: 255, g: 255, b: 255, tolerance: 40 },
    rankCharRegion: { x: 0.05, y: 0.05, w: 0.35, h: 0.25 },
    suitCharRegion: { x: 0.05, y: 0.30, w: 0.35, h: 0.25 },
  },
};

// ============================================================================
// CARD DETECTION ENGINE
// ============================================================================

/**
 * CardDetectionEngine - Main vision engine for real-time card detection
 * Uses color-based detection as primary method with optional YOLO model fallback
 */
class CardDetectionEngine {
  constructor(options = {}) {
    this.options = {
      modelPath: options.modelPath || null,
      confidenceThreshold: options.confidenceThreshold || 0.65,
      nmsThreshold: options.nmsThreshold || 0.4,
      stabilityFrameThreshold: options.stabilityFrameThreshold || 3,
      maxFramesBuffer: options.maxFramesBuffer || 5,
      enableWorker: options.enableWorker !== false,
      debug: options.debug || false,
    };

    this.model = null;
    this.isInitialized = false;
    this.currentProfile = CLIENT_PROFILES.pokerstars;
    this.detectionHistory = [];
    this.worker = null;
    this.tf = null;

    // Color-based detection cache
    this.rankPixelCache = {};
    this.suitColorCache = {};
  }

  /**
   * Initialize the engine - loads YOLO model if available
   */
  async initialize() {
    try {
      // Check if TensorFlow.js is available globally
      if (typeof window !== 'undefined' && window.tf) {
        this.tf = window.tf;
      }

      // If a model path is provided, attempt to load it
      if (this.options.modelPath && this.tf) {
        try {
          this.model = await this.tf.loadLayersModel(this.options.modelPath);
          console.log('[CardDetectionEngine] YOLO model loaded successfully');
        } catch (err) {
          console.warn('[CardDetectionEngine] Failed to load model, using color-based detection:', err);
          this.model = null;
        }
      }

      // Initialize worker if enabled
      if (this.options.enableWorker && typeof window !== 'undefined') {
        this.worker = createVisionWorker();
      }

      this.isInitialized = true;
      console.log('[CardDetectionEngine] Initialized with profile:', this.currentProfile.name);
    } catch (err) {
      console.error('[CardDetectionEngine] Initialization error:', err);
      throw err;
    }
  }

  /**
   * Detect cards from a video frame
   */
  async detectFrame(videoElement) {
    const startTime = performance.now();

    try {
      // Create canvas and extract frame
      const canvas = this._videoToCanvas(videoElement);
      const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);

      let detectionResult = null;

      // Use model-based detection if available
      if (this.model && this.tf) {
        detectionResult = await this._detectWithModel(canvas);
      }

      // Fall back to color-based detection
      if (!detectionResult || !detectionResult.holeCards || detectionResult.holeCards.length === 0) {
        detectionResult = this._detectWithColorAnalysis(canvas, imageData);
      }

      // Apply stability filter
      detectionResult = this._applyStabilityFilter(detectionResult);

      // Calculate processing time
      detectionResult.processingTimeMs = performance.now() - startTime;
      detectionResult.timestamp = Date.now();

      return detectionResult;
    } catch (err) {
      console.error('[CardDetectionEngine] Detection error:', err);
      return this._emptyDetectionResult();
    }
  }

  /**
   * Color-based card detection (primary method)
   */
  _detectWithColorAnalysis(canvas, imageData) {
    const result = {
      holeCards: [],
      boardCards: [],
      potSize: null,
      betAmounts: [],
      playerCount: null,
      rawDetections: [],
      timestamp: Date.now(),
      processingTimeMs: 0,
    };

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Detect hole cards
    for (const region of this.currentProfile.holeCardRegions) {
      const card = this._detectCardInRegion(ctx, width, height, region, 'hole');
      if (card) {
        result.holeCards.push(card);
      }
    }

    // Detect board cards
    for (const region of this.currentProfile.boardCardRegions) {
      const card = this._detectCardInRegion(ctx, width, height, region, 'board');
      if (card) {
        result.boardCards.push(card);
      }
    }

    // Detect pot size (simple OCR fallback to null for now)
    result.potSize = null;

    // Count players (based on detected cards + profile)
    const totalCards = result.holeCards.length + result.boardCards.length;
    result.playerCount = Math.max(2, Math.ceil(result.holeCards.length / 2));

    return result;
  }

  /**
   * Detect a single card in a specified region
   */
  _detectCardInRegion(ctx, width, height, region, regionType) {
    const x = Math.floor(region.x * width);
    const y = Math.floor(region.y * height);
    const w = Math.floor(region.w * width);
    const h = Math.floor(region.h * height);

    // Check if region contains card-like white rectangle
    const imageData = ctx.getImageData(x, y, w, h);
    const cardConfidence = this._detectCardPresence(imageData);

    if (cardConfidence < 0.5) {
      return null;
    }

    // Extract rank
    const rankRegion = this.currentProfile.rankCharRegion;
    const rankX = x + Math.floor(rankRegion.x * w);
    const rankY = y + Math.floor(rankRegion.y * h);
    const rankW = Math.floor(rankRegion.w * w);
    const rankH = Math.floor(rankRegion.h * h);

    const rankData = ctx.getImageData(rankX, rankY, rankW, rankH);
    const { rank, rankConfidence } = this._recognizeRank(rankData);

    // Extract suit
    const suitRegion = this.currentProfile.suitCharRegion;
    const suitX = x + Math.floor(suitRegion.x * w);
    const suitY = y + Math.floor(suitRegion.y * h);
    const suitW = Math.floor(suitRegion.w * w);
    const suitH = Math.floor(suitRegion.h * h);

    const suitData = ctx.getImageData(suitX, suitY, suitW, suitH);
    const { suit, suitConfidence } = this._recognizeSuit(suitData);

    if (!rank || !suit) {
      return null;
    }

    const confidence = (cardConfidence + rankConfidence + suitConfidence) / 3;

    if (confidence < this.options.confidenceThreshold) {
      return null;
    }

    return {
      rank,
      suit,
      confidence: Math.min(0.99, confidence),
      bbox: { x: region.x, y: region.y, w: region.w, h: region.h },
    };
  }

  /**
   * Detect whether a region contains a card (white rectangle)
   */
  _detectCardPresence(imageData) {
    const { data } = imageData;
    const targetColor = this.currentProfile.cardBackgroundColor;
    const tolerance = targetColor.tolerance;

    let whitePixels = 0;
    const totalPixels = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (
        Math.abs(r - targetColor.r) <= tolerance &&
        Math.abs(g - targetColor.g) <= tolerance &&
        Math.abs(b - targetColor.b) <= tolerance
      ) {
        whitePixels++;
      }
    }

    return whitePixels / totalPixels;
  }

  /**
   * Recognize rank from extracted card region using template matching
   */
  _recognizeRank(imageData) {
    // Convert to grayscale and threshold
    const binaryImage = this._binarizeImage(imageData);

    let bestRank = null;
    let bestScore = Infinity;

    // Match against all rank templates
    for (const [rank, template] of Object.entries(RANK_TEMPLATES)) {
      const score = this._templateMatchScore(binaryImage, template);

      if (score < bestScore) {
        bestScore = score;
        bestRank = rank;
      }
    }

    // Convert score (0-100) to confidence (1.0-0.0)
    const confidence = Math.max(0, 1 - bestScore / 100);

    return {
      rank: bestRank,
      rankConfidence: confidence,
    };
  }

  /**
   * Recognize suit from extracted card region using color analysis
   */
  _recognizeSuit(imageData) {
    const dominantColor = this._getDominantColor(imageData);

    // Determine if red or black
    const isRed = dominantColor.r > dominantColor.b;
    const brightness = (dominantColor.r + dominantColor.g + dominantColor.b) / 3;

    if (isRed) {
      // Red = hearts or diamonds
      // Hearts are rounder, diamonds are pointy
      const heartScore = this._templateMatchScore(
        this._binarizeImage(imageData),
        SUIT_TEMPLATES.h.pattern
      );
      const diamondScore = this._templateMatchScore(
        this._binarizeImage(imageData),
        SUIT_TEMPLATES.d.pattern
      );

      const suit = heartScore < diamondScore ? 'h' : 'd';
      const confidence = Math.max(0, 1 - Math.min(heartScore, diamondScore) / 100);

      return { suit, suitConfidence: confidence };
    } else {
      // Black = spades or clubs
      // Spades are pointy bottom, clubs are rounded bumpy
      const spadeScore = this._templateMatchScore(
        this._binarizeImage(imageData),
        SUIT_TEMPLATES.s.pattern
      );
      const clubScore = this._templateMatchScore(
        this._binarizeImage(imageData),
        SUIT_TEMPLATES.c.pattern
      );

      const suit = spadeScore < clubScore ? 's' : 'c';
      const confidence = Math.max(0, 1 - Math.min(spadeScore, clubScore) / 100);

      return { suit, suitConfidence: confidence };
    }
  }

  /**
   * Binarize image for template matching
   */
  _binarizeImage(imageData) {
    const { data } = imageData;
    const binary = [];

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = r * 0.299 + g * 0.587 + b * 0.114;
      binary.push(gray > 128 ? 1 : 0);
    }

    return binary;
  }

  /**
   * Calculate template match score (sum of absolute differences)
   * Lower score = better match
   */
  _templateMatchScore(binaryImage, template) {
    // Resize template to match image size if needed
    const imageWidth = Math.sqrt(binaryImage.length);
    const templateWidth = template[0].length;
    const templateHeight = template.length;

    // Simple template matching - compare at multiple scales
    let bestScore = Infinity;

    // Try matching at original size
    if (binaryImage.length >= templateWidth * templateHeight) {
      let sumDiff = 0;
      let matches = 0;

      for (let i = 0; i < binaryImage.length - templateWidth * templateHeight; i++) {
        let diff = 0;
        for (let j = 0; j < templateHeight; j++) {
          for (let k = 0; k < templateWidth; k++) {
            const idx = i + j * imageWidth + k;
            if (idx < binaryImage.length) {
              diff += Math.abs(binaryImage[idx] - template[j][k]);
            }
          }
        }

        if (diff < bestScore) {
          bestScore = diff;
        }
        matches++;
      }

      if (matches > 0) {
        bestScore = (bestScore / (templateWidth * templateHeight)) * 100;
      }
    }

    return Math.min(bestScore, 100);
  }

  /**
   * Get dominant color from image data
   */
  _getDominantColor(imageData) {
    const { data } = imageData;
    let r = 0, g = 0, b = 0;
    let count = 0;

    // Sample every 4th pixel for performance
    for (let i = 0; i < data.length; i += 16) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }

    return {
      r: Math.round(r / count),
      g: Math.round(g / count),
      b: Math.round(b / count),
    };
  }

  /**
   * Model-based detection using YOLO (if available)
   */
  async _detectWithModel(canvas) {
    if (!this.model || !this.tf) {
      return null;
    }

    try {
      // Preprocess: convert canvas to tensor and normalize
      const input = this.tf.browser.fromPixels(canvas);
      const resized = this.tf.image.resizeBilinear(input, [416, 416]);
      const normalized = resized.div(255.0);
      const batched = normalized.expandDims(0);

      // Run inference
      const predictions = await this.model.predict(batched);

      // Post-process predictions
      const result = await this._postprocessYOLOPredictions(predictions);

      // Cleanup tensors
      input.dispose();
      resized.dispose();
      normalized.dispose();
      batched.dispose();
      predictions.dispose();

      return result;
    } catch (err) {
      console.warn('[CardDetectionEngine] Model inference failed:', err);
      return null;
    }
  }

  /**
   * Post-process YOLO predictions
   */
  async _postprocessYOLOPredictions(predictions) {
    // This would implement YOLO-specific post-processing
    // For now, return null to fall back to color-based detection
    return null;
  }

  /**
   * Apply stability filter to detections
   * Only report cards that appear in multiple consecutive frames
   */
  _applyStabilityFilter(detectionResult) {
    this.detectionHistory.push(detectionResult);

    // Keep only recent frames
    if (this.detectionHistory.length > this.options.maxFramesBuffer) {
      this.detectionHistory.shift();
    }

    // If we don't have enough history, return unfiltered
    if (this.detectionHistory.length < this.options.stabilityFrameThreshold) {
      return detectionResult;
    }

    // Check for stable hole cards
    const stableHoleCards = this._findStableCards(
      this.detectionHistory.map(r => r.holeCards),
      'hole'
    );

    // Check for stable board cards
    const stableBoardCards = this._findStableCards(
      this.detectionHistory.map(r => r.boardCards),
      'board'
    );

    return {
      holeCards: stableHoleCards,
      boardCards: stableBoardCards,
      potSize: detectionResult.potSize,
      betAmounts: detectionResult.betAmounts,
      playerCount: detectionResult.playerCount,
      rawDetections: detectionResult.rawDetections,
      timestamp: detectionResult.timestamp,
      processingTimeMs: detectionResult.processingTimeMs,
    };
  }

  /**
   * Find cards that appear stably across frames
   */
  _findStableCards(cardHistories, regionType) {
    const stableCards = [];

    // Get cards from the most recent frame
    const currentCards = cardHistories[cardHistories.length - 1] || [];

    for (const currentCard of currentCards) {
      let matchCount = 0;

      // Count how many recent frames have a matching card
      for (const history of cardHistories.slice(-this.options.stabilityFrameThreshold)) {
        const hasMatch = history.some(
          card =>
            card.rank === currentCard.rank &&
            card.suit === currentCard.suit &&
            Math.abs(card.bbox.x - currentCard.bbox.x) < 0.02
        );

        if (hasMatch) {
          matchCount++;
        }
      }

      // Only include if appears in minimum frames
      if (matchCount >= this.options.stabilityFrameThreshold) {
        stableCards.push(currentCard);
      }
    }

    return stableCards;
  }

  /**
   * Convert video element to canvas
   */
  _videoToCanvas(videoElement) {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth || videoElement.width;
    canvas.height = videoElement.videoHeight || videoElement.height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    return canvas;
  }

  /**
   * Return empty detection result
   */
  _emptyDetectionResult() {
    return {
      holeCards: [],
      boardCards: [],
      potSize: null,
      betAmounts: [],
      playerCount: null,
      rawDetections: [],
      timestamp: Date.now(),
      processingTimeMs: 0,
    };
  }

  /**
   * Set the poker client profile
   */
  setClientProfile(profileName) {
    if (CLIENT_PROFILES[profileName]) {
      this.currentProfile = CLIENT_PROFILES[profileName];
      this.detectionHistory = []; // Clear history when profile changes
      console.log('[CardDetectionEngine] Switched to profile:', profileName);
    } else {
      console.warn('[CardDetectionEngine] Unknown profile:', profileName);
    }
  }

  /**
   * Update custom profile settings
   */
  updateCustomProfile(profileData) {
    Object.assign(CLIENT_PROFILES.custom, profileData);
    this.currentProfile = CLIENT_PROFILES.custom;
    this.detectionHistory = [];
    console.log('[CardDetectionEngine] Custom profile updated');
  }

  /**
   * Get current profile
   */
  getCurrentProfile() {
    return this.currentProfile;
  }

  /**
   * Get all available profiles
   */
  getAvailableProfiles() {
    return Object.keys(CLIENT_PROFILES);
  }

  /**
   * Cleanup and destroy the engine
   */
  destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    if (this.model && this.tf) {
      this.model.dispose();
      this.model = null;
    }

    this.detectionHistory = [];
    this.rankPixelCache = {};
    this.suitColorCache = {};
    this.isInitialized = false;

    console.log('[CardDetectionEngine] Destroyed');
  }
}

// ============================================================================
// WEB WORKER SUPPORT
// ============================================================================

/**
 * Create a vision worker for off-thread detection
 * Returns a worker instance that accepts ImageData and returns detections
 */
export function createVisionWorker() {
  const workerCode = `
    // Worker implementation for on-device vision processing
    let engine = null;

    // Initialize worker with engine
    self.onmessage = async (event) => {
      const { type, payload } = event.data;

      if (type === 'init') {
        // Initialize engine in worker
        engine = {
          profiles: ${JSON.stringify(CLIENT_PROFILES)},
          currentProfile: null,
          templates: ${JSON.stringify(RANK_TEMPLATES)},
        };
        engine.currentProfile = engine.profiles.pokerstars;
        self.postMessage({ type: 'initialized' });
      } else if (type === 'detect') {
        // Process frame in worker thread
        const { imageData, width, height } = payload;
        const result = detectCards(imageData, width, height, engine);
        self.postMessage({ type: 'detection', result });
      } else if (type === 'setProfile') {
        const { profileName } = payload;
        if (engine && engine.profiles[profileName]) {
          engine.currentProfile = engine.profiles[profileName];
          self.postMessage({ type: 'profileUpdated', profileName });
        }
      }
    };

    // Simplified detection for worker
    function detectCards(imageData, width, height, engine) {
      return {
        holeCards: [],
        boardCards: [],
        potSize: null,
        betAmounts: [],
        playerCount: null,
        rawDetections: [],
        timestamp: Date.now(),
        processingTimeMs: 0,
      };
    }
  `;

  const blob = new Blob([workerCode], { type: 'application/javascript' });
  const workerUrl = URL.createObjectURL(blob);
  const worker = new Worker(workerUrl);

  return worker;
}

// ============================================================================
// EXPORT
// ============================================================================

export default CardDetectionEngine;
