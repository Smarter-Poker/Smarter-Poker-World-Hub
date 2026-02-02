// Check social_posts table schema and sample data
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    try {
        // Fetch sample posts with all fields
        const { data: posts, error } = await supabase
            .from('social_posts')
            .select('*')
            .limit(5);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        // Get all column names from a sample post
        const columns = posts && posts[0] ? Object.keys(posts[0]) : [];

        // Find posts that might have link/article data
        const postsWithLinks = posts?.filter(p =>
            p.link_url || p.shared_url || p.article_url ||
            p.embed_url || p.og_url || p.content?.includes('http')
        ) || [];

        res.status(200).json({
            schema: {
                columns: columns,
                columnCount: columns.length
            },
            samplePosts: posts?.map(p => ({
                id: p.id,
                content: p.content?.substring(0, 100),
                content_type: p.content_type,
                media_urls: p.media_urls,
                hasLinkFields: !!(p.link_url || p.shared_url || p.article_url || p.embed_url),
                allFields: Object.entries(p).filter(([k, v]) => v != null).map(([k, v]) => k)
            })),
            postsWithLinksCount: postsWithLinks.length
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
