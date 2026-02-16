/**
 * Social Page Follow API
 *
 * POST /api/social/pages/follow  - Follow/unfollow a page
 * GET  /api/social/pages/follow  - Get followers for a page or user's followed pages
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method === 'POST') {
        const { page_id, user_id, action, follower_id } = req.body;

        if (!page_id || !user_id) {
            return res.status(400).json({ error: 'page_id and user_id required' });
        }

        // === Approve/Reject (Commander actions) ===
        if (action === 'approve' || action === 'reject') {
            if (!follower_id) return res.status(400).json({ error: 'follower_id required' });
            if (action === 'approve') {
                const { data, error } = await supabase
                    .from('social_page_followers')
                    .update({ status: 'approved' })
                    .eq('page_id', page_id)
                    .eq('user_id', follower_id)
                    .select().single();
                if (error) return res.status(500).json({ error: error.message });
                return res.status(200).json({ success: true, data });
            } else {
                const { error } = await supabase
                    .from('social_page_followers')
                    .delete()
                    .eq('page_id', page_id)
                    .eq('user_id', follower_id);
                if (error) return res.status(500).json({ error: error.message });
                return res.status(200).json({ success: true });
            }
        }

        if (action === 'unfollow') {
            const { error } = await supabase
                .from('social_page_followers')
                .delete()
                .eq('page_id', page_id)
                .eq('user_id', user_id);

            if (error) return res.status(500).json({ error: error.message });
            return res.status(200).json({ success: true, following: false });
        }

        // Determine if page requires approval (home_game type)
        let requiresApproval = false;
        const { data: pageData } = await supabase
            .from('social_pages').select('metadata').eq('id', page_id).single();
        if (pageData?.metadata?.page_type === 'home_game') {
            requiresApproval = true;
        }

        const followStatus = requiresApproval ? 'pending' : 'approved';

        // Follow
        const { data, error } = await supabase
            .from('social_page_followers')
            .upsert({
                page_id,
                user_id,
                role: 'follower',
                status: followStatus,
                notifications_enabled: true
            }, { onConflict: 'page_id,user_id' })
            .select()
            .single();

        if (error) return res.status(500).json({ error: error.message });

        // Send push notification to page owner about new follower
        try {
            const { data: ownerPage } = await supabase
                .from('social_pages').select('owner_id, name').eq('id', page_id).single();
            if (ownerPage && ownerPage.owner_id !== user_id) {
                const { data: followerProfile } = await supabase
                    .from('profiles').select('username, full_name').eq('id', user_id).single();
                const followerName = followerProfile?.full_name || followerProfile?.username || 'Someone';
                const notifTitle = requiresApproval ? '🔔 New Follow Request' : '🎉 New Follower';
                const notifMsg = requiresApproval
                    ? `${followerName} wants to follow your page "${ownerPage.name}". Approve or reject in your Live Games tab.`
                    : `${followerName} is now following your page "${ownerPage.name}"!`;
                await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker'}/api/notifications/send`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: notifTitle,
                        message: notifMsg,
                        externalUserIds: [ownerPage.owner_id],
                        url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker'}/hub/social-media`,
                        data: { type: 'follow_request', page_id, follower_id: user_id }
                    }),
                });
            }
        } catch (notifErr) { console.error('Follow notification error:', notifErr); }

        return res.status(201).json({ success: true, following: true, status: followStatus, pending: requiresApproval, data });

    } else if (req.method === 'GET') {
        const { page_id, user_id, role, requester_id } = req.query;

        if (page_id) {
            // Get followers for a page
            let query = supabase
                .from('social_page_followers')
                .select('id, user_id, role, status, notifications_enabled, created_at')
                .eq('page_id', page_id);

            if (role) query = query.eq('role', role);

            const { data, error } = await query.order('created_at', { ascending: false });
            if (error) return res.status(500).json({ error: error.message });

            // Determine if requester is page owner (only owners see individual follower identities)
            let isOwner = false;
            if (requester_id) {
                const { data: pageOwner } = await supabase
                    .from('social_pages').select('owner_id').eq('id', page_id).single();
                isOwner = pageOwner && pageOwner.owner_id === requester_id;
            }

            if (isOwner) {
                // Owner sees full profile details
                const userIds = (data || []).map(f => f.user_id);
                let profiles = {};
                if (userIds.length > 0) {
                    const { data: profileData } = await supabase
                        .from('profiles')
                        .select('id, username, full_name, avatar_url')
                        .in('id', userIds);
                    (profileData || []).forEach(p => { profiles[p.id] = p; });
                }
                const enriched = (data || []).map(f => ({
                    ...f,
                    profile: profiles[f.user_id] || null
                }));
                // Also check if the owner themselves is following (self-follow)
                const myFollow = (data || []).find(f => f.user_id === requester_id);
                return res.status(200).json({
                    success: true,
                    data: enriched,
                    count: enriched.length,
                    is_following: !!myFollow,
                    my_status: myFollow ? myFollow.status : null
                });
            } else {
                // Non-owners only see the count + their own follow status
                const myFollow = requester_id ? (data || []).find(f => f.user_id === requester_id) : null;
                return res.status(200).json({
                    success: true,
                    count: (data || []).filter(f => f.status === 'approved').length,
                    my_status: myFollow ? myFollow.status : null,
                    is_following: !!myFollow,
                });
            }
        }

        if (user_id) {
            // Get pages a user follows
            const { data, error } = await supabase
                .from('social_page_followers')
                .select('page_id, role, created_at')
                .eq('user_id', user_id);

            if (error) return res.status(500).json({ error: error.message });

            // Get page details
            const pageIds = (data || []).map(f => f.page_id);
            let pages = {};
            if (pageIds.length > 0) {
                const { data: pageData } = await supabase
                    .from('social_pages')
                    .select('*')
                    .in('id', pageIds);
                (pageData || []).forEach(p => { pages[p.id] = p; });
            }

            const enriched = (data || []).map(f => ({
                ...f,
                page: pages[f.page_id] || null
            }));

            return res.status(200).json({ success: true, data: enriched });
        }

        return res.status(400).json({ error: 'page_id or user_id required' });

    } else {
        return res.status(405).json({ error: 'Method not allowed' });
    }
}
