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

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
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
        const { data: club, error: findErr } = await supabaseAdmin
            .from('clubs')
            .select('id, member_count')
            .eq('club_id', codeNum)
            .maybeSingle();

        if (findErr || !club) {
            return res.status(404).json({ success: false, error: 'Club not found. Check the code.' });
        }

        // Check existing membership
        const { data: existing } = await supabaseAdmin
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
                const { data: agentProfile } = await supabaseAdmin
                    .from('profiles')
                    .select('id, player_number')
                    .eq('player_number', pn)
                    .maybeSingle();

                if (agentProfile) {
                    // Verify they are an active agent in THIS club
                    const { data: agentRecord } = await supabaseAdmin
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
            const { data: callerMember } = await supabaseAdmin
                .from('club_members')
                .select('role')
                .eq('club_id', club.id)
                .eq('user_id', user.id)
                .maybeSingle();

            if (callerMember && ['owner', 'admin'].includes(callerMember.role)) {
                const { data: agentCheck } = await supabaseAdmin
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
        const { error: joinErr } = await supabaseAdmin
            .from('club_members')
            .insert({
                club_id: club.id,
                user_id: user.id,
                role: 'player',
                status: 'active',
                chip_balance: 0,
                agent_id: resolvedAgentUserId,
                joined_at: new Date().toISOString(),
            });

        if (joinErr) throw joinErr;

        // Atomically increment agent's player count
        if (resolvedAgentUserId) {
            await supabaseAdmin.rpc('fn_increment_agent_player_count', {
                p_agent_user_id: resolvedAgentUserId,
                p_club_id: club.id,
            }).catch(() => { /* non-fatal — reconciled at settlement */ });
        }

        // Atomically increment club member count
        await supabaseAdmin.rpc('fn_increment_club_member_count', {
            p_club_id: club.id,
        }).catch(async () => {
            // Fallback if RPC not yet deployed
            const { count } = await supabaseAdmin
                .from('club_members')
                .select('*', { count: 'exact', head: true })
                .eq('club_id', club.id);
            await supabaseAdmin
                .from('clubs')
                .update({ member_count: count || 0 })
                .eq('id', club.id);
        });

        // Notify club admins of new member
        notifyClubAdmins(supabaseAdmin, {
          clubId: club.id,
          type: 'member_joined',
          title: '👤 New Member Joined',
          message: `A new player has joined ${club.name}.`,
          data: { clubName: club.name, newUserId: user.id },
          excludeUserId: user.id,
        }).catch(() => {});

        return res.status(200).json({
            success: true,
            club,
            agentAssigned: !!resolvedAgentUserId,
            agentUserId: resolvedAgentUserId,
            agentPlayerNumber: resolvedAgentPlayerNumber,
        });
    } catch (err) {
        console.error('[join-club]', err);
        return res.status(500).json({ success: false, error: err.message || 'Failed to join club' });
    }
}
