/**
 * Commander Send Notification API - POST /api/commander/notifications/send [Staff/System]
 * Send notifications to players
 * Reference: API_REFERENCE.md - Notifications section
 */
import { createClient } from '@supabase/supabase-js';
import { normalizePhoneNumber, isSmsConfigured } from '../../../../src/lib/commander/notifications';

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
      .from('commander_staff')
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
        .from('commander_notifications')
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
        console.error(`Commander notification insert error (${channel}):`, error);
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
    console.error('Commander send notification error:', error);
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
        await sendSmsNotification(notification, phone);
        break;

      case 'push':
        await sendPushNotification(notification);
        break;

      case 'in_app':
        // In-app notifications are immediately available
        await supabase
          .from('commander_notifications')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', notification.id);
        break;

      case 'email':
        await sendEmailNotification(notification);
        break;
    }
  } catch (error) {
    console.error(`Error processing ${channel} notification:`, error);
    await supabase
      .from('commander_notifications')
      .update({
        status: 'failed',
        metadata: { ...notification.metadata, error: error.message }
      })
      .eq('id', notification.id);
  }
}

async function sendSmsNotification(notification, phone) {
  if (!isSmsConfigured()) {
    console.log('Twilio not configured, marking SMS as pending');
    await supabase
      .from('commander_notifications')
      .update({ status: 'pending' })
      .eq('id', notification.id);
    return;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  // Get phone number from notification or player profile
  let toPhone = phone;
  if (!toPhone && notification.player_id) {
    // First check player preferences for this venue
    const { data: prefs } = await supabase
      .from('commander_player_preferences')
      .select('notification_preferences')
      .eq('player_id', notification.player_id)
      .eq('venue_id', notification.venue_id)
      .single();

    // If no phone in preferences, get from profiles table
    if (!prefs?.notification_preferences?.phone) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', notification.player_id)
        .single();
      toPhone = profile?.phone;
    } else {
      toPhone = prefs.notification_preferences.phone;
    }
  }

  if (!toPhone) {
    await supabase
      .from('commander_notifications')
      .update({
        status: 'failed',
        metadata: { ...notification.metadata, error: 'No phone number available' }
      })
      .eq('id', notification.id);
    return;
  }

  try {
    // Normalize the phone number to E.164 format using shared utility
    const normalizedPhone = normalizePhoneNumber(toPhone);
    if (!normalizedPhone) {
      await supabase
        .from('commander_notifications')
        .update({
          status: 'failed',
          metadata: { ...notification.metadata, error: 'Invalid phone number format' }
        })
        .eq('id', notification.id);
      return;
    }

    const client = require('twilio')(accountSid, authToken);
    const result = await client.messages.create({
      body: notification.message,
      from: fromNumber,
      to: normalizedPhone,
      statusCallback: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/commander/webhooks/twilio/status`
    });

    await supabase
      .from('commander_notifications')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        metadata: { ...notification.metadata, message_sid: result.sid }
      })
      .eq('id', notification.id);
  } catch (error) {
    console.error('Twilio SMS error:', error);
    await supabase
      .from('commander_notifications')
      .update({
        status: 'failed',
        metadata: { ...notification.metadata, error: error.message }
      })
      .eq('id', notification.id);
  }
}

async function sendEmailNotification(notification) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'notifications@smarter.poker';

  if (!resendApiKey) {
    console.log('Resend not configured, marking email as pending');
    await supabase
      .from('commander_notifications')
      .update({
        status: 'pending',
        metadata: { ...notification.metadata, email_pending: true }
      })
      .eq('id', notification.id);
    return;
  }

  // Get player email
  let toEmail = notification.metadata?.email;
  if (!toEmail && notification.player_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', notification.player_id)
      .single();
    toEmail = profile?.email;
  }

  if (!toEmail) {
    await supabase
      .from('commander_notifications')
      .update({
        status: 'failed',
        metadata: { ...notification.metadata, error: 'No email address available' }
      })
      .eq('id', notification.id);
    return;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: fromEmail,
        to: toEmail,
        subject: notification.title || 'Club Commander Notification',
        html: `
          <div style="font-family: Inter, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #1877F2; padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">Club Commander</h1>
            </div>
            <div style="padding: 30px; background: #F9FAFB;">
              <h2 style="color: #1F2937; margin-top: 0;">${notification.title || 'Notification'}</h2>
              <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">${notification.message}</p>
            </div>
            <div style="padding: 20px; text-align: center; color: #9CA3AF; font-size: 12px;">
              <p>Sent by Club Commander - Poker Room Management</p>
            </div>
          </div>
        `
      })
    });

    const result = await response.json();

    if (result.id) {
      await supabase
        .from('commander_notifications')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          metadata: { ...notification.metadata, resend_id: result.id }
        })
        .eq('id', notification.id);
    } else {
      await supabase
        .from('commander_notifications')
        .update({
          status: 'failed',
          metadata: { ...notification.metadata, error: result.message || 'Email send failed' }
        })
        .eq('id', notification.id);
    }
  } catch (error) {
    console.error('Resend email error:', error);
    await supabase
      .from('commander_notifications')
      .update({
        status: 'failed',
        metadata: { ...notification.metadata, error: error.message }
      })
      .eq('id', notification.id);
  }
}

async function sendPushNotification(notification) {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;

  if (!appId || !apiKey) {
    console.log('OneSignal not configured, marking push as pending');
    await supabase
      .from('commander_notifications')
      .update({ status: 'pending' })
      .eq('id', notification.id);
    return;
  }

  // Get player's push subscriptions
  const { data: subscriptions } = await supabase
    .from('commander_push_subscriptions')
    .select('subscription_data, endpoint')
    .eq('user_id', notification.player_id)
    .eq('is_active', true);

  if (!subscriptions || subscriptions.length === 0) {
    // No push subscription, try sending by external_user_id (player_id)
    try {
      const response = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${apiKey}`
        },
        body: JSON.stringify({
          app_id: appId,
          include_external_user_ids: [notification.player_id],
          headings: { en: notification.title },
          contents: { en: notification.message },
          data: {
            notification_id: notification.id,
            type: notification.notification_type,
            venue_id: notification.venue_id,
            ...notification.metadata
          }
        })
      });

      const result = await response.json();

      if (result.id) {
        await supabase
          .from('commander_notifications')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            metadata: { ...notification.metadata, onesignal_id: result.id }
          })
          .eq('id', notification.id);
      } else {
        await supabase
          .from('commander_notifications')
          .update({
            status: 'failed',
            metadata: { ...notification.metadata, error: result.errors?.[0] || 'No recipients' }
          })
          .eq('id', notification.id);
      }
    } catch (error) {
      console.error('OneSignal push error:', error);
      await supabase
        .from('commander_notifications')
        .update({
          status: 'failed',
          metadata: { ...notification.metadata, error: error.message }
        })
        .eq('id', notification.id);
    }
    return;
  }

  // Send to all active subscriptions
  try {
    const playerIds = subscriptions
      .map(s => s.subscription_data?.playerId)
      .filter(Boolean);

    if (playerIds.length === 0) {
      // Fallback to external_user_id
      const response = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${apiKey}`
        },
        body: JSON.stringify({
          app_id: appId,
          include_external_user_ids: [notification.player_id],
          headings: { en: notification.title },
          contents: { en: notification.message },
          data: {
            notification_id: notification.id,
            type: notification.notification_type,
            venue_id: notification.venue_id,
            ...notification.metadata
          }
        })
      });

      const result = await response.json();

      await supabase
        .from('commander_notifications')
        .update({
          status: result.id ? 'sent' : 'failed',
          sent_at: result.id ? new Date().toISOString() : null,
          metadata: {
            ...notification.metadata,
            onesignal_id: result.id,
            error: result.errors?.[0]
          }
        })
        .eq('id', notification.id);
      return;
    }

    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${apiKey}`
      },
      body: JSON.stringify({
        app_id: appId,
        include_player_ids: playerIds,
        headings: { en: notification.title },
        contents: { en: notification.message },
        data: {
          notification_id: notification.id,
          type: notification.notification_type,
          venue_id: notification.venue_id,
          ...notification.metadata
        }
      })
    });

    const result = await response.json();

    await supabase
      .from('commander_notifications')
      .update({
        status: result.id ? 'sent' : 'failed',
        sent_at: result.id ? new Date().toISOString() : null,
        metadata: {
          ...notification.metadata,
          onesignal_id: result.id,
          recipients: result.recipients
        }
      })
      .eq('id', notification.id);
  } catch (error) {
    console.error('OneSignal push error:', error);
    await supabase
      .from('commander_notifications')
      .update({
        status: 'failed',
        metadata: { ...notification.metadata, error: error.message }
      })
      .eq('id', notification.id);
  }
}
