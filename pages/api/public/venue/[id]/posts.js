/**
 * Public Venue Posts API
 * GET /api/public/venue/[id]/posts - Get public posts for a venue
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
    const { id, limit = 20, offset = 0 } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ID', message: 'Venue ID required' }
      });
    }

    // Fetch published posts, pinned first then by date
    const { data: posts, error, count } = await supabase
      .from('captain_venue_posts')
      .select(`
        id,
        author_name,
        content,
        post_type,
        image_urls,
        video_url,
        likes_count,
        comments_count,
        shares_count,
        is_pinned,
        created_at
      `, { count: 'exact' })
      .eq('venue_id', id)
      .eq('is_published', true)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: {
        posts: posts || [],
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Public venue posts API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch posts' }
    });
  }
}
