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
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      const { page_type, page_id, title, message, notification_type } = req.body;

      if (!page_type || !page_id || !title || !message || !notification_type) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: page_type, page_id, title, message, notification_type',
        });
      }

      const validTypes = ['new_event', 'schedule_change', 'promotion', 'result'];
      if (!validTypes.includes(notification_type)) {
        return res.status(400).json({
          success: false,
          error: `Invalid notification_type. Must be one of: ${validTypes.join(', ')}`,
        });
      }

      const { data, error } = await supabase
        .from('page_notifications')
        .insert({
          page_type,
          page_id,
          title,
          message,
          notification_type,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating notification:', error);
        return res.status(500).json({ success: false, error: error.message });
      }

      return res.status(201).json({ success: true, notification: data });
    }

    if (req.method === 'GET') {
      const { user_id, unread, limit = '20', offset = '0' } = req.query;

      if (!user_id) {
        return res.status(400).json({ success: false, error: 'user_id is required' });
      }

      const limitNum = parseInt(limit, 10);
      const offsetNum = parseInt(offset, 10);

      // Get pages the user follows
      const { data: follows, error: followError } = await supabase
        .from('page_followers')
        .select('page_type, page_id')
        .eq('user_id', user_id);

      if (followError) {
        console.error('Error fetching follows:', followError);
        return res.status(500).json({ success: false, error: followError.message });
      }

      if (!follows || follows.length === 0) {
        return res.status(200).json({ success: true, notifications: [], total: 0 });
      }

      // Build OR filter for all followed pages
      const orConditions = follows.map(
        (f) => `and(page_type.eq.${f.page_type},page_id.eq.${f.page_id})`
      ).join(',');

      // Get notifications for followed pages
      const { data: notifications, error: notifError } = await supabase
        .from('page_notifications')
        .select('*')
        .or(orConditions)
        .order('created_at', { ascending: false })
        .range(offsetNum, offsetNum + limitNum - 1);

      if (notifError) {
        console.error('Error fetching notifications:', notifError);
        return res.status(500).json({ success: false, error: notifError.message });
      }

      if (!notifications || notifications.length === 0) {
        return res.status(200).json({ success: true, notifications: [], total: 0 });
      }

      // Get read status for these notifications
      const notificationIds = notifications.map((n) => n.id);

      const { data: reads, error: readError } = await supabase
        .from('notification_reads')
        .select('notification_id')
        .eq('user_id', user_id)
        .in('notification_id', notificationIds);

      if (readError) {
        console.error('Error fetching read status:', readError);
        return res.status(500).json({ success: false, error: readError.message });
      }

      const readSet = new Set((reads || []).map((r) => r.notification_id));

      // Add is_read flag
      let result = notifications.map((n) => ({
        ...n,
        is_read: readSet.has(n.id),
      }));

      // Filter to unread only if requested
      if (unread === 'true') {
        result = result.filter((n) => !n.is_read);
      }

      return res.status(200).json({ success: true, notifications: result });
    }

    if (req.method === 'PUT') {
      const { notification_id, user_id, mark_all } = req.body;

      if (!user_id) {
        return res.status(400).json({ success: false, error: 'user_id is required' });
      }

      // Mark all as read
      if (mark_all === true) {
        // Get pages the user follows
        const { data: follows, error: followError } = await supabase
          .from('page_followers')
          .select('page_type, page_id')
          .eq('user_id', user_id);

        if (followError) {
          console.error('Error fetching follows:', followError);
          return res.status(500).json({ success: false, error: followError.message });
        }

        if (!follows || follows.length === 0) {
          return res.status(200).json({ success: true, marked: 0 });
        }

        // Get all notifications for followed pages
        const orConditions = follows.map(
          (f) => `and(page_type.eq.${f.page_type},page_id.eq.${f.page_id})`
        ).join(',');

        const { data: notifications, error: notifError } = await supabase
          .from('page_notifications')
          .select('id')
          .or(orConditions);

        if (notifError) {
          console.error('Error fetching notifications:', notifError);
          return res.status(500).json({ success: false, error: notifError.message });
        }

        if (!notifications || notifications.length === 0) {
          return res.status(200).json({ success: true, marked: 0 });
        }

        // Get already-read notification IDs
        const allNotifIds = notifications.map((n) => n.id);

        const { data: existingReads, error: existingError } = await supabase
          .from('notification_reads')
          .select('notification_id')
          .eq('user_id', user_id)
          .in('notification_id', allNotifIds);

        if (existingError) {
          console.error('Error fetching existing reads:', existingError);
          return res.status(500).json({ success: false, error: existingError.message });
        }

        const alreadyRead = new Set((existingReads || []).map((r) => r.notification_id));
        const unreadIds = allNotifIds.filter((id) => !alreadyRead.has(id));

        if (unreadIds.length === 0) {
          return res.status(200).json({ success: true, marked: 0 });
        }

        const inserts = unreadIds.map((notification_id) => ({
          notification_id,
          user_id,
          read_at: new Date().toISOString(),
        }));

        const { error: insertError } = await supabase
          .from('notification_reads')
          .insert(inserts);

        if (insertError) {
          console.error('Error marking all read:', insertError);
          return res.status(500).json({ success: false, error: insertError.message });
        }

        return res.status(200).json({ success: true, marked: unreadIds.length });
      }

      // Mark single notification as read
      if (!notification_id) {
        return res.status(400).json({ success: false, error: 'notification_id is required (or set mark_all: true)' });
      }

      // Check if already read
      const { data: existing, error: existError } = await supabase
        .from('notification_reads')
        .select('id')
        .eq('notification_id', notification_id)
        .eq('user_id', user_id)
        .limit(1);

      if (existError) {
        console.error('Error checking read status:', existError);
        return res.status(500).json({ success: false, error: existError.message });
      }

      if (existing && existing.length > 0) {
        return res.status(200).json({ success: true, already_read: true });
      }

      const { data, error } = await supabase
        .from('notification_reads')
        .insert({
          notification_id,
          user_id,
          read_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('Error marking notification read:', error);
        return res.status(500).json({ success: false, error: error.message });
      }

      return res.status(200).json({ success: true, read: data });
    }

    return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('Notifications API error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
