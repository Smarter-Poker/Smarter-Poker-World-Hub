/**
 * Public Venue Photos API
 * GET /api/public/venue/[id]/photos - Get public photos for a venue
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed' }
    });
  }

  try {
    const { id, category, limit = 30, offset = 0 } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ID', message: 'Venue ID required' }
      });
    }

    let query = supabase
      .from('captain_venue_photos')
      .select(`
        id,
        url,
        thumbnail_url,
        caption,
        category,
        is_cover_photo,
        is_featured,
        likes_count,
        created_at
      `, { count: 'exact' })
      .eq('venue_id', id)
      .order('is_featured', { ascending: false })
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (category) {
      query = query.eq('category', category);
    }

    const { data: photos, error, count } = await query;

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: {
        photos: photos || [],
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Public venue photos API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch photos' }
    });
  }
}
