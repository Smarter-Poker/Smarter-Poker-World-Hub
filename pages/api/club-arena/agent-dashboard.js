/**
 * GET /api/club-arena/agent-dashboard
 * 
 * Returns comprehensive agent dashboard data:
 * - Agent profile and stats
 * - Downline players with balances
 * - Pending cashout requests
 * - Commission history
 * - Recent transactions
 * 
 * Query: ?clubId=xxx
 * Auth: Bearer token (agent, owner, or admin)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'GET only' });
  if (!applyRateLimit(req, res, LIMITS.read)) return;

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

  const clubId = req.query.clubId;
  if (!clubId) return res.status(400).json({ success: false, error: 'clubId query param required' });

  try {
    // 1. Get caller's membership
    const { data: callerMember } = await supabaseAdmin
      .from('club_members')
      .select('user_id, role, chip_balance, credit_limit, credit_used, nickname, tier')
      .eq('club_id', clubId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!callerMember) return res.status(404).json({ success: false, error: 'Not a member of this club' });

    const isOwnerAdmin = ['owner', 'admin'].includes(callerMember.role);
    const isAgent = ['agent', 'sub_agent', 'super_agent'].includes(callerMember.role);

    if (!isOwnerAdmin && !isAgent) {
      return res.status(403).json({ success: false, error: 'Agent, owner, or admin role required' });
    }

    // 2. Get agent record(s)
    let agentFilter = isOwnerAdmin
      ? supabaseAdmin.from('agents').select('*').eq('club_id', clubId)
      : supabaseAdmin.from('agents').select('*').eq('club_id', clubId).eq('user_id', user.id)
          .limit(100);

    const { data: agents } = await agentFilter;

    // For a single agent, get their specific data
    const targetAgentId = isAgent ? user.id : null;

    // 3. Get downline players
    let playersQuery = supabaseAdmin
      .from('club_members')
      .select('user_id, role, chip_balance, agent_id, status, nickname, tier, xp')
      .eq('club_id', clubId)
      .eq('role', 'player')
          .limit(100);

    if (isAgent) {
      playersQuery = playersQuery.eq('agent_id', user.id)
          .limit(200);
    }

    const { data: players } = await playersQuery;

    // Enrich with profile data
    const playerIds = (players || []).map(p => p.user_id);
    let profiles = [];
    if (playerIds.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_online, last_seen')
        .in('id', playerIds)
            .limit(100);
      profiles = profs || [];
    }

    const profileMap = {};
    for (const p of profiles) profileMap[p.id] = p;

    const enrichedPlayers = (players || []).map(p => ({
      ...p,
      profile: profileMap[p.user_id] || null,
    }));

    // 4. Get pending cashout requests
    let cashoutQuery = supabaseAdmin
      .from('cashout_requests')
      .select('*')
      .eq('club_id', clubId)
      .eq('status', 'pending')
          .limit(200);

    if (isAgent) {
      cashoutQuery = cashoutQuery.eq('agent_id', user.id)
          .limit(200);
    }

    const { data: pendingCashouts } = await cashoutQuery;

    // 5. Get commission history (last 5 periods)
    let commHistQuery = supabaseAdmin
      .from('commission_history')
      .select('*')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (isAgent) {
      const myAgent = (agents || []).find(a => a.user_id === user.id);
      if (myAgent) {
        commHistQuery = supabaseAdmin
          .from('commission_history')
          .select('*')
          .eq('club_id', clubId)
          .eq('agent_id', myAgent.id)
          .order('created_at', { ascending: false })
          .limit(10);
      }
    }

    const { data: commissionHistory } = await commHistQuery;

    // 6. Get recent chip_transactions
    let txnQuery = supabaseAdmin
      .from('chip_transactions')
      .select('*')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })
      .limit(25);

    if (isAgent) {
      // Only show transactions involving this agent
      txnQuery = supabaseAdmin
        .from('chip_transactions')
        .select('*')
        .eq('club_id', clubId)
        .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(25);
    }

    const { data: recentTransactions } = await txnQuery;

    // 7. Aggregate stats
    const totalPlayerChips = (enrichedPlayers || []).reduce((s, p) => s + (p.chip_balance || 0), 0);
    const onlinePlayers = enrichedPlayers.filter(p => p.profile?.is_online).length;

    return res.status(200).json({
      success: true,
      clubId,
      role: callerMember.role,
      membership: callerMember,
      agents: agents || [],
      stats: {
        totalPlayers: enrichedPlayers.length,
        onlinePlayers,
        totalPlayerChips,
        pendingCashouts: (pendingCashouts || []).length,
        pendingCashoutAmount: (pendingCashouts || []).reduce((s, c) => s + c.amount, 0),
      },
      players: enrichedPlayers,
      pendingCashouts: pendingCashouts || [],
      commissionHistory: commissionHistory || [],
      recentTransactions: recentTransactions || [],
    });
  } catch (err) {
    console.error('[agent-dashboard]', err);
    return res.status(500).json({ success: false, error: 'Dashboard load failed', details: err.message });
  }
}
