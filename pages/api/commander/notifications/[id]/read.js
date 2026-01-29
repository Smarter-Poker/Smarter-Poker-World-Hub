/**
 * Mark Notification Read API
 * PATCH /api/commander/notifications/:id/read
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only PATCH allowed' }
    });
  }

  const { id } = req.query;

  try {
    const { data: notification, error } = await supabase
      .from('commander_notifications')
      .update({
        read_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: { notification }
    });
  } catch (error) {
    console.error('Mark read error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to mark as read' }
    });
  }
}
