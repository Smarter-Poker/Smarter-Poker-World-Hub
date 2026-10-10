import { fetchAllHomeGameDirectoryRows, markHomeGameDirectoryUnavailable } from './geoDirectoryServer.mjs';

// Shared public projection only. Placement and authorization stay in the
// caller-scoped RSVP RPC; this never returns player identities or addresses.
export async function addPublicHomeGameSeatCounts(supabase, games) {
  const ids = (games || []).map((game) => game.id).filter(Boolean);
  if (!ids.length) return [];
  const result = await fetchAllHomeGameDirectoryRows((start, end) => supabase
    .from('commander_home_rsvps')
    .select('id, game_id, bringing_guests')
    .in('game_id', ids)
    .eq('response', 'yes')
    .order('id', { ascending: true })
    .range(start, end));
  if (result.error || !result.complete) throw result.error || new Error('Incomplete seat counts');
  const seatsByGame = new Map();
  for (const rsvp of result.rows) {
    const guests = Number(rsvp.bringing_guests);
    const seats = 1 + (Number.isFinite(guests) ? Math.max(0, Math.trunc(guests)) : 0);
    seatsByGame.set(rsvp.game_id, (seatsByGame.get(rsvp.game_id) || 0) + seats);
  }
  return games.map((game) => ({ ...game, rsvp_seats: seatsByGame.get(game.id) || 0 }));
}

export function publicHomeGamesUnavailable(res) {
  markHomeGameDirectoryUnavailable(res);
  return res.status(503).json({
    success: false,
    error: { code: 'TEMPORARILY_UNAVAILABLE', message: 'Home Game Information Is Temporarily Unavailable. Please Try Again.' },
  });
}
