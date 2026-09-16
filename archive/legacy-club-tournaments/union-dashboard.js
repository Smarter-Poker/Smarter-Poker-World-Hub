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

export default async function handler(req, res) {
  try {
    if (!applyRateLimit(req, res, LIMITS.read)) return;
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'GET only' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

    const { data: authData, error: authError } = await getSupabase().auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const unionId = req.query.unionId;
    if (!unionId) return res.status(400).json({ success: false, error: 'unionId query param required' });

    try {
      // 1. Verify union admin (with owner fallback)
      const { data: unionAdmin } = await getSupabase()
        .from('union_admins')
        .select('role, permissions')
        .eq('union_id', unionId)
        .eq('user_id', user.id)
        .maybeSingle();

      // Fallback: check if user is the union owner
      let resolvedAdmin = unionAdmin;
      if (!resolvedAdmin) {
        const { data: ownerCheck } = await getSupabase()
          .from('unions')
          .select('id')
          .eq('id', unionId)
          .eq('owner_id', user.id)
          .maybeSingle();
        if (ownerCheck) {
          resolvedAdmin = { role: 'owner', permissions: null };
        }
      }

      if (!resolvedAdmin) return res.status(403).json({ success: false, error: 'Not a union admin' });

      // 2. Get union info
      const { data: union } = await getSupabase()
        .from('unions')
        .select('id, name, code, description, owner_id, settings, chip_balance, rake_wallet, bbj_wallet, promo_wallet, backup_bbj_balance, created_at')
        .eq('id', unionId)
        .maybeSingle();

      if (!union) return res.status(404).json({ success: false, error: 'Union not found' });

      // 2b. Pending union applications + leave requests (for alert banners)
      const [{ count: pendingApps }, { count: pendingLeave }] = await Promise.all([
        getSupabase().from('union_applications')
          .select('*', { count: 'exact', head: true })
          .eq('union_id', unionId)
          .eq('status', 'pending'),
        getSupabase().from('union_leave_requests')
          .select('*', { count: 'exact', head: true })
          .eq('union_id', unionId)
          .eq('status', 'pending'),
      ]);

      // 3. Get all clubs in union
      const { data: unionClubs } = await getSupabase()
        .from('union_clubs')
        .select('club_id')
        .eq('union_id', unionId)
        .limit(200);

      const clubIds = (unionClubs || []).map(uc => uc.club_id);

      let clubs = [];
      if (clubIds.length > 0) {
        const { data: clubData } = await getSupabase()
          .from('clubs')
          .select('id, name, club_id, member_count, chip_treasury, total_rake, weekly_rake, hands_played, owner_id, settings, club_commission_rate, created_at')
          .in('id', clubIds)
          .limit(200); // BUG FIX: was 100, but union_clubs limit is 200 → agents in clubs 101+ showed "Unknown Club"
        clubs = clubData || [];
      }

      // 4. Get all agents across union clubs
      let agents = [];
      if (clubIds.length > 0) {
        const { data: agentData } = await getSupabase()
          .from('agents')
          .select('id, user_id, club_id, role, commission_rate, is_prepaid, status, active_player_count, total_players, lifetime_earnings, weekly_rake_generated, business_balance, credit_limit, credit_used')
          .in('club_id', clubIds)
          // Include suspended agents — union admin needs to see credit exposure of ALL agents
              .limit(200);
        agents = agentData || [];

        // Enrich agents with profile names
        const agentUserIds = agents.map(a => a.user_id);
        if (agentUserIds.length > 0) {
          const { data: agentProfiles } = await getSupabase()
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
        const { data: periodData } = await getSupabase()
          .from('settlement_periods')
          .select('id, club_id, status, period_number, total_rake_collected, total_hands_dealt, start_at, end_at, created_at')
          .in('club_id', clubIds)
          .order('created_at', { ascending: false })
          .limit(50); // Raised from 20 — with 10+ clubs, 20 periods is ~2 per club
        periods = periodData || [];
      }

      // 6. Get all union admins
      const { data: adminList } = await getSupabase()
        .from('union_admins')
        .select('user_id, role, permissions, created_at')
        .eq('union_id', unionId)
        .limit(100);

      // Enrich admins with profile names
      let admins = adminList || [];
      const adminUserIds = admins.map(a => a.user_id);
      if (adminUserIds.length > 0) {
        const { data: adminProfiles } = await getSupabase()
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', adminUserIds)
              .limit(100);
        const profMap = {};
        for (const p of (adminProfiles || [])) profMap[p.id] = p;
        admins = admins.map(a => ({ ...a, profile: profMap[a.user_id] || null }));
      }

      // 6b. Active tables count per club (for Games tab)
      const activeTablesByClub = {};
      if (clubIds.length > 0) {
        const { data: activeTables } = await getSupabase()
          .from('tables')
          .select('club_id, status, current_players')
          .in('club_id', clubIds)
          .in('status', ['waiting', 'running'])
          .limit(500);
        for (const t of (activeTables || [])) {
          if (!activeTablesByClub[t.club_id]) activeTablesByClub[t.club_id] = { count: 0, seats: 0 };
          activeTablesByClub[t.club_id].count++;
          activeTablesByClub[t.club_id].seats += (t.current_players || 0);
        }
        // Enrich clubs with live table data
        clubs = clubs.map(c => ({
          ...c,
          active_tables: activeTablesByClub[c.id]?.count || 0,
          seated_players: activeTablesByClub[c.id]?.seats || 0,
        }));
      }

      // 7. Running tournament count across all union clubs
      let runningTournaments = 0;
      let scheduledTournaments = 0;
      if (clubIds.length > 0) {
        const { data: tournCounts } = await getSupabase()
          .from('club_tournaments')
          .select('status')
          .in('club_id', clubIds)
          .in('status', ['running', 'late_reg', 'break', 'paused', 'final_table', 'scheduled', 'registering']);
        for (const t of (tournCounts || [])) {
          if (['running', 'late_reg', 'break', 'paused', 'final_table'].includes(t.status)) runningTournaments++;
          else scheduledTournaments++;
        }
      }

      // 7b. Commission history — only loaded when ?include=commissions is passed (lazy)
      let commissionHistory = undefined;
      if (req.query.include === 'commissions' && clubIds.length > 0) {
        const { data: commRows } = await getSupabase()
          .from('commission_history')
          .select('id, club_id, agent_user_id, agent_role, commission_rate, commission_amount, gross_rake, is_prepaid, created_at')
          .in('club_id', clubIds)
          .order('created_at', { ascending: false })
          .limit(100);

        // Enrich with agent names
        const agentUserIds = [...new Set((commRows || []).map(r => r.agent_user_id).filter(Boolean))];
        let profileMap = {};
        if (agentUserIds.length > 0) {
          const { data: profs } = await getSupabase()
            .from('profiles')
            .select('id, username, display_name')
            .in('id', agentUserIds)
            .limit(200);
          for (const p of (profs || [])) profileMap[p.id] = p.display_name || p.username || p.id;
        }
        commissionHistory = (commRows || []).map(r => ({
          ...r,
          agent_name: profileMap[r.agent_user_id] || null,
        }));
      }

      // 8. Aggregate stats
      const totalTreasury = clubs.reduce((s, c) => s + (c.chip_treasury || 0), 0);
      const totalRake = clubs.reduce((s, c) => s + (c.total_rake || 0), 0);
      const totalMembers = clubs.reduce((s, c) => s + (c.member_count || 0), 0);
      const totalSeatedPlayers = clubs.reduce((s, c) => s + (c.seated_players || 0), 0);
      const totalActiveTables = clubs.reduce((s, c) => s + (c.active_tables || 0), 0);
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

      // 7.5. Aggregate Live Activity Feed (Recent Transactions, Tournaments, Tables)
      let activityFeed = [];
      if (clubIds.length > 0) {
        try {
          const [{ data: txs }, { data: tourns }, { data: recentTables }] = await Promise.all([
            getSupabase().from('union_wallet_transactions').select('id, amount, transaction_type, notes, created_at').eq('union_id', unionId).order('created_at', { ascending: false }).limit(3),
            getSupabase().from('club_tournaments').select('id, name, status, created_at').in('club_id', clubIds).order('created_at', { ascending: false }).limit(3),
            getSupabase().from('tables').select('id, name, stakes, status, created_at').in('club_id', clubIds).order('created_at', { ascending: false }).limit(3)
          ]);

          const cMap = { success: '#31A24C', primary: '#2374E1', gold: '#F7C52A' };

          const feedItems = [
            ...(txs || []).map(t => ({ id: `tx_${t.id}`, type: 'money', text: `💰 ${t.transaction_type} ${(t.amount || 0).toLocaleString()} chips`, ts: new Date(t.created_at).getTime(), color: cMap.success })),
            ...(tourns || []).map(t => ({ id: `tr_${t.id}`, type: 'game', text: `🏆 Tournament "${t.name}" added`, ts: new Date(t.created_at).getTime(), color: cMap.gold })),
            ...(recentTables || []).map(t => ({ id: `tb_${t.id}`, type: 'game', text: `🃏 Table "${t.name}" (${t.stakes || ''}) opened`, ts: new Date(t.created_at).getTime(), color: cMap.primary }))
          ];

          feedItems.sort((a, b) => b.ts - a.ts);
          activityFeed = feedItems.slice(0, 5).map(item => {
            const diffMins = Math.floor((Date.now() - item.ts) / 60000);
            const timeStr = diffMins < 1 ? 'Just now' : diffMins < 60 ? `${diffMins}m ago` : `${Math.floor(diffMins/60)}h ${diffMins%60}m ago`;
            return { id: item.id, type: item.type, text: item.text, time: timeStr, color: item.color };
          });
        } catch (e) {
          console.warn('[UnionDashboard API] Activity Feed build failed:', e);
        }
      }

      // 7c. Cross-Club Analytics — only loaded when ?include=analytics is passed (lazy)
      let crossClubAnalytics = undefined;
      if (req.query.include === 'analytics' && clubIds.length > 0) {
        try {
          // Per-club weekly rake trending (last 4 weeks)
          const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
          const { data: periodTrends } = await getSupabase()
            .from('settlement_periods')
            .select('club_id, period_number, total_rake_collected, total_hands_dealt, status, created_at')
            .in('club_id', clubIds)
            .gte('created_at', fourWeeksAgo)
            .order('created_at', { ascending: true })
            .limit(500);

          const rakeTrendByClub = {};
          for (const p of (periodTrends || [])) {
            const clubName = clubs.find(c => c.id === p.club_id)?.name || 'Unknown';
            if (!rakeTrendByClub[p.club_id]) rakeTrendByClub[p.club_id] = { clubName, periods: [] };
            rakeTrendByClub[p.club_id].periods.push({
              period: p.period_number,
              rake: p.total_rake_collected || 0,
              hands: p.total_hands_dealt || 0,
              status: p.status,
              date: p.created_at,
            });
          }

          // Top agents by earnings across all clubs (top 10)
          const sortedAgents = [...agents]
            .filter(a => a.status === 'active')
            .sort((a, b) => (b.lifetime_earnings || 0) - (a.lifetime_earnings || 0))
            .slice(0, 10)
            .map(a => ({
              userId: a.user_id,
              name: a.profile?.display_name || a.profile?.username || a.user_id.substring(0, 8),
              clubId: a.club_id,
              clubName: clubs.find(c => c.id === a.club_id)?.name || 'Unknown',
              commissionRate: a.commission_rate,
              lifetimeEarnings: a.lifetime_earnings || 0,
              weeklyRake: a.weekly_rake_generated || 0,
              playerCount: a.active_player_count || 0,
            }));

          // Player migration — new members (joined in last 14 days)
          const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
          const { data: newMembers } = await getSupabase()
            .from('club_members')
            .select('user_id, club_id, role, created_at')
            .in('club_id', clubIds)
            .gte('created_at', twoWeeksAgo)
            .order('created_at', { ascending: false })
            .limit(100);

          // Detect users in multiple clubs (potential migration)
          const userClubMap = {};
          for (const m of (newMembers || [])) {
            if (!userClubMap[m.user_id]) userClubMap[m.user_id] = [];
            userClubMap[m.user_id].push({
              clubId: m.club_id,
              clubName: clubs.find(c => c.id === m.club_id)?.name || 'Unknown',
              joinedAt: m.created_at,
            });
          }
          const migrations = Object.entries(userClubMap || {})
            .filter(([_, clubs]) => clubs.length > 1)
            .map(([userId, joinedClubs]) => ({ userId, clubs: joinedClubs }));

          crossClubAnalytics = {
            rakeTrendByClub: Object.values(rakeTrendByClub || {}),
            topAgents: sortedAgents,
            newMembersCount: (newMembers || []).length,
            migrations,
          };
        } catch (e) {
          console.warn('[UnionDashboard] Cross-club analytics failed:', e.message);
        }
      }

      // Use current/open period rake for hold estimate (not lifetime)
      const currentPeriodRake = periods
        .filter(p => p.status === 'open')
        .reduce((s, p) => s + (p.total_rake_collected || 0), 0);
      const holdRate = union.settings?.union_rake_hold || 0.10;

      return res.status(200).json({
        success: true,
        union,
        adminRole: resolvedAdmin.role,
        pendingApplications: pendingApps || 0,
        pendingLeaveRequests: pendingLeave || 0,
        activityFeed,
        ...(commissionHistory !== undefined ? { commissionHistory } : {}),
        ...(crossClubAnalytics !== undefined ? { crossClubAnalytics } : {}),
        wallets: {
          chip_balance: Number(union.chip_balance || 0),
          rake_wallet: Number(union.rake_wallet || 0),
          bbj_wallet: Number(union.bbj_wallet || 0),
          promo_wallet: Number(union.promo_wallet || 0),
          backup_bbj_balance: Number(union.backup_bbj_balance || 0),
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
          totalSeatedPlayers,
          totalActiveTables,
        },
        clubs,
        agents,
        admins,
        recentPeriods: periods,
      });
    } catch (err) {
      console.warn('[union-dashboard]', err);
      return res.status(500).json({ success: false, error: 'Union dashboard failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
