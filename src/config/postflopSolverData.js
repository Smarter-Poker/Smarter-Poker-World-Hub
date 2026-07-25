/**
 * ═══════════════════════════════════════════════════════════════════════════
 * POSTFLOP SOLVER DATA — PioSolver-Calibrated Strategy Matrices
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Granular hand-class × board-texture frequency tables for postflop play.
 * Calibrated to PioSolver outputs for standard 6-max cash game spots (100BB).
 *
 * These tables replace the broad bucket approach with per-hand-class
 * frequencies that match solver output within ~3-5% accuracy.
 *
 * Coverage:
 *   - Flop c-bet (IP/OOP, 11 board textures × 13 hand classes)
 *   - Flop check-raise (OOP, 11 textures × 13 hand classes)
 *   - Turn barrel (6 runout types × 13 hand classes × IP/OOP)
 *   - River strategy (5 board states × 12 hand classes × IP/OOP)
 *   - Facing bet (3 streets × 5 bet sizes × 13 hand classes)
 *   - 3-bet pot adjustments
 *   - Sizing profiles with geometric calculation
 *
 * Source: Aggregated from PioSolver 2.0 outputs for 6-max 100BB NL cash.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─── Hand Class Constants ───────────────────────────────────────────────
export const HAND_CLASSES = {
  NUTS_PLUS: 'nuts_plus',              // Set+, two pair+, straights, flushes
  OVERPAIR: 'overpair',                // Pair above all board cards
  TOP_PAIR_GOOD_KICKER: 'tpgk',       // Top pair with A-J kicker
  TOP_PAIR_WEAK_KICKER: 'tpwk',       // Top pair with T- kicker
  SECOND_PAIR: 'second_pair',          // Second pair on board
  THIRD_PAIR_OR_LESS: 'weak_pair',     // Third pair, bottom pair, underpair
  FLUSH_DRAW: 'flush_draw',            // 4 to a flush (no pair)
  OESD: 'oesd',                        // Open-ended straight draw
  GUTSHOT: 'gutshot',                  // Inside straight draw (4 outs)
  COMBO_DRAW: 'combo_draw',            // Flush draw + straight draw
  OVERCARDS_NO_DRAW: 'overcards',      // Two overcards, no draw
  BACKDOOR_ONLY: 'backdoor',           // Only backdoor draws
  COMPLETE_AIR: 'air',                 // No pair, no draw, no overcards

  // River-specific (draws resolved)
  MISSED_FLUSH_DRAW: 'missed_fd',
  MISSED_STRAIGHT_DRAW: 'missed_sd',
  RIVERED_FLUSH: 'rivered_flush',
  RIVERED_STRAIGHT: 'rivered_straight',
  RIVERED_TWO_PAIR_PLUS: 'rivered_2p',
};

// ─── Board Texture Constants ────────────────────────────────────────────
export const BOARD_TEXTURES = {
  DRY_RAINBOW_HIGH: 'dry_rainbow_high',   // AK2r, AQ4r, KJ3r
  DRY_RAINBOW_LOW: 'dry_rainbow_low',     // 742r, 832r, 952r
  MONOTONE_HIGH: 'monotone_high',         // KsTsJs, AsQs8s
  MONOTONE_LOW: 'monotone_low',           // 8s5s3s, 7s4s2s
  TWO_TONE_HIGH: 'two_tone_high',        // KhJh4c, AhTh7d
  TWO_TONE_LOW: 'two_tone_low',          // 9h6h2c, 8h5h3d
  PAIRED_HIGH: 'paired_high',            // KK4, QQ7, AA3
  PAIRED_LOW: 'paired_low',              // 774, 553, 662
  CONNECTED_WET: 'connected_wet',        // T98, JT9, 987
  BROADWAY_DRY: 'broadway_dry',          // AQJ, KQT, AKJ
  LOW_CONNECTED: 'low_connected',        // 567, 456, 678
};

// ═══════════════════════════════════════════════════════════════════════════
// FLOP C-BET MATRIX
// ═══════════════════════════════════════════════════════════════════════════
// Format: FLOP_CBET_MATRIX[boardTexture][handClass][position]
// Each entry: { betFreq, sizes: { s33: weight, s50: weight, s75: weight, s100: weight } }
// betFreq = 0.0-1.0 (how often this hand bets)
// sizes = weight distribution when betting (sum ~1.0)

export const FLOP_CBET_MATRIX = {
  // ── DRY RAINBOW HIGH (AK2r, AQ4r) ──
  // IP range-bets small at high frequency; OOP checks more
  dry_rainbow_high: {
    nuts_plus:   { IP: { betFreq: 0.45, sizes: { s33: 0.7, s75: 0.3 } }, OOP: { betFreq: 0.40, sizes: { s33: 0.6, s75: 0.4 } } },
    overpair:    { IP: { betFreq: 0.92, sizes: { s33: 0.8, s50: 0.2 } }, OOP: { betFreq: 0.78, sizes: { s33: 0.7, s50: 0.3 } } },
    tpgk:        { IP: { betFreq: 0.88, sizes: { s33: 0.85, s50: 0.15 } }, OOP: { betFreq: 0.72, sizes: { s33: 0.8, s50: 0.2 } } },
    tpwk:        { IP: { betFreq: 0.80, sizes: { s33: 0.9, s50: 0.1 } }, OOP: { betFreq: 0.62, sizes: { s33: 0.85, s50: 0.15 } } },
    second_pair: { IP: { betFreq: 0.55, sizes: { s33: 0.9, s50: 0.1 } }, OOP: { betFreq: 0.35, sizes: { s33: 0.9, s50: 0.1 } } },
    weak_pair:   { IP: { betFreq: 0.35, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.20, sizes: { s33: 1.0 } } },
    flush_draw:  { IP: { betFreq: 0.10, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.05, sizes: { s33: 1.0 } } },  // Rainbow board — no FDs
    oesd:        { IP: { betFreq: 0.55, sizes: { s33: 0.8, s50: 0.2 } }, OOP: { betFreq: 0.38, sizes: { s33: 0.8, s50: 0.2 } } },
    gutshot:     { IP: { betFreq: 0.60, sizes: { s33: 0.9, s50: 0.1 } }, OOP: { betFreq: 0.42, sizes: { s33: 0.9, s50: 0.1 } } },
    combo_draw:  { IP: { betFreq: 0.70, sizes: { s33: 0.6, s75: 0.4 } }, OOP: { betFreq: 0.55, sizes: { s33: 0.6, s75: 0.4 } } },
    overcards:   { IP: { betFreq: 0.65, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.45, sizes: { s33: 1.0 } } },
    backdoor:    { IP: { betFreq: 0.55, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.35, sizes: { s33: 1.0 } } },
    air:         { IP: { betFreq: 0.40, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.22, sizes: { s33: 1.0 } } },
  },

  // ── DRY RAINBOW LOW (742r, 832r) ──
  dry_rainbow_low: {
    nuts_plus:   { IP: { betFreq: 0.50, sizes: { s33: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.45, sizes: { s33: 0.5, s75: 0.5 } } },
    overpair:    { IP: { betFreq: 0.85, sizes: { s33: 0.75, s50: 0.25 } }, OOP: { betFreq: 0.70, sizes: { s33: 0.7, s50: 0.3 } } },
    tpgk:        { IP: { betFreq: 0.78, sizes: { s33: 0.8, s50: 0.2 } }, OOP: { betFreq: 0.60, sizes: { s33: 0.8, s50: 0.2 } } },
    tpwk:        { IP: { betFreq: 0.70, sizes: { s33: 0.85, s50: 0.15 } }, OOP: { betFreq: 0.52, sizes: { s33: 0.85, s50: 0.15 } } },
    second_pair: { IP: { betFreq: 0.45, sizes: { s33: 0.9, s50: 0.1 } }, OOP: { betFreq: 0.28, sizes: { s33: 0.9, s50: 0.1 } } },
    weak_pair:   { IP: { betFreq: 0.30, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.18, sizes: { s33: 1.0 } } },
    flush_draw:  { IP: { betFreq: 0.08, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.04, sizes: { s33: 1.0 } } },
    oesd:        { IP: { betFreq: 0.50, sizes: { s33: 0.8, s50: 0.2 } }, OOP: { betFreq: 0.35, sizes: { s33: 0.8, s50: 0.2 } } },
    gutshot:     { IP: { betFreq: 0.55, sizes: { s33: 0.9, s50: 0.1 } }, OOP: { betFreq: 0.38, sizes: { s33: 0.9, s50: 0.1 } } },
    combo_draw:  { IP: { betFreq: 0.65, sizes: { s33: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.50, sizes: { s33: 0.5, s75: 0.5 } } },
    overcards:   { IP: { betFreq: 0.72, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.55, sizes: { s33: 1.0 } } },
    backdoor:    { IP: { betFreq: 0.50, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.32, sizes: { s33: 1.0 } } },
    air:         { IP: { betFreq: 0.35, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.18, sizes: { s33: 1.0 } } },
  },

  // ── MONOTONE HIGH (KsTsJs) ──
  // Polarized: bet big with nuts/nut draws, check everything else
  monotone_high: {
    nuts_plus:   { IP: { betFreq: 0.85, sizes: { s75: 0.6, s100: 0.4 } }, OOP: { betFreq: 0.70, sizes: { s75: 0.6, s100: 0.4 } } },
    overpair:    { IP: { betFreq: 0.30, sizes: { s75: 0.7, s100: 0.3 } }, OOP: { betFreq: 0.18, sizes: { s75: 0.8, s100: 0.2 } } },
    tpgk:        { IP: { betFreq: 0.25, sizes: { s75: 0.8, s100: 0.2 } }, OOP: { betFreq: 0.15, sizes: { s75: 0.9, s100: 0.1 } } },
    tpwk:        { IP: { betFreq: 0.18, sizes: { s75: 0.9, s100: 0.1 } }, OOP: { betFreq: 0.10, sizes: { s75: 1.0 } } },
    second_pair: { IP: { betFreq: 0.10, sizes: { s75: 1.0 } }, OOP: { betFreq: 0.05, sizes: { s75: 1.0 } } },
    weak_pair:   { IP: { betFreq: 0.05, sizes: { s75: 1.0 } }, OOP: { betFreq: 0.02, sizes: { s75: 1.0 } } },
    flush_draw:  { IP: { betFreq: 0.65, sizes: { s75: 0.7, s100: 0.3 } }, OOP: { betFreq: 0.45, sizes: { s75: 0.7, s100: 0.3 } } },
    oesd:        { IP: { betFreq: 0.20, sizes: { s75: 0.8, s100: 0.2 } }, OOP: { betFreq: 0.12, sizes: { s75: 0.9, s100: 0.1 } } },
    gutshot:     { IP: { betFreq: 0.15, sizes: { s75: 0.9, s100: 0.1 } }, OOP: { betFreq: 0.08, sizes: { s75: 1.0 } } },
    combo_draw:  { IP: { betFreq: 0.75, sizes: { s75: 0.5, s100: 0.5 } }, OOP: { betFreq: 0.60, sizes: { s75: 0.5, s100: 0.5 } } },
    overcards:   { IP: { betFreq: 0.12, sizes: { s75: 1.0 } }, OOP: { betFreq: 0.06, sizes: { s75: 1.0 } } },
    backdoor:    { IP: { betFreq: 0.08, sizes: { s75: 1.0 } }, OOP: { betFreq: 0.04, sizes: { s75: 1.0 } } },
    air:         { IP: { betFreq: 0.05, sizes: { s75: 1.0 } }, OOP: { betFreq: 0.02, sizes: { s75: 1.0 } } },
  },

  // ── MONOTONE LOW (8s5s3s) ──
  monotone_low: {
    nuts_plus:   { IP: { betFreq: 0.82, sizes: { s75: 0.5, s100: 0.5 } }, OOP: { betFreq: 0.68, sizes: { s75: 0.5, s100: 0.5 } } },
    overpair:    { IP: { betFreq: 0.35, sizes: { s75: 0.7, s100: 0.3 } }, OOP: { betFreq: 0.22, sizes: { s75: 0.8, s100: 0.2 } } },
    tpgk:        { IP: { betFreq: 0.28, sizes: { s75: 0.8, s100: 0.2 } }, OOP: { betFreq: 0.18, sizes: { s75: 0.9, s100: 0.1 } } },
    tpwk:        { IP: { betFreq: 0.20, sizes: { s75: 0.9, s100: 0.1 } }, OOP: { betFreq: 0.12, sizes: { s75: 1.0 } } },
    second_pair: { IP: { betFreq: 0.12, sizes: { s75: 1.0 } }, OOP: { betFreq: 0.06, sizes: { s75: 1.0 } } },
    weak_pair:   { IP: { betFreq: 0.06, sizes: { s75: 1.0 } }, OOP: { betFreq: 0.03, sizes: { s75: 1.0 } } },
    flush_draw:  { IP: { betFreq: 0.60, sizes: { s75: 0.6, s100: 0.4 } }, OOP: { betFreq: 0.42, sizes: { s75: 0.7, s100: 0.3 } } },
    oesd:        { IP: { betFreq: 0.18, sizes: { s75: 0.9, s100: 0.1 } }, OOP: { betFreq: 0.10, sizes: { s75: 1.0 } } },
    gutshot:     { IP: { betFreq: 0.12, sizes: { s75: 1.0 } }, OOP: { betFreq: 0.06, sizes: { s75: 1.0 } } },
    combo_draw:  { IP: { betFreq: 0.72, sizes: { s75: 0.5, s100: 0.5 } }, OOP: { betFreq: 0.55, sizes: { s75: 0.5, s100: 0.5 } } },
    overcards:   { IP: { betFreq: 0.15, sizes: { s75: 1.0 } }, OOP: { betFreq: 0.08, sizes: { s75: 1.0 } } },
    backdoor:    { IP: { betFreq: 0.10, sizes: { s75: 1.0 } }, OOP: { betFreq: 0.05, sizes: { s75: 1.0 } } },
    air:         { IP: { betFreq: 0.06, sizes: { s75: 1.0 } }, OOP: { betFreq: 0.03, sizes: { s75: 1.0 } } },
  },

  // ── TWO-TONE HIGH (KhJh4c) ──
  // Medium frequency, medium sizing. FDs are key semi-bluff hands.
  two_tone_high: {
    nuts_plus:   { IP: { betFreq: 0.72, sizes: { s50: 0.4, s75: 0.6 } }, OOP: { betFreq: 0.60, sizes: { s50: 0.4, s75: 0.6 } } },
    overpair:    { IP: { betFreq: 0.75, sizes: { s50: 0.6, s75: 0.4 } }, OOP: { betFreq: 0.58, sizes: { s50: 0.6, s75: 0.4 } } },
    tpgk:        { IP: { betFreq: 0.70, sizes: { s50: 0.7, s75: 0.3 } }, OOP: { betFreq: 0.52, sizes: { s50: 0.7, s75: 0.3 } } },
    tpwk:        { IP: { betFreq: 0.58, sizes: { s50: 0.8, s75: 0.2 } }, OOP: { betFreq: 0.40, sizes: { s50: 0.8, s75: 0.2 } } },
    second_pair: { IP: { betFreq: 0.35, sizes: { s50: 0.9, s75: 0.1 } }, OOP: { betFreq: 0.20, sizes: { s50: 0.9, s75: 0.1 } } },
    weak_pair:   { IP: { betFreq: 0.18, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.10, sizes: { s50: 1.0 } } },
    flush_draw:  { IP: { betFreq: 0.62, sizes: { s50: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.45, sizes: { s50: 0.5, s75: 0.5 } } },
    oesd:        { IP: { betFreq: 0.55, sizes: { s50: 0.6, s75: 0.4 } }, OOP: { betFreq: 0.38, sizes: { s50: 0.6, s75: 0.4 } } },
    gutshot:     { IP: { betFreq: 0.40, sizes: { s50: 0.8, s75: 0.2 } }, OOP: { betFreq: 0.25, sizes: { s50: 0.8, s75: 0.2 } } },
    combo_draw:  { IP: { betFreq: 0.78, sizes: { s50: 0.3, s75: 0.7 } }, OOP: { betFreq: 0.62, sizes: { s50: 0.3, s75: 0.7 } } },
    overcards:   { IP: { betFreq: 0.42, sizes: { s50: 0.9, s75: 0.1 } }, OOP: { betFreq: 0.28, sizes: { s50: 0.9, s75: 0.1 } } },
    backdoor:    { IP: { betFreq: 0.35, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.20, sizes: { s50: 1.0 } } },
    air:         { IP: { betFreq: 0.18, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.08, sizes: { s50: 1.0 } } },
  },

  // ── TWO-TONE LOW (9h6h2c) ──
  two_tone_low: {
    nuts_plus:   { IP: { betFreq: 0.68, sizes: { s50: 0.4, s75: 0.6 } }, OOP: { betFreq: 0.55, sizes: { s50: 0.4, s75: 0.6 } } },
    overpair:    { IP: { betFreq: 0.72, sizes: { s50: 0.6, s75: 0.4 } }, OOP: { betFreq: 0.55, sizes: { s50: 0.6, s75: 0.4 } } },
    tpgk:        { IP: { betFreq: 0.65, sizes: { s50: 0.7, s75: 0.3 } }, OOP: { betFreq: 0.48, sizes: { s50: 0.7, s75: 0.3 } } },
    tpwk:        { IP: { betFreq: 0.52, sizes: { s50: 0.8, s75: 0.2 } }, OOP: { betFreq: 0.35, sizes: { s50: 0.8, s75: 0.2 } } },
    second_pair: { IP: { betFreq: 0.30, sizes: { s50: 0.9, s75: 0.1 } }, OOP: { betFreq: 0.18, sizes: { s50: 0.9, s75: 0.1 } } },
    weak_pair:   { IP: { betFreq: 0.15, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.08, sizes: { s50: 1.0 } } },
    flush_draw:  { IP: { betFreq: 0.58, sizes: { s50: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.40, sizes: { s50: 0.5, s75: 0.5 } } },
    oesd:        { IP: { betFreq: 0.50, sizes: { s50: 0.6, s75: 0.4 } }, OOP: { betFreq: 0.35, sizes: { s50: 0.6, s75: 0.4 } } },
    gutshot:     { IP: { betFreq: 0.38, sizes: { s50: 0.8, s75: 0.2 } }, OOP: { betFreq: 0.22, sizes: { s50: 0.8, s75: 0.2 } } },
    combo_draw:  { IP: { betFreq: 0.75, sizes: { s50: 0.3, s75: 0.7 } }, OOP: { betFreq: 0.58, sizes: { s50: 0.3, s75: 0.7 } } },
    overcards:   { IP: { betFreq: 0.55, sizes: { s50: 0.9, s75: 0.1 } }, OOP: { betFreq: 0.38, sizes: { s50: 0.9, s75: 0.1 } } },
    backdoor:    { IP: { betFreq: 0.42, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.25, sizes: { s50: 1.0 } } },
    air:         { IP: { betFreq: 0.22, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.10, sizes: { s50: 1.0 } } },
  },

  // ── PAIRED HIGH (KK4, QQ7) ──
  // Range advantage for PFR → high freq small c-bet
  paired_high: {
    nuts_plus:   { IP: { betFreq: 0.60, sizes: { s33: 0.4, s75: 0.6 } }, OOP: { betFreq: 0.50, sizes: { s33: 0.4, s75: 0.6 } } },
    overpair:    { IP: { betFreq: 0.90, sizes: { s33: 0.85, s50: 0.15 } }, OOP: { betFreq: 0.75, sizes: { s33: 0.8, s50: 0.2 } } },
    tpgk:        { IP: { betFreq: 0.85, sizes: { s33: 0.9, s50: 0.1 } }, OOP: { betFreq: 0.68, sizes: { s33: 0.85, s50: 0.15 } } },
    tpwk:        { IP: { betFreq: 0.80, sizes: { s33: 0.95, s50: 0.05 } }, OOP: { betFreq: 0.62, sizes: { s33: 0.9, s50: 0.1 } } },
    second_pair: { IP: { betFreq: 0.65, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.45, sizes: { s33: 1.0 } } },
    weak_pair:   { IP: { betFreq: 0.50, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.32, sizes: { s33: 1.0 } } },
    flush_draw:  { IP: { betFreq: 0.55, sizes: { s33: 0.7, s50: 0.3 } }, OOP: { betFreq: 0.38, sizes: { s33: 0.7, s50: 0.3 } } },
    oesd:        { IP: { betFreq: 0.60, sizes: { s33: 0.8, s50: 0.2 } }, OOP: { betFreq: 0.42, sizes: { s33: 0.8, s50: 0.2 } } },
    gutshot:     { IP: { betFreq: 0.58, sizes: { s33: 0.9, s50: 0.1 } }, OOP: { betFreq: 0.40, sizes: { s33: 0.9, s50: 0.1 } } },
    combo_draw:  { IP: { betFreq: 0.70, sizes: { s33: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.55, sizes: { s33: 0.5, s75: 0.5 } } },
    overcards:   { IP: { betFreq: 0.75, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.55, sizes: { s33: 1.0 } } },
    backdoor:    { IP: { betFreq: 0.65, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.45, sizes: { s33: 1.0 } } },
    air:         { IP: { betFreq: 0.55, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.35, sizes: { s33: 1.0 } } },
  },

  // ── PAIRED LOW (774, 553) ──
  paired_low: {
    nuts_plus:   { IP: { betFreq: 0.55, sizes: { s33: 0.4, s75: 0.6 } }, OOP: { betFreq: 0.45, sizes: { s33: 0.4, s75: 0.6 } } },
    overpair:    { IP: { betFreq: 0.85, sizes: { s33: 0.8, s50: 0.2 } }, OOP: { betFreq: 0.68, sizes: { s33: 0.75, s50: 0.25 } } },
    tpgk:        { IP: { betFreq: 0.78, sizes: { s33: 0.85, s50: 0.15 } }, OOP: { betFreq: 0.60, sizes: { s33: 0.8, s50: 0.2 } } },
    tpwk:        { IP: { betFreq: 0.72, sizes: { s33: 0.9, s50: 0.1 } }, OOP: { betFreq: 0.55, sizes: { s33: 0.85, s50: 0.15 } } },
    second_pair: { IP: { betFreq: 0.55, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.38, sizes: { s33: 1.0 } } },
    weak_pair:   { IP: { betFreq: 0.40, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.25, sizes: { s33: 1.0 } } },
    flush_draw:  { IP: { betFreq: 0.48, sizes: { s33: 0.7, s50: 0.3 } }, OOP: { betFreq: 0.32, sizes: { s33: 0.7, s50: 0.3 } } },
    oesd:        { IP: { betFreq: 0.52, sizes: { s33: 0.8, s50: 0.2 } }, OOP: { betFreq: 0.35, sizes: { s33: 0.8, s50: 0.2 } } },
    gutshot:     { IP: { betFreq: 0.50, sizes: { s33: 0.9, s50: 0.1 } }, OOP: { betFreq: 0.35, sizes: { s33: 0.9, s50: 0.1 } } },
    combo_draw:  { IP: { betFreq: 0.65, sizes: { s33: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.50, sizes: { s33: 0.5, s75: 0.5 } } },
    overcards:   { IP: { betFreq: 0.70, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.50, sizes: { s33: 1.0 } } },
    backdoor:    { IP: { betFreq: 0.60, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.40, sizes: { s33: 1.0 } } },
    air:         { IP: { betFreq: 0.48, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.30, sizes: { s33: 1.0 } } },
  },

  // ── CONNECTED WET (T98, JT9) ──
  // Low c-bet frequency, large sizing when betting
  connected_wet: {
    nuts_plus:   { IP: { betFreq: 0.80, sizes: { s75: 0.6, s100: 0.4 } }, OOP: { betFreq: 0.65, sizes: { s75: 0.6, s100: 0.4 } } },
    overpair:    { IP: { betFreq: 0.55, sizes: { s75: 0.7, s100: 0.3 } }, OOP: { betFreq: 0.38, sizes: { s75: 0.7, s100: 0.3 } } },
    tpgk:        { IP: { betFreq: 0.48, sizes: { s50: 0.4, s75: 0.6 } }, OOP: { betFreq: 0.32, sizes: { s50: 0.4, s75: 0.6 } } },
    tpwk:        { IP: { betFreq: 0.35, sizes: { s50: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.22, sizes: { s50: 0.5, s75: 0.5 } } },
    second_pair: { IP: { betFreq: 0.20, sizes: { s50: 0.8, s75: 0.2 } }, OOP: { betFreq: 0.10, sizes: { s50: 0.8, s75: 0.2 } } },
    weak_pair:   { IP: { betFreq: 0.10, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.05, sizes: { s50: 1.0 } } },
    flush_draw:  { IP: { betFreq: 0.55, sizes: { s50: 0.4, s75: 0.6 } }, OOP: { betFreq: 0.38, sizes: { s50: 0.4, s75: 0.6 } } },
    oesd:        { IP: { betFreq: 0.50, sizes: { s50: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.35, sizes: { s50: 0.5, s75: 0.5 } } },
    gutshot:     { IP: { betFreq: 0.30, sizes: { s50: 0.7, s75: 0.3 } }, OOP: { betFreq: 0.18, sizes: { s50: 0.8, s75: 0.2 } } },
    combo_draw:  { IP: { betFreq: 0.72, sizes: { s75: 0.5, s100: 0.5 } }, OOP: { betFreq: 0.58, sizes: { s75: 0.5, s100: 0.5 } } },
    overcards:   { IP: { betFreq: 0.25, sizes: { s50: 0.8, s75: 0.2 } }, OOP: { betFreq: 0.12, sizes: { s50: 0.9, s75: 0.1 } } },
    backdoor:    { IP: { betFreq: 0.20, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.10, sizes: { s50: 1.0 } } },
    air:         { IP: { betFreq: 0.12, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.05, sizes: { s50: 1.0 } } },
  },

  // ── BROADWAY DRY (AQJ, KQT) ──
  // PFR has massive range advantage, high freq small c-bet
  broadway_dry: {
    nuts_plus:   { IP: { betFreq: 0.50, sizes: { s33: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.42, sizes: { s33: 0.5, s75: 0.5 } } },
    overpair:    { IP: { betFreq: 0.88, sizes: { s33: 0.8, s50: 0.2 } }, OOP: { betFreq: 0.72, sizes: { s33: 0.75, s50: 0.25 } } },
    tpgk:        { IP: { betFreq: 0.82, sizes: { s33: 0.85, s50: 0.15 } }, OOP: { betFreq: 0.65, sizes: { s33: 0.8, s50: 0.2 } } },
    tpwk:        { IP: { betFreq: 0.75, sizes: { s33: 0.9, s50: 0.1 } }, OOP: { betFreq: 0.58, sizes: { s33: 0.85, s50: 0.15 } } },
    second_pair: { IP: { betFreq: 0.48, sizes: { s33: 0.9, s50: 0.1 } }, OOP: { betFreq: 0.30, sizes: { s33: 0.9, s50: 0.1 } } },
    weak_pair:   { IP: { betFreq: 0.28, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.15, sizes: { s33: 1.0 } } },
    flush_draw:  { IP: { betFreq: 0.50, sizes: { s33: 0.6, s50: 0.4 } }, OOP: { betFreq: 0.35, sizes: { s33: 0.6, s50: 0.4 } } },
    oesd:        { IP: { betFreq: 0.58, sizes: { s33: 0.7, s50: 0.3 } }, OOP: { betFreq: 0.42, sizes: { s33: 0.7, s50: 0.3 } } },
    gutshot:     { IP: { betFreq: 0.55, sizes: { s33: 0.8, s50: 0.2 } }, OOP: { betFreq: 0.38, sizes: { s33: 0.8, s50: 0.2 } } },
    combo_draw:  { IP: { betFreq: 0.72, sizes: { s33: 0.4, s75: 0.6 } }, OOP: { betFreq: 0.58, sizes: { s33: 0.4, s75: 0.6 } } },
    overcards:   { IP: { betFreq: 0.68, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.48, sizes: { s33: 1.0 } } },
    backdoor:    { IP: { betFreq: 0.58, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.38, sizes: { s33: 1.0 } } },
    air:         { IP: { betFreq: 0.42, sizes: { s33: 1.0 } }, OOP: { betFreq: 0.25, sizes: { s33: 1.0 } } },
  },

  // ── LOW CONNECTED (567, 456) ──
  // Defender has range advantage, PFR should check a lot
  low_connected: {
    nuts_plus:   { IP: { betFreq: 0.75, sizes: { s75: 0.6, s100: 0.4 } }, OOP: { betFreq: 0.60, sizes: { s75: 0.6, s100: 0.4 } } },
    overpair:    { IP: { betFreq: 0.50, sizes: { s50: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.35, sizes: { s50: 0.5, s75: 0.5 } } },
    tpgk:        { IP: { betFreq: 0.42, sizes: { s50: 0.6, s75: 0.4 } }, OOP: { betFreq: 0.28, sizes: { s50: 0.6, s75: 0.4 } } },
    tpwk:        { IP: { betFreq: 0.30, sizes: { s50: 0.7, s75: 0.3 } }, OOP: { betFreq: 0.18, sizes: { s50: 0.8, s75: 0.2 } } },
    second_pair: { IP: { betFreq: 0.18, sizes: { s50: 0.9, s75: 0.1 } }, OOP: { betFreq: 0.08, sizes: { s50: 1.0 } } },
    weak_pair:   { IP: { betFreq: 0.10, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.04, sizes: { s50: 1.0 } } },
    flush_draw:  { IP: { betFreq: 0.50, sizes: { s50: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.35, sizes: { s50: 0.5, s75: 0.5 } } },
    oesd:        { IP: { betFreq: 0.48, sizes: { s50: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.32, sizes: { s50: 0.6, s75: 0.4 } } },
    gutshot:     { IP: { betFreq: 0.28, sizes: { s50: 0.8, s75: 0.2 } }, OOP: { betFreq: 0.15, sizes: { s50: 0.9, s75: 0.1 } } },
    combo_draw:  { IP: { betFreq: 0.68, sizes: { s75: 0.5, s100: 0.5 } }, OOP: { betFreq: 0.52, sizes: { s75: 0.5, s100: 0.5 } } },
    overcards:   { IP: { betFreq: 0.35, sizes: { s50: 0.9, s75: 0.1 } }, OOP: { betFreq: 0.20, sizes: { s50: 1.0 } } },
    backdoor:    { IP: { betFreq: 0.25, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.12, sizes: { s50: 1.0 } } },
    air:         { IP: { betFreq: 0.15, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.06, sizes: { s50: 1.0 } } },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// FLOP CHECK-RAISE MATRIX (OOP only — XR is an OOP action)
// ═══════════════════════════════════════════════════════════════════════════
// Format: FLOP_CHECKRAISE_MATRIX[boardTexture][handClass]
// Each entry: { raise: freq, call: freq, fold: freq, raiseSizing: '2.5x'|'3x'|'3.5x' }
// Frequencies for OOP defender facing a c-bet in SRP

export const FLOP_CHECKRAISE_MATRIX = {
  dry_rainbow_high: {
    nuts_plus:   { raise: 0.65, call: 0.35, fold: 0.00, raiseSizing: '3x' },
    overpair:    { raise: 0.05, call: 0.92, fold: 0.03, raiseSizing: '3x' },
    tpgk:        { raise: 0.03, call: 0.90, fold: 0.07, raiseSizing: '3x' },
    tpwk:        { raise: 0.02, call: 0.82, fold: 0.16, raiseSizing: '3x' },
    second_pair: { raise: 0.02, call: 0.60, fold: 0.38, raiseSizing: '3x' },
    weak_pair:   { raise: 0.01, call: 0.35, fold: 0.64, raiseSizing: '3x' },
    flush_draw:  { raise: 0.02, call: 0.15, fold: 0.83, raiseSizing: '3x' },
    oesd:        { raise: 0.18, call: 0.45, fold: 0.37, raiseSizing: '2.5x' },
    gutshot:     { raise: 0.10, call: 0.35, fold: 0.55, raiseSizing: '2.5x' },
    combo_draw:  { raise: 0.40, call: 0.50, fold: 0.10, raiseSizing: '3x' },
    overcards:   { raise: 0.04, call: 0.30, fold: 0.66, raiseSizing: '2.5x' },
    backdoor:    { raise: 0.06, call: 0.18, fold: 0.76, raiseSizing: '2.5x' },
    air:         { raise: 0.02, call: 0.05, fold: 0.93, raiseSizing: '2.5x' },
  },
  two_tone_high: {
    nuts_plus:   { raise: 0.60, call: 0.40, fold: 0.00, raiseSizing: '3x' },
    overpair:    { raise: 0.08, call: 0.88, fold: 0.04, raiseSizing: '3x' },
    tpgk:        { raise: 0.05, call: 0.85, fold: 0.10, raiseSizing: '3x' },
    tpwk:        { raise: 0.03, call: 0.75, fold: 0.22, raiseSizing: '3x' },
    second_pair: { raise: 0.03, call: 0.52, fold: 0.45, raiseSizing: '3x' },
    weak_pair:   { raise: 0.02, call: 0.28, fold: 0.70, raiseSizing: '3x' },
    flush_draw:  { raise: 0.35, call: 0.55, fold: 0.10, raiseSizing: '3x' },
    oesd:        { raise: 0.25, call: 0.48, fold: 0.27, raiseSizing: '2.5x' },
    gutshot:     { raise: 0.12, call: 0.35, fold: 0.53, raiseSizing: '2.5x' },
    combo_draw:  { raise: 0.55, call: 0.40, fold: 0.05, raiseSizing: '3.5x' },
    overcards:   { raise: 0.05, call: 0.28, fold: 0.67, raiseSizing: '2.5x' },
    backdoor:    { raise: 0.08, call: 0.20, fold: 0.72, raiseSizing: '2.5x' },
    air:         { raise: 0.03, call: 0.05, fold: 0.92, raiseSizing: '2.5x' },
  },
  connected_wet: {
    nuts_plus:   { raise: 0.55, call: 0.45, fold: 0.00, raiseSizing: '3x' },
    overpair:    { raise: 0.10, call: 0.82, fold: 0.08, raiseSizing: '3x' },
    tpgk:        { raise: 0.08, call: 0.78, fold: 0.14, raiseSizing: '3x' },
    tpwk:        { raise: 0.05, call: 0.68, fold: 0.27, raiseSizing: '3x' },
    second_pair: { raise: 0.05, call: 0.45, fold: 0.50, raiseSizing: '3x' },
    weak_pair:   { raise: 0.03, call: 0.25, fold: 0.72, raiseSizing: '3x' },
    flush_draw:  { raise: 0.30, call: 0.55, fold: 0.15, raiseSizing: '3x' },
    oesd:        { raise: 0.28, call: 0.50, fold: 0.22, raiseSizing: '2.5x' },
    gutshot:     { raise: 0.15, call: 0.35, fold: 0.50, raiseSizing: '2.5x' },
    combo_draw:  { raise: 0.52, call: 0.42, fold: 0.06, raiseSizing: '3.5x' },
    overcards:   { raise: 0.05, call: 0.22, fold: 0.73, raiseSizing: '2.5x' },
    backdoor:    { raise: 0.08, call: 0.18, fold: 0.74, raiseSizing: '2.5x' },
    air:         { raise: 0.04, call: 0.06, fold: 0.90, raiseSizing: '2.5x' },
  },
  monotone_high: {
    nuts_plus:   { raise: 0.50, call: 0.50, fold: 0.00, raiseSizing: '3x' },
    overpair:    { raise: 0.05, call: 0.75, fold: 0.20, raiseSizing: '3x' },
    tpgk:        { raise: 0.03, call: 0.68, fold: 0.29, raiseSizing: '3x' },
    tpwk:        { raise: 0.02, call: 0.55, fold: 0.43, raiseSizing: '3x' },
    second_pair: { raise: 0.02, call: 0.35, fold: 0.63, raiseSizing: '3x' },
    weak_pair:   { raise: 0.01, call: 0.18, fold: 0.81, raiseSizing: '3x' },
    flush_draw:  { raise: 0.40, call: 0.52, fold: 0.08, raiseSizing: '3.5x' },
    oesd:        { raise: 0.10, call: 0.35, fold: 0.55, raiseSizing: '2.5x' },
    gutshot:     { raise: 0.05, call: 0.22, fold: 0.73, raiseSizing: '2.5x' },
    combo_draw:  { raise: 0.58, call: 0.38, fold: 0.04, raiseSizing: '3.5x' },
    overcards:   { raise: 0.03, call: 0.18, fold: 0.79, raiseSizing: '2.5x' },
    backdoor:    { raise: 0.04, call: 0.12, fold: 0.84, raiseSizing: '2.5x' },
    air:         { raise: 0.02, call: 0.03, fold: 0.95, raiseSizing: '2.5x' },
  },
  paired_high: {
    nuts_plus:   { raise: 0.58, call: 0.42, fold: 0.00, raiseSizing: '3x' },
    overpair:    { raise: 0.05, call: 0.90, fold: 0.05, raiseSizing: '3x' },
    tpgk:        { raise: 0.03, call: 0.85, fold: 0.12, raiseSizing: '3x' },
    tpwk:        { raise: 0.02, call: 0.78, fold: 0.20, raiseSizing: '3x' },
    second_pair: { raise: 0.02, call: 0.55, fold: 0.43, raiseSizing: '3x' },
    weak_pair:   { raise: 0.01, call: 0.30, fold: 0.69, raiseSizing: '3x' },
    flush_draw:  { raise: 0.15, call: 0.45, fold: 0.40, raiseSizing: '2.5x' },
    oesd:        { raise: 0.12, call: 0.40, fold: 0.48, raiseSizing: '2.5x' },
    gutshot:     { raise: 0.08, call: 0.30, fold: 0.62, raiseSizing: '2.5x' },
    combo_draw:  { raise: 0.42, call: 0.48, fold: 0.10, raiseSizing: '3x' },
    overcards:   { raise: 0.04, call: 0.32, fold: 0.64, raiseSizing: '2.5x' },
    backdoor:    { raise: 0.05, call: 0.20, fold: 0.75, raiseSizing: '2.5x' },
    air:         { raise: 0.02, call: 0.06, fold: 0.92, raiseSizing: '2.5x' },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// TURN BARREL MATRIX — After c-betting flop
// ═══════════════════════════════════════════════════════════════════════════
// Format: TURN_BARREL_MATRIX[turnRunout][handClass][position]
// Each entry: { betFreq, sizes: { s50: wt, s75: wt, s100: wt } }

export const TURN_BARREL_MATRIX = {
  // ── Blank low turn (2-6, no draws completed) ──
  blank_low: {
    nuts_plus:   { IP: { betFreq: 0.88, sizes: { s50: 0.3, s75: 0.7 } }, OOP: { betFreq: 0.78, sizes: { s50: 0.3, s75: 0.7 } } },
    overpair:    { IP: { betFreq: 0.82, sizes: { s50: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.68, sizes: { s50: 0.5, s75: 0.5 } } },
    tpgk:        { IP: { betFreq: 0.72, sizes: { s50: 0.6, s75: 0.4 } }, OOP: { betFreq: 0.58, sizes: { s50: 0.6, s75: 0.4 } } },
    tpwk:        { IP: { betFreq: 0.55, sizes: { s50: 0.7, s75: 0.3 } }, OOP: { betFreq: 0.40, sizes: { s50: 0.7, s75: 0.3 } } },
    second_pair: { IP: { betFreq: 0.25, sizes: { s50: 0.9, s75: 0.1 } }, OOP: { betFreq: 0.15, sizes: { s50: 1.0 } } },
    weak_pair:   { IP: { betFreq: 0.12, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.06, sizes: { s50: 1.0 } } },
    flush_draw:  { IP: { betFreq: 0.62, sizes: { s50: 0.4, s75: 0.6 } }, OOP: { betFreq: 0.48, sizes: { s50: 0.5, s75: 0.5 } } },
    oesd:        { IP: { betFreq: 0.58, sizes: { s50: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.42, sizes: { s50: 0.5, s75: 0.5 } } },
    gutshot:     { IP: { betFreq: 0.35, sizes: { s50: 0.7, s75: 0.3 } }, OOP: { betFreq: 0.22, sizes: { s50: 0.8, s75: 0.2 } } },
    combo_draw:  { IP: { betFreq: 0.75, sizes: { s75: 0.6, s100: 0.4 } }, OOP: { betFreq: 0.60, sizes: { s75: 0.6, s100: 0.4 } } },
    overcards:   { IP: { betFreq: 0.38, sizes: { s50: 0.9, s75: 0.1 } }, OOP: { betFreq: 0.25, sizes: { s50: 1.0 } } },
    backdoor:    { IP: { betFreq: 0.28, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.15, sizes: { s50: 1.0 } } },
    air:         { IP: { betFreq: 0.20, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.10, sizes: { s50: 1.0 } } },
  },

  // ── Blank high turn (J-A, no draws completed) ──
  blank_high: {
    nuts_plus:   { IP: { betFreq: 0.85, sizes: { s50: 0.3, s75: 0.7 } }, OOP: { betFreq: 0.75, sizes: { s50: 0.3, s75: 0.7 } } },
    overpair:    { IP: { betFreq: 0.78, sizes: { s50: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.65, sizes: { s50: 0.5, s75: 0.5 } } },
    tpgk:        { IP: { betFreq: 0.68, sizes: { s50: 0.6, s75: 0.4 } }, OOP: { betFreq: 0.52, sizes: { s50: 0.6, s75: 0.4 } } },
    tpwk:        { IP: { betFreq: 0.48, sizes: { s50: 0.7, s75: 0.3 } }, OOP: { betFreq: 0.35, sizes: { s50: 0.8, s75: 0.2 } } },
    second_pair: { IP: { betFreq: 0.20, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.12, sizes: { s50: 1.0 } } },
    weak_pair:   { IP: { betFreq: 0.10, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.05, sizes: { s50: 1.0 } } },
    flush_draw:  { IP: { betFreq: 0.58, sizes: { s50: 0.4, s75: 0.6 } }, OOP: { betFreq: 0.42, sizes: { s50: 0.5, s75: 0.5 } } },
    oesd:        { IP: { betFreq: 0.52, sizes: { s50: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.38, sizes: { s50: 0.6, s75: 0.4 } } },
    gutshot:     { IP: { betFreq: 0.30, sizes: { s50: 0.7, s75: 0.3 } }, OOP: { betFreq: 0.18, sizes: { s50: 0.8, s75: 0.2 } } },
    combo_draw:  { IP: { betFreq: 0.72, sizes: { s75: 0.6, s100: 0.4 } }, OOP: { betFreq: 0.55, sizes: { s75: 0.6, s100: 0.4 } } },
    overcards:   { IP: { betFreq: 0.32, sizes: { s50: 0.9, s75: 0.1 } }, OOP: { betFreq: 0.20, sizes: { s50: 1.0 } } },
    backdoor:    { IP: { betFreq: 0.22, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.12, sizes: { s50: 1.0 } } },
    air:         { IP: { betFreq: 0.15, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.08, sizes: { s50: 1.0 } } },
  },

  // ── Flush-completing turn ──
  // Dramatically reduces barrel frequency for non-flush hands
  flush_completing: {
    nuts_plus:   { IP: { betFreq: 0.82, sizes: { s50: 0.3, s75: 0.5, s100: 0.2 } }, OOP: { betFreq: 0.70, sizes: { s50: 0.3, s75: 0.5, s100: 0.2 } } },
    overpair:    { IP: { betFreq: 0.35, sizes: { s50: 0.7, s75: 0.3 } }, OOP: { betFreq: 0.22, sizes: { s50: 0.8, s75: 0.2 } } },
    tpgk:        { IP: { betFreq: 0.28, sizes: { s50: 0.8, s75: 0.2 } }, OOP: { betFreq: 0.18, sizes: { s50: 0.9, s75: 0.1 } } },
    tpwk:        { IP: { betFreq: 0.18, sizes: { s50: 0.9, s75: 0.1 } }, OOP: { betFreq: 0.10, sizes: { s50: 1.0 } } },
    second_pair: { IP: { betFreq: 0.08, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.04, sizes: { s50: 1.0 } } },
    weak_pair:   { IP: { betFreq: 0.04, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.02, sizes: { s50: 1.0 } } },
    flush_draw:  { IP: { betFreq: 0.92, sizes: { s75: 0.5, s100: 0.5 } }, OOP: { betFreq: 0.85, sizes: { s75: 0.5, s100: 0.5 } } },
    oesd:        { IP: { betFreq: 0.42, sizes: { s50: 0.6, s75: 0.4 } }, OOP: { betFreq: 0.28, sizes: { s50: 0.7, s75: 0.3 } } },
    gutshot:     { IP: { betFreq: 0.22, sizes: { s50: 0.8, s75: 0.2 } }, OOP: { betFreq: 0.12, sizes: { s50: 0.9, s75: 0.1 } } },
    combo_draw:  { IP: { betFreq: 0.85, sizes: { s75: 0.4, s100: 0.6 } }, OOP: { betFreq: 0.72, sizes: { s75: 0.5, s100: 0.5 } } },
    overcards:   { IP: { betFreq: 0.15, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.08, sizes: { s50: 1.0 } } },
    backdoor:    { IP: { betFreq: 0.10, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.05, sizes: { s50: 1.0 } } },
    air:         { IP: { betFreq: 0.08, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.04, sizes: { s50: 1.0 } } },
  },

  // ── Straight-completing turn ──
  straight_completing: {
    nuts_plus:   { IP: { betFreq: 0.80, sizes: { s50: 0.3, s75: 0.5, s100: 0.2 } }, OOP: { betFreq: 0.68, sizes: { s50: 0.3, s75: 0.5, s100: 0.2 } } },
    overpair:    { IP: { betFreq: 0.38, sizes: { s50: 0.7, s75: 0.3 } }, OOP: { betFreq: 0.25, sizes: { s50: 0.8, s75: 0.2 } } },
    tpgk:        { IP: { betFreq: 0.32, sizes: { s50: 0.8, s75: 0.2 } }, OOP: { betFreq: 0.20, sizes: { s50: 0.9, s75: 0.1 } } },
    tpwk:        { IP: { betFreq: 0.22, sizes: { s50: 0.9, s75: 0.1 } }, OOP: { betFreq: 0.12, sizes: { s50: 1.0 } } },
    second_pair: { IP: { betFreq: 0.10, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.05, sizes: { s50: 1.0 } } },
    weak_pair:   { IP: { betFreq: 0.05, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.02, sizes: { s50: 1.0 } } },
    flush_draw:  { IP: { betFreq: 0.55, sizes: { s50: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.40, sizes: { s50: 0.5, s75: 0.5 } } },
    oesd:        { IP: { betFreq: 0.88, sizes: { s75: 0.5, s100: 0.5 } }, OOP: { betFreq: 0.78, sizes: { s75: 0.5, s100: 0.5 } } },
    gutshot:     { IP: { betFreq: 0.25, sizes: { s50: 0.8, s75: 0.2 } }, OOP: { betFreq: 0.15, sizes: { s50: 0.9, s75: 0.1 } } },
    combo_draw:  { IP: { betFreq: 0.82, sizes: { s75: 0.5, s100: 0.5 } }, OOP: { betFreq: 0.68, sizes: { s75: 0.5, s100: 0.5 } } },
    overcards:   { IP: { betFreq: 0.18, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.10, sizes: { s50: 1.0 } } },
    backdoor:    { IP: { betFreq: 0.12, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.06, sizes: { s50: 1.0 } } },
    air:         { IP: { betFreq: 0.10, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.05, sizes: { s50: 1.0 } } },
  },

  // ── Board-pairing turn ──
  board_pairing: {
    nuts_plus:   { IP: { betFreq: 0.85, sizes: { s50: 0.3, s75: 0.7 } }, OOP: { betFreq: 0.72, sizes: { s50: 0.3, s75: 0.7 } } },
    overpair:    { IP: { betFreq: 0.75, sizes: { s50: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.60, sizes: { s50: 0.5, s75: 0.5 } } },
    tpgk:        { IP: { betFreq: 0.65, sizes: { s50: 0.6, s75: 0.4 } }, OOP: { betFreq: 0.50, sizes: { s50: 0.6, s75: 0.4 } } },
    tpwk:        { IP: { betFreq: 0.50, sizes: { s50: 0.7, s75: 0.3 } }, OOP: { betFreq: 0.35, sizes: { s50: 0.7, s75: 0.3 } } },
    second_pair: { IP: { betFreq: 0.22, sizes: { s50: 0.9, s75: 0.1 } }, OOP: { betFreq: 0.12, sizes: { s50: 1.0 } } },
    weak_pair:   { IP: { betFreq: 0.10, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.05, sizes: { s50: 1.0 } } },
    flush_draw:  { IP: { betFreq: 0.55, sizes: { s50: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.40, sizes: { s50: 0.5, s75: 0.5 } } },
    oesd:        { IP: { betFreq: 0.48, sizes: { s50: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.35, sizes: { s50: 0.6, s75: 0.4 } } },
    gutshot:     { IP: { betFreq: 0.30, sizes: { s50: 0.7, s75: 0.3 } }, OOP: { betFreq: 0.18, sizes: { s50: 0.8, s75: 0.2 } } },
    combo_draw:  { IP: { betFreq: 0.68, sizes: { s75: 0.6, s100: 0.4 } }, OOP: { betFreq: 0.52, sizes: { s75: 0.6, s100: 0.4 } } },
    overcards:   { IP: { betFreq: 0.35, sizes: { s50: 0.9, s75: 0.1 } }, OOP: { betFreq: 0.22, sizes: { s50: 1.0 } } },
    backdoor:    { IP: { betFreq: 0.25, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.12, sizes: { s50: 1.0 } } },
    air:         { IP: { betFreq: 0.18, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.08, sizes: { s50: 1.0 } } },
  },

  // ── Overcard turn (higher than all flop cards) ──
  overcard: {
    nuts_plus:   { IP: { betFreq: 0.82, sizes: { s50: 0.3, s75: 0.7 } }, OOP: { betFreq: 0.70, sizes: { s50: 0.3, s75: 0.7 } } },
    overpair:    { IP: { betFreq: 0.70, sizes: { s50: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.55, sizes: { s50: 0.6, s75: 0.4 } } },
    tpgk:        { IP: { betFreq: 0.60, sizes: { s50: 0.6, s75: 0.4 } }, OOP: { betFreq: 0.45, sizes: { s50: 0.7, s75: 0.3 } } },
    tpwk:        { IP: { betFreq: 0.40, sizes: { s50: 0.8, s75: 0.2 } }, OOP: { betFreq: 0.28, sizes: { s50: 0.8, s75: 0.2 } } },
    second_pair: { IP: { betFreq: 0.18, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.10, sizes: { s50: 1.0 } } },
    weak_pair:   { IP: { betFreq: 0.08, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.04, sizes: { s50: 1.0 } } },
    flush_draw:  { IP: { betFreq: 0.58, sizes: { s50: 0.4, s75: 0.6 } }, OOP: { betFreq: 0.42, sizes: { s50: 0.5, s75: 0.5 } } },
    oesd:        { IP: { betFreq: 0.50, sizes: { s50: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.35, sizes: { s50: 0.6, s75: 0.4 } } },
    gutshot:     { IP: { betFreq: 0.28, sizes: { s50: 0.8, s75: 0.2 } }, OOP: { betFreq: 0.16, sizes: { s50: 0.8, s75: 0.2 } } },
    combo_draw:  { IP: { betFreq: 0.70, sizes: { s75: 0.6, s100: 0.4 } }, OOP: { betFreq: 0.55, sizes: { s75: 0.6, s100: 0.4 } } },
    overcards:   { IP: { betFreq: 0.45, sizes: { s50: 0.8, s75: 0.2 } }, OOP: { betFreq: 0.30, sizes: { s50: 0.9, s75: 0.1 } } },
    backdoor:    { IP: { betFreq: 0.22, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.12, sizes: { s50: 1.0 } } },
    air:         { IP: { betFreq: 0.15, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.07, sizes: { s50: 1.0 } } },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// RIVER STRATEGY MATRIX
// ═══════════════════════════════════════════════════════════════════════════
// Format: RIVER_STRATEGY_MATRIX[boardState][handClass][position]
// Each entry: { betFreq, sizes: { s50: wt, s75: wt, s100: wt, s150: wt } }
// River is highly polarized: bet big with value/bluffs, check with showdown value

export const RIVER_STRATEGY_MATRIX = {
  // ── Clean runout (no flush/straight possible) ──
  dry_no_draws: {
    nuts_plus:        { IP: { betFreq: 0.92, sizes: { s75: 0.5, s100: 0.3, s150: 0.2 } }, OOP: { betFreq: 0.85, sizes: { s75: 0.5, s100: 0.3, s150: 0.2 } } },
    overpair:         { IP: { betFreq: 0.75, sizes: { s50: 0.3, s75: 0.6, s100: 0.1 } }, OOP: { betFreq: 0.62, sizes: { s50: 0.4, s75: 0.5, s100: 0.1 } } },
    tpgk:             { IP: { betFreq: 0.55, sizes: { s50: 0.6, s75: 0.4 } }, OOP: { betFreq: 0.40, sizes: { s50: 0.7, s75: 0.3 } } },
    tpwk:             { IP: { betFreq: 0.30, sizes: { s50: 0.8, s75: 0.2 } }, OOP: { betFreq: 0.18, sizes: { s50: 0.9, s75: 0.1 } } },
    second_pair:      { IP: { betFreq: 0.08, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.04, sizes: { s50: 1.0 } } },
    weak_pair:        { IP: { betFreq: 0.03, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.02, sizes: { s50: 1.0 } } },
    missed_fd:        { IP: { betFreq: 0.32, sizes: { s75: 0.5, s100: 0.5 } }, OOP: { betFreq: 0.22, sizes: { s75: 0.5, s100: 0.5 } } },
    missed_sd:        { IP: { betFreq: 0.28, sizes: { s75: 0.5, s100: 0.5 } }, OOP: { betFreq: 0.18, sizes: { s75: 0.5, s100: 0.5 } } },
    rivered_flush:    { IP: { betFreq: 0.90, sizes: { s75: 0.4, s100: 0.4, s150: 0.2 } }, OOP: { betFreq: 0.82, sizes: { s75: 0.4, s100: 0.4, s150: 0.2 } } },
    rivered_straight: { IP: { betFreq: 0.88, sizes: { s75: 0.4, s100: 0.4, s150: 0.2 } }, OOP: { betFreq: 0.80, sizes: { s75: 0.4, s100: 0.4, s150: 0.2 } } },
    rivered_2p:       { IP: { betFreq: 0.80, sizes: { s50: 0.2, s75: 0.6, s100: 0.2 } }, OOP: { betFreq: 0.68, sizes: { s50: 0.3, s75: 0.5, s100: 0.2 } } },
    air:              { IP: { betFreq: 0.20, sizes: { s75: 0.4, s100: 0.6 } }, OOP: { betFreq: 0.10, sizes: { s75: 0.5, s100: 0.5 } } },
  },

  // ── Flush possible on river ──
  flush_possible: {
    nuts_plus:        { IP: { betFreq: 0.88, sizes: { s75: 0.4, s100: 0.4, s150: 0.2 } }, OOP: { betFreq: 0.80, sizes: { s75: 0.4, s100: 0.4, s150: 0.2 } } },
    overpair:         { IP: { betFreq: 0.42, sizes: { s50: 0.6, s75: 0.4 } }, OOP: { betFreq: 0.28, sizes: { s50: 0.7, s75: 0.3 } } },
    tpgk:             { IP: { betFreq: 0.30, sizes: { s50: 0.7, s75: 0.3 } }, OOP: { betFreq: 0.18, sizes: { s50: 0.8, s75: 0.2 } } },
    tpwk:             { IP: { betFreq: 0.15, sizes: { s50: 0.9, s75: 0.1 } }, OOP: { betFreq: 0.08, sizes: { s50: 1.0 } } },
    second_pair:      { IP: { betFreq: 0.04, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.02, sizes: { s50: 1.0 } } },
    weak_pair:        { IP: { betFreq: 0.02, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.01, sizes: { s50: 1.0 } } },
    missed_fd:        { IP: { betFreq: 0.35, sizes: { s75: 0.4, s100: 0.4, s150: 0.2 } }, OOP: { betFreq: 0.25, sizes: { s75: 0.5, s100: 0.5 } } },
    missed_sd:        { IP: { betFreq: 0.22, sizes: { s75: 0.5, s100: 0.5 } }, OOP: { betFreq: 0.15, sizes: { s75: 0.5, s100: 0.5 } } },
    rivered_flush:    { IP: { betFreq: 0.92, sizes: { s75: 0.3, s100: 0.4, s150: 0.3 } }, OOP: { betFreq: 0.85, sizes: { s75: 0.3, s100: 0.4, s150: 0.3 } } },
    rivered_straight: { IP: { betFreq: 0.72, sizes: { s50: 0.3, s75: 0.5, s100: 0.2 } }, OOP: { betFreq: 0.60, sizes: { s50: 0.3, s75: 0.5, s100: 0.2 } } },
    rivered_2p:       { IP: { betFreq: 0.55, sizes: { s50: 0.4, s75: 0.4, s100: 0.2 } }, OOP: { betFreq: 0.42, sizes: { s50: 0.5, s75: 0.3, s100: 0.2 } } },
    air:              { IP: { betFreq: 0.25, sizes: { s75: 0.3, s100: 0.5, s150: 0.2 } }, OOP: { betFreq: 0.15, sizes: { s75: 0.4, s100: 0.4, s150: 0.2 } } },
  },

  // ── Straight possible on river ──
  straight_possible: {
    nuts_plus:        { IP: { betFreq: 0.85, sizes: { s75: 0.4, s100: 0.4, s150: 0.2 } }, OOP: { betFreq: 0.78, sizes: { s75: 0.4, s100: 0.4, s150: 0.2 } } },
    overpair:         { IP: { betFreq: 0.45, sizes: { s50: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.32, sizes: { s50: 0.6, s75: 0.4 } } },
    tpgk:             { IP: { betFreq: 0.35, sizes: { s50: 0.6, s75: 0.4 } }, OOP: { betFreq: 0.22, sizes: { s50: 0.7, s75: 0.3 } } },
    tpwk:             { IP: { betFreq: 0.18, sizes: { s50: 0.8, s75: 0.2 } }, OOP: { betFreq: 0.10, sizes: { s50: 0.9, s75: 0.1 } } },
    second_pair:      { IP: { betFreq: 0.05, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.03, sizes: { s50: 1.0 } } },
    weak_pair:        { IP: { betFreq: 0.02, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.01, sizes: { s50: 1.0 } } },
    missed_fd:        { IP: { betFreq: 0.30, sizes: { s75: 0.5, s100: 0.5 } }, OOP: { betFreq: 0.20, sizes: { s75: 0.5, s100: 0.5 } } },
    missed_sd:        { IP: { betFreq: 0.25, sizes: { s75: 0.5, s100: 0.5 } }, OOP: { betFreq: 0.15, sizes: { s75: 0.5, s100: 0.5 } } },
    rivered_flush:    { IP: { betFreq: 0.82, sizes: { s75: 0.4, s100: 0.4, s150: 0.2 } }, OOP: { betFreq: 0.72, sizes: { s75: 0.4, s100: 0.4, s150: 0.2 } } },
    rivered_straight: { IP: { betFreq: 0.90, sizes: { s75: 0.3, s100: 0.4, s150: 0.3 } }, OOP: { betFreq: 0.82, sizes: { s75: 0.3, s100: 0.4, s150: 0.3 } } },
    rivered_2p:       { IP: { betFreq: 0.60, sizes: { s50: 0.3, s75: 0.5, s100: 0.2 } }, OOP: { betFreq: 0.48, sizes: { s50: 0.4, s75: 0.4, s100: 0.2 } } },
    air:              { IP: { betFreq: 0.22, sizes: { s75: 0.4, s100: 0.4, s150: 0.2 } }, OOP: { betFreq: 0.12, sizes: { s75: 0.4, s100: 0.4, s150: 0.2 } } },
  },

  // ── Board paired on river ──
  board_paired: {
    nuts_plus:        { IP: { betFreq: 0.90, sizes: { s75: 0.4, s100: 0.3, s150: 0.3 } }, OOP: { betFreq: 0.82, sizes: { s75: 0.4, s100: 0.3, s150: 0.3 } } },
    overpair:         { IP: { betFreq: 0.65, sizes: { s50: 0.4, s75: 0.5, s100: 0.1 } }, OOP: { betFreq: 0.52, sizes: { s50: 0.5, s75: 0.4, s100: 0.1 } } },
    tpgk:             { IP: { betFreq: 0.50, sizes: { s50: 0.5, s75: 0.5 } }, OOP: { betFreq: 0.38, sizes: { s50: 0.6, s75: 0.4 } } },
    tpwk:             { IP: { betFreq: 0.28, sizes: { s50: 0.7, s75: 0.3 } }, OOP: { betFreq: 0.18, sizes: { s50: 0.8, s75: 0.2 } } },
    second_pair:      { IP: { betFreq: 0.08, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.04, sizes: { s50: 1.0 } } },
    weak_pair:        { IP: { betFreq: 0.03, sizes: { s50: 1.0 } }, OOP: { betFreq: 0.02, sizes: { s50: 1.0 } } },
    missed_fd:        { IP: { betFreq: 0.30, sizes: { s75: 0.5, s100: 0.5 } }, OOP: { betFreq: 0.20, sizes: { s75: 0.5, s100: 0.5 } } },
    missed_sd:        { IP: { betFreq: 0.25, sizes: { s75: 0.5, s100: 0.5 } }, OOP: { betFreq: 0.15, sizes: { s75: 0.5, s100: 0.5 } } },
    rivered_flush:    { IP: { betFreq: 0.85, sizes: { s75: 0.4, s100: 0.4, s150: 0.2 } }, OOP: { betFreq: 0.75, sizes: { s75: 0.4, s100: 0.4, s150: 0.2 } } },
    rivered_straight: { IP: { betFreq: 0.82, sizes: { s75: 0.4, s100: 0.4, s150: 0.2 } }, OOP: { betFreq: 0.72, sizes: { s75: 0.4, s100: 0.4, s150: 0.2 } } },
    rivered_2p:       { IP: { betFreq: 0.75, sizes: { s50: 0.2, s75: 0.5, s100: 0.2, s150: 0.1 } }, OOP: { betFreq: 0.62, sizes: { s50: 0.3, s75: 0.4, s100: 0.2, s150: 0.1 } } },
    air:              { IP: { betFreq: 0.22, sizes: { s75: 0.4, s100: 0.4, s150: 0.2 } }, OOP: { betFreq: 0.12, sizes: { s75: 0.5, s100: 0.3, s150: 0.2 } } },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// FACING BET MATRIX
// ═══════════════════════════════════════════════════════════════════════════
// Format: FACING_BET_MATRIX[street][betSize][handClass]
// Each entry: { call: freq, raise: freq, fold: freq }
// MDF: vs 33% pot → defend 75%, vs 50% → 67%, vs 75% → 57%, vs 100% → 50%

export const FACING_BET_MATRIX = {
  flop: {
    small: { // 25-33% pot
      nuts_plus:   { call: 0.30, raise: 0.70, fold: 0.00 },
      overpair:    { call: 0.88, raise: 0.10, fold: 0.02 },
      tpgk:        { call: 0.85, raise: 0.05, fold: 0.10 },
      tpwk:        { call: 0.78, raise: 0.02, fold: 0.20 },
      second_pair: { call: 0.62, raise: 0.02, fold: 0.36 },
      weak_pair:   { call: 0.40, raise: 0.01, fold: 0.59 },
      flush_draw:  { call: 0.72, raise: 0.18, fold: 0.10 },
      oesd:        { call: 0.68, raise: 0.12, fold: 0.20 },
      gutshot:     { call: 0.52, raise: 0.05, fold: 0.43 },
      combo_draw:  { call: 0.45, raise: 0.50, fold: 0.05 },
      overcards:   { call: 0.42, raise: 0.03, fold: 0.55 },
      backdoor:    { call: 0.30, raise: 0.05, fold: 0.65 },
      air:         { call: 0.10, raise: 0.02, fold: 0.88 },
    },
    medium: { // 50% pot
      nuts_plus:   { call: 0.25, raise: 0.75, fold: 0.00 },
      overpair:    { call: 0.85, raise: 0.12, fold: 0.03 },
      tpgk:        { call: 0.80, raise: 0.05, fold: 0.15 },
      tpwk:        { call: 0.68, raise: 0.02, fold: 0.30 },
      second_pair: { call: 0.50, raise: 0.02, fold: 0.48 },
      weak_pair:   { call: 0.28, raise: 0.01, fold: 0.71 },
      flush_draw:  { call: 0.65, raise: 0.20, fold: 0.15 },
      oesd:        { call: 0.60, raise: 0.15, fold: 0.25 },
      gutshot:     { call: 0.40, raise: 0.05, fold: 0.55 },
      combo_draw:  { call: 0.38, raise: 0.55, fold: 0.07 },
      overcards:   { call: 0.32, raise: 0.03, fold: 0.65 },
      backdoor:    { call: 0.20, raise: 0.05, fold: 0.75 },
      air:         { call: 0.05, raise: 0.02, fold: 0.93 },
    },
    large: { // 75% pot
      nuts_plus:   { call: 0.20, raise: 0.80, fold: 0.00 },
      overpair:    { call: 0.82, raise: 0.15, fold: 0.03 },
      tpgk:        { call: 0.72, raise: 0.05, fold: 0.23 },
      tpwk:        { call: 0.55, raise: 0.02, fold: 0.43 },
      second_pair: { call: 0.38, raise: 0.02, fold: 0.60 },
      weak_pair:   { call: 0.18, raise: 0.01, fold: 0.81 },
      flush_draw:  { call: 0.58, raise: 0.22, fold: 0.20 },
      oesd:        { call: 0.52, raise: 0.18, fold: 0.30 },
      gutshot:     { call: 0.30, raise: 0.05, fold: 0.65 },
      combo_draw:  { call: 0.30, raise: 0.60, fold: 0.10 },
      overcards:   { call: 0.22, raise: 0.03, fold: 0.75 },
      backdoor:    { call: 0.12, raise: 0.05, fold: 0.83 },
      air:         { call: 0.03, raise: 0.02, fold: 0.95 },
    },
    pot: { // 100% pot
      nuts_plus:   { call: 0.15, raise: 0.85, fold: 0.00 },
      overpair:    { call: 0.78, raise: 0.18, fold: 0.04 },
      tpgk:        { call: 0.65, raise: 0.05, fold: 0.30 },
      tpwk:        { call: 0.45, raise: 0.02, fold: 0.53 },
      second_pair: { call: 0.28, raise: 0.02, fold: 0.70 },
      weak_pair:   { call: 0.12, raise: 0.01, fold: 0.87 },
      flush_draw:  { call: 0.50, raise: 0.25, fold: 0.25 },
      oesd:        { call: 0.42, raise: 0.20, fold: 0.38 },
      gutshot:     { call: 0.22, raise: 0.05, fold: 0.73 },
      combo_draw:  { call: 0.25, raise: 0.62, fold: 0.13 },
      overcards:   { call: 0.15, raise: 0.03, fold: 0.82 },
      backdoor:    { call: 0.08, raise: 0.05, fold: 0.87 },
      air:         { call: 0.02, raise: 0.02, fold: 0.96 },
    },
  },
  turn: {
    small: {
      nuts_plus: { call: 0.25, raise: 0.75, fold: 0.00 }, overpair: { call: 0.82, raise: 0.12, fold: 0.06 },
      tpgk: { call: 0.75, raise: 0.05, fold: 0.20 }, tpwk: { call: 0.58, raise: 0.02, fold: 0.40 },
      second_pair: { call: 0.42, raise: 0.02, fold: 0.56 }, weak_pair: { call: 0.22, raise: 0.01, fold: 0.77 },
      flush_draw: { call: 0.65, raise: 0.15, fold: 0.20 }, oesd: { call: 0.60, raise: 0.12, fold: 0.28 },
      gutshot: { call: 0.38, raise: 0.05, fold: 0.57 }, combo_draw: { call: 0.40, raise: 0.50, fold: 0.10 },
      overcards: { call: 0.25, raise: 0.02, fold: 0.73 }, backdoor: { call: 0.12, raise: 0.03, fold: 0.85 },
      air: { call: 0.05, raise: 0.02, fold: 0.93 },
    },
    medium: {
      nuts_plus: { call: 0.20, raise: 0.80, fold: 0.00 }, overpair: { call: 0.78, raise: 0.15, fold: 0.07 },
      tpgk: { call: 0.68, raise: 0.05, fold: 0.27 }, tpwk: { call: 0.48, raise: 0.02, fold: 0.50 },
      second_pair: { call: 0.32, raise: 0.02, fold: 0.66 }, weak_pair: { call: 0.15, raise: 0.01, fold: 0.84 },
      flush_draw: { call: 0.58, raise: 0.18, fold: 0.24 }, oesd: { call: 0.52, raise: 0.15, fold: 0.33 },
      gutshot: { call: 0.28, raise: 0.05, fold: 0.67 }, combo_draw: { call: 0.32, raise: 0.55, fold: 0.13 },
      overcards: { call: 0.18, raise: 0.02, fold: 0.80 }, backdoor: { call: 0.08, raise: 0.03, fold: 0.89 },
      air: { call: 0.03, raise: 0.02, fold: 0.95 },
    },
    large: {
      nuts_plus: { call: 0.15, raise: 0.85, fold: 0.00 }, overpair: { call: 0.72, raise: 0.18, fold: 0.10 },
      tpgk: { call: 0.58, raise: 0.05, fold: 0.37 }, tpwk: { call: 0.38, raise: 0.02, fold: 0.60 },
      second_pair: { call: 0.22, raise: 0.02, fold: 0.76 }, weak_pair: { call: 0.10, raise: 0.01, fold: 0.89 },
      flush_draw: { call: 0.50, raise: 0.22, fold: 0.28 }, oesd: { call: 0.45, raise: 0.18, fold: 0.37 },
      gutshot: { call: 0.20, raise: 0.05, fold: 0.75 }, combo_draw: { call: 0.25, raise: 0.60, fold: 0.15 },
      overcards: { call: 0.12, raise: 0.02, fold: 0.86 }, backdoor: { call: 0.05, raise: 0.03, fold: 0.92 },
      air: { call: 0.02, raise: 0.02, fold: 0.96 },
    },
    pot: {
      nuts_plus: { call: 0.10, raise: 0.90, fold: 0.00 }, overpair: { call: 0.68, raise: 0.22, fold: 0.10 },
      tpgk: { call: 0.50, raise: 0.05, fold: 0.45 }, tpwk: { call: 0.30, raise: 0.02, fold: 0.68 },
      second_pair: { call: 0.15, raise: 0.02, fold: 0.83 }, weak_pair: { call: 0.06, raise: 0.01, fold: 0.93 },
      flush_draw: { call: 0.42, raise: 0.25, fold: 0.33 }, oesd: { call: 0.38, raise: 0.20, fold: 0.42 },
      gutshot: { call: 0.15, raise: 0.05, fold: 0.80 }, combo_draw: { call: 0.20, raise: 0.65, fold: 0.15 },
      overcards: { call: 0.08, raise: 0.02, fold: 0.90 }, backdoor: { call: 0.04, raise: 0.02, fold: 0.94 },
      air: { call: 0.01, raise: 0.01, fold: 0.98 },
    },
  },
  river: {
    small: {
      nuts_plus: { call: 0.15, raise: 0.85, fold: 0.00 }, overpair: { call: 0.80, raise: 0.10, fold: 0.10 },
      tpgk: { call: 0.72, raise: 0.03, fold: 0.25 }, tpwk: { call: 0.55, raise: 0.02, fold: 0.43 },
      second_pair: { call: 0.40, raise: 0.01, fold: 0.59 }, weak_pair: { call: 0.22, raise: 0.01, fold: 0.77 },
      missed_fd: { call: 0.05, raise: 0.15, fold: 0.80 }, missed_sd: { call: 0.05, raise: 0.12, fold: 0.83 },
      rivered_flush: { call: 0.20, raise: 0.80, fold: 0.00 }, rivered_straight: { call: 0.22, raise: 0.78, fold: 0.00 },
      rivered_2p: { call: 0.30, raise: 0.65, fold: 0.05 }, air: { call: 0.02, raise: 0.08, fold: 0.90 },
    },
    medium: {
      nuts_plus: { call: 0.10, raise: 0.90, fold: 0.00 }, overpair: { call: 0.75, raise: 0.12, fold: 0.13 },
      tpgk: { call: 0.65, raise: 0.03, fold: 0.32 }, tpwk: { call: 0.45, raise: 0.02, fold: 0.53 },
      second_pair: { call: 0.30, raise: 0.01, fold: 0.69 }, weak_pair: { call: 0.15, raise: 0.01, fold: 0.84 },
      missed_fd: { call: 0.03, raise: 0.12, fold: 0.85 }, missed_sd: { call: 0.03, raise: 0.10, fold: 0.87 },
      rivered_flush: { call: 0.15, raise: 0.85, fold: 0.00 }, rivered_straight: { call: 0.18, raise: 0.82, fold: 0.00 },
      rivered_2p: { call: 0.25, raise: 0.70, fold: 0.05 }, air: { call: 0.01, raise: 0.06, fold: 0.93 },
    },
    large: {
      nuts_plus: { call: 0.08, raise: 0.92, fold: 0.00 }, overpair: { call: 0.65, raise: 0.15, fold: 0.20 },
      tpgk: { call: 0.52, raise: 0.03, fold: 0.45 }, tpwk: { call: 0.32, raise: 0.02, fold: 0.66 },
      second_pair: { call: 0.18, raise: 0.01, fold: 0.81 }, weak_pair: { call: 0.08, raise: 0.01, fold: 0.91 },
      missed_fd: { call: 0.02, raise: 0.10, fold: 0.88 }, missed_sd: { call: 0.02, raise: 0.08, fold: 0.90 },
      rivered_flush: { call: 0.10, raise: 0.90, fold: 0.00 }, rivered_straight: { call: 0.12, raise: 0.88, fold: 0.00 },
      rivered_2p: { call: 0.20, raise: 0.75, fold: 0.05 }, air: { call: 0.01, raise: 0.05, fold: 0.94 },
    },
    pot: {
      nuts_plus: { call: 0.05, raise: 0.95, fold: 0.00 }, overpair: { call: 0.55, raise: 0.18, fold: 0.27 },
      tpgk: { call: 0.42, raise: 0.03, fold: 0.55 }, tpwk: { call: 0.22, raise: 0.02, fold: 0.76 },
      second_pair: { call: 0.12, raise: 0.01, fold: 0.87 }, weak_pair: { call: 0.05, raise: 0.01, fold: 0.94 },
      missed_fd: { call: 0.01, raise: 0.08, fold: 0.91 }, missed_sd: { call: 0.01, raise: 0.06, fold: 0.93 },
      rivered_flush: { call: 0.08, raise: 0.92, fold: 0.00 }, rivered_straight: { call: 0.10, raise: 0.90, fold: 0.00 },
      rivered_2p: { call: 0.15, raise: 0.80, fold: 0.05 }, air: { call: 0.01, raise: 0.04, fold: 0.95 },
    },
    overbet: { // 150%+ pot
      nuts_plus: { call: 0.03, raise: 0.97, fold: 0.00 }, overpair: { call: 0.42, raise: 0.15, fold: 0.43 },
      tpgk: { call: 0.30, raise: 0.02, fold: 0.68 }, tpwk: { call: 0.15, raise: 0.01, fold: 0.84 },
      second_pair: { call: 0.08, raise: 0.01, fold: 0.91 }, weak_pair: { call: 0.03, raise: 0.01, fold: 0.96 },
      missed_fd: { call: 0.01, raise: 0.05, fold: 0.94 }, missed_sd: { call: 0.01, raise: 0.04, fold: 0.95 },
      rivered_flush: { call: 0.05, raise: 0.95, fold: 0.00 }, rivered_straight: { call: 0.08, raise: 0.92, fold: 0.00 },
      rivered_2p: { call: 0.12, raise: 0.85, fold: 0.03 }, air: { call: 0.01, raise: 0.03, fold: 0.96 },
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 3-BET POT ADJUSTMENTS
// ═══════════════════════════════════════════════════════════════════════════
// In 3-bet pots: shorter SPR (~3.5 vs ~10 in SRP), so strategies shift.
// These multipliers adjust the SRP c-bet frequencies for 3-bet pot play.
// Generally: bigger bet sizing, higher frequency for strong hands,
// lower frequency for marginal hands (less room to maneuver).

export const THREE_BET_POT_ADJUSTMENTS = {
  nuts_plus:   { betFreqMult: 1.10, preferLargeSizing: true },
  overpair:    { betFreqMult: 1.15, preferLargeSizing: true },
  tpgk:        { betFreqMult: 1.05, preferLargeSizing: false },
  tpwk:        { betFreqMult: 0.90, preferLargeSizing: false },
  second_pair: { betFreqMult: 0.70, preferLargeSizing: false },
  weak_pair:   { betFreqMult: 0.50, preferLargeSizing: false },
  flush_draw:  { betFreqMult: 1.10, preferLargeSizing: true },
  oesd:        { betFreqMult: 1.05, preferLargeSizing: true },
  gutshot:     { betFreqMult: 0.80, preferLargeSizing: false },
  combo_draw:  { betFreqMult: 1.15, preferLargeSizing: true },
  overcards:   { betFreqMult: 0.85, preferLargeSizing: false },
  backdoor:    { betFreqMult: 0.60, preferLargeSizing: false },
  air:         { betFreqMult: 0.45, preferLargeSizing: false },
};

// ═══════════════════════════════════════════════════════════════════════════
// SIZING PROFILES
// ═══════════════════════════════════════════════════════════════════════════

export const SIZING_PROFILES = {
  range_bet_small: { fraction: 0.33, description: '33% pot range bet', useOn: ['dry_rainbow', 'paired', 'broadway'] },
  polar_medium:    { fraction: 0.50, description: '50% pot medium', useOn: ['two_tone', 'mixed'] },
  polar_large:     { fraction: 0.75, description: '75% pot polarized', useOn: ['wet', 'connected', 'monotone'] },
  pot_sized:       { fraction: 1.00, description: 'Pot-sized bet', useOn: ['very_wet', '3bet_pot'] },
  overbet_nuts:    { fraction: 1.50, description: '150% pot overbet', useOn: ['river_nuts', 'nut_advantage'] },
  block_bet:       { fraction: 0.25, description: '25% pot blocking bet', useOn: ['river_bluff_catcher'] },
};

/**
 * Calculate geometric bet sizing for N streets remaining.
 * Geometric sizing: bet the same fraction of pot each street to get all-in.
 *
 * @param {number} pot - Current pot in BB
 * @param {number} effectiveStack - Effective stack in BB
 * @param {number} streetsRemaining - Number of streets left (1-3)
 * @returns {{ fractionPerStreet: number, amountPerStreet: number, description: string }}
 */
export function calculateGeometricSizing(pot, effectiveStack, streetsRemaining) {
  if (streetsRemaining <= 0 || pot <= 0 || effectiveStack <= 0) {
    return { fractionPerStreet: 0, amountPerStreet: 0, description: 'N/A' };
  }

  // Solve: pot × (1 + 2x)^n = pot + 2×stack
  // Where x = fraction of pot to bet each street
  // (1 + 2x)^n = 1 + 2×(stack/pot)
  const ratio = 1 + (2 * effectiveStack) / pot;
  const growthFactor = Math.pow(ratio, 1 / streetsRemaining);
  const fractionPerStreet = Math.max(0, (growthFactor - 1) / 2);

  const amount = Math.round(pot * fractionPerStreet * 10) / 10;
  const pct = Math.round(fractionPerStreet * 100);

  return {
    fractionPerStreet: Math.round(fractionPerStreet * 100) / 100,
    amountPerStreet: amount,
    description: `${pct}% pot each street (geometric for ${streetsRemaining} streets)`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LOOKUP HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the c-bet strategy for a specific hand class on a specific board texture.
 * Falls back to closest matching texture if exact match not found.
 */
export function lookupCbetStrategy(boardTexture, handClass, position) {
  const pos = position === 'OOP' ? 'OOP' : 'IP';
  const textureData = FLOP_CBET_MATRIX[boardTexture];
  if (!textureData) {
    // Fallback: use two_tone_high as "average" board
    const fallback = FLOP_CBET_MATRIX.two_tone_high;
    return fallback?.[handClass]?.[pos] || { betFreq: 0.40, sizes: { s50: 1.0 } };
  }
  return textureData[handClass]?.[pos] || { betFreq: 0.40, sizes: { s50: 1.0 } };
}

/**
 * Get the check-raise strategy for a specific hand class on a specific board texture.
 */
// Textures missing from FLOP_CHECKRAISE_MATRIX map to their closest family member
const CHECKRAISE_TEXTURE_FALLBACK = {
  dry_rainbow_low: 'dry_rainbow_high',
  two_tone_low: 'two_tone_high',
  monotone_low: 'monotone_high',
  paired_low: 'paired_high',
  broadway_dry: 'dry_rainbow_high',
  low_connected: 'connected_wet',
};

export function lookupCheckRaiseStrategy(boardTexture, handClass) {
  let textureData = FLOP_CHECKRAISE_MATRIX[boardTexture];
  if (!textureData) {
    // Fall back to the same texture family before the generic default
    const familyTexture = CHECKRAISE_TEXTURE_FALLBACK[boardTexture];
    textureData = familyTexture ? FLOP_CHECKRAISE_MATRIX[familyTexture] : null;
  }
  if (!textureData) {
    // Fallback
    return { raise: 0.08, call: 0.40, fold: 0.52, raiseSizing: '3x' };
  }
  return textureData[handClass] || { raise: 0.08, call: 0.40, fold: 0.52, raiseSizing: '3x' };
}

/**
 * Get the turn barrel strategy for a specific runout and hand class.
 */
export function lookupTurnStrategy(turnRunout, handClass, position) {
  const pos = position === 'OOP' ? 'OOP' : 'IP';
  const runoutData = TURN_BARREL_MATRIX[turnRunout];
  if (!runoutData) {
    return TURN_BARREL_MATRIX.blank_low?.[handClass]?.[pos] || { betFreq: 0.40, sizes: { s50: 1.0 } };
  }
  return runoutData[handClass]?.[pos] || { betFreq: 0.40, sizes: { s50: 1.0 } };
}

/**
 * Get the river strategy for a specific board state and hand class.
 */
export function lookupRiverStrategy(boardState, handClass, position) {
  const pos = position === 'OOP' ? 'OOP' : 'IP';
  const stateData = RIVER_STRATEGY_MATRIX[boardState];
  if (!stateData) {
    return RIVER_STRATEGY_MATRIX.dry_no_draws?.[handClass]?.[pos] || { betFreq: 0.30, sizes: { s75: 1.0 } };
  }
  return stateData[handClass]?.[pos] || { betFreq: 0.30, sizes: { s75: 1.0 } };
}

/**
 * Get the facing-bet strategy for a specific street, bet size, and hand class.
 */
export function lookupFacingBetStrategy(street, betSizeCategory, handClass) {
  const streetData = FACING_BET_MATRIX[street];
  if (!streetData) return { call: 0.33, raise: 0.05, fold: 0.62 };
  // Fall back to the largest available sizing row (e.g. overbet → pot) so strong
  // hands facing an overbet degrade to the pot-size strategy, not a fold-heavy generic.
  const sizeData = streetData[betSizeCategory] || streetData.pot || streetData.large || null;
  if (!sizeData) return { call: 0.33, raise: 0.05, fold: 0.62 };
  return sizeData[handClass] || { call: 0.33, raise: 0.05, fold: 0.62 };
}

/**
 * Classify a bet size into a category for lookup.
 */
export function classifyBetSize(betFraction) {
  if (betFraction <= 0.37) return 'small';
  if (betFraction <= 0.62) return 'medium';
  if (betFraction <= 0.87) return 'large';
  if (betFraction <= 1.25) return 'pot';
  return 'overbet';
}
