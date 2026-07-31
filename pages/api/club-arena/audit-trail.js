import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * POST /api/club-arena/audit-trail
 * 
 * Live Audit Stream — Real-time financial activity feed from action_audit_logs.
 * 
 * Actions:
 *   'list'   - Paginated, filtered audit log entries
 *   'export' - Returns all matching entries as CSV-ready JSON
 *   'stats'  - Aggregate stats (count by action_type, total volume)
 * 
 * Body: { clubId, action, page?, pageSize?, filters?: { actionType?, userId?, dateFrom?, dateTo? } }
 * Auth: Bearer token (club owner/admin only)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
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
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');
export default async function handler(req, res) {
  // Idempotency guard — prevents duplicate mutations from laggy mobile networks
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (checkIdempotency(req, res)) return;
  }

  try {
      // Rate limit
      if (!applyRateLimit(req, res, 'club-arena/audit-trail')) return;
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'No auth token' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { clubId, action, page = 1, pageSize = 50, filters = {} } = req.body;
      if (!clubId) return res.status(400).json({ error: 'clubId required' });

      // Verify ownership/admin
      const { data: membership } = await getSupabase()
          .from('club_members')
          .select('role')
          .eq('club_id', clubId)
          .eq('user_id', user.id)
          .maybeSingle();

      if (!membership || !['owner', 'admin'].includes(membership.role)) {
          return res.status(403).json({ error: 'Owner/admin only' });
      }

      // ─── BUILD QUERY ──────────────────────────────────────────
      function buildQuery(selectClause, withCount = false) {
          let query = getSupabase()
              .from('action_audit_logs')
              .select(selectClause, withCount ? { count: 'exact' } : undefined)
              .eq('club_id', clubId);

          if (filters.actionType) query = query.eq('action_type', filters.actionType);
          // SECURITY FIX 2026-07-19: validate the UUID before interpolating it
          // into the PostgREST .or() filter (prevents filter injection that
          // could broaden the OR group). club_id stays AND-ed regardless.
          if (filters.userId) {
            const uid = String(filters.userId);
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) {
              return res.status(400).json({ error: 'Invalid userId filter' });
            }
            query = query.or(`user_id.eq.${uid},target_user_id.eq.${uid}`);
          }
          if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
          if (filters.dateTo) query = query.lte('created_at', filters.dateTo);

          return query;
      }

      // ─── LIST: Paginated audit log ────────────────────────────
      if (action === 'list') {
          try {
              const offset = (page - 1) * pageSize;
              const clampedSize = Math.min(pageSize, 100); // Max 100 per page

              const { data: logs, count, error } = await buildQuery(
                  'id, action_type, user_id, target_user_id, amount, ip_address, details, created_at',
                  true
              )
                  .order('created_at', { ascending: false })
                  .range(offset, offset + clampedSize - 1);

              if (error) throw error;

              // Collect unique user IDs for name resolution
              const userIds = new Set();
              for (const log of (logs || [])) {
                  if (log.user_id) userIds.add(log.user_id);
                  if (log.target_user_id) userIds.add(log.target_user_id);
              }
              // Remove 'SYSTEM' entries which aren't UUIDs
              userIds.delete('SYSTEM');

              const { data: profiles } = await getSupabase()
                  .from('profiles')
                  .select('id, display_name, username')
                  .in('id', [...userIds]);

              const nameMap = {};
              for (const p of (profiles || [])) nameMap[p.id] = p.display_name || p.username || p.id.substring(0, 8);
              nameMap['SYSTEM'] = 'SYSTEM';

              const enriched = (logs || []).map(l => ({
                  ...l,
                  userName: nameMap[l.user_id] || l.user_id?.substring(0, 8) || 'Unknown',
                  targetUserName: l.target_user_id ? (nameMap[l.target_user_id] || l.target_user_id?.substring(0, 8)) : null,
              }));

              return res.status(200).json({
                  success: true,
                  logs: enriched,
                  total: count || 0,
                  page,
                  pageSize: clampedSize,
                  totalPages: Math.ceil((count || 0) / clampedSize),
              });
          } catch (err) {
              return res.status(500).json({ error: 'Fetch failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
          }
      }

      // ─── EXPORT: CSV-ready data ───────────────────────────────
      if (action === 'export') {
          try {
              const { data: logs, error } = await buildQuery(
                  'action_type, user_id, target_user_id, amount, ip_address, created_at'
              )
                  .order('created_at', { ascending: false })
                  .limit(10000); // Hard cap at 10K for exports

              if (error) throw error;

              // CSV header + rows
              const header = 'Timestamp,Action,UserID,TargetUserID,Amount,IP';
              const rows = (logs || []).map(l =>
                  `${l.created_at},${l.action_type},${l.user_id || ''},${l.target_user_id || ''},${l.amount || 0},${l.ip_address || ''}`
              );

              return res.status(200).json({
                  success: true,
                  csv: [header, ...rows].join('\n'),
                  count: rows.length,
              });
          } catch (err) {
              return res.status(500).json({ error: 'Export failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
          }
      }

      // ─── STATS: Aggregate stats ───────────────────────────────
      if (action === 'stats') {
          try {
              const { data: logs } = await buildQuery('action_type, amount')
                  .order('created_at', { ascending: false })
                  .limit(5000);

              const byType = {};
              let totalVolume = 0;
              for (const l of (logs || [])) {
                  const t = l.action_type || 'unknown';
                  if (!byType[t]) byType[t] = { count: 0, volume: 0 };
                  byType[t].count++;
                  byType[t].volume += Math.abs(l.amount || 0);
                  totalVolume += Math.abs(l.amount || 0);
              }

              return res.status(200).json({
                  success: true,
                  totalEvents: (logs || []).length,
                  totalVolume,
                  byActionType: byType,
              });
          } catch (err) {
              return res.status(500).json({ error: 'Stats failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
          }
      }

      return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
