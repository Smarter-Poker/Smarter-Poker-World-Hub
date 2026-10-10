/** Read session claims only after cryptographic verification has supplied identity. */
export function sessionIdOf(token) {
  try {
    const claims = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claims.session_id)
      ? claims.session_id : null;
  } catch { return null; }
}

/** Unknown never means revoked, and no stale success is cached. */
export async function playerSessionVerdict(db, userId, token) {
  try {
    const { data, error } = await db.rpc('fn_ca_player_session_live', {
      p_user_id: userId, p_session_id: sessionIdOf(token),
    });
    if (error || typeof data !== 'boolean') return 'unknown';
    return data ? 'alive' : 'revoked';
  } catch { return 'unknown'; }
}
