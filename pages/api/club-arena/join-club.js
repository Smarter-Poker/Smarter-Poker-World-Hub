import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * POST /api/club-arena/join-club
 * Join a club by numeric club code.
 *
 * ── Agent assignment ─────────────────────────────────────────────────────────
 * Every Smarter.Poker player has a player_number (profiles.player_number).
 * That same number serves two independent purposes depending on context:
 *
 *   1. Platform referral  — "Dan Bekavac is inviting you to join Smarter.Poker"
 *                           Handled by /api/rewards/referral — awards 500💎
 *
 *   2. Club Arena agent   — Player enters a club code + their agent's
 *                           player_number to be auto-attached to that agent.
 *                           No diamonds. Club-scoped hierarchy only.
 *
 * Same number, completely different flows and outcomes.
 * If no agentPlayerNumber is provided, player joins unassigned and can be
 * manually attached to any agent by the club owner or admin later.
 *
 * Body:
 *   clubCode          (required) — 5-digit club code
 *   agentPlayerNumber (optional) — agent's player_number (Club Arena assignment)
 *   agentUserId       (optional) — direct UUID assignment (owner/admin only)
 *
 * Auth: Bearer token (any authenticated user)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { notifyClubAdmins } from '../../../src/lib/club-arena/notify';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
import { reportApiError } from '../../../src/lib/sentryWrap';
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');

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
  // Idempotency guard — prevents duplicate mutations from laggy mobile networks
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (checkIdempotency(req, res)) return;
  }

  const supabaseAdmin = getSupabase(); // FIX: was undefined — alias to getSupabase() for settlement-lock, audit, velocity, notify
  try {
      if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

      // agentPlayerNumber is the agent's profiles.player_number.
      // Same number as the platform referral code, but here it means:
      // "attach me to this agent in the club" — no diamonds, no reward claim.
      const { clubCode, clubId, agentPlayerNumber, agentUserId: explicitAgentUserId } = req.body;
      const resolvedCode = clubCode || clubId; // Accept either param name
      if (!resolvedCode) return res.status(400).json({ success: false, error: 'Club code required' });

      // Rate limit — prevent brute-force of club codes
      if (!applyRateLimit(req, res, 'club-arena/join-club')) return;

      const codeNum = parseInt(resolvedCode);
      if (!Number.isFinite(codeNum) || codeNum <= 0) {
          return res.status(400).json({ success: false, error: 'Invalid club code' });
      }

      try {
          // Find club by 5-digit club_id
          const { data: club, error: findErr } = await getSupabase()
              .from('clubs')
              .select('id, member_count, requires_approval, is_public')
              .eq('club_id', codeNum)
              .maybeSingle();

          if (findErr || !club) {
              return res.status(404).json({ success: false, error: 'Club not found. Check the code.' });
          }

          // Round 70: Blacklist enforcement gate. Banned users cannot
          // (re-)join the club they were banned from, and cannot join any
          // club inside a union they were banned from.
          try {
              const { data: clubMeta } = await supabaseAdmin
                  .from('clubs')
                  .select('union_id')
                  .eq('id', club.id)
                  .maybeSingle();
              const banQuery = supabaseAdmin
                  .from('blacklists')
                  .select('id, reason, expires_at')
                  .eq('user_id', user.id)
                  .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());
              const orParts = [`club_id.eq.${club.id}`];
              if (clubMeta?.union_id) orParts.push(`union_id.eq.${clubMeta.union_id}`);
              const { data: bans } = await banQuery.or(orParts.join(','));
              if (bans && bans.length > 0) {
                  return res.status(403).json({
                      success: false,
                      error: 'banned',
                      reason: bans[0].reason || 'Banned from this club',
                      expires_at: bans[0].expires_at,
                  });
              }
          } catch (banErr) {
              // Belt-and-suspenders: never block legitimate joins on a
              // blacklist-check error. Log + proceed.
              console.warn('[join-club] blacklist check skipped:', banErr?.message || banErr);
          }

          // Check existing membership
          const { data: existing } = await getSupabase()
              .from('club_members')
              .select('id')
              .eq('club_id', club.id)
              .eq('user_id', user.id)
              .maybeSingle();

          if (existing) {
              return res.status(409).json({ success: false, error: 'You are already a member of this club' });
          }

          // ── Resolve agent assignment ──────────────────────────────────
          // agentPlayerNumber = agent's player_number from profiles.
          // We look them up by player_number, then verify they are an active
          // agent in THIS club before assigning. No platform referral reward
          // is triggered here — that is a separate flow entirely.
          //
          // If no agentPlayerNumber: player joins unassigned (agent_id = null).
          // Owner/admin can manually assign them to any agent later.
          //
          // Priority: agentPlayerNumber > explicitAgentUserId (admin-only)
          let resolvedAgentUserId = null;
          let resolvedAgentPlayerNumber = null;

          if (agentPlayerNumber) {
              const pn = parseInt(agentPlayerNumber);
              if (Number.isFinite(pn) && pn > 0) {
                  // Look up profile by player_number to get their user_id
                  const { data: agentProfile } = await getSupabase()
                      .from('profiles')
                      .select('id, player_number')
                      .eq('player_number', pn)
                      .maybeSingle();

                  if (agentProfile) {
                      // Verify they are an active agent in THIS club
                      const { data: agentRecord } = await getSupabase()
                          .from('agents')
                          .select('user_id, status')
                          .eq('club_id', club.id)
                          .eq('user_id', agentProfile.id)
                          .eq('status', 'active')
                          .maybeSingle();

                      if (agentRecord) {
                          resolvedAgentUserId = agentRecord.user_id;
                          resolvedAgentPlayerNumber = pn;
                      }
                      // player_number exists on platform but not an agent in this club
                      // → join unassigned, silently ignore
                  }
              }
          } else if (explicitAgentUserId) {
              // Admin-side direct assignment — requires caller to be owner/admin
              const { data: callerMember } = await getSupabase()
                  .from('club_members')
                  .select('role')
                  .eq('club_id', club.id)
                  .eq('user_id', user.id)
                  .maybeSingle();

              if (callerMember && ['owner', 'admin'].includes(callerMember.role)) {
                  const { data: agentCheck } = await getSupabase()
                      .from('agents')
                      .select('user_id')
                      .eq('club_id', club.id)
                      .eq('user_id', explicitAgentUserId)
                      .eq('status', 'active')
                      .maybeSingle();
                  if (agentCheck) resolvedAgentUserId = agentCheck.user_id;
              }
          }

          // Insert membership
          const memberStatus = club.requires_approval ? 'pending' : 'active';
          const { error: joinErr } = await getSupabase()
              .from('club_members')
              .insert({
                  club_id: club.id,
                  user_id: user.id,
                  role: 'player',
                  status: memberStatus,
                  chip_balance: 0,
                  agent_id: resolvedAgentUserId,
                  joined_at: new Date().toISOString(),
              });

          if (joinErr) throw joinErr;

          // If pending, notify owner and return early
          if (memberStatus === 'pending') {
              // Notify club owner
              try {
                  const { notifyClubAdmins } = require('../../../src/lib/club-arena/notify');
                  const { data: profile } = await getSupabase().from('profiles').select('display_name, username').eq('id', user.id).maybeSingle();
                  const playerName = profile?.display_name || profile?.username || 'A new player';
                   await notifyClubAdmins(supabaseAdmin, {
                       clubId: club.id,
                       type: 'join_request',
                       title: '🙋 New Join Request',
                       message: `${playerName} is requesting to join your club.`,
                       data: { userId: user.id, clubId: club.id },
                   });
              } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

              return res.status(200).json({
                  success: true,
                  status: 'pending',
                  message: 'Your request has been submitted. The club owner will review it.',
                  club: { id: club.id, club_id: codeNum },
              });
          }

          // Atomically increment agent's player count
          if (resolvedAgentUserId) {
              await getSupabase().rpc('fn_increment_agent_player_count', {
                  p_agent_user_id: resolvedAgentUserId,
                  p_club_id: club.id,
              }).catch(e => { console.warn('[App] Handled promise rejection:', e?.message || e); });
          }

          // Atomically increment club member count
          await getSupabase().rpc('fn_increment_club_member_count', {
              p_club_id: club.id,
          }).catch(async () => {
              // Fallback if RPC not yet deployed
              const { count } = await getSupabase()
                  .from('club_members')
                  .select('*', { count: 'exact', head: true })
                  .eq('club_id', club.id);
              const { error: err_clubs_8tsi7 } = await getSupabase()
                .from('clubs')
                .update({ member_count: count || 0 })
                  .eq('id', club.id);
              if (err_clubs_8tsi7) console.warn('[Supabase] Silent mutation failed in clubs:', err_clubs_8tsi7.message);
          });

          // Notify club admins of new member
          notifyClubAdmins(supabaseAdmin, {
            clubId: club.id,
            type: 'member_joined',
            title: '👤 New Member Joined',
            message: `A new player has joined ${club.name}.`,
            data: { clubName: club.name, newUserId: user.id },
            excludeUserId: user.id,
          }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));

          return res.status(200).json({
              success: true,
              club,
              agentAssigned: !!resolvedAgentUserId,
              agentUserId: resolvedAgentUserId,
              agentPlayerNumber: resolvedAgentPlayerNumber,
          });
      } catch (err) {
          console.warn('[join-club]', err);
          return res.status(500).json({ success: false, error: 'Failed to join club' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
