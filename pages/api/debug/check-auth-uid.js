// Debug API: Check what auth.uid() returns for the current session
// pages/api/debug/check-auth-uid.js

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (!SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Service key not configured' });
    }

    const supabase = createClient(SUPABASE_URL.trim(), SUPABASE_SERVICE_KEY);

    const DANIEL_ID = '47965354-0e56-43ef-931c-ddaab82af765';
    const CONVO_ID = 'ab868e7d-a75b-4a6d-ab46-7839e8302e89';

    try {
        // Get Daniel's auth user record
        const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(DANIEL_ID);

        // Get Daniel's participant record
        const { data: participant, error: partError } = await supabase
            .from('social_conversation_participants')
            .select('*')
            .eq('conversation_id', CONVO_ID)
            .eq('user_id', DANIEL_ID)
            .single();

        // Run a raw SQL query to check what auth.uid() returns with RLS for this user
        // Test: select messages as if we were Daniel
        const { data: testQuery, error: testError } = await supabase.rpc('fn_test_rls_as_user', {
            p_user_id: DANIEL_ID,
            p_conversation_id: CONVO_ID
        }).maybeSingle();

        return res.json({
            success: true,
            danielAuthId: authUser?.user?.id || 'NOT FOUND',
            danielEmail: authUser?.user?.email,
            danielProfileId: DANIEL_ID,
            participantRecord: participant,
            idsMatch: authUser?.user?.id === DANIEL_ID,
            testQueryResult: testQuery,
            testQueryError: testError,
            diagnosis: authUser?.user?.id !== DANIEL_ID
                ? 'IDs DO NOT MATCH - This is the bug!'
                : 'IDs match, RLS should work. Checking policy syntax...'
        });
    } catch (e) {
        return res.status(500).json({ error: e.message, stack: e.stack });
    }
}
