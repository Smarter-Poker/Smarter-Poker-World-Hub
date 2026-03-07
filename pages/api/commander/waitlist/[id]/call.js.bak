/**
 * Commander Call Player API - POST /api/commander/waitlist/:id/call [Staff]
 * Call a player from the waitlist
 * Reference: API_REFERENCE.md - Waitlist section
 */
import { createClient } from '../../../../../src/lib/supabaseServerClient';
import { guardWriteStaff } from '../../../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../../../src/lib/apiRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Twilio SMS Integration
async function sendTwilioSMS(to, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, error: 'Twilio not configured' };
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          To: to,
          From: fromNumber,
          Body: message
        })
      }
    );

    const data = await response.json();
    if (response.ok) {
      return { success: true, sid: data.sid };
    } else {
      console.error('Twilio error:', data);
      return { success: false, error: data.message };
    }
  } catch (error) {
    console.error('Twilio SMS error:', error);
    return { success: false, error: error.message };
  }
}

// OneSignal Push Notification Integration
async function sendOneSignalPush(userId, title, message, data = {}) {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;

  if (!appId || !apiKey) {
    return { success: false, error: 'OneSignal not configured' };
  }

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: appId,
        include_external_user_ids: [userId],
        headings: { en: title },
        contents: { en: message },
        data: data,
        ios_badgeType: 'Increase',
        ios_badgeCount: 1
      })
    });

    const result = await response.json();
    if (response.ok && !result.errors) {
      return { success: true, id: result.id };
    } else {
      console.error('OneSignal error:', result);
      return { success: false, error: result.errors?.[0] || 'Push failed' };
    }
  } catch (error) {
    console.error('OneSignal push error:', error);
    return { success: false, error: error.message };
  }
}

export default async function handler(req, res) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  const _g = await guardWriteStaff(req, res); if (!_g) return;

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
    const staff = _g; // from guardWriteStaff

    const { notify_sms = true, notify_push = true, message } = req.body;

    // Verify entry exists and is waiting
    const { data: entry, error: fetchError } = await supabase
      .from('commander_waitlist')
      .select(`
        *,
        poker_venues (
          id,
          name,
          auto_text_enabled
        )
      `)
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !entry) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Waitlist entry not found' }
      });
    }

    // Verify staff belongs to the same venue as the waitlist entry
    if (staff.venue_id !== entry.venue_id) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Staff is not authorized for this venue' }
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
      .from('commander_waitlist')
      .update({
        status: 'called',
        call_count: (entry.call_count || 0) + 1,
        last_called_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (updateError) {
      console.error('Commander waitlist call update error:', updateError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to update entry' }
      });
    }

    // Send notifications
    const notifications = [];
    const notificationMessage = message ||
      `Your seat is ready at ${entry.poker_venues?.name || 'the venue'} for ${entry.stakes} ${(entry.game_type || '').toUpperCase()}. Please check in within 5 minutes.`;

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

      // SMS notification via Twilio
      if (notify_sms && entry.player_phone && entry.poker_venues?.auto_text_enabled !== false) {
        const { data: smsNotification, error: smsError } = await supabase
          .from('commander_notifications')
          .insert({
            ...notificationData,
            channel: 'sms'
          })
          .select()
          .single();

        if (!smsError) {
          notifications.push(smsNotification);

          // Send SMS via Twilio
          const smsResult = await sendTwilioSMS(entry.player_phone, notificationMessage);

          // Update notification status
          await supabase
            .from('commander_notifications')
            .update({
              status: smsResult.success ? 'sent' : 'failed',
              sent_at: smsResult.success ? new Date().toISOString() : null,
              metadata: {
                ...smsNotification.metadata,
                twilio_sid: smsResult.sid,
                error: smsResult.error
              }
            })
            .eq('id', smsNotification.id);
        }
      }

      // Push notification via OneSignal
      if (notify_push && entry.player_id) {
        const { data: pushNotification, error: pushError } = await supabase
          .from('commander_notifications')
          .insert({
            ...notificationData,
            channel: 'push'
          })
          .select()
          .single();

        if (!pushError) {
          notifications.push(pushNotification);

          // Send push via OneSignal
          const pushResult = await sendOneSignalPush(
            entry.player_id,
            'Seat Available',
            notificationMessage,
            {
              type: 'seat_ready',
              waitlist_id: entry.id,
              venue_id: entry.venue_id,
              game_type: entry.game_type,
              stakes: entry.stakes
            }
          );

          // Update notification status
          await supabase
            .from('commander_notifications')
            .update({
              status: pushResult.success ? 'sent' : 'failed',
              sent_at: pushResult.success ? new Date().toISOString() : null,
              metadata: {
                ...pushNotification.metadata,
                onesignal_id: pushResult.id,
                error: pushResult.error
              }
            })
            .eq('id', pushNotification.id);
        }
      }

      // In-app notification
      if (entry.player_id) {
        const { data: inAppNotification } = await supabase
          .from('commander_notifications')
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
    console.error('Commander waitlist call API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
