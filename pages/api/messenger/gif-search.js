/**
 * GIF Search API — Server-side proxy for GIPHY API
 * ═══════════════════════════════════════════════════════════════════════════
 * Hides GIPHY API key from client. Returns trending or search results.
 * Rate limited: 100 searches/hour (GIPHY beta key limit).
 * ═══════════════════════════════════════════════════════════════════════════
 */

// GIPHY beta API key — free tier, 100 searches/hour
// To upgrade: visit developers.giphy.com and request a production key
const GIPHY_API_KEY = process.env.GIPHY_API_KEY || 'GlVGYHkr3WSBnllca54iNt0yFbjz7L29';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { q, offset = 0, limit = 20 } = req.query;

    try {
        let url;
        if (q && q.trim()) {
            // Search GIFs
            url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(q.trim())}&limit=${limit}&offset=${offset}&rating=pg-13&lang=en`;
        } else {
            // Trending GIFs
            url = `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&offset=${offset}&rating=pg-13`;
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`GIPHY API returned ${response.status}`);
        }

        const data = await response.json();
        
        // Extract just what we need (minimize payload)
        const gifs = (data.data || []).map(gif => ({
            id: gif.id,
            title: gif.title,
            url: gif.images?.fixed_height?.url || gif.images?.original?.url,
            preview: gif.images?.fixed_height_small?.url || gif.images?.preview_gif?.url,
            width: parseInt(gif.images?.fixed_height?.width || '200'),
            height: parseInt(gif.images?.fixed_height?.height || '200'),
        }));

        return res.status(200).json({
            success: true,
            gifs,
            total: data.pagination?.total_count || 0,
        });
    } catch (error) {
        console.error('[GIF Search] Error:', error);
        return res.status(500).json({ success: false, error: 'GIF search failed' });
    }
}
