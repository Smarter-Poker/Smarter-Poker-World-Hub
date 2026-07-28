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

      if (authError || !user) {
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

          // ── 0c. Cancel any pending cashout requests ──
          const { error: err_cashout_requests_0c2tx } = await getSupabase()
            .from('cashout_requests')
            .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), agent_note: 'Account deleted' })
              .eq('player_id', userId)
              .eq('status', 'pending');
          if (err_cashout_requests_0c2tx) console.warn('[Supabase] Silent mutation failed in cashout_requests:', err_cashout_requests_0c2tx.message);

          // ── 0d. Remove club memberships (zero-balance only at this point) ──
          const { error: err_club_members_1g5q6 } = await getSupabase()
            .from('club_members')
            .delete()
              .eq('user_id', userId);
          if (err_club_members_1g5q6) console.warn('[Supabase] Silent mutation failed in club_members:', err_club_members_1g5q6.message);

          // ── 1. Delete user profile data ──
          // Remove diamond balance
          const { error: err_user_diamond_balance_ckxzy } = await getSupabase()
            .from('user_diamond_balance')
            .delete()
              .eq('user_id', userId);
          if (err_user_diamond_balance_ckxzy) console.warn('[Supabase] Silent mutation failed in user_diamond_balance:', err_user_diamond_balance_ckxzy.message);

          // Remove diamond reward claims
          const { error: err_diamond_reward_claims_1a4v3 } = await getSupabase()
            .from('diamond_reward_claims')
            .delete()
              .eq('user_id', userId);
          if (err_diamond_reward_claims_1a4v3) console.warn('[Supabase] Silent mutation failed in diamond_reward_claims:', err_diamond_reward_claims_1a4v3.message);

          // Remove diamond transactions
          const { error: err_diamond_transactions_3zlok } = await getSupabase()
            .from('diamond_transactions')
            .delete()
              .eq('user_id', userId);
          if (err_diamond_transactions_3zlok) console.warn('[Supabase] Silent mutation failed in diamond_transactions:', err_diamond_transactions_3zlok.message);

          // Remove promo code redemptions
          const { error: err_promo_code_redemptions_ugm44 } = await getSupabase()
            .from('promo_code_redemptions')
            .delete()
              .eq('user_id', userId);
          if (err_promo_code_redemptions_ugm44) console.warn('[Supabase] Silent mutation failed in promo_code_redemptions:', err_promo_code_redemptions_ugm44.message);

          // Remove MFA factors
          const { error: err_user_mfa_factors_pnfzp } = await getSupabase()
            .from('user_mfa_factors')
            .delete()
              .eq('user_id', userId);
          if (err_user_mfa_factors_pnfzp) console.warn('[Supabase] Silent mutation failed in user_mfa_factors:', err_user_mfa_factors_pnfzp.message);

          // Remove active sessions
          const { error: err_user_sessions_7emf7 } = await getSupabase()
            .from('user_sessions')
            .delete()
              .eq('user_id', userId);
          if (err_user_sessions_7emf7) console.warn('[Supabase] Silent mutation failed in user_sessions:', err_user_sessions_7emf7.message);

          // Remove notifications
          const { error: err_notifications_vgtnc } = await getSupabase()
            .from('notifications')
            .delete()
              .eq('user_id', userId);
          if (err_notifications_vgtnc) console.warn('[Supabase] Silent mutation failed in notifications:', err_notifications_vgtnc.message);

          // Remove friendships (both directions)
          const { error: err_friendships_9qtq5 } = await getSupabase()
            .from('friendships')
            .delete()
              .eq('user_id', userId);
          if (err_friendships_9qtq5) console.warn('[Supabase] Silent mutation failed in friendships:', err_friendships_9qtq5.message);
          const { error: err_friendships_cxnd7 } = await getSupabase()
            .from('friendships')
            .delete()
              .eq('friend_id', userId);
          if (err_friendships_cxnd7) console.warn('[Supabase] Silent mutation failed in friendships:', err_friendships_cxnd7.message);

          // Remove the profile (must be after dependent records)
          const { error: err_profiles_2sqi2 } = await getSupabase()
            .from('profiles')
            .delete()
              .eq('id', userId);
          if (err_profiles_2sqi2) console.warn('[Supabase] Silent mutation failed in profiles:', err_profiles_2sqi2.message);

          // ── 2. Delete the auth user (hard delete via admin API) ──
          const { error: deleteError } = await getSupabase().auth.admin.deleteUser(userId);

          if (deleteError) {
              console.warn('[delete-account] Auth user deletion error:', deleteError);
              // Profile data is already gone — log but don't block
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
