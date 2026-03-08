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
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../src/lib/serverAuth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, LIMITS.read)) return;
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
      .maybeSingle();

    if (!unionAdmin) return res.status(403).json({ success: false, error: 'Not a union admin' });

    // 2. Get union info
    const { data: union } = await supabaseAdmin
      .from('unions')
      .select('*')
      .eq('id', unionId)
      .maybeSingle();

    if (!union) return res.status(404).json({ success: false, error: 'Union not found' });

    // 2b. Pending union applications + leave requests (for alert banners)
    const [{ count: pendingApps }, { count: pendingLeave }] = await Promise.all([
      supabaseAdmin.from('union_applications')
        .select('*', { count: 'exact', head: true })
        .eq('union_id', unionId)
        .eq('status', 'pending'),
      supabaseAdmin.from('union_leave_requests')
        .select('*', { count: 'exact', head: true })
        .eq('union_id', unionId)
        .eq('status', 'pending'),
    ]);

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
        .select('id, name, club_id, member_count, chip_treasury, total_rake, owner_id, settings, club_commission_rate, created_at')
        .in('id', clubIds)
        .limit(200); // BUG FIX: was 100, but union_clubs limit is 200 → agents in clubs 101+ showed "Unknown Club"
      clubs = clubData || [];
    }

    // 4. Get all agents across union clubs
    let agents = [];
    if (clubIds.length > 0) {
      const { data: agentData } = await supabaseAdmin
        .from('agents')
        .select('id, user_id, club_id, role, commission_rate, is_prepaid, status, active_player_count, total_players, lifetime_earnings, weekly_rake_generated, business_balance, credit_limit, credit_used')
        .in('club_id', clubIds)
        // Include suspended agents — union admin needs to see credit exposure of ALL agents
            .limit(200);
      agents = agentData || [];

      // Enrich agents with profile names
      const agentUserIds = agents.map(a => a.user_id);
      if (agentUserIds.length > 0) {
        const { data: agentProfiles } = await supabaseAdmin
          .from('profiles')
          .select('id, username, display_name')
          .in('id', agentUserIds)
          .limit(200);

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
        .limit(50); // Raised from 20 — with 10+ clubs, 20 periods is ~2 per club
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

    // 7. Running tournament count across all union clubs
    let runningTournaments = 0;
    let scheduledTournaments = 0;
    if (clubIds.length > 0) {
      const { data: tournCounts } = await supabaseAdmin
        .from('club_tournaments')
        .select('status')
        .in('club_id', clubIds)
        .in('status', ['running', 'late_reg', 'break', 'paused', 'final_table', 'scheduled', 'registering']);
      for (const t of (tournCounts || [])) {
        if (['running', 'late_reg', 'break', 'paused', 'final_table'].includes(t.status)) runningTournaments++;
        else scheduledTournaments++;
      }
    }

    // 8. Aggregate stats
    const totalTreasury = clubs.reduce((s, c) => s + (c.chip_treasury || 0), 0);
    const totalRake = clubs.reduce((s, c) => s + (c.total_rake || 0), 0);
    const totalMembers = clubs.reduce((s, c) => s + (c.member_count || 0), 0);
    const activeAgents = agents.filter(a => a.status === 'active');
    const suspendedAgents = agents.filter(a => a.status === 'suspended');
    const totalAgents = activeAgents.length;
    const totalSuspendedAgents = suspendedAgents.length;
    const totalAgentPlayers = activeAgents.reduce((s, a) => s + (a.active_player_count || 0), 0);
    const totalLifetimeEarnings = agents.reduce((s, a) => s + (a.lifetime_earnings || 0), 0);
    const totalWeeklyRake = agents.reduce((s, a) => s + (a.weekly_rake_generated || 0), 0);
    // Total outstanding credit across ALL agents (including suspended — still owed)
    const totalCreditExposure = agents
      .filter(a => !a.is_prepaid)
      .reduce((s, a) => s + (a.credit_used || 0), 0);

    // Use current/open period rake for hold estimate (not lifetime)
    const currentPeriodRake = periods
      .filter(p => p.status === 'open')
      .reduce((s, p) => s + (p.total_rake_collected || 0), 0);
    const holdRate = union.settings?.union_rake_hold || 0.10;

    return res.status(200).json({
      success: true,
      union,
      adminRole: unionAdmin.role,
      pendingApplications: pendingApps || 0,
      pendingLeaveRequests: pendingLeave || 0,
      wallets: {
        chip_balance: Number(union.chip_balance || 0),
        rake_wallet: Number(union.rake_wallet || 0),
        bbj_wallet: Number(union.bbj_wallet || 0),
        promo_wallet: Number(union.promo_wallet || 0),
      },
      stats: {
        totalClubs: clubs.length,
        totalMembers,
        totalAgents,
        totalSuspendedAgents,
        totalAgentPlayers,
        totalTreasury,
        totalRake,
        totalLifetimeEarnings,
        totalWeeklyRake,
        totalCreditExposure,
        unionHoldRate: holdRate,
        estimatedUnionHold: Math.round(currentPeriodRake * holdRate),
        currentPeriodRake,
        runningTournaments,
        scheduledTournaments,
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
