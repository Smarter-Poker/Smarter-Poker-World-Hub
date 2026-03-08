/**
 * ═══════════════════════════════════════════════════════════
 * STICKER ORCHESTRATOR — Smarter.Poker / Club Arena
 * ═══════════════════════════════════════════════════════════
 *
 * Derives which sticker assets to display on a game card based on:
 *   • Game settings (features enabled at table/tournament creation)
 *   • Live table stats (VPIP, player count)
 *   • Tournament type (payout_structure, ko_bounty, etc.)
 *
 * Returns an ordered array of sticker keys that map directly to
 * the `sticker_assets` Supabase table `key` column.
 *
 * Usage:
 *   import { getGameStickers } from '@/lib/stickerOrchestrator';
 *   const stickers = getGameStickers(table);   // or getGameStickers(tournament)
 */

// ─────────────────────────────────────────────────────────────
// VPIP THRESHOLDS
// ─────────────────────────────────────────────────────────────
const VPIP_60_MIN = 60;
const VPIP_50_MIN = 50;
const VPIP_40_MIN = 40;

/**
 * Derive VPIP bucket from a live average VPIP value.
 * Returns the sticker key or null.
 */
function vpipStickerKey(avgVpip) {
  if (avgVpip == null || avgVpip <= 0) return null;
  if (avgVpip >= VPIP_60_MIN) return 'vpip_60';
  if (avgVpip >= VPIP_50_MIN) return 'vpip_50';
  if (avgVpip >= VPIP_40_MIN) return 'vpip_40';
  return null;
}

// ─────────────────────────────────────────────────────────────
// CASH GAME STICKER RULES
// Maps settings keys → sticker keys (in display priority order)
// ─────────────────────────────────────────────────────────────
const CASH_STICKER_RULES = [
  // Format / Game Mode
  { stickerKey: 'winner_takes_all',   test: (s) => s?.payout_structure === 'winner_take_all' },
  { stickerKey: 'bomb_pot',           test: (s) => s?.bomb_pot_enabled || s?.bomb_pot },
  { stickerKey: 'double_board',       test: (s) => s?.double_board },
  { stickerKey: 'triple_board',       test: (s) => s?.triple_board },
  { stickerKey: 'straddle',           test: (s) => s?.straddle_enabled || s?.auto_utg_straddle || s?.voluntary_straddle },
  { stickerKey: 'run_it_twice',       test: (s) => s?.run_it_twice || s?.run_it_mode === 'mandatory_twice' || s?.run_it_mode === 'player_choice' },
  { stickerKey: 'run_it_thrice',      test: (s) => s?.run_it_thrice || s?.run_it_mode === 'mandatory_thrice' },
  { stickerKey: 'insurance',          test: (s) => s?.insurance },
  { stickerKey: 'anonymous',          test: (s) => s?.anonymous_table },
  { stickerKey: 'nit_game',           test: (s) => s?.nit_game },
  { stickerKey: 'seven_deuce',        test: (s) => s?.seven_deuce },
  { stickerKey: 'cap_game',           test: (s) => s?.cap },
  { stickerKey: 'vip_only',           test: (s) => s?.vip_only },
  { stickerKey: 'private',            test: (s) => s?.private_game },
  { stickerKey: 'new',                test: (s) => s?.label_new },
  { stickerKey: 'featured',           test: (s) => s?.featured_table },
];

// ─────────────────────────────────────────────────────────────
// TOURNAMENT STICKER RULES
// ─────────────────────────────────────────────────────────────
const TOURNAMENT_STICKER_RULES = [
  { stickerKey: 'winner_takes_all',   test: (s) => s?.payout_structure === 'winner_take_all' },
  { stickerKey: 'ko_bounty',          test: (s) => s?.ko_bounty },
  { stickerKey: 'satellite',          test: (s) => s?.satellite },
  { stickerKey: 'rebuy',              test: (s) => s?.number_of_rebuys > 0 },
  { stickerKey: 'addon',              test: (s) => s?.custom_add_on },
  { stickerKey: 'gtd',                test: (s) => s?.gtd_prize_pool },
  { stickerKey: 'big_blind_ante',     test: (s) => s?.big_blind_ante },
  { stickerKey: 'accelerated',        test: (s) => s?.accelerated_mtt },
  { stickerKey: 'all_in_or_fold',     test: (s) => s?.all_in_or_fold },
  { stickerKey: 'bubble_protection',  test: (s) => s?.bubble_protection },
  { stickerKey: 'early_bird',         test: (s) => s?.early_bird_registration },
  { stickerKey: 'multi_day',          test: (s) => s?.multi_day_mtt },
  { stickerKey: 'final_table_deal',   test: (s) => s?.final_table_deal },
  { stickerKey: 'vip_only',           test: (s) => s?.vip_only },
  { stickerKey: 'featured',           test: (s) => s?.featured_tournament },
  { stickerKey: 'new',                test: (s) => s?.label_new },
  { stickerKey: 'private',            test: (s) => s?.private_game },
];

// ─────────────────────────────────────────────────────────────
// MAX STICKERS TO SHOW (cards are small — don't overload)
// ─────────────────────────────────────────────────────────────
const MAX_STICKERS_CASH       = 3;
const MAX_STICKERS_TOURNAMENT = 3;

// ─────────────────────────────────────────────────────────────
// PRIMARY EXPORTS
// ─────────────────────────────────────────────────────────────

/**
 * Get sticker keys for a CASH GAME table row.
 *
 * @param {object} table   - Row from `tables` (includes .settings JSONB)
 * @param {number} [avgVpip] - Optional: live average VPIP across seated players (0–100)
 * @param {number} [maxStickers] - Override max sticker count
 * @returns {string[]} Array of sticker keys (up to maxStickers)
 */
export function getCashStickers(table, avgVpip = null, maxStickers = MAX_STICKERS_CASH) {
  const s = table?.settings || table;
  const result = [];

  // 1. VPIP dynamic sticker (always first if applicable)
  const vpipKey = vpipStickerKey(avgVpip ?? s?.avg_vpip);
  if (vpipKey) result.push(vpipKey);

  // 2. Feature stickers by priority
  for (const rule of CASH_STICKER_RULES) {
    if (result.length >= maxStickers) break;
    if (rule.test(s) && !result.includes(rule.stickerKey)) {
      result.push(rule.stickerKey);
    }
  }

  return result.slice(0, maxStickers);
}

/**
 * Get sticker keys for a TOURNAMENT row.
 *
 * @param {object} tournament  - Row from `club_tournaments` or `tournaments`
 * @param {number} [maxStickers]
 * @returns {string[]}
 */
export function getTournamentStickers(tournament, maxStickers = MAX_STICKERS_TOURNAMENT) {
  const s = tournament?.settings || tournament;
  const result = [];

  for (const rule of TOURNAMENT_STICKER_RULES) {
    if (result.length >= maxStickers) break;
    if (rule.test(s) && !result.includes(rule.stickerKey)) {
      result.push(rule.stickerKey);
    }
  }

  return result.slice(0, maxStickers);
}

/**
 * Universal dispatcher — auto-detects cash vs tournament.
 *
 * @param {object} game      - Table or tournament row
 * @param {number} [avgVpip] - For cash games only
 * @returns {string[]}
 */
export function getGameStickers(game, avgVpip = null) {
  const isTournament = game?.game_type === 'tournament'
    || game?.game_type === 'sng'
    || game?.game_type === 'mtt'
    || game?.type === 'sng'
    || game?.type === 'mtt'
    || !!game?.registered_count; // tournaments have registered_count

  return isTournament
    ? getTournamentStickers(game)
    : getCashStickers(game, avgVpip);
}

/**
 * Build a full sticker display map from a loaded `sticker_assets` table.
 * Useful for pre-loading all assets at lobby mount.
 *
 * @param {object[]} stickerAssets  - All rows from sticker_assets
 * @returns {object}  key → { label, storage_path, category, sort_order }
 */
export function buildStickerAssetMap(stickerAssets = []) {
  return stickerAssets.reduce((acc, row) => {
    acc[row.key] = {
      label: row.label,
      path: row.storage_path,
      category: row.category,
      sortOrder: row.sort_order,
    };
    return acc;
  }, {});
}
