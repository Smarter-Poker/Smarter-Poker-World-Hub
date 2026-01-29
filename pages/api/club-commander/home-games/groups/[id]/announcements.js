/**
 * Club Announcements API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 4
 * GET /api/club-commander/home-games/groups/[id]/announcements - List announcements
 * POST /api/club-commander/home-games/groups/[id]/announcements - Create announcement
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id: groupId } = req.query;

  if (!groupId) {
    return res.status(400).json({ error: 'Group ID required' });
  }

  if (req.method === 'GET') {
    return listAnnouncements(req, res, groupId);
  }

  if (req.method === 'POST') {
    return createAnnouncement(req, res, groupId);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function listAnnouncements(req, res, groupId) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check membership
    const { data: membership } = await supabase
      .from('captain_home_members')
      .select('role, status')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single();

    if (!membership || membership.status !== 'approved') {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    const { limit = 20, before } = req.query;

    let query = supabase
      .from('captain_club_announcements')
      .select(`
        *,
        profiles:author_id (id, display_name, avatar_url),
        captain_home_games:related_game_id (id, title, scheduled_date, start_time)
      `)
      .eq('group_id', groupId)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(parseInt(limit));

    if (before) {
      query = query.lt('sent_at', before);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.status(200).json({ announcements: data });
  } catch (error) {
    console.error('List announcements error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function createAnnouncement(req, res, groupId) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check if user is admin
    const { data: membership } = await supabase
      .from('captain_home_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .single();

    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return res.status(403).json({ error: 'Only admins can create announcements' });
    }

    const {
      title,
      message,
      message_type = 'announcement',
      target_all = true,
      target_member_ids,
      scheduled_for,
      related_game_id,
      send_push = true,
      send_now = true
    } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    const status = send_now ? 'sent' : (scheduled_for ? 'scheduled' : 'draft');

    const { data: announcement, error } = await supabase
      .from('captain_club_announcements')
      .insert({
        group_id: groupId,
        author_id: user.id,
        title,
        message,
        message_type,
        target_all,
        target_member_ids: target_all ? null : target_member_ids,
        scheduled_for,
        sent_at: send_now ? new Date().toISOString() : null,
        related_game_id,
        send_push,
        status
      })
      .select(`
        *,
        profiles:author_id (id, display_name, avatar_url)
      `)
      .single();

    if (error) throw error;

    // If sending now with push notifications, trigger push
    if (send_now && send_push) {
      await sendPushNotifications(groupId, announcement, target_all, target_member_ids);
    }

    return res.status(201).json({ announcement });
  } catch (error) {
    console.error('Create announcement error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function sendPushNotifications(groupId, announcement, targetAll, targetMemberIds) {
  try {
    // Get members to notify
    let memberQuery = supabase
      .from('captain_home_members')
      .select('user_id, notify_announcements')
      .eq('group_id', groupId)
      .eq('status', 'approved')
      .eq('notifications_enabled', true);

    if (!targetAll && targetMemberIds?.length > 0) {
      memberQuery = memberQuery.in('user_id', targetMemberIds);
    }

    const { data: members } = await memberQuery;

    if (!members || members.length === 0) return;

    // Filter members who have announcements enabled
    const notifyUserIds = members
      .filter(m => m.notify_announcements !== false)
      .map(m => m.user_id);

    if (notifyUserIds.length === 0) return;

    // Get push subscriptions for these users
    const { data: subscriptions } = await supabase
      .from('captain_push_subscriptions')
      .select('user_id, device_token, device_type')
      .in('user_id', notifyUserIds)
      .eq('group_id', groupId)
      .eq('is_active', true);

    if (!subscriptions || subscriptions.length === 0) return;

    // Log notifications (actual push would use Firebase/APNS)
    const notificationLogs = subscriptions.map(sub => ({
      user_id: sub.user_id,
      group_id: groupId,
      announcement_id: announcement.id,
      notification_type: announcement.message_type,
      title: announcement.title,
      body: announcement.message.substring(0, 200),
      channel: 'push',
      status: 'sent',
      sent_at: new Date().toISOString()
    }));

    await supabase
      .from('captain_notification_log')
      .insert(notificationLogs);

    // Update announcement push count
    await supabase
      .from('captain_club_announcements')
      .update({
        push_sent: true,
        push_sent_count: subscriptions.length
      })
      .eq('id', announcement.id);

    // TODO: Integrate with actual push service (Firebase FCM, Apple APNS)
    console.log(`Would send push to ${subscriptions.length} devices`);
  } catch (error) {
    console.error('Send push notifications error:', error);
  }
}
