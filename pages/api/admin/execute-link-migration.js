// Execute SQL migration automatically using Supabase functions
// This creates a temporary function to run the migration

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST required' });
    }

    const results = [];

    try {
        // Test if link_url column already exists
        const { data: testData, error: testError } = await supabase
            .from('social_posts')
            .select('id, link_url')
            .limit(1);

        if (!testError) {
            results.push({ step: 'check_columns', status: 'EXISTS', message: 'Columns already exist' });

            // Columns exist - try to backfill article posts
            const { data: articlePosts, error: articleError } = await supabase
                .from('social_posts')
                .select('id, content, media_urls, content_type')
                .in('content_type', ['article', 'link'])
                .is('link_url', null)
                .limit(50);

            if (articleError) {
                results.push({ step: 'fetch_articles', status: 'ERROR', message: articleError.message });
            } else {
                results.push({ step: 'fetch_articles', status: 'OK', count: articlePosts?.length || 0 });

                // Backfill metadata for each post
                let backfilled = 0;
                for (const post of articlePosts || []) {
                    // Extract URL from content
                    const urlMatch = post.content?.match(/https?:\/\/[^\s"'<>]+/);
                    const extractedUrl = urlMatch ? urlMatch[0] : null;

                    // Use first media_url as image
                    const imageUrl = post.media_urls?.[0] || null;

                    if (extractedUrl || imageUrl) {
                        const { error: updateError } = await supabase
                            .from('social_posts')
                            .update({
                                link_url: extractedUrl,
                                link_image: imageUrl
                            })
                            .eq('id', post.id);

                        if (!updateError) backfilled++;
                    }
                }

                results.push({ step: 'backfill', status: 'OK', backfilled });
            }

            return res.status(200).json({
                status: 'COMPLETE',
                message: 'Migration already applied, backfill complete',
                results
            });
        }

        // Columns don't exist - provide manual SQL
        results.push({ step: 'check_columns', status: 'NOT_EXISTS', message: 'Need to run SQL migration' });

        return res.status(200).json({
            status: 'MIGRATION_REQUIRED',
            message: 'Run this SQL in Supabase Dashboard SQL Editor, then call this endpoint again to backfill',
            sql: `
-- STEP 1: Run this in Supabase SQL Editor (Dashboard > SQL)
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS link_title TEXT;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS link_description TEXT;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS link_image TEXT;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS link_site_name TEXT;
CREATE INDEX IF NOT EXISTS idx_social_posts_link_url ON social_posts(link_url) WHERE link_url IS NOT NULL;

-- STEP 2: After running above, POST to /api/admin/execute-link-migration again to backfill existing posts
            `.trim(),
            results
        });

    } catch (error) {
        return res.status(500).json({
            status: 'ERROR',
            error: error.message,
            results
        });
    }
}
