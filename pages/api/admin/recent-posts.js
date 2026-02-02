// Admin endpoint to check recent posts for link metadata
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    try {
        // Get last 5 posts
        const { data: posts, error } = await supabase
            .from('social_posts')
            .select('id, content_type, content, media_urls, link_url, link_title, link_image, created_at')
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw error;

        return res.status(200).json({
            posts: posts.map(p => ({
                id: p.id,
                content_type: p.content_type,
                content: p.content?.substring(0, 50),
                media_urls: p.media_urls,
                link_url: p.link_url,
                link_title: p.link_title,
                link_image: p.link_image,  // Return actual URL for debugging
                created_at: p.created_at
            }))
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
