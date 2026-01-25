// Debug API: Search all profiles and find references to unknown users
// pages/api/debug/find-user.js

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (!SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Service key not configured' });
    }

    const supabase = createClient(SUPABASE_URL.trim(), SUPABASE_SERVICE_KEY);

    const { search } = req.query; // Allow searching by name/email

    try {
        // Get ALL profiles (no limit)
        const { data: allProfiles, error: profileError } = await supabase
            .from('profiles')
            .select('id, username, full_name, email, created_at')
            .order('created_at', { ascending: false });

        // Search for specific user if provided
        let searchResults = [];
        if (search) {
            searchResults = allProfiles?.filter(p =>
                p.email?.toLowerCase().includes(search.toLowerCase()) ||
                p.username?.toLowerCase().includes(search.toLowerCase()) ||
                p.full_name?.toLowerCase().includes(search.toLowerCase())
            ) || [];
        }

        // Find all distinct user_ids from friendships that might not be in profiles
        const { data: friendshipUsers, error: friendshipError } = await supabase
            .from('friendships')
            .select('user_id, friend_id');

        // Find all notification actor_ids
        const { data: notifications, error: notifError } = await supabase
            .from('notifications')
            .select('user_id, data')
            .limit(100);

        // Get the profile IDs
        const profileIds = new Set(allProfiles?.map(p => p.id) || []);

        // Find friendship user_ids that don't have profiles
        const friendshipUserIds = new Set();
        friendshipUsers?.forEach(f => {
            friendshipUserIds.add(f.user_id);
            friendshipUserIds.add(f.friend_id);
        });

        const missingFromFriendships = [...friendshipUserIds].filter(id => !profileIds.has(id));

        // Find notification senders that don't have profiles
        const notifSenderIds = new Set();
        notifications?.forEach(n => {
            if (n.data?.sender_id) notifSenderIds.add(n.data.sender_id);
        });

        const missingFromNotifs = [...notifSenderIds].filter(id => !profileIds.has(id));

        return res.json({
            success: true,
            totalProfiles: allProfiles?.length || 0,
            searchQuery: search || null,
            searchResults: searchResults,
            allProfiles: allProfiles?.slice(0, 30), // Show first 30
            missingUsersFromFriendships: missingFromFriendships,
            missingUsersFromNotifications: missingFromNotifs,
            errors: {
                profile: profileError?.message,
                friendship: friendshipError?.message,
                notification: notifError?.message
            }
        });
    } catch (e) {
        return res.status(500).json({ error: e.message, stack: e.stack });
    }
}
