// Check notification actors for avatar URLs
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get the user's most recent notifications with actor data
    const { data: { user } } = await sb.auth.getUser();

    // Find Dan's profile using email
    const { data: danProfile } = await sb
        .from('profiles')
        .select('id')
        .ilike('email', '%bekavac%')
        .single();

    const userId = req.query.userId || danProfile?.id || '47965354-0e56-43ef-931c-ddaab82af765';

    // Get notifications
    const { data: notifications, error } = await sb
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

    // Get unique actor IDs
    const actorIds = [...new Set((notifications || []).map(n => n.actor_id).filter(Boolean))];

    // Get the profiles for those actors
    let profiles = [];
    if (actorIds.length > 0) {
        const { data: p } = await sb.from('profiles')
            .select('id, username, full_name, avatar_url')
            .in('id', actorIds);
        profiles = p || [];
    }

    // Build enriched notification data
    const enriched = (notifications || []).map(n => {
        const profile = profiles.find(p => p.id === n.actor_id);
        return {
            id: n.id,
            type: n.type,
            title: n.title,
            message: n.message,
            actor_id: n.actor_id,
            actor_profile: profile || null,
            has_avatar: !!profile?.avatar_url
        };
    });

    res.json({
        userId,
        totalNotifications: notifications?.length || 0,
        actorIds,
        profiles,
        enriched,
        error: error?.message
    });
}
