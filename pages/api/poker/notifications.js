import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
const { applyCors } = require('../../../src/lib/cors');
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}



/**
 * Can this user publish official notifications for a page?
 * - Admin/superadmin role, OR
 * - Approved page_claims row for this page, OR
 * - Active venue_managers row with can_post_updates for a venue page.
 * Mirrors isAuthorizedEditor() in pages/api/poker/venue-schedules.js.
 */
async function canPublishForPage(userId, pageType, pageId) {
    if (!userId || !pageType || !pageId) return false;

    try {
        const { data: profile } = await getSupabase()
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .maybeSingle();
        if (profile && (profile.role === 'admin' || profile.role === 'superadmin')) return true;
    } catch (_err) { /* continue to claim checks */ }

    try {
        const { data: claim } = await getSupabase()
            .from('page_claims')
            .select('id')
            .eq('page_type', pageType)
            .eq('page_id', String(pageId))
            .eq('user_id', userId)
            .eq('status', 'approved')
            .limit(1)
            .maybeSingle();
        if (claim) return true;
    } catch (_err) { /* continue to manager check */ }

    if (pageType === 'venue') {
        const venueIdNum = parseInt(pageId, 10);
        if (!isNaN(venueIdNum) && venueIdNum > 0) {
            try {
                const { data: manager } = await getSupabase()
                    .from('venue_managers')
                    .select('id, can_post_updates')
                    .eq('venue_id', venueIdNum)
                    .eq('user_id', userId)
                    .eq('is_active', true)
                    .limit(1)
                    .maybeSingle();
                if (manager && manager.can_post_updates !== false) return true;
            } catch (_err) { /* not a manager */ }
        }
    }

    return false;
}

export default async function handler(req, res) {
    if (!applyCors(req, res, { methods: 'GET, POST, PUT, DELETE, OPTIONS', headers: 'Content-Type, x-user-id, Authorization' })) return;
try {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    // ── HARDENED Auth: local HMAC verify first, GoTrue network fallback if JWT secret missing ──
    const supabase = getSupabase();
    const { user: localUser } = await getServerUserWithFallback(req, supabase);
    if (!localUser) return res.status(401).json({ success: false, error: 'Auth required' });
    const authenticatedUserId = localUser.id;

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

        // SECURITY: notifications are pushed to every follower of the page, so only
        // page owners/managers (or admins) may publish them.
        const allowed = await canPublishForPage(authenticatedUserId, page_type, page_id);
        if (!allowed) {
          return res.status(403).json({
            success: false,
            error: 'Unauthorized: you must own or manage this page to publish notifications',
          });
        }

        const { data, error } = await getSupabase()
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
          .maybeSingle();

        if (error) {
          console.warn('Error creating notification:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        return res.status(201).json({ success: true, notification: data });
      }

      if (req.method === 'GET') {
        const { unread, limit = '20', offset = '0' } = req.query;
        const user_id = authenticatedUserId; // Use JWT identity, not query param

        const limitNum = parseInt(limit, 10);
        const offsetNum = parseInt(offset, 10);

        // Get pages the user follows
        const { data: follows, error: followError } = await getSupabase()
          .from('page_followers')
          .select('page_type, page_id')
          .eq('user_id', user_id)
          .limit(100);

        if (followError) {
          console.warn('Error fetching follows:', followError);
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
        const { data: notifications, error: notifError } = await getSupabase()
          .from('page_notifications')
          .select('*')
          .or(orConditions)
          .order('created_at', { ascending: false })
          .range(offsetNum, offsetNum + limitNum - 1);

        if (notifError) {
          console.warn('Error fetching notifications:', notifError);
          return res.status(500).json({ success: false, error: notifError.message });
        }

        if (!notifications || notifications.length === 0) {
          return res.status(200).json({ success: true, notifications: [], total: 0 });
        }

        // Get read status for these notifications
        const notificationIds = notifications.map((n) => n.id);

        const { data: reads, error: readError } = await getSupabase()
          .from('notification_reads')
          .select('notification_id')
          .eq('user_id', user_id)
          .in('notification_id', notificationIds)
          .limit(100);

        if (readError) {
          console.warn('Error fetching read status:', readError);
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
        const { notification_id, mark_all } = req.body;
        const user_id = authenticatedUserId; // Use JWT identity, not body param

        // Mark all as read
        if (mark_all === true) {
          // Get pages the user follows
          const { data: follows, error: followError } = await getSupabase()
            .from('page_followers')
            .select('page_type, page_id')
            .eq('user_id', user_id)
            .limit(100);

          if (followError) {
            console.warn('Error fetching follows:', followError);
            return res.status(500).json({ success: false, error: followError.message });
          }

          if (!follows || follows.length === 0) {
            return res.status(200).json({ success: true, marked: 0 });
          }

          // Get all notifications for followed pages
          const orConditions = follows.map(
            (f) => `and(page_type.eq.${f.page_type},page_id.eq.${f.page_id})`
          ).join(',');

          const { data: notifications, error: notifError } = await getSupabase()
            .from('page_notifications')
            .select('id')
            .or(orConditions)
            .limit(100);

          if (notifError) {
            console.warn('Error fetching notifications:', notifError);
            return res.status(500).json({ success: false, error: notifError.message });
          }

          if (!notifications || notifications.length === 0) {
            return res.status(200).json({ success: true, marked: 0 });
          }

          // Get already-read notification IDs
          const allNotifIds = notifications.map((n) => n.id);

          const { data: existingReads, error: existingError } = await getSupabase()
            .from('notification_reads')
            .select('notification_id')
            .eq('user_id', user_id)
            .in('notification_id', allNotifIds)
            .limit(100);

          if (existingError) {
            console.warn('Error fetching existing reads:', existingError);
            return res.status(500).json({ success: false, error: existingError.message });
          }

          const alreadyRead = new Set((existingReads || []).map((r) => r.notification_id));
          const unreadIds = allNotifIds.filter((id) => !alreadyRead.has(id))
            .slice(0, 100);

          if (unreadIds.length === 0) {
            return res.status(200).json({ success: true, marked: 0 });
          }

          const inserts = unreadIds.map((notification_id) => ({
            notification_id,
            user_id,
            read_at: new Date().toISOString(),
          }));

          const { error: insertError } = await getSupabase()
            .from('notification_reads')
            .insert(inserts);

          if (insertError) {
            console.warn('Error marking all read:', insertError);
            return res.status(500).json({ success: false, error: insertError.message });
          }

          return res.status(200).json({ success: true, marked: unreadIds.length });
        }

        // Mark single notification as read
        if (!notification_id) {
          return res.status(400).json({ success: false, error: 'notification_id is required (or set mark_all: true)' });
        }

        // Check if already read
        const { data: existing, error: existError } = await getSupabase()
          .from('notification_reads')
          .select('id')
          .eq('notification_id', notification_id)
          .eq('user_id', user_id)
          .limit(1);

        if (existError) {
          console.warn('Error checking read status:', existError);
          return res.status(500).json({ success: false, error: existError.message });
        }

        if (existing && existing.length > 0) {
          return res.status(200).json({ success: true, already_read: true });
        }

        const { data, error } = await getSupabase()
          .from('notification_reads')
          .insert({
            notification_id,
            user_id,
            read_at: new Date().toISOString(),
          })
          .select()
          .maybeSingle();

        if (error) {
          console.warn('Error marking notification read:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        return res.status(200).json({ success: true, read: data });
      }

      return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
    } catch (err) {
      console.warn('Notifications API error:', err);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
