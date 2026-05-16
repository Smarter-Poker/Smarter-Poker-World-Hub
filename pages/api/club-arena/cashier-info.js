/**
 * POST /api/club-arena/cashier-info
 * 
 * Cashier UX Enhancements — Unified data endpoint for the one-screen cashier.
 * 
 * Actions:
 *   'summary'         - Player's complete financial snapshot (balances, pending cashouts, recent txns)
 *   'quick_buyin'     - Fast buy-in with preset amounts (1K, 5K, 10K, 25K, 50K)
 *   'cashout_status'  - Real-time progress tracker for a cashout request
 *   'presets'         - Returns configurable quick-amount presets for the club
 * 
 * Body: { clubId, action, amount?, cashoutId? }
 * Auth: Bearer token
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');
const { isUUID, rejectBadPayload } = require('../../../src/lib/club-arena/validate');
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) {
            console.warn('[cashier-info] SUPABASE_SERVICE_ROLE_KEY not set — refusing anon key fallback');
            throw new Error('Server misconfiguration: missing service role key');
        }
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const DEFAULT_PRESETS = [1000, 5000, 10000, 25000, 50000];

const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
export default async function handler(req, res) {
  try {
      // Rate limit
      if (!applyRateLimit(req, res, 'club-arena/cashier-info')) return;
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

      // RED TEAM: Payload size + field allowlist
      if (rejectBadPayload(req, res, ['clubId', 'action', 'amount', 'cashoutId', 'amounts'])) return;

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'No auth token' });

      const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { clubId, action, amount, cashoutId } = req.body;
      if (!clubId) return res.status(400).json({ error: 'clubId required' });

      // BUG-04 FIX: Strict UUID validation (was missing entirely)
      if (!isUUID(clubId)) return res.status(400).json({ error: 'Invalid clubId format' });

      // ─── SUMMARY: Complete financial snapshot ─────────────────
      if (action === 'summary') {
          try {
              // Player balance (F-04: include promo_balance for visibility)
              const { data: member } = await getSupabase()
                  .from('club_members')
                  .select('chip_balance, promo_balance, role')
                  .eq('club_id', clubId)
                  .eq('user_id', user.id)
                  .maybeSingle();

              if (!member) return res.status(404).json({ error: 'Not a member of this club' });

              // Pending cashouts
              const { data: pendingCashouts } = await getSupabase()
                  .from('cashout_requests')
                  .select('id, amount, status, created_at, updated_at')
                  .eq('club_id', clubId)
                  .eq('user_id', user.id)
                  .in('status', ['pending', 'processing'])
                  .order('created_at', { ascending: false });

              // Recent transactions (last 20)
              const { data: recentTxns } = await getSupabase()
                  .from('chip_transactions')
                  .select('id, amount, transaction_type, notes, created_at, from_user_id, to_user_id')
                  .eq('club_id', clubId)
                  .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
                  .order('created_at', { ascending: false })
                  .limit(20);

              // Enrich transactions with direction
              const txns = (recentTxns || []).map(t => ({
                  ...t,
                  direction: t.to_user_id === user.id ? 'in' : 'out',
                  displayAmount: t.to_user_id === user.id ? `+${t.amount}` : `-${t.amount}`,
              }));

              // Get quick-amount presets
              const { data: club } = await getSupabase()
                  .from('clubs')
                  .select('settings')
                  .eq('id', clubId)
                  .maybeSingle();

              const presets = club?.settings?.cashier_presets || DEFAULT_PRESETS;

              return res.status(200).json({
                  success: true,
                  balance: member.chip_balance || 0,
                  promoBalance: member.promo_balance || 0,  // F-04: Promo balance visibility
                  role: member.role,
                  pendingCashouts: pendingCashouts || [],
                  recentTransactions: txns,
                  quickAmounts: presets,
                  totalPendingCashout: (pendingCashouts || []).reduce((s, c) => s + (c.amount || 0), 0),
              });
          } catch (err) {
              return res.status(500).json({ error: 'Summary failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
          }
      }

      // ─── CASHOUT_STATUS: Real-time progress tracker ───────────
      if (action === 'cashout_status') {
          if (!cashoutId) return res.status(400).json({ error: 'cashoutId required' });

          try {
              const { data: cashout } = await getSupabase()
                  .from('cashout_requests')
                  .select('id, amount, status, created_at, updated_at, notes')
                  .eq('id', cashoutId)
                  .eq('user_id', user.id)
                  .maybeSingle();

              if (!cashout) return res.status(404).json({ error: 'Cashout not found' });

              // Status progression
              const stages = ['pending', 'processing', 'approved', 'completed'];
              const currentStage = stages.indexOf(cashout.status);

              return res.status(200).json({
                  success: true,
                  cashout,
                  progress: {
                      currentStage,
                      totalStages: stages.length,
                      percentage: Math.round(((currentStage + 1) / stages.length) * 100),
                      stages: stages.map((s, i) => ({
                          name: s.charAt(0).toUpperCase() + s.slice(1),
                          completed: i <= currentStage,
                          current: i === currentStage,
                      })),
                  },
              });
          } catch (err) {
              return res.status(500).json({ error: 'Status check failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
          }
      }

      // ─── PRESETS: Configure quick-amount buttons ──────────────
      if (action === 'presets') {
          // BUG-09 FIX: Add idempotency guard for settings mutation
          if (checkIdempotency(req, res)) return;

          // Verify owner/admin
          const { data: mem } = await getSupabase()
              .from('club_members')
              .select('role')
              .eq('club_id', clubId)
              .eq('user_id', user.id)
              .maybeSingle();

          if (!mem || !['owner', 'admin'].includes(mem.role)) {
              return res.status(403).json({ error: 'Owner/admin only' });
          }

          try {
              const { data: club } = await getSupabase()
                  .from('clubs')
                  .select('settings')
                  .eq('id', clubId)
                  .maybeSingle();

              const rawAmounts = req.body.amounts || DEFAULT_PRESETS;

              // Validate amounts: must be array of positive integers, capped at 10 presets
              if (!Array.isArray(rawAmounts) || rawAmounts.length === 0) {
                  return res.status(400).json({ error: 'amounts must be a non-empty array' });
              }
              const validAmounts = rawAmounts
                  .slice(0, 10) // Max 10 presets
                  .map(a => {
                      const n = Number(a);
                      if (!Number.isFinite(n) || n < 100 || n > 10_000_000 || !Number.isInteger(n)) return null;
                      return n;
                  })
                  .filter(a => a !== null);

              if (validAmounts.length === 0) {
                  return res.status(400).json({ error: 'No valid amounts provided (must be integers 100–10,000,000)' });
              }

              const currentSettings = club?.settings || {};

              const { error: err_clubs_nhuke } = await getSupabase()

                .from('clubs')

                .update({ settings: { ...currentSettings, cashier_presets: validAmounts } })
                  .eq('id', clubId);

              if (err_clubs_nhuke) console.warn('[Supabase] Silent mutation failed in clubs:', err_clubs_nhuke.message);

              return res.status(200).json({ success: true, presets: validAmounts });
          } catch (err) {
              return res.status(500).json({ error: 'Presets update failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
          }
      }

      return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
