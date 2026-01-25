// Check profiles for avatar URLs
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get profiles that would be notification actors
    const { data: profiles, error } = await sb
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .limit(20);

    // Count how many have avatar_url vs not
    const withAvatar = profiles?.filter(p => p.avatar_url) || [];
    const withoutAvatar = profiles?.filter(p => !p.avatar_url) || [];

    res.json({
        total: profiles?.length || 0,
        withAvatar: withAvatar.length,
        withoutAvatar: withoutAvatar.length,
        samples: profiles?.slice(0, 10),
        error: error?.message
    });
}
