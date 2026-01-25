// Debug API: Check friend requests visibility
// pages/api/debug/friend-requests.js

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo';

export default async function handler(req, res) {
    // Use service role key to bypass RLS (for admin debug only)
    const supabase = createClient(
        SUPABASE_URL.trim(),
        SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY
    );

    // Daniel's user ID (from browser debug)
    const DANIEL_USER_ID = '47965354-0e56-43ef-931c-ddaab82af765';

    try {
        // Check ALL pending friendships in the system
        const { data: allPending, error: pendingError } = await supabase
            .from('friendships')
            .select(`
                id, 
                user_id, 
                friend_id, 
                status, 
                created_at,
                requester:profiles!friendships_user_id_fkey(id, username, full_name, avatar_url),
                receiver:profiles!friendships_friend_id_fkey(id, username, full_name, avatar_url)
            `)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        // Check incoming requests to Daniel specifically
        const { data: danielIncoming, error: danielError } = await supabase
            .from('friendships')
            .select(`
                id, 
                user_id, 
                friend_id, 
                status, 
                created_at,
                requester:profiles!friendships_user_id_fkey(id, username, full_name, avatar_url)
            `)
            .eq('friend_id', DANIEL_USER_ID)
            .eq('status', 'pending');

        // Check all notifications for Daniel
        const { data: danielNotifs, error: notifError } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', DANIEL_USER_ID)
            .order('created_at', { ascending: false })
            .limit(20);

        // List all users to see who exists
        const { data: recentUsers, error: userError } = await supabase
            .from('profiles')
            .select('id, username, full_name, created_at')
            .order('created_at', { ascending: false })
            .limit(10);

        return res.json({
            success: true,
            targetUser: DANIEL_USER_ID,
            allPendingInSystem: {
                count: allPending?.length || 0,
                data: allPending,
                error: pendingError?.message
            },
            incomingToDaniel: {
                count: danielIncoming?.length || 0,
                data: danielIncoming,
                error: danielError?.message
            },
            danielNotifications: {
                count: danielNotifs?.length || 0,
                data: danielNotifs,
                error: notifError?.message
            },
            recentUsers: {
                count: recentUsers?.length || 0,
                data: recentUsers,
                error: userError?.message
            }
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
