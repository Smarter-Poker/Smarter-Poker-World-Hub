import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const results = { linkDuplicates: 0, videoDuplicates: 0 };

        // Get all link posts from last 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        console.log('Fetching link posts...');
        const { data: linkPosts } = await supabase
            .from('social_posts')
            .select('id, link_url, created_at')
            .not('link_url', 'is', null)
            .gte('created_at', sevenDaysAgo)
            .order('created_at', { ascending: true });

        // Group by link_url and find duplicates
        const linkGroups = {};
        (linkPosts || []).forEach(post => {
            if (!linkGroups[post.link_url]) {
                linkGroups[post.link_url] = [];
            }
            linkGroups[post.link_url].push(post);
        });

        // Delete duplicates (keep first, delete rest)
        const linkToDelete = [];
        Object.entries(linkGroups).forEach(([url, posts]) => {
            if (posts.length > 1) {
                console.log(`Found ${posts.length} duplicates of: ${url.slice(0, 60)}...`);
                linkToDelete.push(...posts.slice(1).map(p => p.id));
            }
        });

        if (linkToDelete.length > 0) {
            console.log(`Deleting ${linkToDelete.length} duplicate link posts...`);
            const { error } = await supabase
                .from('social_posts')
                .delete()
                .in('id', linkToDelete);

            if (error) throw error;
            results.linkDuplicates = linkToDelete.length;
        }

        // Get all video posts
        console.log('Fetching video posts...');
        const { data: videoPosts } = await supabase
            .from('social_posts')
            .select('id, media_urls, created_at')
            .eq('content_type', 'video')
            .gte('created_at', sevenDaysAgo)
            .order('created_at', { ascending: true });

        // Group by first media_url
        const videoGroups = {};
        (videoPosts || []).forEach(post => {
            if (post.media_urls && post.media_urls.length > 0) {
                const url = post.media_urls[0];
                if (!videoGroups[url]) {
                    videoGroups[url] = [];
                }
                videoGroups[url].push(post);
            }
        });

        const videoToDelete = [];
        Object.entries(videoGroups).forEach(([url, posts]) => {
            if (posts.length > 1) {
                console.log(`Found ${posts.length} duplicates of video: ${url.slice(0, 60)}...`);
                videoToDelete.push(...posts.slice(1).map(p => p.id));
            }
        });

        if (videoToDelete.length > 0) {
            console.log(`Deleting ${videoToDelete.length} duplicate video posts...`);
            const { error } = await supabase
                .from('social_posts')
                .delete()
                .in('id', videoToDelete);

            if (error) throw error;
            results.videoDuplicates = videoToDelete.length;
        }

        return res.status(200).json({
            success: true,
            message: `Deleted ${results.linkDuplicates + results.videoDuplicates} duplicate posts`,
            ...results
        });

    } catch (error) {
        console.error('Error deleting duplicates:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
