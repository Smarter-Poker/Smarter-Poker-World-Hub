/**
 * Public Home Game Posts API
 * GET /api/public/home-game/[code]/posts - Get public posts for a home game group
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
    const { code, limit = 20, offset = 0 } = req.query;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_CODE', message: 'Club code required' }
      });
    }

    // First get the group by club code
    const { data: group, error: groupError } = await supabase
      .from('commander_home_groups')
      .select('id, is_private')
      .eq('club_code', code)
      .eq('is_active', true)
      .single();

    if (groupError || !group) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Group not found' }
      });
    }

    // Only return public posts
    const { data: posts, error, count } = await supabase
      .from('commander_home_posts')
      .select(`
        id,
        content,
        post_type,
        image_urls,
        video_url,
        likes_count,
        comments_count,
        is_pinned,
        created_at,
        author:author_id (
          id,
          display_name,
          avatar_url
        )
      `, { count: 'exact' })
      .eq('group_id', group.id)
      .eq('is_published', true)
      .eq('visible_to', 'public')
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
    console.error('Public home game posts API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch posts' }
    });
  }
}
