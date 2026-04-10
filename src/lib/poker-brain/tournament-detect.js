/**
 * Poker Brain -- Tournament Stage Auto-Detection
 * ===============================================
 * Analyzes OCR output from the tournament lobby or HUD overlay to
 * automatically determine the tournament stage (early, middle, bubble,
 * itm, ft) without manual user input.
 *
 * Detection sources:
 *   1. Player count text: "X/Y players" or "X of Y remaining"
 *   2. Blind level progression: maps blind level to tournament phase
 *   3. Prize info: "pays Z spots" combined with player count
 *
 * Returns a structured object that the HUD can use to set the
 * tournament stage dropdown automatically.
 */

/**
 * Parse player count strings from OCR output.
 * Handles formats like:
 *   "45/100 players"
 *   "45 of 100 remaining"
 *   "Players: 45"
 *   "Remaining: 45/100"
 * @param {string} text - OCR text to parse
 * @returns {{ remaining: number|null, total: number|null }}
 */
export function parsePlayerCount(text) {
  if (!text) return { remaining: null, total: null };
  const cleaned = text.replace(/[,]/g, '').toLowerCase();

  // "45/100" or "45 / 100"
  const slashMatch = cleaned.match(/(\d+)\s*\/\s*(\d+)/);
  if (slashMatch) {
    return { remaining: parseInt(slashMatch[1]), total: parseInt(slashMatch[2]) };
  }

  // "45 of 100"
  const ofMatch = cleaned.match(/(\d+)\s+of\s+(\d+)/);
  if (ofMatch) {
    return { remaining: parseInt(ofMatch[1]), total: parseInt(ofMatch[2]) };
  }

  // "remaining: 45" or "players: 45"
  const labelMatch = cleaned.match(/(?:remaining|players|left)\s*[:=]?\s*(\d+)/);
  if (labelMatch) {
    return { remaining: parseInt(labelMatch[1]), total: null };
  }

  // Just a bare number near "player" context
  const bareMatch = cleaned.match(/(\d+)\s*(?:players?|left|remaining)/);
  if (bareMatch) {
    return { remaining: parseInt(bareMatch[1]), total: null };
  }

  return { remaining: null, total: null };
}

/**
 * Parse paid spots from OCR output.
 * Handles: "pays 15", "15 paid", "prize: 15 spots"
 * @param {string} text
 * @returns {number|null}
 */
export function parsePaidSpots(text) {
  if (!text) return null;
  const cleaned = text.replace(/[,]/g, '').toLowerCase();

  const payMatch = cleaned.match(/(?:pays?|paid|prizes?|itm)\s*[:=]?\s*(\d+)/);
  if (payMatch) return parseInt(payMatch[1]);

  const spotsMatch = cleaned.match(/(\d+)\s*(?:paid|spots?|prizes?)/);
  if (spotsMatch) return parseInt(spotsMatch[1]);

  return null;
}

/**
 * Infer tournament stage from blind level.
 * Uses a heuristic based on typical blind level progression.
 * @param {number} blindLevel - current blind level (1-based)
 * @param {number} [totalLevels] - total expected levels (optional)
 * @returns {string} stage string
 */
export function stageFromBlindLevel(blindLevel, totalLevels = null) {
  if (!blindLevel || blindLevel < 1) return 'early';

  if (totalLevels && totalLevels > 0) {
    const progress = blindLevel / totalLevels;
    if (progress < 0.25) return 'early';
    if (progress < 0.5) return 'middle';
    if (progress < 0.75) return 'bubble';
    return 'itm';
  }

  // Heuristic for unknown total levels
  if (blindLevel <= 5) return 'early';
  if (blindLevel <= 12) return 'middle';
  if (blindLevel <= 20) return 'bubble';
  return 'itm';
}

/**
 * Determine tournament stage from available data.
 * Priority: player count + paid spots > player count alone > blind level
 *
 * @param {object} opts
 * @param {number} [opts.playersRemaining]
 * @param {number} [opts.totalPlayers]
 * @param {number} [opts.paidSpots]
 * @param {number} [opts.blindLevel]
 * @param {number} [opts.totalLevels]
 * @returns {{ stage: string, confidence: number, reasoning: string }}
 */
export function detectTournamentStage(opts = {}) {
  const { playersRemaining, totalPlayers, paidSpots, blindLevel, totalLevels } = opts;

  // Best case: we know remaining players AND paid spots
  if (playersRemaining && paidSpots) {
    if (playersRemaining <= 9 || (totalPlayers && playersRemaining <= totalPlayers * 0.05)) {
      return { stage: 'ft', confidence: 0.95, reasoning: `Final table (${playersRemaining} remaining, ${paidSpots} paid)` };
    }
    if (playersRemaining <= paidSpots) {
      return { stage: 'itm', confidence: 0.9, reasoning: `In the money (${playersRemaining} of ${paidSpots} paid remaining)` };
    }
    if (playersRemaining <= paidSpots * 1.1) {
      return { stage: 'bubble', confidence: 0.9, reasoning: `Bubble (${playersRemaining} remaining, ${paidSpots} paid)` };
    }
    if (playersRemaining <= paidSpots * 1.5) {
      return { stage: 'bubble', confidence: 0.7, reasoning: `Approaching bubble (${playersRemaining} remaining, ${paidSpots} paid)` };
    }
  }

  // Partial: just player count with total
  if (playersRemaining && totalPlayers) {
    const ratio = playersRemaining / totalPlayers;
    if (ratio > 0.7) return { stage: 'early', confidence: 0.7, reasoning: `Early (${playersRemaining}/${totalPlayers} remaining)` };
    if (ratio > 0.4) return { stage: 'middle', confidence: 0.7, reasoning: `Middle (${playersRemaining}/${totalPlayers} remaining)` };
    if (ratio > 0.2) return { stage: 'bubble', confidence: 0.6, reasoning: `Late/Bubble zone (${playersRemaining}/${totalPlayers} remaining)` };
    return { stage: 'itm', confidence: 0.5, reasoning: `Deep (${playersRemaining}/${totalPlayers} remaining)` };
  }

  // Fallback: blind level
  if (blindLevel) {
    const stage = stageFromBlindLevel(blindLevel, totalLevels);
    return { stage, confidence: 0.4, reasoning: `From blind level ${blindLevel}` };
  }

  return { stage: 'middle', confidence: 0.1, reasoning: 'No tournament data available' };
}

/**
 * Process raw OCR text from the tournament lobby area and extract
 * all available tournament info.
 * @param {string} ocrText - full OCR text from tournament info area
 * @returns {object} extracted tournament data
 */
export function extractTournamentInfo(ocrText) {
  if (!ocrText) return { stage: 'middle', confidence: 0, reasoning: 'No OCR text' };

  const players = parsePlayerCount(ocrText);
  const paidSpots = parsePaidSpots(ocrText);

  // Try to extract blind level: "Level 5" or "Lvl 5" or "L5"
  let blindLevel = null;
  const levelMatch = ocrText.match(/(?:level|lvl|l)\s*[:=]?\s*(\d+)/i);
  if (levelMatch) blindLevel = parseInt(levelMatch[1]);

  return detectTournamentStage({
    playersRemaining: players.remaining,
    totalPlayers: players.total,
    paidSpots,
    blindLevel,
  });
}
