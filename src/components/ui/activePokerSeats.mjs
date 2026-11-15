/** Server-owned live occupancies and the authenticated caller's pool RPC. */
export function activePokerSeats(seats, sessions) {
  const rooms = Array.isArray(sessions) ? sessions.filter(s => s.pool_session_id && s.cluster_id) : [];
  const poolClusters = new Set(rooms.map(s => s.cluster_id));
  const candidates = rooms.map(s => ({id: s.pool_session_id, name: s.name || 'Lightning'}));
  for (const seat of seats || []) {
    const table = Array.isArray(seat.tables) ? seat.tables[0] : seat.tables;
    if (!seat.id || !seat.table_id || seat.left_at || !table || table.is_deleted || table.lifecycle === 'closed' || poolClusters.has(table.cluster_id)) continue;
    candidates.push({id:seat.table_id,name:table.name || 'Your Game'});
  }
  const seen = new Set();
  return candidates.filter(s => !seen.has(s.id) && seen.add(s.id)).map(s => ({...s,href:`/hub/club-arena/table/${encodeURIComponent(s.id)}`}));
}
