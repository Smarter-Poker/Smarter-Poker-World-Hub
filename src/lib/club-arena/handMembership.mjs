export function clubArenaParticipantFilter(userId) {
  const id = String(userId || '');
  if (!id) throw new Error('user_id_required');
  const modern = JSON.stringify([{ userId: id }]);
  const legacy = JSON.stringify([{ id }]);
  return `players.cs.${modern},players.cs.${legacy}`;
}

export default { clubArenaParticipantFilter };
