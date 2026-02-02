/**
 * Friends API
 * GET - Get user's friends list
 * POST - Add a friend
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Verify auth
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }

  if (req.method === 'GET') {
    try {
      // Check if friends table exists, if not return profiles as potential friends
      const { data: friendships, error: friendsError } = await supabase
        .from('friendships')
        .select(`
          id,
          friend:friend_id (
            id,
            display_name,
            username,
            avatar_url
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'accepted');

      if (friendsError) {
        // Table might not exist, return empty array
        if (friendsError.code === '42P01') {
          return res.status(200).json({
            success: true,
            data: { friends: [] }
          });
        }
        throw friendsError;
      }

      const friends = (friendships || []).map(f => ({
        id: f.friend?.id,
        name: f.friend?.display_name || 'Friend',
        username: f.friend?.username || '',
        avatar_url: f.friend?.avatar_url
      })).filter(f => f.id);

      return res.status(200).json({
        success: true,
        data: { friends }
      });

    } catch (error) {
      console.error('Get friends error:', error);
      // Return empty friends if table doesn't exist
      return res.status(200).json({
        success: true,
        data: { friends: [] }
      });
    }
  }

  if (req.method === 'POST') {
    const { friend_id } = req.body;

    if (!friend_id) {
      return res.status(400).json({ success: false, error: 'friend_id is required' });
    }

    try {
      const { data, error } = await supabase
        .from('friendships')
        .insert({
          user_id: user.id,
          friend_id,
          status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;

      return res.status(201).json({
        success: true,
        data: { friendship: data }
      });

    } catch (error) {
      console.error('Add friend error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
