/**
 * VIP Status Checker — Hourly Cron
 * ═══════════════════════════════════════════════════════════════════════════
 * Sweeps the database every hour to find users whose 30-day free trial or
 * paid VIP subscription has expired. Revokes their VIP status automatically.
 *
 * Cron: Runs at the top of every hour
 * Schedule: 0 * * * *
 *
 * Logic:
 * 1. Find all profiles where is_vip = true AND vip_expires_at < now
 * 2. Set is_vip = false for those profiles
 */

import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { reportApiError } from '../../../src/lib/sentryWrap';

export const config = {
    maxDuration: 60
};

const getSupabase = getSupabaseAdmin;

export default async function handler(req, res) {
  try {
      // Verify cron secret
      if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
          return res.status(401).json({ error: 'Unauthorized' });
      }

      try {
          const supabase = getSupabase();
          const now = new Date().toISOString();

          // 1. Get all expired VIP users
          const { data: expiredUsers, error: fetchErr } = await supabase
              .from('profiles')
              .select('id, username, vip_expires_at')
              .eq('is_vip', true)
              .not('vip_expires_at', 'is', null) // Avoid revoking permanent VIPs (if any exist with null expiry)
              .lt('vip_expires_at', now)
              .limit(500); // Batch limit for safety

          if (fetchErr) {
              console.warn('[VIP Expiry] Error fetching expired VIP users:', fetchErr);
              return res.status(500).json({ error: fetchErr.message });
          }

          if (!expiredUsers || expiredUsers.length === 0) {
              return res.status(200).json({
                  success: true,
                  message: 'No expired VIP users found',
                  revokedCount: 0
              });
          }

          const userIds = expiredUsers.map(u => u.id);

          // 2. Set is_vip = false for expired users
          const { error: updateErr } = await supabase
              .from('profiles')
              .update({ is_vip: false })
              .in('id', userIds);

          if (updateErr) {
              console.warn('[VIP Expiry] Error revoking VIP status:', updateErr);
              return res.status(500).json({ error: updateErr.message });
          }

          console.warn(`[VIP Expiry] Successfully revoked VIP status for ${userIds.length} users.`);

          return res.status(200).json({
              success: true,
              revokedCount: userIds.length,
              revokedUsers: userIds // For audit logs
          });

      } catch (error) {
          console.warn('[VIP Expiry] Cron error:', error);
          return res.status(500).json({ error: error.message });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
