/**
 * Push Subscription API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 4
 * POST /api/captain/home-games/groups/[id]/subscribe - Subscribe to push notifications
 * DELETE /api/captain/home-games/groups/[id]/subscribe - Unsubscribe
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

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (req.method === 'POST') {
    return subscribe(req, res, groupId, user.id);
  }

  if (req.method === 'DELETE') {
    return unsubscribe(req, res, groupId, user.id);
  }

  if (req.method === 'PUT') {
    return updatePreferences(req, res, groupId, user.id);
  }

  res.setHeader('Allow', ['POST', 'DELETE', 'PUT']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function subscribe(req, res, groupId, userId) {
  try {
    const { device_token, device_type, device_name } = req.body;

    if (!device_token) {
      return res.status(400).json({ error: 'Device token required' });
    }

    // Check membership
    const { data: membership } = await supabase
      .from('captain_home_members')
      .select('id, status')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();

    if (!membership || membership.status !== 'approved') {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    // Upsert subscription
    const { data: subscription, error } = await supabase
      .from('captain_push_subscriptions')
      .upsert({
        user_id: userId,
        group_id: groupId,
        device_token,
        device_type: device_type || 'web',
        device_name,
        is_active: true,
        last_used: new Date().toISOString()
      }, {
        onConflict: 'user_id,group_id,device_token'
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      subscription,
      message: 'Subscribed to push notifications'
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function unsubscribe(req, res, groupId, userId) {
  try {
    const { device_token, all_devices } = req.body;

    let query = supabase
      .from('captain_push_subscriptions')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);

    if (!all_devices && device_token) {
      query = query.eq('device_token', device_token);
    }

    const { error } = await query;

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: all_devices ? 'Unsubscribed all devices' : 'Unsubscribed device'
    });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function updatePreferences(req, res, groupId, userId) {
  try {
    const {
      notifications_enabled,
      notify_announcements,
      notify_new_games,
      notify_game_reminders,
      notify_rsvp_updates
    } = req.body;

    const updates = {};
    if (typeof notifications_enabled === 'boolean') updates.notifications_enabled = notifications_enabled;
    if (typeof notify_announcements === 'boolean') updates.notify_announcements = notify_announcements;
    if (typeof notify_new_games === 'boolean') updates.notify_new_games = notify_new_games;
    if (typeof notify_game_reminders === 'boolean') updates.notify_game_reminders = notify_game_reminders;
    if (typeof notify_rsvp_updates === 'boolean') updates.notify_rsvp_updates = notify_rsvp_updates;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No preferences to update' });
    }

    const { data: membership, error } = await supabase
      .from('captain_home_members')
      .update(updates)
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      membership,
      message: 'Notification preferences updated'
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    return res.status(500).json({ error: error.message });
  }
}
