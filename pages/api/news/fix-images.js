/**
 * Fix Missing Images - Updates all articles with null images to use category defaults
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Default category images - must match scraper
const DEFAULT_CATEGORY_IMAGES = {
    tournament: 'https://images.unsplash.com/photo-1609743522653-52354461eb27?w=600&q=80',
    strategy: 'https://images.unsplash.com/photo-1529074963764-98f45c47344b?w=600&q=80',
    industry: 'https://images.unsplash.com/photo-1596838132731-3301c3fd4317?w=600&q=80',
    news: 'https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=600&q=80',
    online: 'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=600&q=80'
};

export default async function handler(req, res) {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ error: 'Missing Supabase credentials' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    try {
        // Get all articles with null or empty image_url
        const { data: articles, error: fetchError } = await supabase
            .from('poker_news')
            .select('id, category, image_url')
            .or('image_url.is.null,image_url.eq.');

        if (fetchError) throw fetchError;

        console.log(`Found ${articles?.length || 0} articles with missing images`);

        let updated = 0;
        const errors = [];

        for (const article of (articles || [])) {
            const imageUrl = DEFAULT_CATEGORY_IMAGES[article.category] || DEFAULT_CATEGORY_IMAGES.news;

            const { error: updateError } = await supabase
                .from('poker_news')
                .update({ image_url: imageUrl })
                .eq('id', article.id);

            if (updateError) {
                errors.push({ id: article.id, error: updateError.message });
            } else {
                updated++;
            }
        }

        return res.status(200).json({
            success: true,
            found: articles?.length || 0,
            updated,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('Error fixing images:', error);
        return res.status(500).json({ error: error.message });
    }
}
