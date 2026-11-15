/** Server-owned live occupancies are the only return links; browser tabs are not seats. */
export function activePokerSeats(seats, sessions) {
  const rooms = new Map((sessions || []).filter(s => !s.exited_at && !['closed', 'ended', 'left', 'cashed_out'].includes(s.state)).map(s => [s.anchor_seat_id, s.id]));
  const seen = new Set();
  return (seats || []).filter(s => s.id && s.table_id && !s.left_at).flatMap(s => {
    const table = Array.isArray(s.tables) ? s.tables[0] : s.tables;
    if (!table || table.is_deleted || table.lifecycle === 'closed') return [];
    const room = rooms.get(s.id) || s.table_id;
    if (seen.has(room)) return [];
    seen.add(room);
    return [{ id: room, name: table.name || 'Your Game', href: `/hub/club-arena/table/${encodeURIComponent(room)}` }];
  });
}
