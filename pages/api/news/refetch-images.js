/**
 * Re-fetch Images - Fetches og:image from article source URLs
 * This updates existing articles with real thumbnail images
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Default images to detect (we want to replace these with real images)
const DEFAULT_IMAGE_PATTERNS = [
    'unsplash.com',
    'pexels.com',
    'placeholder'
];

/**
 * Fetch og:image from article URL
 */
async function fetchOgImage(url) {
    if (!url) return null;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; SmarterPokerBot/1.0)',
                'Accept': 'text/html'
            }
        });

        clearTimeout(timeout);

        if (!response.ok) return null;

        const html = await response.text();

        // Try og:image
        let match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
        if (!match) {
            match = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
        }

        // Try twitter:image
        if (!match) {
            match = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
            if (!match) {
                match = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
            }
        }

        // Try first large image in article
        if (!match) {
            // Look for article images with reasonable sizes
            const imgMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi);
            for (const imgMatch of imgMatches) {
                const src = imgMatch[1];
                // Skip small images, icons, logos, tracking pixels
                if (src.includes('logo') || src.includes('icon') || src.includes('avatar') ||
                    src.includes('1x1') || src.includes('pixel') || src.includes('track') ||
                    src.includes('ad') || src.includes('banner') || src.length < 20) {
                    continue;
                }
                // Accept if it looks like a content image
                if (src.startsWith('http') && (src.includes('.jpg') || src.includes('.png') ||
                    src.includes('.webp') || src.includes('image'))) {
                    match = [null, src];
                    break;
                }
            }
        }

        if (match && match[1]) {
            const imageUrl = match[1];
            // Validate it's a real image URL
            if (imageUrl.startsWith('http') && !imageUrl.includes('logo') &&
                !imageUrl.includes('icon') && !imageUrl.includes('favicon')) {
                return imageUrl;
            }
        }

        return null;
    } catch (error) {
        console.log(`   ⚠ Failed to fetch ${url}: ${error.message}`);
        return null;
    }
}

export default async function handler(req, res) {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ error: 'Missing Supabase credentials' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    try {
        // Get articles that have default/placeholder images
        const { data: articles, error: fetchError } = await supabase
            .from('poker_news')
            .select('id, title, source_url, image_url, category')
            .order('published_at', { ascending: false })
            .limit(50); // Process most recent 50

        if (fetchError) throw fetchError;

        // Filter to articles with default images
        const articlesToUpdate = (articles || []).filter(a => {
            if (!a.image_url) return true;
            return DEFAULT_IMAGE_PATTERNS.some(pattern => a.image_url.includes(pattern));
        });

        console.log(`Found ${articlesToUpdate.length} articles with default images`);

        let updated = 0;
        let failed = 0;
        const results = [];

        for (const article of articlesToUpdate) {
            console.log(`📷 Fetching image for: ${article.title.substring(0, 40)}...`);

            const newImageUrl = await fetchOgImage(article.source_url);

            if (newImageUrl) {
                const { error: updateError } = await supabase
                    .from('poker_news')
                    .update({ image_url: newImageUrl })
                    .eq('id', article.id);

                if (!updateError) {
                    updated++;
                    results.push({ id: article.id, title: article.title.substring(0, 40), newImage: newImageUrl.substring(0, 60) });
                    console.log(`   ✓ Updated with: ${newImageUrl.substring(0, 60)}...`);
                } else {
                    failed++;
                }
            } else {
                failed++;
                console.log(`   ✗ No image found`);
            }

            // Small delay to be nice to servers
            await new Promise(r => setTimeout(r, 500));
        }

        return res.status(200).json({
            success: true,
            total: articlesToUpdate.length,
            updated,
            failed,
            results
        });

    } catch (error) {
        console.error('Error refetching images:', error);
        return res.status(500).json({ error: error.message });
    }
}
