/* ═══════════════════════════════════════════════════════════════════════════
   SEND PUSH NOTIFICATION API
   POST /api/notifications/send

   REWIRED 2026-08-19: OneSignal removed, now delivers over self-hosted VAPID
   Web Push (src/lib/push/*). The REQUEST AND RESPONSE CONTRACT IS UNCHANGED so
   that all ~20 existing callers across club-arena, social, horses and messenger
   keep working without edits.

   What changed underneath:
     - `externalUserIds` are Supabase user ids and are now the ONLY targeting
       mode that works. They map straight onto push_subscriptions.user_id.
     - `playerIds` (raw OneSignal device ids) are DEAD. They identified devices
       inside OneSignal's system, which no longer exists for us. Requests using
       them are rejected with a clear error rather than silently doing nothing.
     - `segments` / `tags` broadcast targeting is gone. Broadcasts must resolve
       to a concrete recipient list before calling this route.

   Auth: Bearer token, or x-admin-secret for internal server-to-server calls.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { enqueuePush } from '../../../src/lib/push/push-enqueue';
import { isPushConfigured } from '../../../src/lib/push/web-push';
import { LEGACY_PREF_COLUMNS } from '../../../src/lib/push/push-prefs';

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
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

      if (!isPushConfigured()) {
          return res.status(503).json({ success: false, error: 'Push is not configured (VAPID keys missing)' });
      }

      // ── Auth: verify JWT identity OR admin secret (internal server-to-server) ──
      const adminSecret = req.headers['x-admin-secret'];
      const envSecret = process.env.ADMIN_ROUTE_SECRET;
      const hasAdminAuth = envSecret && adminSecret === envSecret;

      if (!hasAdminAuth) {
          const supabaseForAuth = getSupabase();
          const { user } = await getServerUserWithFallback(req, supabaseForAuth);
          if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });

          // A JWT caller may not broadcast.
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
          // external_id. Call notifications (isCall) legitimately target another
          // user, so they remain allowed but are constrained to one recipient.
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
              segments,        // DEAD -- broadcast segments are not supported
              playerIds,       // DEAD -- OneSignal device ids
              externalUserIds, // Supabase user ids. The only working target.
              tags,            // DEAD
              data,
              image,
              isCall,
              callType,
              roomName,
              callerId,
              category,        // user_notification_preferences column to honour
              event,           // optional PushTypeKey override for the gate
          } = req.body;

          if (!message) {
              return res.status(400).json({ success: false, error: 'Message is required' });
          }

          if ((!externalUserIds || externalUserIds.length === 0)) {
              if (playerIds?.length) {
                  return res.status(400).json({
                      success: false,
                      error: 'playerIds are no longer supported. OneSignal was removed on 2026-08-19 -- pass externalUserIds (Supabase user ids) instead.',
                  });
              }
              if (segments?.length || tags) {
                  return res.status(400).json({
                      success: false,
                      error: 'Segment and tag broadcasts are no longer supported. Resolve the audience to externalUserIds first.',
                  });
              }
              return res.status(400).json({ success: false, error: 'externalUserIds is required' });
          }

          const supabase = getSupabase();

          // ── Enforce per-category opt-outs (user_notification_preferences) ──
          //
          // `category` is raw request input interpolated into a PostgREST select.
          // Two problems, both fixed here:
          //
          //   1. An unknown column made PostgREST return 400. The error was
          //      DISCARDED, `prefs` came back null, `if (prefs)` was false, and
          //      the whole opt-out check was SKIPPED -- so a user who had turned
          //      that category off was pushed anyway. A silent consent bypass
          //      triggered by nothing more than a typo in the caller.
          //   2. Interpolating unvalidated input into a select list is a
          //      column-injection primitive. Allowlisting removes it entirely.
          let finalUserIds = Array.from(new Set(externalUserIds.filter(Boolean)));
          if (category && finalUserIds.length > 0) {
              if (!LEGACY_PREF_COLUMNS.includes(category)) {
                  return res.status(400).json({
                      success: false,
                      error: `Unknown notification category: ${category}`,
                  });
              }

              const { data: prefs, error: prefsErr } = await supabase
                  .from('user_notification_preferences')
                  .select(`user_id, ${category}`)
                  .in('user_id', finalUserIds);

              // Fail CLOSED on a read failure. Sending to everyone because we
              // could not read their preferences is the wrong default when the
              // question is "did this person ask us not to contact them".
              if (prefsErr) {
                  console.warn('[notifications/send] preference read failed:', prefsErr.message);
                  return res.status(503).json({
                      success: false,
                      error: 'Could not verify notification preferences; nothing was sent.',
                  });
              }

              const optedOut = new Set(
                  (prefs || []).filter((p) => p[category] === false).map((p) => p.user_id)
              );
              finalUserIds = finalUserIds.filter((id) => !optedOut.has(id));
              if (finalUserIds.length === 0) {
                  return res.status(200).json({
                      success: true,
                      message: 'Notification skipped: all target users opted out.',
                      skipped: true,
                  });
              }
          }

          // ── Call notifications ring differently ──
          // requireInteraction keeps the banner on screen instead of
          // auto-dismissing after a few seconds, and the accept/decline actions
          // are handled by the notificationclick listener in worker/index.js.
          const callPayload = isCall
              ? {
                    requireInteraction: true,
                    tag: `call-${callerId || 'unknown'}`,
                    actions: [
                        { action: 'accept', title: 'Accept' },
                        { action: 'decline', title: 'Decline' },
                    ],
                }
              : {};

          const results = await Promise.all(
              finalUserIds.map((userId) =>
                  enqueuePush(supabase, {
                      userId,
                      title: title || 'Smarter Poker',
                      body: message,
                      url: url || '/hub',
                      event: event || (isCall ? 'incoming_call' : (category || null)),
                      icon: image || undefined,
                      relatedEntityId: null,
                      ...callPayload,
                  })
              )
          );

          const delivered = results.filter((r) => r.sent).length;
          const queued = results.filter((r) => !r.sent && !r.skipped).length;
          const skipped = results.filter((r) => r.skipped).length;

          return res.status(200).json({
              success: true,
              recipients: delivered,
              delivered,
              queued,
              skipped,
              // Kept for callers that logged result.notificationId under OneSignal.
              notificationId: results.find((r) => r.outboxId)?.outboxId || null,
              callMeta: isCall ? { callType: callType || 'voice', roomName: roomName || '', callerId: callerId || '' } : undefined,
              extraData: data || undefined,
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
