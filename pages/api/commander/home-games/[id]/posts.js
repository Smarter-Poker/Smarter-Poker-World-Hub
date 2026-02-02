/**
 * Home Game Posts API
 * GET /api/commander/home-games/[id]/posts - List posts for a home game group
 * POST /api/commander/home-games/[id]/posts - Create a new post
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    const { id } = req.query;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authorization required' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid token' }
      });
    }

    // Verify user is a member of this group
    const { data: membership, error: memberError } = await supabase
      .from('commander_home_members')
      .select('role, status')
      .eq('group_id', id)
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .single();

    if (memberError || !membership) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Must be a member to access posts' }
      });
    }

    if (req.method === 'GET') {
      const { limit = 20, offset = 0 } = req.query;

      const { data, error, count } = await supabase
        .from('commander_home_posts')
        .select(`
          *,
          author:author_id (id, display_name, avatar_url)
        `, { count: 'exact' })
        .eq('group_id', id)
        .eq('is_published', true)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (error) throw error;

      return res.status(200).json({
        success: true,
        data: {
          posts: data || [],
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    }

    if (req.method === 'POST') {
      const { content, post_type = 'announcement', image_urls, video_url, is_pinned = false, visible_to = 'members' } = req.body;

      if (!content) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_CONTENT', message: 'Post content required' }
        });
      }

      // Only owner/admin can pin posts
      if (is_pinned && !['owner', 'admin'].includes(membership.role)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Only owner/admin can pin posts' }
        });
      }

      const { data, error } = await supabase
        .from('commander_home_posts')
        .insert({
          group_id: id,
          author_id: user.id,
          content,
          post_type,
          image_urls: image_urls || [],
          video_url: video_url || null,
          is_pinned,
          visible_to,
          is_published: true
        })
        .select(`
          *,
          author:author_id (id, display_name, avatar_url)
        `)
        .single();

      if (error) throw error;

      return res.status(201).json({
        success: true,
        data: { post: data }
      });
    }

    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET and POST allowed' }
    });
  } catch (error) {
    console.error('Home game posts API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to process request' }
    });
  }
}
