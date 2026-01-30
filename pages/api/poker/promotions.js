import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-id',
};

export default async function handler(req, res) {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { page_type, limit = '50', offset = '0' } = req.query;
    const limitNum = parseInt(limit, 10);
    const offsetNum = parseInt(offset, 10);

    let query = supabase
      .from('page_activity')
      .select('*')
      .eq('activity_type', 'promotion')
      .order('created_at', { ascending: false })
      .range(offsetNum, offsetNum + limitNum - 1);

    if (page_type && page_type !== 'all') {
      query = query.eq('page_type', page_type);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching promotions:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    // Also fetch page_notifications with type 'promotion'
    let notifQuery = supabase
      .from('page_notifications')
      .select('*')
      .eq('notification_type', 'promotion')
      .order('created_at', { ascending: false })
      .range(offsetNum, offsetNum + limitNum - 1);

    if (page_type && page_type !== 'all') {
      notifQuery = notifQuery.eq('page_type', page_type);
    }

    const { data: notifData, error: notifError } = await notifQuery;

    if (notifError) {
      console.error('Error fetching promotion notifications:', notifError);
    }

    // Combine and sort by created_at
    const promotions = [
      ...(data || []).map(a => ({
        id: 'activity-' + a.id,
        page_type: a.page_type,
        page_id: a.page_id,
        title: null,
        content: a.content,
        source: 'activity',
        created_at: a.created_at,
      })),
      ...(notifData || []).map(n => ({
        id: 'notif-' + n.id,
        page_type: n.page_type,
        page_id: n.page_id,
        title: n.title,
        content: n.message,
        source: 'notification',
        created_at: n.created_at,
      })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return res.status(200).json({
      success: true,
      promotions: promotions.slice(0, limitNum),
      total: promotions.length,
    });
  } catch (err) {
    console.error('Promotions API error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
