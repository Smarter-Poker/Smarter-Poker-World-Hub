/**
 * Captain Send Notification API - POST /api/captain/notifications/send [Staff/System]
 * Send notifications to players
 * Reference: API_REFERENCE.md - Notifications section
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const VALID_TYPES = ['seat_available', 'tournament_starting', 'called_for_seat', 'promotion', 'custom'];
const VALID_CHANNELS = ['sms', 'push', 'email', 'in_app'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  try {
    // Verify staff authentication
    const staffSession = req.headers['x-staff-session'];
    if (!staffSession) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Staff authentication required' }
      });
    }

    let sessionData;
    try {
      sessionData = JSON.parse(staffSession);
    } catch {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_SESSION', message: 'Invalid session format' }
      });
    }

    const { data: staff, error: staffError } = await supabase
      .from('captain_staff')
      .select('id, venue_id, role, is_active')
      .eq('id', sessionData.id)
      .eq('is_active', true)
      .single();

    if (staffError || !staff) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_STAFF', message: 'Staff member not found or inactive' }
      });
    }

    const {
      player_id,
      phone,
      venue_id,
      type,
      channels = ['in_app'],
      title,
      message,
      metadata = {}
    } = req.body;

    // Validation
    if (!venue_id || !type || !message) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'venue_id, type, and message are required'
        }
      });
    }

    if (!player_id && !phone) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Either player_id or phone is required'
        }
      });
    }

    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`
        }
      });
    }

    const invalidChannels = channels.filter(c => !VALID_CHANNELS.includes(c));
    if (invalidChannels.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid channels: ${invalidChannels.join(', ')}. Must be one of: ${VALID_CHANNELS.join(', ')}`
        }
      });
    }

    // Create notification records for each channel
    const notifications = [];
    const errors = [];

    for (const channel of channels) {
      const { data: notification, error } = await supabase
        .from('captain_notifications')
        .insert({
          venue_id,
          player_id: player_id || null,
          notification_type: type,
          channel,
          title: title || getDefaultTitle(type),
          message,
          status: 'pending',
          metadata: {
            ...metadata,
            phone: phone || null
          }
        })
        .select()
        .single();

      if (error) {
        console.error(`Captain notification insert error (${channel}):`, error);
        errors.push({ channel, error: error.message });
      } else {
        notifications.push(notification);

        // Process notification based on channel
        await processNotification(notification, channel, phone);
      }
    }

    return res.status(201).json({
      success: true,
      data: {
        notifications,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (error) {
    console.error('Captain send notification error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}

function getDefaultTitle(type) {
  const titles = {
    seat_available: 'Seat Available',
    tournament_starting: 'Tournament Starting',
    called_for_seat: 'Your Seat is Ready',
    promotion: 'Promotion Alert',
    custom: 'Notification'
  };
  return titles[type] || 'Notification';
}

async function processNotification(notification, channel, phone) {
  try {
    switch (channel) {
      case 'sms':
        // TODO: Integrate with Twilio (Step 1.6)
        // For now, just mark as sent
        await supabase
          .from('captain_notifications')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', notification.id);
        break;

      case 'push':
        // TODO: Integrate with FCM
        await supabase
          .from('captain_notifications')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', notification.id);
        break;

      case 'in_app':
        // In-app notifications are immediately available
        await supabase
          .from('captain_notifications')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', notification.id);
        break;

      case 'email':
        // TODO: Integrate with email service
        break;
    }
  } catch (error) {
    console.error(`Error processing ${channel} notification:`, error);
  }
}
