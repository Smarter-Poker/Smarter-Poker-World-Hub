/**
 * GET /api/club-arena/union-dashboard
 * 
 * Returns union-level dashboard data:
 * - Union info and settings
 * - All clubs with stats
 * - All agents across clubs
 * - Aggregate financials
 * - Recent settlement periods
 * 
 * Query: ?unionId=xxx
 * Auth: Bearer token (union admin)
 */
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'GET only' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

  const unionId = req.query.unionId;
  if (!unionId) return res.status(400).json({ success: false, error: 'unionId query param required' });

  try {
    // 1. Verify union admin
    const { data: unionAdmin } = await supabaseAdmin
      .from('union_admins')
      .select('role, permissions')
      .eq('union_id', unionId)
      .eq('user_id', user.id)
      .single();

    if (!unionAdmin) return res.status(403).json({ success: false, error: 'Not a union admin' });

    // 2. Get union info
    const { data: union } = await supabaseAdmin
      .from('unions')
      .select('*')
      .eq('id', unionId)
      .single();

    if (!union) return res.status(404).json({ success: false, error: 'Union not found' });

    // 3. Get all clubs in union
    const { data: unionClubs } = await supabaseAdmin
      .from('union_clubs')
      .select('club_id')
      .eq('union_id', unionId)
      .limit(200);

    const clubIds = (unionClubs || []).map(uc => uc.club_id);

    let clubs = [];
    if (clubIds.length > 0) {
      const { data: clubData } = await supabaseAdmin
        .from('clubs')
        .select('id, name, club_id, member_count, chip_treasury, total_rake, owner_id, settings, created_at')
        .in('id', clubIds)
            .limit(100);
      clubs = clubData || [];
    }

    // 4. Get all agents across union clubs
    let agents = [];
    if (clubIds.length > 0) {
      const { data: agentData } = await supabaseAdmin
        .from('agents')
        .select('id, user_id, club_id, commission_rate, is_prepaid, status, active_player_count, total_players, lifetime_earnings, weekly_rake_generated, business_balance, credit_limit, credit_used')
        .in('club_id', clubIds)
        .eq('status', 'active')
            .limit(100);
      agents = agentData || [];

      // Enrich agents with profile names
      const agentUserIds = agents.map(a => a.user_id);
      if (agentUserIds.length > 0) {
        const { data: agentProfiles } = await supabaseAdmin
          .from('profiles')
          .select('id, username, display_name')
          .in('id', agentUserIds)
              .limit(100);

        const profMap = {};
        for (const p of (agentProfiles || [])) profMap[p.id] = p;
        agents = agents.map(a => ({ ...a, profile: profMap[a.user_id] || null }));
      }
    }

    // 5. Get recent settlement periods
    let periods = [];
    if (clubIds.length > 0) {
      const { data: periodData } = await supabaseAdmin
        .from('settlement_periods')
        .select('*')
        .in('club_id', clubIds)
        .order('created_at', { ascending: false })
        .limit(20);
      periods = periodData || [];
    }

    // 6. Get all union admins
    const { data: adminList } = await supabaseAdmin
      .from('union_admins')
      .select('user_id, role, permissions, created_at')
      .eq('union_id', unionId)
      .limit(100);

    // Enrich admins with profile names
    let admins = adminList || [];
    const adminUserIds = admins.map(a => a.user_id);
    if (adminUserIds.length > 0) {
      const { data: adminProfiles } = await supabaseAdmin
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', adminUserIds)
            .limit(100);
      const profMap = {};
      for (const p of (adminProfiles || [])) profMap[p.id] = p;
      admins = admins.map(a => ({ ...a, profile: profMap[a.user_id] || null }));
    }

    // 7. Aggregate stats
    const totalTreasury = clubs.reduce((s, c) => s + (c.chip_treasury || 0), 0);
    const totalRake = clubs.reduce((s, c) => s + (c.total_rake || 0), 0);
    const totalMembers = clubs.reduce((s, c) => s + (c.member_count || 0), 0);
    const totalAgents = agents.length;
    const totalAgentPlayers = agents.reduce((s, a) => s + (a.active_player_count || 0), 0);
    const totalLifetimeEarnings = agents.reduce((s, a) => s + (a.lifetime_earnings || 0), 0);
    const totalWeeklyRake = agents.reduce((s, a) => s + (a.weekly_rake_generated || 0), 0);

    // Use current/open period rake for hold estimate (not lifetime)
    const currentPeriodRake = periods
      .filter(p => p.status === 'open')
      .reduce((s, p) => s + (p.total_rake_collected || 0), 0);
    const holdRate = union.settings?.union_rake_hold || 0.10;

    return res.status(200).json({
      success: true,
      union,
      adminRole: unionAdmin.role,
      stats: {
        totalClubs: clubs.length,
        totalMembers,
        totalAgents,
        totalAgentPlayers,
        totalTreasury,
        totalRake,
        totalLifetimeEarnings,
        totalWeeklyRake,
        unionHoldRate: holdRate,
        estimatedUnionHold: Math.round(currentPeriodRake * holdRate),
        currentPeriodRake,
      },
      clubs,
      agents,
      admins,
      recentPeriods: periods,
    });
  } catch (err) {
    console.error('[union-dashboard]', err);
    return res.status(500).json({ success: false, error: 'Union dashboard failed', details: err.message });
  }
}
