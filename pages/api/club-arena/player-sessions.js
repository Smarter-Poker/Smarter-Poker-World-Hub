import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * Player Session Tracker API — Real-time view of player activity
 * ═════════════════════════════════════════════════════════════
 * GET /api/club-arena/player-sessions?clubId=xxx
 *
 * Returns: Active player sessions with duration, table location, buy-in/stack info
 */

import { createClient } from '@supabase/supabase-js';
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

const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
export default async function handler(req, res) {
  try {
      // Rate limit
      if (!applyRateLimit(req, res, 'club-arena/player-sessions')) return;
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Not authenticated' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { clubId } = req.query;
      if (!clubId) return res.status(400).json({ error: 'clubId required' });

      // Verify admin
      const { data: membership } = await getSupabase()
          .from('club_members')
          .select('role')
          .eq('club_id', clubId)
          .eq('user_id', user.id)
          .maybeSingle();

      if (!membership || !['owner', 'admin', 'super_agent'].includes(membership.role)) {
          return res.status(403).json({ error: 'Admin access required' });
      }

      try {
          // Get active members with their latest activity
          const [membersRes, tablesRes, txRes] = await Promise.allSettled([
              // All active members
              getSupabase().from('club_members')
                  .select(`
                      user_id, role, joined_at, chip_balance,
                      profiles:user_id ( display_name, avatar_url, last_sign_in_at )
                  `)
                  .eq('club_id', clubId)
                  .eq('status', 'active')
                  .order('chip_balance', { ascending: false })
                  .limit(100),

              // Active tables with player counts
              getSupabase().from('tables')
                  .select('id, name, current_players, max_players, status')
                  .eq('club_id', clubId)
                  .in('status', ['active', 'playing', 'waiting', 'between_hands']),

              // Recent transactions (last 24h) to detect who's been active
              getSupabase().from('chip_transactions')
                  .select('from_user_id, to_user_id, transaction_type, amount, created_at')
                  .eq('club_id', clubId)
                  .gte('created_at', new Date(Date.now() - 86400000).toISOString())
                  .order('created_at', { ascending: false })
                  .limit(500),
          ]);

          const members = membersRes.status === 'fulfilled' ? (membersRes.value?.data || []) : [];
          const tables = tablesRes.status === 'fulfilled' ? (tablesRes.value?.data || []) : [];
          const recentTx = txRes.status === 'fulfilled' ? (txRes.value?.data || []) : [];

          // Build activity map: userId → { lastActive, txCount, totalVolume }
          const activityMap = {};
          recentTx.forEach(tx => {
              const uid = tx.from_user_id || tx.to_user_id;
              if (!uid) return;
              if (!activityMap[uid]) activityMap[uid] = { lastActive: tx.created_at, txCount: 0, totalVolume: 0 };
              activityMap[uid].txCount++;
              activityMap[uid].totalVolume += Math.abs(tx.amount || 0);
              if (tx.created_at > activityMap[uid].lastActive) activityMap[uid].lastActive = tx.created_at;
          });

          // Enrich members with activity data
          const sessions = members.map(m => {
              const activity = activityMap[m.user_id] || {};
              const profile = m.profiles || {};
              const lastActive = activity.lastActive || profile.last_sign_in_at || m.joined_at;
              const timeSinceActive = lastActive ? Date.now() - new Date(lastActive).getTime() : null;

              let status = 'offline';
              if (timeSinceActive !== null) {
                  if (timeSinceActive < 300000) status = 'online'; // < 5 min
                  else if (timeSinceActive < 3600000) status = 'idle'; // < 1 hour
                  else if (timeSinceActive < 86400000) status = 'away'; // < 24h
              }

              return {
                  userId: m.user_id,
                  displayName: profile.display_name || 'Unknown',
                  avatarUrl: profile.avatar_url || null,
                  role: m.role,
                  chipBalance: m.chip_balance || 0,
                  status,
                  lastActive: lastActive || null,
                  txCount24h: activity.txCount || 0,
                  volume24h: activity.totalVolume || 0,
                  joinedAt: m.joined_at,
              };
          });

          // Sort: online first, then by volume
          sessions.sort((a, b) => {
              const statusOrder = { online: 0, idle: 1, away: 2, offline: 3 };
              const diff = (statusOrder[a.status] || 3) - (statusOrder[b.status] || 3);
              if (diff !== 0) return diff;
              return (b.volume24h || 0) - (a.volume24h || 0);
          });

          const summary = {
              totalMembers: members.length,
              online: sessions.filter(s => s.status === 'online').length,
              idle: sessions.filter(s => s.status === 'idle').length,
              activeTables: tables.length,
              totalSeated: tables.reduce((s, t) => s + (t.current_players || 0), 0),
          };

          return res.status(200).json({ success: true, sessions, summary, tables });
      } catch (err) {
          console.warn('[player-sessions]', err);
          return res.status(500).json({ error: 'Internal error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
