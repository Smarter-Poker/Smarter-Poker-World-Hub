/**
 * SOURCE BOXES API - Returns exactly 1 article per source box
 *
 * HARDENED: This endpoint guarantees 6 articles (one per source)
 * by querying the database directly for each source's latest article.
 *
 * Box 1: PokerNews
 * Box 2: MSPT
 * Box 3: CardPlayer
 * Box 4: WSOP
 * Box 5: Poker.org
 * Box 6: Pokerfuse
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// THE 6 SOURCE BOXES - HARDCODED AND IMMUTABLE
const SOURCE_BOXES = [
    { box: 1, source_name: 'PokerNews', fallback_image: 'https://images.pexels.com/photos/1871508/pexels-photo-1871508.jpeg?auto=compress&cs=tinysrgb&w=800' },
    { box: 2, source_name: 'MSPT', fallback_image: 'https://images.pexels.com/photos/3279691/pexels-photo-3279691.jpeg?auto=compress&cs=tinysrgb&w=800' },
    { box: 3, source_name: 'CardPlayer', fallback_image: 'https://images.pexels.com/photos/279009/pexels-photo-279009.jpeg?auto=compress&cs=tinysrgb&w=800' },
    { box: 4, source_name: 'WSOP', fallback_image: 'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=800' },
    { box: 5, source_name: 'Poker.org', fallback_image: 'https://images.pexels.com/photos/4254890/pexels-photo-4254890.jpeg?auto=compress&cs=tinysrgb&w=800' },
    { box: 6, source_name: 'Pokerfuse', fallback_image: 'https://images.pexels.com/photos/1871508/pexels-photo-1871508.jpeg?auto=compress&cs=tinysrgb&w=800' }
];

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const boxArticles = [];

        // Query each source's latest article - GUARANTEED one per box
        for (const box of SOURCE_BOXES) {
            // Try by source_box first, then by source_name
            let { data: article } = await supabase
                .from('poker_news')
                .select('*')
                .eq('source_box', box.box)
                .eq('is_published', true)
                .order('published_at', { ascending: false })
                .limit(1)
                .single();

            // Fallback: try by source_name if source_box didn't match
            if (!article) {
                const { data: byName } = await supabase
                    .from('poker_news')
                    .select('*')
                    .eq('source_name', box.source_name)
                    .eq('is_published', true)
                    .order('published_at', { ascending: false })
                    .limit(1)
                    .single();
                article = byName;
            }

            // If we found an article, add it with box number
            if (article) {
                boxArticles.push({
                    ...article,
                    _boxNumber: box.box,
                    _sourceName: box.source_name
                });
            } else {
                // NO PLACEHOLDER - just mark as empty for this box
                // The frontend should handle showing old cached content
                boxArticles.push({
                    id: `empty-box-${box.box}`,
                    _boxNumber: box.box,
                    _sourceName: box.source_name,
                    _isEmpty: true,
                    title: `Awaiting ${box.source_name} News`,
                    source_name: box.source_name,
                    image_url: box.fallback_image,
                    published_at: new Date().toISOString(),
                    views: 0
                });
            }
        }

        return res.status(200).json({
            success: true,
            data: boxArticles,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[Source Boxes API] Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            data: SOURCE_BOXES.map(box => ({
                id: `error-box-${box.box}`,
                _boxNumber: box.box,
                _sourceName: box.source_name,
                _isError: true,
                title: `${box.source_name} - Loading...`,
                source_name: box.source_name,
                image_url: box.fallback_image,
                published_at: new Date().toISOString(),
                views: 0
            }))
        });
    }
}
