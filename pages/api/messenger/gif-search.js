import { reportApiError } from '../../../src/lib/sentryWrap';
/**
 * GIF/Sticker Search API — Server-side proxy for GIPHY API
 * ═══════════════════════════════════════════════════════════════════════════
 * Hides GIPHY API key from client. Returns trending or search results.
 * Supports both GIFs and Stickers via the `type` query param.
 * Rate limited: 100 searches/hour (GIPHY beta key limit).
 * ═══════════════════════════════════════════════════════════════════════════
 */

// GIPHY beta key — this is a FREE public SDK key from GIPHY for development use (not a secret).
// Override with a paid/production key via GIPHY_API_KEY env var in Vercel if needed.
const GIPHY_API_KEY = process.env.GIPHY_API_KEY || 'GRZ1Yjou2kmUFz1jcXP0S2skHrMZOFoQ';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { q, offset = 0, limit = 20, type = 'gif' } = req.query;

    // Determine endpoint based on type: 'gif' or 'sticker'
    const endpoint = type === 'sticker' ? 'stickers' : 'gifs';

    try {
        let url;
        if (q && q.trim()) {
            // Search
            url = `https://api.giphy.com/v1/${endpoint}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(q.trim())}&limit=${limit}&offset=${offset}&rating=pg-13&lang=en`;
        } else {
            // Trending
            url = `https://api.giphy.com/v1/${endpoint}/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&offset=${offset}&rating=pg-13`;
        }

        const response = await fetch(url);
        if (!response.ok) {
            if (response.status === 401) {
                return res.status(200).json({ success: false, error: 'GIPHY API key is not configured or invalid', gifs: [] });
            }
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
        try { reportApiError(error, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[GIF Search] Error:', error);
        return res.status(500).json({ success: false, error: 'GIF search failed' });
    }
}
