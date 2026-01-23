/**
 * Re-fetch Images - Fetches og:image from article source URLs
 * This updates existing articles with real thumbnail images
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Default/bad images to detect (we want to replace these with real images)
const DEFAULT_IMAGE_PATTERNS = [
    'unsplash.com',
    'pexels.com',
    'placeholder',
    'lh3.googleusercontent.com',  // Google's generic thumbnails
    'gstatic.com',
    'google.com/images'
];

/**
 * Fetch og:image from article URL - follows redirects to get real article
 */
async function fetchOgImage(url) {
    if (!url) return null;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        // Follow redirects to get to the actual article
        const response = await fetch(url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        });

        clearTimeout(timeout);

        if (!response.ok) return null;

        const html = await response.text();

        // Try og:image first
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

        // Try twitter:image:src
        if (!match) {
            match = html.match(/<meta[^>]+name=["']twitter:image:src["'][^>]+content=["']([^"']+)["']/i);
        }

        if (match && match[1]) {
            let imageUrl = match[1];

            // Decode HTML entities
            imageUrl = imageUrl.replace(/&amp;/g, '&');

            // Skip Google's generic thumbnails
            if (imageUrl.includes('lh3.googleusercontent.com') ||
                imageUrl.includes('google.com/images') ||
                imageUrl.includes('gstatic.com')) {
                return null;
            }

            // Skip logos, icons, favicons
            if (imageUrl.includes('logo') || imageUrl.includes('icon') ||
                imageUrl.includes('favicon') || imageUrl.includes('avatar')) {
                return null;
            }

            if (imageUrl.startsWith('http')) {
                return imageUrl;
            }
        }

        return null;
    } catch (error) {
        console.log(`   Failed to fetch: ${error.message}`);
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
