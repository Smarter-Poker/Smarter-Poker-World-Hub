// Validate a referral code (player number) — returns referrer info
import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { code } = req.body;
    if (!code) {
        return res.status(400).json({ error: 'Referral code is required' });
    }

    const playerNumber = parseInt(code, 10);
    if (isNaN(playerNumber) || playerNumber <= 0) {
        return res.status(400).json({ valid: false, error: 'Invalid referral code' });
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('profiles')
            .select('id, display_name, username, player_number')
            .eq('player_number', playerNumber)
            .single();

        if (error || !data) {
            return res.status(404).json({ valid: false, error: 'No player found with that referral code' });
        }

        // Mask the name for privacy (show first name + last initial)
        const displayName = data.display_name || data.username || 'A Player';
        const parts = displayName.split(' ');
        const maskedName = parts.length > 1
            ? `${parts[0]} ${parts[parts.length - 1][0]}.`
            : parts[0];

        return res.status(200).json({
            valid: true,
            referrerId: data.id,
            playerNumber: data.player_number,
            referrerName: maskedName,
        });
    } catch (err) {
        console.error('Validate referral code error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
}
