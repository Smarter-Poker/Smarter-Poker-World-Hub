/**
 * POST /api/club-arena/settlement-history
 * 
 * Returns settlement period history for a club with aggregated stats.
 * Also provides auto-close scheduling configuration.
 * 
 * Actions:
 *   'list'          - Returns last N settlement periods with aggregated stats
 *   'auto_schedule' - Toggles auto-close scheduling for a club
 *   'auto_close'    - Cron-triggered: auto-closes all clubs with scheduling enabled
 * 
 * Body: { clubId, action, limit?, enabled? }
 * Auth: Bearer token (club owner/admin) or ADMIN_ROUTE_SECRET for cron
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
const { isUUID } = require('../../../src/lib/club-arena/validate');
import { reportApiError } from '../../../src/lib/sentryWrap';
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  // Idempotency guard — prevents duplicate mutations from laggy mobile networks
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (checkIdempotency(req, res)) return;
  }

  const supabaseAdmin = getSupabase(); // FIX: was undefined — alias to getSupabase() for settlement-lock, audit, velocity, notify
  try {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
      if (!applyRateLimit(req, res, 'club-arena/settlement-history')) return;

      const { action } = req.body || {};

      // ═══════════════════════════════════════════════════════════
      // AUTO-CLOSE CRON (triggered by Vercel cron or admin secret)
      // Closes all clubs with auto_settlement_enabled = true
      // ═══════════════════════════════════════════════════════════
      if (action === 'auto_close') {
          // SECURITY: a missing ADMIN_ROUTE_SECRET is a server misconfiguration,
          // not a grant. This previously FAILED OPEN: with ADMIN_ROUTE_SECRET
          // unset the comparison was `undefined !== undefined` → false, so a
          // caller supplying no secret at all could trigger auto_close
          // settlement for every club on the platform.
          const envAdminSecret = process.env.ADMIN_ROUTE_SECRET;
          if (!envAdminSecret) {
              console.warn('[settlement-history] ADMIN_ROUTE_SECRET is not configured — rejecting auto_close');
              return res.status(500).json({ error: 'Server misconfigured' });
          }
          const secret = req.headers['x-admin-secret'] || req.body.secret;
          if (secret !== envAdminSecret) {
              return res.status(403).json({ error: 'Unauthorized cron call' });
          }

          try {
              // Find all clubs with auto-settlement enabled
              const { data: clubs } = await getSupabase()
                  .from('clubs')
                  .select('id, name, settings')
                  .not('settings->auto_settlement_enabled', 'is', null);

              const autoClubs = (clubs || []).filter(c => c.settings?.auto_settlement_enabled === true);

              if (autoClubs.length === 0) {
                  return res.status(200).json({ success: true, message: 'No clubs with auto-settlement', processed: 0 });
              }

              const results = [];
              // BUG-01 FIX: Use internal fetch to settle-period API so commission calculation
              // actually runs. Previously just updated status without computing commissions.
              const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
                  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

              for (const club of autoClubs) {
                  try {
                      // Find current open period
                      const { data: openPeriod } = await getSupabase()
                          .from('settlement_periods')
                          .select('id, start_at')  // BUG-05 FIX: was start_date
                          .eq('club_id', club.id)
                          .eq('status', 'open')
                          .order('created_at', { ascending: false })
                          .maybeSingle();

                      if (!openPeriod) {
                          results.push({ clubId: club.id, name: club.name, status: 'no_open_period' });
                          continue;
                      }

                      // BUG-01 FIX: Call the full settle-period close logic via internal API
                      // This calculates commissions, invoices, union holds — not just status update
                      let settleSuccess = false;
                      try {
                          const settleRes = await fetch(`${baseUrl}/api/club-arena/settle-period`, {
                              method: 'POST',
                              headers: {
                                  'Content-Type': 'application/json',
                                  'x-admin-secret': process.env.ADMIN_ROUTE_SECRET || '',
                              },
                              body: JSON.stringify({ clubId: club.id, action: 'close' }),
                          });
                          if (!settleRes.ok) throw new Error(`Request failed (${settleRes.status})`);
                          const settleData = await settleRes.json();
                          settleSuccess = settleData.success;
                      } catch (settleErr) {
                          console.warn(`[auto_close] settle-period call failed for ${club.name}:`, settleErr.message);
                          // Fallback: at minimum close the period so it's not orphaned
                          const { error: err_settlement_periods_vzvc7 } = await getSupabase()
                            .from('settlement_periods')
                            .update({ status: 'closed', settled_at: new Date().toISOString() })  // BUG-05 FIX: was end_date
                              .eq('id', openPeriod.id);
                          if (err_settlement_periods_vzvc7) console.warn('[Supabase] Silent mutation failed in settlement_periods:', err_settlement_periods_vzvc7.message);
                      }

                      // Open a new period via settle-period open action
                      try {
                          await fetch(`${baseUrl}/api/club-arena/settle-period`, {
                              method: 'POST',
                              headers: {
                                  'Content-Type': 'application/json',
                                  'x-admin-secret': process.env.ADMIN_ROUTE_SECRET || '',
                              },
                              body: JSON.stringify({ clubId: club.id, action: 'open' }),
                          });
                      } catch (openErr) {
                          console.warn(`[auto_close] settle-period open failed for ${club.name}:`, openErr.message);
                      }

                      logAudit(supabaseAdmin, {
                          actionType: 'auto_settlement_close',
                          userId: 'SYSTEM',
                          clubId: club.id,
                          details: { periodId: openPeriod.id, trigger: 'cron', settleSuccess },
                          ip: extractIP(req),
                      });

                      results.push({ clubId: club.id, name: club.name, status: 'closed_and_reopened', periodId: openPeriod.id, settleSuccess });
                  } catch (err) {
                      results.push({ clubId: club.id, name: club.name, status: 'error', message: err.message });
                  }
              }

              return res.status(200).json({ success: true, processed: results.length, results });
          } catch (err) {
              return res.status(500).json({ error: 'Auto-close failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
          }
      }

      // ═══════════════════════════════════════════════════════════
      // AUTHENTICATED ROUTES (require user token)
      // ═══════════════════════════════════════════════════════════
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'No auth token' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { clubId, enabled } = req.body;
      // Round 81: clamp user-supplied limit. Default 12, max 200, min 1.
      // settlement_periods queries can pull large historical sets — without
      // clamping, a malicious caller could request limit=999999 and exhaust
      // the underlying RPC + downstream batch commission query.
      const rawLimit = parseInt(req.body.limit, 10);
      const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, rawLimit)) : 12;
      if (!clubId) return res.status(400).json({ error: 'clubId required' });

      // Verify ownership/admin
      // Round 72: production de-facto admin role is super_agent (admin enum
      // exists but has 0 rows). Accept the canonical admin trio.
      const { data: membership } = await getSupabase()
          .from('club_members')
          .select('role')
          .eq('club_id', clubId)
          .eq('user_id', user.id)
          .maybeSingle();

      if (!membership || !['owner', 'admin', 'super_agent'].includes(membership.role)) {
          return res.status(403).json({ error: 'Owner/admin only' });
      }

      // ─── LIST: Settlement History ─────────────────────────────
      if (action === 'list') {
          try {
              const { data: periods } = await getSupabase()
                  .from('settlement_periods')
                  .select('id, status, start_at, end_at, created_at, total_rake_collected')  // BUG-05 FIX: was start_date, end_date
                  .eq('club_id', clubId)
                  .order('created_at', { ascending: false })
                  .limit(limit);

              // BUG-12 FIX: Batch-query all commissions for all period IDs at once
              // (was N+1: one query per period in a for loop)
              const periodIds = (periods || []).map(p => p.id);
              let allCommissions = [];
              if (periodIds.length > 0) {
                  const { data: comms } = await getSupabase()
                      .from('commission_history')
                      .select('period_id, commission_earned, status')  // BUG-08 FIX: was 'amount'
                      .in('period_id', periodIds);
                  allCommissions = comms || [];
              }

              // Group commissions by period_id
              const commsByPeriod = {};
              for (const c of allCommissions) {
                  if (!commsByPeriod[c.period_id]) commsByPeriod[c.period_id] = [];
                  commsByPeriod[c.period_id].push(c);
              }

              const enriched = (periods || []).map(p => {
                  const comms = commsByPeriod[p.id] || [];
                  const totalCommissions = comms.reduce((s, c) => s + (c.commission_earned || 0), 0);
                  const paidCount = comms.filter(c => c.status === 'paid').length;
                  const pendingCount = comms.filter(c => c.status !== 'paid').length;
                  return {
                      ...p,
                      totalCommissions,
                      paidCount,
                      pendingCount,
                      agentCount: comms.length,
                  };
              });

              // Get auto-schedule status
              const { data: club } = await getSupabase()
                  .from('clubs')
                  .select('settings')
                  .eq('id', clubId)
                  .maybeSingle();

              return res.status(200).json({
                  success: true,
                  periods: enriched,
                  autoSettlement: club?.settings?.auto_settlement_enabled || false,
              });
          } catch (err) {
              return res.status(500).json({ error: 'Failed to fetch history', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
          }
      }

      // ─── AUTO_SCHEDULE: Toggle auto-settlement ────────────────
      if (action === 'auto_schedule') {
          try {
              const { data: club } = await getSupabase()
                  .from('clubs')
                  .select('settings')
                  .eq('id', clubId)
                  .maybeSingle();

              const currentSettings = club?.settings || {};
              const newEnabled = typeof enabled === 'boolean' ? enabled : !currentSettings.auto_settlement_enabled;

              const { error: err_clubs_u6olk } = await getSupabase()

                .from('clubs')

                .update({ settings: { ...currentSettings, auto_settlement_enabled: newEnabled } })
                  .eq('id', clubId);

              if (err_clubs_u6olk) console.warn('[Supabase] Silent mutation failed in clubs:', err_clubs_u6olk.message);

              logAudit(supabaseAdmin, {
                  actionType: 'auto_settlement_toggled',
                  userId: user.id,
                  clubId,
                  details: { enabled: newEnabled },
                  ip: extractIP(req),
              });

              return res.status(200).json({ success: true, autoSettlement: newEnabled });
          } catch (err) {
              return res.status(500).json({ error: 'Toggle failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
          }
      }

      // ─── BATCH_PREVIEW: Preview all pending commissions ───────
      if (action === 'batch_preview') {
          const { periodId: batchPeriodId } = req.body;
          if (!batchPeriodId) return res.status(400).json({ error: 'periodId required' });

          try {
              // BUG-04 FIX: Validate periodId UUID
              if (!isUUID(batchPeriodId)) return res.status(400).json({ error: 'Invalid periodId format' });

              const { data: commissions } = await getSupabase()
                  .from('commission_history')
                  .select('id, agent_id, commission_earned, status')  // BUG-08 FIX: was 'amount'
                  .eq('period_id', batchPeriodId)
                  .neq('status', 'paid');

              // Enrich with agent display names
              const agentIds = [...new Set((commissions || []).map(c => c.agent_id))];
              let profileMap = {};
              if (agentIds.length > 0) {
                  const { data: profiles } = await getSupabase()
                      .from('profiles')
                      .select('id, display_name, username')
                      .in('id', agentIds);
                  for (const p of (profiles || [])) profileMap[p.id] = p.display_name || p.username || p.id.substring(0, 8);
              }

              const preview = (commissions || []).map(c => ({
                  commissionId: c.id,
                  agentId: c.agent_id,
                  agentName: profileMap[c.agent_id] || c.agent_id.substring(0, 8),
                  amount: c.commission_earned || 0,  // BUG-08 FIX: was c.amount
                  status: c.status,
              }));

              const totalPayout = preview.reduce((s, c) => s + c.amount, 0);

              return res.status(200).json({
                  success: true,
                  preview,
                  totalPayout,
                  count: preview.length,
              });
          } catch (err) {
              return res.status(500).json({ error: 'Preview failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
          }
      }

      return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
