import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * DELETE ACCOUNT API
 * DELETE /api/auth/delete-account
 * Auth: Bearer token required
 *
 * Deletes user profile data from Supabase and signs out the auth user.
 *
 * [2026-07-25] DOC CORRECTION: this endpoint HARD-DELETES. It removes the
 * user's rows and then calls auth.admin.deleteUser() — there is NO disabled
 * state, NO 30-day grace window, and NO recovery. The previous docstring
 * promised soft-delete + recovery that the code never implemented; any UX
 * copy or support script based on that promise was wrong. If a grace window
 * is ever wanted, implement ban/disable + a scheduled purge — don't just
 * edit this comment back.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { rateLimit } from '../../../src/lib/apiRateLimit';
import { requireRecentMfa } from '../../../src/lib/mfaGate';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}


/**
 * GDPR ERASURE, HONESTLY REPORTED.
 *
 * Every erasure step below used to be its own `const { error: err_xxx } = ...`
 * followed by a console.warn, and then the handler returned
 * "Account has been permanently deleted" regardless. So a failed erasure --
 * PII left behind on a user who asked to be forgotten -- was a line in a log
 * nobody reads and a 200 to the user saying it was done. The auth user is then
 * HARD deleted, so there is no account left to retry from and no owner to
 * trace the leftovers back to.
 *
 * A ZERO-ROW match is NOT an error here and is deliberately not treated as
 * one: most users have no MFA factors, no promo redemptions, no friendships.
 * Nothing to erase is a successful erasure.
 *
 * A real error IS a compliance failure, so it is collected and reported.
 */
async function eraseFrom(sb, table, applyFilters, failures) {
    try {
        const { error } = await applyFilters(sb.from(table).delete());
        if (error) {
            console.error(`[delete-account] ERASURE FAILED for ${table}:`, error.message);
            failures.push({ table, error: error.message });
            return false;
        }
        return true;
    } catch (e) {
        console.error(`[delete-account] ERASURE THREW for ${table}:`, e?.message || e);
        failures.push({ table, error: e?.message || String(e) });
        return false;
    }
}

export default async function handler(req, res) {
  const rl = rateLimit(req, { max: 3, windowMs: 3600000 }); // 3 per hour
  if (!rl.ok) return res.status(429).json({ error: 'Too many requests', retryAfter: rl.retryAfter });
  try {
      if (req.method !== 'DELETE') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      // ── AUTH CHECK ──
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Not authenticated' });
      }

      const token = authHeader.replace('Bearer ', '');
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;

      if (authErr || !user) {
          return res.status(401).json({ error: 'Invalid or expired session' });
      }

      // ── [Phase 6.1.27] Step-up MFA gate ─────────────────────────────────
      // Account deletion is irreversible after the 30-day grace window. A
      // stolen 12h mfa_session cookie can't be allowed to trigger erase —
      // require a fresh (within-5-min) second-factor confirmation.
      //
      // If the user has no MFA enrolled at all, we fall back to the rate
      // limit + email-confirmation-link pattern that was in place before
      // 6.1.21 (they can still delete, just more slowly). This prevents
      // soft-locking accounts that never enrolled a second factor.
      {
          const { data: factor } = await getSupabase()
              .from('user_mfa_factors')
              .select('enabled')
              .eq('user_id', user.id)
              .maybeSingle();
          if (factor?.enabled) {
              const gate = await requireRecentMfa(req, getSupabase(), user);
              if (!gate.ok) {
                  return res.status(gate.status || 403).json({
                      error: gate.reason || 'Step-up confirmation required',
                      requiresMfa: true,
                      requiresStepUp: gate.requiresStepUp === true,
                      maxAgeSec: gate.maxAgeSec,
                  });
              }
          }
      }

      try {
          const userId = user.id;

          // ── 0. BLOCK deletion if user has active chip balances ──
          // Chips must be cashed out or returned to agents first.
          const { data: activeBalances } = await getSupabase()
              .from('club_members')
              .select('club_id, chip_balance, locked_chips')
              .eq('user_id', userId)
              .or('chip_balance.gt.0,locked_chips.gt.0');

          if (activeBalances?.length > 0) {
              const totalChips = activeBalances.reduce((sum, m) => sum + (m.chip_balance || 0) + (m.locked_chips || 0), 0);
              return res.status(400).json({
                  error: 'Cannot delete account with active chip balances',
                  details: `You have ${totalChips.toLocaleString()} chips across ${activeBalances.length} club(s). Please cash out or contact your agent first.`,
                  clubs_with_balance: activeBalances.length,
              });
          }

          // ── 0b. Block if user is an active agent (would break settlement) ──
          const { data: activeAgent } = await getSupabase()
              .from('agents')
              .select('id, club_id')
              .eq('user_id', userId)
              .eq('status', 'active')
              .limit(1);

          if (activeAgent?.length > 0) {
              return res.status(400).json({
                  error: 'Cannot delete account while active as an agent',
                  details: 'Please have the club owner remove your agent role first.',
              });
          }

          // ── 0d. Block if user owns any clubs (would orphan the club) ──
          const { data: ownedClubs } = await getSupabase()
              .from('clubs')
              .select('id, name')
              .eq('owner_id', userId);

          if (ownedClubs?.length > 0) {
              return res.status(400).json({
                  error: 'Cannot delete account while you own clubs',
                  details: `You own ${ownedClubs.length} club(s): ${ownedClubs.map(c => c.name).join(', ')}. Transfer ownership or delete the club(s) first.`,
                  clubs_owned: ownedClubs.length,
              });
          }

          // ── 0e. Block if user owns any unions (would orphan the union) ──
          const { data: ownedUnions } = await getSupabase()
              .from('unions')
              .select('id, name')
              .eq('owner_id', userId);

          if (ownedUnions?.length > 0) {
              return res.status(400).json({
                  error: 'Cannot delete account while you own unions',
                  details: `You own ${ownedUnions.length} union(s): ${ownedUnions.map(u => u.name).join(', ')}. Transfer ownership first.`,
                  unions_owned: ownedUnions.length,
              });
          }

          // Collected across every erasure step so the response can tell the
          // truth about what was actually removed.
          const erasureFailures = [];

          // ── 0c. Cancel any pending cashout requests ──
          // Money in flight. If this fails the account is erased with a pending
          // cashout still open against a player_id that no longer exists, and
          // nothing will ever resolve it. A zero-row match is fine and normal --
          // most users have no pending cashout -- but an ERROR is not.
          const { error: err_cashout_requests_0c2tx } = await getSupabase()
            .from('cashout_requests')
            .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), agent_note: 'Account deleted' })
              .eq('player_id', userId)
              .eq('status', 'pending');
          if (err_cashout_requests_0c2tx) {
            console.error('[delete-account] CRITICAL: could not cancel pending cashouts before erasure:', err_cashout_requests_0c2tx.message);
            return res.status(500).json({
              success: false,
              error: 'Could not close your pending cashout requests, so the account was NOT deleted. Nothing has been removed. Please contact support.',
            });
          }

          // ── 0d. Remove club memberships (zero-balance only at this point) ──
          await eraseFrom(getSupabase(), 'club_members', (q) => q.eq('user_id', userId), erasureFailures);

          // ── 1. Delete user profile data ──
          // Remove diamond balance
          await eraseFrom(getSupabase(), 'user_diamond_balance', (q) => q.eq('user_id', userId), erasureFailures);

          // Remove diamond reward claims
          await eraseFrom(getSupabase(), 'diamond_reward_claims', (q) => q.eq('user_id', userId), erasureFailures);

          // Remove diamond transactions
          await eraseFrom(getSupabase(), 'diamond_transactions', (q) => q.eq('user_id', userId), erasureFailures);

          // Remove promo code redemptions
          await eraseFrom(getSupabase(), 'promo_code_redemptions', (q) => q.eq('user_id', userId), erasureFailures);

          // Remove MFA factors
          await eraseFrom(getSupabase(), 'user_mfa_factors', (q) => q.eq('user_id', userId), erasureFailures);

          // Remove active sessions
          await eraseFrom(getSupabase(), 'user_sessions', (q) => q.eq('user_id', userId), erasureFailures);

          // Remove notifications
          await eraseFrom(getSupabase(), 'notifications', (q) => q.eq('user_id', userId), erasureFailures);

          // Remove friendships (both directions)
          await eraseFrom(getSupabase(), 'friendships', (q) => q.eq('user_id', userId), erasureFailures);
          await eraseFrom(getSupabase(), 'friendships', (q) => q.eq('friend_id', userId), erasureFailures);

          // Remove the profile (must be after dependent records)
          // The profile is the anchor record. If it survives while the auth user
          // is hard-deleted, the row becomes ORPHANED PII: still holding the
          // person's name, email and username, with no account left to trace it
          // to and no way for them to ask again. Stop before that happens.
          const { error: err_profiles_2sqi2 } = await getSupabase()
            .from('profiles')
            .delete()
              .eq('id', userId);
          if (err_profiles_2sqi2) {
              console.error('[delete-account] CRITICAL: profile delete FAILED - refusing to hard-delete the auth user, which would orphan this PII:', err_profiles_2sqi2.message);
              return res.status(500).json({
                  success: false,
                  error: 'Your profile could not be removed, so the deletion was stopped before your login was destroyed. Your account still exists. Please contact support.',
                  failedTables: [...erasureFailures.map((f) => f.table), 'profiles'],
              });
          }

          // ── 2. Delete the auth user (hard delete via admin API) ──
          const { error: deleteError } = await getSupabase().auth.admin.deleteUser(userId);

          if (deleteError) {
              console.error('[delete-account] CRITICAL: auth user deletion failed AFTER profile data was removed - the login still exists with no profile behind it:', deleteError.message);
              return res.status(500).json({
                  success: false,
                  error: 'Your data was removed but your login could not be deleted. Please contact support so this can be completed.',
                  dataRemoved: true,
                  loginRemoved: false,
              });
          }

          // Only now is "permanently deleted" a true statement -- and only for
          // the tables that actually succeeded.
          if (erasureFailures.length > 0) {
              console.error('[delete-account] PARTIAL ERASURE - account deleted but these tables still hold data:', erasureFailures);
              return res.status(200).json({
                  success: true,
                  partial: true,
                  message: 'Your account has been deleted, but some records could not be removed and have been escalated.',
                  failedTables: erasureFailures.map((f) => f.table),
              });
          }

          console.info('[delete-account] Account deletion completed successfully.');

          return res.status(200).json({
              success: true,
              message: 'Account has been permanently deleted'
          });

      } catch (error) {
          console.warn('[delete-account] Error:', error);
          return res.status(500).json({ error: 'Failed to delete account. Please contact support.' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
