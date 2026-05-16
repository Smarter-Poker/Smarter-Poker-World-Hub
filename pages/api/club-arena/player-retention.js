/**
 * POST /api/club-arena/player-retention
 * 
 * Player Retention Engine — Proactive churn prevention and engagement tools.
 * 
 * Actions:
 *   'scan'          - Returns players at risk of churning (inactive 5+ days)
 *   'welcome_back'  - Send welcome-back promo chips to an inactive player
 *   'first_deposit' - Check/apply first-deposit bonus configuration
 *   'configure'     - Set retention rules (inactivity threshold, bonus amounts)
 * 
 * Body: { clubId, action, playerId?, amount?, config? }
 * Auth: Bearer token (club owner/admin/agent)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { notifyUser } from '../../../src/lib/club-arena/notify';
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');
import { reportApiError } from '../../../src/lib/sentryWrap';

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

const RETENTION_DEFAULTS = {
    at_risk_days: 5,        // Days of inactivity before flagging
    churned_days: 14,       // Days before marking as churned
    welcome_back_amount: 500, // Default welcome-back promo chips
    first_deposit_bonus_pct: 10, // 10% bonus on first buy-in
    first_deposit_max: 5000,     // Max bonus cap
};

const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');
export default async function handler(req, res) {
  // Idempotency guard — prevents duplicate mutations from laggy mobile networks
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (checkIdempotency(req, res)) return;
  }

  const supabaseAdmin = getSupabase(); // FIX: was undefined — alias to getSupabase() for settlement-lock, audit, velocity, notify
  try {
      // Rate limit
      if (!applyRateLimit(req, res, 'club-arena/player-retention')) return;
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'No auth token' });

      const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { clubId, action, playerId, amount, config } = req.body;
      if (!clubId) return res.status(400).json({ error: 'clubId required' });

      // Verify agent/owner/admin role
      const { data: membership } = await getSupabase()
          .from('club_members')
          .select('role')
          .eq('club_id', clubId)
          .eq('user_id', user.id)
          .maybeSingle();

      if (!membership || !['owner', 'admin', 'agent'].includes(membership.role)) {
          return res.status(403).json({ error: 'Agent/Owner/Admin only' });
      }

      // Get club retention config
      const { data: club } = await getSupabase()
          .from('clubs')
          .select('settings')
          .eq('id', clubId)
          .maybeSingle();

      const retConfig = { ...RETENTION_DEFAULTS, ...(club?.settings?.retention || {}) };

      // ─── SCAN: Find at-risk and churned players ──────────────
      if (action === 'scan') {
          try {
              const now = new Date();
              const atRiskDate = new Date(now - retConfig.at_risk_days * 24 * 60 * 60 * 1000).toISOString();
              const churnedDate = new Date(now - retConfig.churned_days * 24 * 60 * 60 * 1000).toISOString();

              // Get all player members with their last activity
              const { data: members } = await getSupabase()
                  .from('club_members')
                  .select('user_id, chip_balance, last_active, role, agent_id')
                  .eq('club_id', clubId)
                  .in('role', ['player', 'member']);

              // Resolve display names
              const userIds = (members || []).map(m => m.user_id);
              const { data: profiles } = await getSupabase()
                  .from('profiles')
                  .select('id, display_name, username')
                  .in('id', userIds);

              const nameMap = {};
              for (const p of (profiles || [])) nameMap[p.id] = p.display_name || p.username || p.id.substring(0, 8);

              const active = [];
              const atRisk = [];
              const churned = [];

              for (const m of (members || [])) {
                  const lastActive = m.last_active || m.created_at || churnedDate;
                  const player = {
                      userId: m.user_id,
                      name: nameMap[m.user_id] || m.user_id.substring(0, 8),
                      chipBalance: m.chip_balance || 0,
                      lastActive,
                      agentId: m.agent_id,
                      daysSinceActive: Math.floor((now - new Date(lastActive)) / (24 * 60 * 60 * 1000)),
                  };

                  if (new Date(lastActive) < new Date(churnedDate)) {
                      churned.push({ ...player, status: 'churned' });
                  } else if (new Date(lastActive) < new Date(atRiskDate)) {
                      atRisk.push({ ...player, status: 'at_risk' });
                  } else {
                      active.push({ ...player, status: 'active' });
                  }
              }

              return res.status(200).json({
                  success: true,
                  summary: {
                      total: (members || []).length,
                      active: active.length,
                      atRisk: atRisk.length,
                      churned: churned.length,
                  },
                  atRisk: atRisk.sort((a, b) => b.daysSinceActive - a.daysSinceActive),
                  churned: churned.sort((a, b) => b.daysSinceActive - a.daysSinceActive),
                  config: retConfig,
              });
          } catch (err) {
              return res.status(500).json({ error: 'Scan failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
          }
      }

      // ─── WELCOME_BACK: Send promo chips to inactive player ───
      if (action === 'welcome_back') {
          if (!playerId) return res.status(400).json({ error: 'playerId required' });
          const promoAmount = amount || retConfig.welcome_back_amount;

          try {
              // Credit the player's promo wallet or chip balance
              const { data: playerMember } = await getSupabase()
                  .from('club_members')
                  .select('chip_balance, user_id')
                  .eq('club_id', clubId)
                  .eq('user_id', playerId)
                  .maybeSingle();

              if (!playerMember) return res.status(404).json({ error: 'Player not found in club' });

              const { error: updateErr } = await getSupabase()
                  .from('club_members')
                  .update({ chip_balance: (playerMember.chip_balance || 0) + promoAmount })
                  .eq('club_id', clubId)
                  .eq('user_id', playerId);
              if (updateErr) throw updateErr;

              // Record the transaction
              const { error: txErr } = await getSupabase().from('chip_transactions').insert({
                  from_user_id: user.id,
                  to_user_id: playerId,
                  club_id: clubId,
                  amount: promoAmount,
                  transaction_type: 'promo',
                  notes: 'Welcome-back bonus',
              });
              if (txErr) console.warn('[PlayerRetention] Failed to record promo transaction:', txErr.message);

              await notifyUser(supabaseAdmin, {
                  userId: playerId,
                  type: 'welcome_back',
                  title: '🎁 Welcome Back!',
                  message: `You received ${promoAmount.toLocaleString()} bonus chips! Come play!`,
                  data: { clubId, amount: promoAmount },
              });

              logAudit(supabaseAdmin, {
                  actionType: 'welcome_back_promo',
                  userId: user.id,
                  targetUserId: playerId,
                  clubId,
                  amount: promoAmount,
                  ip: extractIP(req),
                  details: { reason: 'player_retention' },
              });

              return res.status(200).json({ success: true, amount: promoAmount, playerId });
          } catch (err) {
              return res.status(500).json({ error: 'Welcome-back failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
          }
      }

      // ─── CONFIGURE: Set retention rules ───────────────────────
      if (action === 'configure') {
          if (membership.role !== 'owner' && membership.role !== 'admin') {
              return res.status(403).json({ error: 'Owner/admin only for configuration' });
          }

          try {
              const currentSettings = club?.settings || {};
              const newRetention = { ...retConfig, ...(config || {}) };

              const { error: confErr } = await getSupabase()
                  .from('clubs')
                  .update({ settings: { ...currentSettings, retention: newRetention } })
                  .eq('id', clubId);
              if (confErr) throw confErr;

              logAudit(supabaseAdmin, {
                  actionType: 'retention_config_updated',
                  userId: user.id,
                  clubId,
                  details: newRetention,
                  ip: extractIP(req),
              });

              return res.status(200).json({ success: true, config: newRetention });
          } catch (err) {
              return res.status(500).json({ error: 'Config update failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
          }
      }

      return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
