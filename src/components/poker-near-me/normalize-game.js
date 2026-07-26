/**
 * normalize-game.js — Game name normalization for Poker Near Me
 * 
 * Standardizes game names from multiple sources:
 *   Bravo:      "1-3 No Limit Holdem 8"  → { type: 'NLH', stakes: '1/3', players: 8, canonical: 'NLH 1/3' }
 *   PokerAtlas: "1/2 No Limit Hold'em"   → { type: 'NLH', stakes: '1/2', players: null, canonical: 'NLH 1/2' }
 *   Bravo:      "10-25 Pot Limit Omaha"  → { type: 'PLO', stakes: '10/25', players: null, canonical: 'PLO 10/25' }
 */

// Game type detection patterns (order matters — first match wins)
const GAME_TYPE_PATTERNS = [
  { pattern: /pot\s*limit\s*omaha\s*(hi[- ]?lo|8|hilo)/i, type: 'PLO8', label: 'PLO Hi-Lo' },
  { pattern: /big\s*o/i, type: 'BigO', label: 'Big O' },
  // Hi-Lo Omaha variants ("Omaha Hi-Lo", "Omaha 8", "PLO8") must be checked
  // before the generic omaha pattern or they get bucketed as plain PLO.
  { pattern: /\bplo\s*8\b/i, type: 'PLO8', label: 'PLO Hi-Lo' },
  { pattern: /omaha.*(hi[- \/]?lo|hilo|8[- ]?or[- ]?better|\/8|8\b)/i, type: 'PLO8', label: 'PLO Hi-Lo' },
  { pattern: /pot\s*limit\s*omaha/i, type: 'PLO', label: 'PLO' },
  { pattern: /\bplo\b/i, type: 'PLO', label: 'PLO' },
  { pattern: /omaha/i, type: 'PLO', label: 'PLO' },
  { pattern: /no[- ]?limit\s*(hold|texas|holdem|hold'em)/i, type: 'NLH', label: 'NLH' },
  // LHE must be checked before the bare holdem patterns — "4/8 Limit Hold'em"
  // contains "holdem" and was previously misclassified as NLH. The no-limit
  // pattern above has already consumed "No Limit Hold'em" by this point.
  { pattern: /limit\s*(hold|texas|holdem)/i, type: 'LHE', label: 'Limit Hold\'em' },
  { pattern: /\bnlh?\b/i, type: 'NLH', label: 'NLH' },
  { pattern: /\bholdem\b|\bhold'?em\b/i, type: 'NLH', label: 'NLH' },
  { pattern: /\bstud\b.*\b(hi[- ]?lo|8)\b/i, type: 'Stud8', label: 'Stud Hi-Lo' },
  { pattern: /\bstud\b/i, type: 'Stud', label: 'Stud' },
  { pattern: /\bhorse\b/i, type: 'HORSE', label: 'HORSE' },
  { pattern: /mixed/i, type: 'Mixed', label: 'Mixed Game' },
  { pattern: /triple\s*draw|2-7|badugi/i, type: 'Draw', label: 'Draw Game' },
  { pattern: /razz/i, type: 'Razz', label: 'Razz' },
];

/**
 * Normalize a raw game name string into structured data.
 * 
 * @param {string} rawName - Raw game name from scraper (e.g., "1-3 No Limit Holdem 8")
 * @returns {{ type: string, label: string, stakes: string|null, smallBlind: number|null, bigBlind: number|null, players: number|null, canonical: string, raw: string }}
 */
export function normalizeGameName(rawName) {
  if (!rawName) return { type: 'Unknown', label: 'Unknown', stakes: null, smallBlind: null, bigBlind: null, players: null, canonical: 'Unknown', raw: '' };

  const raw = typeof rawName === 'string' ? rawName.trim() : String(rawName).trim();

  // Extract stakes: "1-3", "1/3", "2/5", "10-25", "$1/$2"
  const stakesMatch = raw.match(/\$?(\d+)\s*[\/\-]\s*\$?(\d+)/);
  let stakes = null;
  let smallBlind = null;
  let bigBlind = null;
  if (stakesMatch) {
    const a = parseInt(stakesMatch[1]);
    const b = parseInt(stakesMatch[2]);
    smallBlind = Math.min(a, b);
    bigBlind = Math.max(a, b);
    stakes = `${smallBlind}/${bigBlind}`;
  }

  // Extract player count (trailing number like "8" or "9" in "1-3 No Limit Holdem 8")
  let players = null;
  const playerMatch = raw.match(/\b([6-9]|10)\s*$/);
  if (playerMatch) {
    players = parseInt(playerMatch[1]);
  }

  // Detect game type
  let type = 'Unknown';
  let label = 'Unknown';
  for (const { pattern, type: t, label: l } of GAME_TYPE_PATTERNS) {
    if (pattern.test(raw)) {
      type = t;
      label = l;
      break;
    }
  }

  // INFERENCE: If type is still "Unknown" but we have stakes, infer game type
  // "Unknown 30/60" or bare "6/12" → Limit Hold'em (most common unlabeled format)
  // "Unknown" game names with stakes in scraper data are typically LHE
  if (type === 'Unknown' && stakes) {
    // If the raw name is just stakes or "Unknown X/Y", infer Limit Hold'em
    const stripped = raw.replace(/unknown/i, '').replace(/\$?\d+\s*[\/\-]\s*\$?\d+/, '').trim();
    if (!stripped || stripped.length < 3) {
      type = 'LHE';
      label = 'Limit Hold\'em';
    }
  }

  // Build canonical name
  const canonical = stakes ? `${label} ${stakes}` : label;

  return { type, label, stakes, smallBlind, bigBlind, players, canonical, raw };
}

/**
 * Get a short display label for a game (for compact UI).
 * Example: "NLH 1/3" or "PLO 2/5"
 */
export function gameShortLabel(rawName) {
  const { canonical } = normalizeGameName(rawName);
  return canonical;
}

/**
 * Compare two game names to determine if they represent the same game.
 * Useful for deduplication across Bravo and PokerAtlas.
 */
export function isSameGame(nameA, nameB) {
  const a = normalizeGameName(nameA);
  const b = normalizeGameName(nameB);
  return a.type === b.type && a.stakes === b.stakes;
}
