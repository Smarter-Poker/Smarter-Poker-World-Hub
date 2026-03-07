/**
 * System Information API
 * GET /api/commander/system-info - Get system health, version, recent log
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUser } from '../../../src/lib/serverAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const APP_VERSION = '1.0.0';
const BUILD_DATE = '2026-02-12';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Authorization required' });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { data: staff } = await supabase
      .from('commander_staff')
      .select('venue_id, role, name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();
    if (!staff) return res.status(403).json({ success: false, error: 'Staff access required' });

    const venueId = staff.venue_id;

    // Health checks
    const healthChecks = {};

    // 1. Database connectivity
    const dbStart = Date.now();
    const { error: dbErr } = await supabase.from('poker_venues').select('id').eq('id', venueId).maybeSingle();
    healthChecks.database = {
      status: dbErr ? 'error' : 'healthy',
      latency_ms: Date.now() - dbStart,
      error: dbErr?.message || null
    };

    // 2. Get venue info
    const { data: venue } = await supabase
      .from('poker_venues')
      .select('id, name, created_at')
      .eq('id', venueId)
      .maybeSingle();

    // 3. Count active resources
    const [tablesRes, staffRes, gamesRes, membersRes] = await Promise.all([
      supabase.from('commander_tables').select('id', { count: 'exact', head: true }).eq('venue_id', venueId),
      supabase.from('commander_staff').select('id', { count: 'exact', head: true }).eq('venue_id', venueId).eq('is_active', true),
      supabase.from('commander_games').select('id', { count: 'exact', head: true }).eq('venue_id', venueId).in('status', ['waiting', 'running']),
      supabase.from('commander_members').select('id', { count: 'exact', head: true }).eq('venue_id', venueId)
    ]);

    // 4. Recent system log
    const { data: recentLog } = await supabase
      .from('commander_system_log')
      .select('*')
      .eq('venue_id', venueId)
      .order('created_at', { ascending: false })
      .limit(20);

    // 5. API health (self-check)
    healthChecks.api = { status: 'healthy', latency_ms: 0 };

    return res.status(200).json({
      success: true,
      data: {
        version: APP_VERSION,
        build_date: BUILD_DATE,
        environment: process.env.NODE_ENV || 'production',
        platform: 'Club Commander Cloud',
        venue: venue ? { id: venue.id, name: venue.name, created_at: venue.created_at } : null,
        health: healthChecks,
        counts: {
          tables: tablesRes.count || 0,
          active_staff: staffRes.count || 0,
          active_games: gamesRes.count || 0,
          total_members: membersRes.count || 0
        },
        recent_log: recentLog || [],
        server_time: new Date().toISOString(),
        uptime_note: 'Cloud-hosted — 99.9% uptime SLA'
      }
    });
  } catch (err) {
    console.error('System info error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
