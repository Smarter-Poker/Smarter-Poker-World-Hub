// Public trivia leaderboards name players from the server-written
// `trivia_scores.username`, never from `public.profiles`.
//
// Signed-out visitors run as `anon`, and Club Arena migration
// 20260826152329_anon_has_no_business_reading_profiles_columns deliberately
// revoked every `anon` SELECT on `public.profiles` (PII). Any browser read of
// `profiles` from a public leaderboard therefore fails with Postgres 42501
// "permission denied for table profiles". `trivia_scores.username` is the
// sanctioned public surface: the settlement RPC copies the username onto each
// verified score row, and `anon` may read it on server-verified rows only
// (policy "Verified trivia scores are viewable by all").

function rowTime(row) {
    return String(row?.play_date || '') + '|' + String(row?.created_at || '');
}

// Map user_id -> the username on that player's newest verified score row.
export function latestVerifiedUsernames(rows) {
    const newest = new Map();
    for (const row of rows || []) {
        if (!row || row.server_verified === false) continue;
        const name = typeof row.username === 'string' ? row.username.trim() : '';
        if (!row.user_id || !name) continue;
        const seen = newest.get(row.user_id);
        if (!seen || rowTime(row) > seen.time) newest.set(row.user_id, { name, time: rowTime(row) });
    }
    const out = {};
    for (const [userId, { name }] of newest) out[userId] = name;
    return out;
}
