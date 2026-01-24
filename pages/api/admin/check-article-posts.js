// Check article posts metadata structure
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    try {
        // Find posts with content_type = 'article' or 'link'
        const { data: articlePosts, error } = await supabase
            .from('social_posts')
            .select('*')
            .or('content_type.eq.article,content_type.eq.link,content_type.eq.shared')
            .limit(10);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        // Also look for posts with link-like content
        const { data: allPosts } = await supabase
            .from('social_posts')
            .select('*')
            .limit(20);

        // Find posts that might have link metadata
        const postsWithMetadata = allPosts?.filter(p => p.metadata && Object.keys(p.metadata).length > 0) || [];

        res.status(200).json({
            articlePostsCount: articlePosts?.length || 0,
            articlePosts: articlePosts?.map(p => ({
                id: p.id,
                content: p.content?.substring(0, 100),
                content_type: p.content_type,
                media_urls: p.media_urls,
                metadata: p.metadata
            })),
            postsWithMetadata: postsWithMetadata.map(p => ({
                id: p.id,
                content: p.content?.substring(0, 50),
                content_type: p.content_type,
                metadata: p.metadata
            })),
            distinctContentTypes: [...new Set(allPosts?.map(p => p.content_type) || [])]
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
