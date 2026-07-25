/* ═══════════════════════════════════════════════════════════════════════════
   ONESIGNAL — SEND PUSH NOTIFICATION API
   POST /api/notifications/send
   
   Send push notifications to users via OneSignal.
   Auth: Bearer token required.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';


const ONESIGNAL_APP_ID = (process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || '').trim();
const ONESIGNAL_REST_API_KEY = (process.env.ONESIGNAL_REST_API_KEY || '').trim();

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
          return res.status(500).json({ success: false, error: 'OneSignal not configured' });
      }

      // ── Auth: verify JWT identity OR admin secret (for internal server-to-server calls) ──
      const adminSecret = req.headers['x-admin-secret'];
      const envSecret = process.env.ADMIN_ROUTE_SECRET;
      const hasAdminAuth = envSecret && adminSecret === envSecret;

      if (!hasAdminAuth) {
          // BUG-21 FIX: Use local HMAC JWT validation instead of GoTrue network roundtrip
          const supabaseForAuth = getSupabase();
          const { user } = await getServerUserWithFallback(req, supabaseForAuth);
          if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });

          // BUG #243 FIX: JWT users can only send to specific users (not broadcast to segments)
          const { segments, playerIds, externalUserIds, tags } = req.body;
          if (segments || tags || (playerIds && playerIds.length > 5) || (externalUserIds && externalUserIds.length > 5)) {
              return res.status(403).json({ success: false, error: 'Broadcast notifications require admin access' });
          }
          if (!externalUserIds?.length && !playerIds?.length) {
              return res.status(400).json({ success: false, error: 'Must specify target user(s) for notification' });
          }

          // [2026-07-25] AUTH GAP FIX: previously a JWT caller could push an
          // arbitrary title/message/url to up to 5 ARBITRARY user IDs (spam /
          // phishing vector). A non-admin may now only target THEMSELVES by
          // external_id. playerIds (raw OneSignal device IDs) aren't tied to a
          // user server-side, so non-admins can't use them at all. Call
          // notifications (isCall) legitimately target another user, so they
          // remain allowed but are constrained to a single recipient.
          const isSelfOnly =
              Array.isArray(externalUserIds) &&
              externalUserIds.length === 1 &&
              externalUserIds[0] === user.id;
          const isSingleCall =
              req.body?.isCall === true &&
              Array.isArray(externalUserIds) &&
              externalUserIds.length === 1;
          if (!isSelfOnly && !isSingleCall) {
              return res.status(403).json({
                  success: false,
                  error: 'You can only send notifications to yourself.',
              });
          }
      }

      try {
          const {
              title,
              message,
              url,
              // Target options (use one):
              segments,        // e.g., ['All', 'Active Users']
              playerIds,       // Array of OneSignal player IDs
              externalUserIds, // Array of your database user IDs
              tags,            // Tag filters
              // Optional:
              data,            // Custom data payload
              buttons,         // Action buttons
              image,           // Image URL
              isCall,          // NEW: Is this a call notification?
              callType,        // NEW: 'voice' or 'video'
              roomName,        // NEW: Room to join if accepted
              callerId,        // NEW: Who is calling
              category,        // NEW: 'tournament_reminders' | 'venue_alerts' | etc
          } = req.body;

          if (!message) {
              return res.status(400).json({ success: false, error: 'Message is required' });
          }

          // ── Enforce User Preferences (Opt-Outs) ──
          let finalExternalUserIds = externalUserIds;
          if (category && finalExternalUserIds?.length > 0) {
              const { data: prefs } = await getSupabase()
                  .from('user_notification_preferences')
                  .select(`user_id, ${category}`)
                  .in('user_id', finalExternalUserIds);

              if (prefs) {
                  const optedOutUsers = new Set(
                      prefs.filter(p => p[category] === false).map(p => p.user_id)
                  );
                  finalExternalUserIds = finalExternalUserIds.filter(id => !optedOutUsers.has(id));
                  
                  if (finalExternalUserIds.length === 0) {
                      return res.status(200).json({ 
                          success: true, 
                          message: 'Notification skipped: all target users opted out.', 
                          skipped: true 
                      });
                  }
              }
          }

          // Build notification payload
          const notification = {
              app_id: ONESIGNAL_APP_ID,
              contents: { en: message },
              headings: title ? { en: title } : undefined,
              url: url || undefined,
              web_url: url || undefined,
              chrome_web_link: url || undefined,
              data: data || undefined,
              buttons: buttons || undefined,
              big_picture: image || undefined,
          };

          // 📞 SPECIAL HANDLING FOR CALLS - Make it ring like a real call!
          if (isCall) {
              // Custom data for the call
              notification.data = {
                  ...notification.data,
                  isCall: true,
                  callType: callType || 'voice',
                  roomName: roomName || '',
                  callerId: callerId || '',
              };

              // Android: High priority + ringtone sound + persistent
              notification.priority = 10; // Highest priority
              notification.android_visibility = 1; // Show on lock screen
              notification.android_sound = 'ringtone'; // Use ringtone sound
              notification.android_channel_id = '80694c07-ed3b-4016-9525-083b5f59d812'; // OneSignal "Incoming Calls" channel
              notification.ttl = 120; // Expire after 2 minutes (call timeout)

              // iOS: Critical alert style for calls
              notification.ios_sound = 'ringtone.wav'; // Custom ringtone (if uploaded)
              notification.ios_interruption_level = 'time-sensitive'; // Bypass Do Not Disturb
              notification.ios_relevance_score = 1.0; // Highest relevance

              // Web: Require interaction (don't auto-dismiss)
              notification.web_push_topic = `call-${callerId}`; // Replace previous call notifs
              notification.chrome_web_badge = '/icons/call-badge.png';

              // Action buttons for call
              notification.buttons = [
                  { id: 'accept', text: '✓ Accept', icon: 'ic_call_accept' },
                  { id: 'decline', text: '✗ Decline', icon: 'ic_call_decline' },
              ];
              notification.web_buttons = [
                  { id: 'accept', text: '✓ Accept', url: url || 'https://smarter.poker/hub/messenger' },
                  { id: 'decline', text: '✗ Decline', url: 'https://smarter.poker/hub' },
              ];
          } else {
              // Regular notification settings
              notification.ios_sound = 'default';
              notification.android_sound = 'default';
              notification.android_channel_id = null;
              notification.priority = 10;
              notification.android_visibility = 1;
              notification.ios_badgeType = 'Increase';
              notification.ios_badgeCount = 1;
          }

          // Set targeting
          if (playerIds && playerIds.length > 0) {
              notification.include_player_ids = playerIds;
          } else if (finalExternalUserIds && finalExternalUserIds.length > 0) {
              notification.include_aliases = { external_id: finalExternalUserIds };
              notification.target_channel = 'push';
          } else if (tags) {
              notification.filters = tags;
          } else if (segments && segments.length > 0) {
              notification.included_segments = segments;
          } else {
              notification.included_segments = ['Subscribed Users'];
          }

          // Send to OneSignal API
          const response = await fetch('https://onesignal.com/api/v1/notifications', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
              },
              body: JSON.stringify(notification),
          });

          // [2026-07-25] Removed the unconditional throw that made the
          // detailed error branch below dead code and swallowed OneSignal's
          // actual error body into a generic 500.
          const result = await response.json().catch(() => ({}));

          if (!response.ok) {
              console.warn('OneSignal error:', result);
              return res.status(response.status).json({
                  success: false,
                  error: result.errors?.[0] || `OneSignal request failed (${response.status})`,
                  details: result,
              });
          }


          return res.status(200).json({
              success: true,
              notificationId: result.id,
              recipients: result.recipients,
          });

      } catch (error) {
          console.warn('Send notification error:', error);
          return res.status(500).json({ success: false, error: 'Failed to send notification' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
