import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-id',
};

export default async function handler(req, res) {
  // Set CORS headers
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      const { page_type, page_id, user_id, content, activity_type } = req.body;

      if (!page_type || !page_id || !user_id || !content || !activity_type) {
        return res.status(400).json({ success: false, error: 'Missing required fields: page_type, page_id, user_id, content, activity_type' });
      }

      const validTypes = ['update', 'announcement', 'promotion', 'result'];
      if (!validTypes.includes(activity_type)) {
        return res.status(400).json({ success: false, error: `Invalid activity_type. Must be one of: ${validTypes.join(', ')}` });
      }

      const { data, error } = await supabase
        .from('page_activity')
        .insert({
          page_type,
          page_id,
          user_id,
          content,
          activity_type,
          created_at: new Date().toISOString(),
          likes_count: 0,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating activity:', error);
        return res.status(500).json({ success: false, error: error.message });
      }

      return res.status(201).json({ success: true, activity: data });
    }

    if (req.method === 'GET') {
      const { page_type, page_id, user_id, feed, limit = '20', offset = '0' } = req.query;
      const limitNum = parseInt(limit, 10);
      const offsetNum = parseInt(offset, 10);

      // User feed mode: get activities from pages the user follows
      if (user_id && feed === 'true') {
        // First get pages the user follows
        const { data: follows, error: followError } = await supabase
          .from('page_followers')
          .select('page_type, page_id')
          .eq('user_id', user_id);

        if (followError) {
          console.error('Error fetching follows:', followError);
          return res.status(500).json({ success: false, error: followError.message });
        }

        if (!follows || follows.length === 0) {
          return res.status(200).json({ success: true, activities: [], total: 0 });
        }

        // Build OR filter for all followed pages
        const orConditions = follows.map(
          (f) => `and(page_type.eq.${f.page_type},page_id.eq.${f.page_id})`
        ).join(',');

        const { data, error } = await supabase
          .from('page_activity')
          .select('*')
          .or(orConditions)
          .order('created_at', { ascending: false })
          .range(offsetNum, offsetNum + limitNum - 1);

        if (error) {
          console.error('Error fetching feed:', error);
          return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(200).json({ success: true, activities: data || [] });
      }

      // Page activity mode
      if (page_type && page_id) {
        const { data, error } = await supabase
          .from('page_activity')
          .select('*')
          .eq('page_type', page_type)
          .eq('page_id', page_id)
          .order('created_at', { ascending: false })
          .range(offsetNum, offsetNum + limitNum - 1);

        if (error) {
          console.error('Error fetching activities:', error);
          return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(200).json({ success: true, activities: data || [] });
      }

      return res.status(400).json({ success: false, error: 'Must provide page_type+page_id or user_id+feed=true' });
    }

    return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('Activity API error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
