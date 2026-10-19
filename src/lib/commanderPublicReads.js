/**
 * Shapes for the PUBLIC Commander reads the player pages use (2026-10-19).
 *
 * The player pages under /hub/commander used to call the staff listings
 * (/api/commander/promotions, /leaderboards, /leagues, /games/venue/:id),
 * which have been staff-only since the 2026-08-20 Commander audit, so every
 * player got 401 "Staff Authentication Required". They now read the public,
 * display-column routes (promotions/active, leaderboards/active,
 * leagues/active, games/live). Those name a few fields differently from the
 * staff rows the page components were written against; these helpers map
 * them back so the existing cards render unchanged.
 */

export function publicPromotionsUrl(venueId) {
  return `/api/commander/promotions/active?venue_id=${encodeURIComponent(venueId)}`;
}

export function publicLeaderboardsUrl(venueId) {
  return `/api/commander/leaderboards/active?venue_id=${encodeURIComponent(venueId)}`;
}

export function publicVenueGamesUrl(venueId) {
  return `/api/commander/games/live?venue_id=${encodeURIComponent(venueId)}`;
}

export const PUBLIC_LEAGUES_URL = '/api/commander/leagues/active';

const TYPE_LABELS = {
  high_hand: 'High Hand',
  bad_beat: 'Bad Beat',
  splash_pot: 'Splash Pot',
  drawing: 'Drawing',
  leaderboard: 'Leaderboard',
};

function titleWords(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** A promotions/active row in the shape PromotionCard renders. */
export function normalizePublicPromotion(p) {
  if (!p || typeof p !== 'object') return null;
  const amount = p.prize_amount ?? p.prize_value;
  const days = Array.isArray(p.days_of_week) && p.days_of_week.length ? p.days_of_week.join(', ') : null;
  return {
    ...p,
    is_active: p.is_active ?? true,
    prize_amount: Number.isFinite(Number(amount)) ? Number(amount) : 0,
    frequency: p.frequency || days || (p.is_recurring ? 'Recurring' : (TYPE_LABELS[p.promotion_type] || titleWords(p.promotion_type) || 'Promotion')),
  };
}

/** A games/live row in the shape the check-in game list renders. */
export function normalizePublicGame(g) {
  if (!g || typeof g !== 'object') return null;
  return {
    ...g,
    table_number: g.table_number ?? g.commander_tables?.table_number ?? null,
    player_count: g.player_count ?? g.current_players ?? 0,
  };
}
