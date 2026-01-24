// API endpoint to verify profile page data and schema
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    try {
        // 1. Check profiles table schema by fetching a sample profile
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('*')
            .limit(1);

        if (profilesError) {
            return res.status(500).json({ error: 'Failed to fetch profiles', details: profilesError });
        }

        // Get column names from first profile
        const profileColumns = profiles && profiles[0] ? Object.keys(profiles[0]) : [];

        // 2. Find a real profile with data to test
        const { data: testProfile, error: testError } = await supabase
            .from('profiles')
            .select('*')
            .not('username', 'is', null)
            .not('full_name', 'is', null)
            .limit(5);

        // 3. Check required fields for Facebook-style profile
        const requiredFields = [
            'id', 'username', 'full_name', 'avatar_url', 'bio',
            'city', 'state', 'country', 'hometown',
            'cover_photo_url', 'birth_year', 'occupation',
            'favorite_game', 'favorite_hand', 'home_casino',
            'twitter', 'instagram', 'website',
            'hendon_url', 'hendon_total_cashes', 'hendon_total_earnings', 'hendon_best_finish'
        ];

        const missingFields = requiredFields.filter(f => !profileColumns.includes(f));
        const existingFields = requiredFields.filter(f => profileColumns.includes(f));

        // 4. Check friendships table
        const { count: friendshipsCount } = await supabase
            .from('friendships')
            .select('*', { count: 'exact', head: true });

        // 5. Check social_posts table
        const { count: postsCount } = await supabase
            .from('social_posts')
            .select('*', { count: 'exact', head: true });

        // 6. Check social_reels table
        const { count: reelsCount } = await supabase
            .from('social_reels')
            .select('*', { count: 'exact', head: true });

        // 7. Test fetching a specific user
        const testUsername = req.query.user || 'KingFish';
        const { data: userProfile, error: userError } = await supabase
            .from('profiles')
            .select('*')
            .eq('username', testUsername)
            .single();

        // 8. If user exists, get their friends
        let userFriends = [];
        let userPosts = [];
        if (userProfile) {
            const { data: friendships } = await supabase
                .from('friendships')
                .select('user_id, friend_id')
                .eq('status', 'accepted')
                .or(`user_id.eq.${userProfile.id},friend_id.eq.${userProfile.id}`)
                .limit(10);
            userFriends = friendships || [];

            const { data: posts } = await supabase
                .from('social_posts')
                .select('id, content, content_type, media_urls, created_at')
                .eq('author_id', userProfile.id)
                .limit(5);
            userPosts = posts || [];
        }

        res.status(200).json({
            status: 'OK',
            schema: {
                allColumns: profileColumns,
                requiredForProfile: requiredFields,
                existingFields: existingFields,
                missingFields: missingFields,
                schemaComplete: missingFields.length === 0
            },
            counts: {
                profiles: profiles?.length || 0,
                friendships: friendshipsCount || 0,
                posts: postsCount || 0,
                reels: reelsCount || 0
            },
            testUser: {
                username: testUsername,
                found: !!userProfile,
                profile: userProfile ? {
                    id: userProfile.id,
                    username: userProfile.username,
                    full_name: userProfile.full_name,
                    avatar_url: userProfile.avatar_url ? 'EXISTS' : 'MISSING',
                    cover_photo_url: userProfile.cover_photo_url ? 'EXISTS' : 'MISSING',
                    city: userProfile.city,
                    state: userProfile.state,
                    bio: userProfile.bio?.substring(0, 50),
                    hendon_url: userProfile.hendon_url ? 'EXISTS' : 'MISSING'
                } : null,
                friendsCount: userFriends.length,
                postsCount: userPosts.length,
                samplePost: userPosts[0] || null
            },
            sampleProfiles: (testProfile || []).map(p => ({
                username: p.username,
                full_name: p.full_name,
                hasAvatar: !!p.avatar_url,
                hasCover: !!p.cover_photo_url
            }))
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
