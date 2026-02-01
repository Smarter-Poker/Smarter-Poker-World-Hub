/**
 * Debug endpoint to check clip tables
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default async function handler(req, res) {
    try {
        // Check poker_clips
        const { data: pokerClips, error: pokerError } = await supabase
            .from('poker_clips')
            .select('id, title, is_active, source_url')
            .limit(5);

        // Check sports_clips
        const { data: sportsClips, error: sportsError } = await supabase
            .from('sports_clips')
            .select('id, title, source_url, video_id')
            .limit(5);

        // Count both tables
        const { count: pokerCount } = await supabase
            .from('poker_clips')
            .select('*', { count: 'exact', head: true });

        const { count: sportsCount } = await supabase
            .from('sports_clips')
            .select('*', { count: 'exact', head: true });

        // Check poker_clips with is_active = true
        const { count: activePokerCount } = await supabase
            .from('poker_clips')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);

        return res.status(200).json({
            poker_clips: {
                total: pokerCount,
                active: activePokerCount,
                sample: pokerClips,
                error: pokerError?.message
            },
            sports_clips: {
                total: sportsCount,
                sample: sportsClips,
                error: sportsError?.message
            }
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
