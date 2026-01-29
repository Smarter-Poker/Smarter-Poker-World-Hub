/**
 * Club Commander Call Player API - POST /api/club-commander/waitlist/:id/call [Staff]
 * Call a player from the waitlist
 * Reference: API_REFERENCE.md - Waitlist section
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Waitlist entry ID required' }
    });
  }

  try {
    // TODO: Add staff authentication check (Step 1.3)

    const { notify_sms = true, notify_push = true, message } = req.body;

    // Verify entry exists and is waiting
    const { data: entry, error: fetchError } = await supabase
      .from('captain_waitlist')
      .select(`
        *,
        poker_venues (
          id,
          name,
          auto_text_enabled
        )
      `)
      .eq('id', id)
      .single();

    if (fetchError || !entry) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Waitlist entry not found' }
      });
    }

    if (entry.status !== 'waiting') {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Entry is not in waiting status' }
      });
    }

    // Update entry status to called
    const { data: updatedEntry, error: updateError } = await supabase
      .from('captain_waitlist')
      .update({
        status: 'called',
        call_count: (entry.call_count || 0) + 1,
        last_called_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Club Commander waitlist call update error:', updateError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to update entry' }
      });
    }

    // Send notifications
    const notifications = [];
    const notificationMessage = message ||
      `Your seat is ready at ${entry.poker_venues?.name || 'the venue'} for ${entry.game_type.toUpperCase()} ${entry.stakes}. Please check in within 5 minutes.`;

    // Create notification record
    if (entry.player_id || entry.player_phone) {
      const notificationData = {
        venue_id: entry.venue_id,
        player_id: entry.player_id || null,
        notification_type: 'called_for_seat',
        title: 'Seat Available',
        message: notificationMessage,
        status: 'pending',
        metadata: {
          waitlist_id: entry.id,
          game_type: entry.game_type,
          stakes: entry.stakes
        }
      };

      // SMS notification
      if (notify_sms && entry.player_phone && entry.poker_venues?.auto_text_enabled !== false) {
        const { data: smsNotification, error: smsError } = await supabase
          .from('captain_notifications')
          .insert({
            ...notificationData,
            channel: 'sms'
          })
          .select()
          .single();

        if (!smsError) {
          notifications.push(smsNotification);
          // TODO: Integrate with Twilio (Step 1.6)
        }
      }

      // Push notification
      if (notify_push && entry.player_id) {
        const { data: pushNotification, error: pushError } = await supabase
          .from('captain_notifications')
          .insert({
            ...notificationData,
            channel: 'push'
          })
          .select()
          .single();

        if (!pushError) {
          notifications.push(pushNotification);
          // TODO: Integrate with FCM
        }
      }

      // In-app notification
      if (entry.player_id) {
        const { data: inAppNotification } = await supabase
          .from('captain_notifications')
          .insert({
            ...notificationData,
            channel: 'in_app',
            status: 'sent'
          })
          .select()
          .single();

        if (inAppNotification) {
          notifications.push(inAppNotification);
        }
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        entry: updatedEntry,
        notifications_sent: notifications.length
      }
    });
  } catch (error) {
    console.error('Club Commander waitlist call API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
