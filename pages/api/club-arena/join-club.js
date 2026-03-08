/**
 * POST /api/club-arena/join-club
 * Join a club by numeric club code.
 *
 * ── Agent assignment (Club Arena only) ──────────────────────────────────────
 * Club Arena uses its OWN invite code system, completely separate from the
 * platform-level referral/diamond reward system (profiles.player_number).
 *
 * Club Arena agent invite codes are 6-character alphanumeric strings stored
 * in agents.invite_code, unique per club. They have NO relation to
 * player_number, platform referrals, or diamond rewards.
 *
 * Body:
 *   clubCode      (required) — 5-digit club code
 *   agentCode     (optional) — 6-char agent invite code (agents.invite_code)
 *                              Club Arena only — NOT the platform referral code
 *   agentUserId   (optional) — direct UUID assignment (owner/admin only)
 *
 * Auth: Bearer token (any authenticated user)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUser } from '../../../src/lib/serverAuth';
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

    // NOTE: agentCode is the Club Arena-specific 6-char invite code (agents.invite_code).
    // It is completely separate from the platform referral system (profiles.player_number).
    // Do NOT conflate these — they serve different purposes and different reward systems.
    const { clubCode, agentCode, agentUserId: explicitAgentUserId } = req.body;
    if (!clubCode) return res.status(400).json({ success: false, error: 'Club code required' });

    // Validate agentCode format if provided: 6 alphanumeric chars only
    if (agentCode && !/^[A-Z0-9]{6}$/i.test(agentCode.trim())) {
        return res.status(400).json({ success: false, error: 'Agent invite code must be 6 alphanumeric characters' });
    }

    // Rate limit — prevent brute-force of club codes
    if (!applyRateLimit(req, res, 'club-arena/join-club')) return;

    const codeNum = parseInt(clubCode);
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

        // ── Resolve agent assignment (Club Arena only) ─────────────────
        // Uses agents.invite_code — a 6-char alphanumeric code unique per club.
        // This is NOT the platform player_number / referral system.
        // Platform referrals (diamonds, rewards) are handled separately in
        // /api/rewards/referral and /api/promo/validate-referral-code.
        //
        // Priority: agentCode (invite_code) > explicitAgentUserId (admin-only)
        let resolvedAgentUserId = null;

        if (agentCode) {
            // Look up the agent directly by their Club Arena invite code + club
            const { data: agentRecord } = await supabaseAdmin
                .from('agents')
                .select('user_id, status')
                .eq('club_id', club.id)
                .eq('invite_code', agentCode.trim().toUpperCase())
                .eq('status', 'active')
                .maybeSingle();

            if (agentRecord) {
                resolvedAgentUserId = agentRecord.user_id;
            }
            // Invalid/unknown code — silently ignore (agent may be in different club)
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

        return res.status(200).json({
            success: true,
            club,
            agentAssigned: !!resolvedAgentUserId,
            agentUserId: resolvedAgentUserId,
        });
    } catch (err) {
        console.error('[join-club]', err);
        return res.status(500).json({ success: false, error: err.message || 'Failed to join club' });
    }
}
