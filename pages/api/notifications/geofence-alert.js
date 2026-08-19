/**
 * /api/notifications/geofence-alert.js
 *
 * Server-side endpoint that sends a targeted Web Push notification
 * when a user enters a geofence zone near a poker venue.
 *
 * POST body: { userId, venueId, venueName, venueType }
 * Response:  { success, messageId?, error? }
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { sendPushNotification } from '../../../src/lib/onesignal-server';
import { isPushConfigured } from '../../../src/lib/push/web-push';
import { reportApiError } from '../../../src/lib/sentryWrap';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.


// PUSH MIGRATION 2026-08-19: OneSignal removed. Delivery is self-hosted VAPID
// Web Push; the config gate below now checks the VAPID keys instead.

// Rate-limit map: userId:venueId -> timestamp (in-memory, per-instance)
const rateLimitMap = new Map();
const RATE_LIMIT_MS = 4 * 60 * 60 * 1000; // 4 hours


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
      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const { userId, venueId, venueName, venueType } = req.body;

      if (!userId || !venueId || !venueName) {
          return res.status(400).json({ success: false, error: 'Missing required fields: userId, venueId, venueName' });
      }

      // BUG-30 FIX: Use local HMAC JWT validation instead of GoTrue network roundtrip
      const { user } = await getServerUserWithFallback(req, getSupabase());
      if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });
      if (user.id !== userId) {
          return res.status(403).json({ success: false, error: 'Cannot send geofence alerts for other users' });
      }

      if (!isPushConfigured()) {
          return res.status(503).json({ success: false, error: 'Push notifications not configured' });
      }

      // Server-side rate limit
      const rateLimitKey = `${userId}:${venueId}`;
      const lastSent = rateLimitMap.get(rateLimitKey);
      if (lastSent && Date.now() - lastSent < RATE_LIMIT_MS) {
          return res.status(429).json({ success: false, error: 'Rate limited — already notified for this venue recently' });
      }

      try {
          // Emoji based on venue type
          const venueEmoji = {
              casino: '🎲',
              card_room: '♠️',
              poker_club: '🃏',
              charity: '🎗️',
          }[venueType] || '📍';

          const pushResult = await sendPushNotification({
              externalIds: [userId],
              heading: `${venueEmoji} Poker Venue Nearby`,
              content: `You're near ${venueName}! Tap to log a session.`,
              url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker'}/hub/bankroll-manager?venue=${venueId}`,
              collapseId: `geofence-${venueId}`,
              data: {
                  type: 'geofence_alert',
                  venueId,
                  venueName,
                  venueType,
                  timestamp: new Date().toISOString(),
              },
              options: {
                  ttl: 3600,
                  small_icon: 'ic_stat_notification',
                  chrome_web_icon: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker'}/icons/icon-192.png`,
                  ios_badgeType: 'Increase',
                  ios_badgeCount: 1,
                  android_channel_id: process.env.ONESIGNAL_GEOFENCE_CHANNEL_ID || undefined
              }
          });

          if (pushResult.success) {
              // Success — update rate limit
              rateLimitMap.set(rateLimitKey, Date.now());

              // Prune old rate limit entries tightly to prevent memory leak
              if (rateLimitMap.size > 2000) {
                  const now = Date.now();
                  for (const [key, ts] of rateLimitMap.entries()) {
                      if (now - ts > RATE_LIMIT_MS) {
                          rateLimitMap.delete(key);
                      }
                  }
                  // Failsafe clear if still huge
                  if (rateLimitMap.size > 5000) rateLimitMap.clear();
              }

              return res.status(200).json({ success: true, messageId: pushResult.result.id });
          }

          console.warn('[GeofenceAlert] push error:', pushResult.error);
          return res.status(500).json({ success: false, error: pushResult.error || 'Push failed' });
      } catch (err) {
          console.warn('[GeofenceAlert] Server error:', err);
          return res.status(500).json({ success: false, error: err.message });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
