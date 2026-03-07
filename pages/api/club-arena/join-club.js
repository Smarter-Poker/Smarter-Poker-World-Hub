/**
 * POST /api/club-arena/join-club
 * Join a club by numeric code. Prevents duplicate membership.
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

    const { clubCode } = req.body;
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
            .select('id')
            .eq('club_id', parseInt(clubCode))
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
            .maybeSingle()

        if (existing) {
            return res.status(409).json({ success: false, error: 'You are already a member of this club' });
        }

        // If club requires approval, could add pending status here
        // For now: direct join
        const { error: joinErr } = await supabaseAdmin
            .from('club_members')
            .insert({
                club_id: club.id,
                user_id: user.id,
                role: 'player',
                status: 'active',
                chip_balance: 0,
                joined_at: new Date().toISOString(),
            });

        if (joinErr) throw joinErr;

        // Update member count
        await supabaseAdmin
            .from('clubs')
            .update({ member_count: (club.member_count || 0) + 1 })
            .eq('id', club.id);

        return res.status(200).json({ success: true, club });
    } catch (err) {
        console.error('[join-club]', err);
        return res.status(500).json({ success: false, error: err.message || 'Failed to join club' });
    }
}
