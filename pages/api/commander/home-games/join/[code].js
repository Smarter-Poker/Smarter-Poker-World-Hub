import { createClient } from '../../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../../src/lib/sentryWrap';

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
        if (req.method !== 'POST') {
            res.setHeader('Allow', ['POST']);
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });

        const supabase = getSupabase();
        const { data: { user }, error: authErr } = await supabase.auth['getUser'](token);
        
        if (authErr || !user) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const code = req.query.code;
        if (!code || typeof code !== 'string') {
            return res.status(400).json({ success: false, error: 'Invite code is required' });
        }

        // Sanitize code — reject anything containing Supabase filter meta-characters
        // (comma, period, parentheses) that could poison the .or() query string.
        // A legitimate invite_code / club_code is alphanumeric + dashes only.
        if (!/^[a-zA-Z0-9\-]+$/.test(code) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(code)) {
            return res.status(400).json({ success: false, error: 'Invalid invite code format.' });
        }

        // Check if code is a UUID to allow joining by group ID directly
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(code);
        const orQuery = isUuid
            ? `invite_code.eq.${code},club_code.eq.${code},id.eq.${code}`
            : `invite_code.eq.${code},club_code.eq.${code}`;

        // Find the group by invite_code, club_code, or id
        const { data: group, error: groupErr } = await supabase
            .from('commander_home_groups')
            .select('id, name, is_private, owner_id')
            .or(orQuery)
            .maybeSingle();

        if (groupErr || !group) {
            return res.status(404).json({ success: false, error: 'Home game group not found. Check the code.' });
        }

        // Check if user is already a member
        const { data: existingMember } = await supabase
            .from('commander_home_members')
            .select('id, status')
            .eq('group_id', group.id)
            .eq('user_id', user.id)
            .maybeSingle();

        if (existingMember) {
            if (existingMember.status === 'banned') {
                return res.status(403).json({ success: false, error: 'You cannot join this group.' });
            }
            if (existingMember.status === 'pending') {
                return res.status(409).json({ success: false, error: 'Your request is already pending.' });
            }
            return res.status(409).json({ success: false, error: 'You are already a member of this group.' });
        }

        // BUG-FIX: was 'active' — real table uses 'approved' for active members.
        // 'pending' stays as 'pending' for private groups.
        const memberStatus = group.is_private ? 'pending' : 'approved';

        // Add user to the group.
        // BUG-FIX: table was 'commander_home_group_members' (doesn't exist).
        // Correct table is 'commander_home_members'.
        const { error: insertErr } = await supabase
            .from('commander_home_members')
            .insert({
                group_id: group.id,
                user_id: user.id,
                role: 'member',
                status: memberStatus,
            });

        if (insertErr) throw insertErr;

        // If pending, notify the host
        if (memberStatus === 'pending') {
            try {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('display_name, username, avatar_url')
                    .eq('id', user.id)
                    .maybeSingle();
                
                const playerName = profile?.display_name || profile?.username || 'A player';

                await supabase.from('notifications').insert({
                    user_id: group.owner_id,
                    type: 'home_game_join_request',
                    source: 'home_game',
                    title: 'New Join Request',
                    message: `${playerName} has requested to join ${group.name}.`,
                    metadata: {
                        group_id: group.id,
                        group_name: group.name,
                        requester_id: user.id,
                        requester_name: playerName,
                        requester_avatar: profile?.avatar_url
                    },
                    link: `/hub/home-games/${group.id}/manage`,
                    action_url: `/hub/home-games/${group.id}/manage`,
                    is_read: false,
                    read: false,
                });
            } catch (notifyErr) {
                console.warn('[join API] Failed to notify host:', notifyErr);
            }
        }
        // NOTE: member_count is maintained atomically by the DB trigger
        // trg_home_members_bump_activity / update_home_group_member_count.
        // No application-level RPC call needed.

        // Return 'pending' for private groups, 'approved' for direct joins.
        // The frontend checks: pending → "Request Pending" state; else → "Member" state.
        return res.status(200).json({ 
            success: true, 
            status: memberStatus,
            message: memberStatus === 'pending' ? 'Request sent to host' : 'Successfully joined' 
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) {}
        console.warn('[commander/home-games/join]', err);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}
