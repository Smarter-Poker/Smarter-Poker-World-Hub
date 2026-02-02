// Debug API: Check friendship status between two users
// pages/api/debug/check-friendship.js

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (!SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Service key not configured' });
    }

    const supabase = createClient(SUPABASE_URL.trim(), SUPABASE_SERVICE_KEY);

    // Daniel and Marcela's IDs
    const DANIEL_ID = '47965354-0e56-43ef-931c-ddaab82af765';
    const MARCELA_ID = '9ca264f1-c0aa-4df9-bc39-1a97bdaad016';

    try {
        // Check friendships between Daniel and Marcela (BOTH directions)
        const { data: friendships, error: friendError } = await supabase
            .from('friendships')
            .select('*')
            .or(`and(user_id.eq.${DANIEL_ID},friend_id.eq.${MARCELA_ID}),and(user_id.eq.${MARCELA_ID},friend_id.eq.${DANIEL_ID})`);

        // Check Daniel's view of Marcela
        const { data: danielsView, error: dError } = await supabase
            .from('friendships')
            .select('*')
            .eq('user_id', DANIEL_ID)
            .eq('friend_id', MARCELA_ID);

        // Check Marcela's view of Daniel
        const { data: marcelasView, error: mError } = await supabase
            .from('friendships')
            .select('*')
            .eq('user_id', MARCELA_ID)
            .eq('friend_id', DANIEL_ID);

        return res.json({
            success: true,
            analysis: {
                totalRecordsBetweenThem: friendships?.length || 0,
                needsBothDirections: 'For mutual friends, BOTH directions need status=accepted',
                dansFriendshipWithMarcela: danielsView?.[0] || 'NO RECORD',
                marcelasFriendshipWithDan: marcelasView?.[0] || 'NO RECORD'
            },
            allRecords: friendships,
            fix: friendships?.length === 1 ? 'NEEDS REVERSE RECORD' :
                friendships?.length === 0 ? 'NO RECORDS - FRIENDSHIP NOT CREATED' :
                    'TWO RECORDS FOUND - CHECKING STATUS'
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
