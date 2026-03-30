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

import { createClient } from '../../../src/lib/supabaseServerClient';

export const config = {
    maxDuration: 60
};

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
              console.error('[VIP Expiry] Error fetching expired VIP users:', fetchErr);
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
              console.error('[VIP Expiry] Error revoking VIP status:', updateErr);
              return res.status(500).json({ error: updateErr.message });
          }

          console.log(`[VIP Expiry] Successfully revoked VIP status for ${userIds.length} users.`);

          return res.status(200).json({
              success: true,
              revokedCount: userIds.length,
              revokedUsers: userIds // For audit logs
          });

      } catch (error) {
          console.error('[VIP Expiry] Cron error:', error);
          return res.status(500).json({ error: error.message });
      }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
