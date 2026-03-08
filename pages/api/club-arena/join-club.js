/**
 * POST /api/club-arena/join-club
 * Join a club by numeric code. Prevents duplicate membership.
 * 
 * Optional body fields:
 *   agentCode    - Agent's unique invite code (auto-assigns player to that agent)
 *   agentUserId  - Agent's user_id (admin-side assignment, requires owner/admin caller)
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

    const { clubCode, agentCode, agentUserId: explicitAgentUserId } = req.body;
    if (!clubCode) return res.status(400).json({ success: false, error: 'Club code required' });

    // BUG #281: No rate limit — attacker could brute-force all numeric club codes
    if (!applyRateLimit(req, res, 'club-arena/join-club')) return;

    // Validate club code is a reasonable integer
    const codeNum = parseInt(clubCode);
    if (!Number.isFinite(codeNum) || codeNum <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid club code' });
    }

    try {
        // Find club
        const { data: club, error: findErr } = await supabaseAdmin
            .from('clubs')
            .select('id, member_count')
            .eq('club_id', parseInt(clubCode))
            .maybeSingle();

        if (findErr || !club) {
            return res.status(404).json({ success: false, error: 'Club not found. Check the code.' });
        }

        // Check existing membership
        const { data: existing, error: existingErr } = await supabaseAdmin
            .from('club_members')
            .select('id')
            .eq('club_id', club.id)
            .eq('user_id', user.id)
            .maybeSingle();

        if (existingErr) {
            console.error('[join-club] Membership check error:', existingErr);
            return res.status(500).json({ success: false, error: 'Failed to check membership' });
        }

        if (existing) {
            return res.status(409).json({ success: false, error: 'You are already a member of this club' });
        }

        // ── Resolve agent assignment ──────────────────────────────────
        // Priority: agentCode (player invite flow) > explicitAgentUserId (admin assign)
        let resolvedAgentUserId = null;

        if (agentCode) {
            // Player joined via agent's invite link/code
            const { data: agentByCode } = await supabaseAdmin
                .from('agents')
                .select('user_id, status')
                .eq('club_id', club.id)
                .eq('invite_code', agentCode.trim().toUpperCase())
                .eq('status', 'active')
                .maybeSingle();
            if (agentByCode) {
                resolvedAgentUserId = agentByCode.user_id;
            }
        } else if (explicitAgentUserId) {
            // Admin-side explicit assignment — verify caller is owner/admin
            const { data: callerMember } = await supabaseAdmin
                .from('club_members')
                .select('role')
                .eq('club_id', club.id)
                .eq('user_id', user.id)
                .maybeSingle();
            const isAdmin = callerMember && ['owner', 'admin'].includes(callerMember.role);
            if (isAdmin) {
                // Verify the target agent is active in this club
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

        // Increment agent's active_player_count if assigned
        if (resolvedAgentUserId) {
            await supabaseAdmin.rpc('fn_increment_agent_player_count', {
                p_agent_user_id: resolvedAgentUserId,
                p_club_id: club.id,
            }).catch(() => {
                // Non-fatal — count will reconcile on next settlement
            });
        }

        // Atomic member count increment — avoids race condition stale read
        await supabaseAdmin.rpc('fn_increment_club_member_count', {
            p_club_id: club.id,
        }).catch(async () => {
            // Fallback: non-atomic increment (acceptable if RPC doesn't exist yet)
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
