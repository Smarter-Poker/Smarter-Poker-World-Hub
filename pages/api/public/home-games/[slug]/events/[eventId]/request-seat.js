/**
 * ══════════════════════════════════════════════════════════════════════════
 *  PUBLIC HOME GAMES — REQUEST SEAT
 *  POST /api/public/home-games/[slug]/events/[eventId]/request-seat
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  The missing link between the SEO-indexed public profile and the
 *  commander-gated RSVP system. Let an authenticated visitor who DOES NOT
 *  belong to a home game request a seat on a specific upcoming game, even
 *  if they've never been a member before.
 *
 *  Flow:
 *    1. Resolve the slug → social_page (must be page_type='home_game',
 *       is_public=true). 404 on miss.
 *    2. Resolve the eventId → commander_home_games row in the same group.
 *       The transactional RPC authoritatively checks scheduled/confirmed
 *       state, cancellation, RSVP deadline, start time and publication.
 *    3. Call request_public_home_game_seat with the visitor's JWT. The
 *       database performs membership eligibility, membership creation,
 *       guest clamping, RSVP upsert and capacity placement atomically.
 *       Group owners and event hosts are eligible without a membership row.
 *    4. Consume the RPC's authoritative RSVP response. The capacity trigger
 *       may return 'waitlist' even when the request initially asked for yes.
 *    5. Return the rsvp + membership status so the UI can render
 *       "Waiting for host approval" or "You're on the waitlist".
 *
 *  Privacy:
 *    - Never returns the event's physical address, host PII beyond the
 *      public display_name/avatar_url that's already on the social page.
 *    - Rate-limited under LIMITS.write.
 *    - 401 if no Bearer token. (Anonymous requesters are handled upstream
 *      by a login redirect.)
 *
 *  Idempotency:
 *    - The RPC upserts the RSVP and safely serializes membership/capacity
 *      changes, so retries return the canonical row.
 */

import { createClient } from '../../../../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../../../../src/lib/apiRateLimit';
import { sendPushNotification } from '../../../../../../../src/lib/commander/pushNotifications';
import { sendDirectMessageBetweenUsers } from '../../../../../../../src/lib/home-games/messenger';
import { getUserScopedClient, mapRpcError } from '../../../../../../../src/lib/home-games/rpcBridge';
import { homeGameSeatNotificationId } from '../../../../../../../src/lib/home-games/seatNotificationId.mjs';
import { reportApiError } from '../../../../../../../src/lib/sentryWrap';

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
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, LIMITS.write)) return;

    // 1. Auth
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authorization required' });
    }
    const token = authHeader.replace('Bearer ', '');
    const supabase = getSupabase();
    const { data: authData, error: authErr } = await supabase.auth["getUser"](token);
    if (authErr || !authData || !authData.user) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
    const user = authData.user;

    // 2. Validate URL params
    const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
    const slug = safeQ(req.query.slug);
    const eventId = safeQ(req.query.eventId);
    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ success: false, error: 'slug required' });
    }
    if (!eventId || typeof eventId !== 'string') {
      return res.status(400).json({ success: false, error: 'eventId required' });
    }

    // 3. Resolve slug → public home-game page
    const { data: page, error: pageErr } = await supabase
      .from('social_pages')
      .select('id, linked_entity_id, linked_entity_type, is_public, page_type')
      .eq('slug', slug)
      .eq('page_type', 'home_game')
      .maybeSingle();

    if (pageErr) throw pageErr;
    if (!page || page.linked_entity_type !== 'home_group' || !page.linked_entity_id) {
      return res.status(404).json({ success: false, error: 'Home game not found' });
    }
    // audit F-09: is_public was SELECTed and the docblock promised a gate, but
    // nothing ever checked it — unlisted pages still accepted seat requests,
    // notified the host and inserted pending members. 404 (not 403) so an
    // unlisted page stays indistinguishable from a missing one.
    if (page.is_public !== true) {
      return res.status(404).json({ success: false, error: 'Home game not found' });
    }

    const groupId = String(page.linked_entity_id);

    // 4. Resolve eventId for privacy-safe notification/response context. The
    // RPC below repeats and locks every authorization/state check before any
    // membership or RSVP mutation, so these reads are not a security or
    // capacity decision.
    const { data: event, error: eventErr } = await supabase
      .from('commander_home_games')
      .select('id, group_id, host_id, scheduled_date, start_time, title')
      .eq('id', eventId)
      .maybeSingle();

    if (eventErr) throw eventErr;
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }
    if (String(event.group_id) !== groupId) {
      // The eventId belongs to a different group. Don't leak that fact —
      // just 404 it to prevent cross-group event enumeration.
      return res.status(404).json({ success: false, error: 'Event not found' });
    }
    // 4b. Load the group row for notification dispatch only.
    const { data: group, error: groupErr } = await supabase
      .from('commander_home_groups')
      .select('id, owner_id, name')
      .eq('id', groupId)
      .maybeSingle();
    if (groupErr) throw groupErr;
    if (!group) {
      // Group vanished between Phase 1's trigger and now. Shouldn't happen
      // because the social_page→group link invariant is enforced by
      // ck_home_group_link_is_home_game, but if it does, fail clean.
      return res.status(404).json({ success: false, error: 'Home game not found' });
    }

    // 5. Sanitize body
    const body = req.body || {};
    const message = (typeof body.message === 'string' ? body.message : '').trim().slice(0, 500);
    const bringingGuests = Number.isFinite(Number(body.bringing_guests)) ? Math.max(0, parseInt(body.bringing_guests, 10)) : 0;
    const guestNamesRaw = Array.isArray(body.guest_names) ? body.guest_names : [];
    const guestNames = guestNamesRaw
      .filter((n) => typeof n === 'string')
      .map((n) => n.trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 10);

    // 6. One caller-scoped RPC owns every mutation and the capacity decision.
    // Supplying the bearer JWT is essential: the function requires auth.uid()
    // to equal p_caller_user_id and rejects service-role-only calls.
    const callerSupabase = getUserScopedClient(token);
    const { data: seatResult, error: seatRequestErr } = await callerSupabase.rpc(
      'request_public_home_game_seat',
      {
        p_group_id: groupId,
        p_game_id: eventId,
        p_caller_user_id: user.id,
        p_bringing_guests: bringingGuests,
        p_guest_names: guestNames,
        p_message: message || null,
      }
    );

    if (seatRequestErr) {
      const mapped = mapRpcError(seatRequestErr);
      return res.status(mapped.status).json({
        success: false,
        code: mapped.error,
        error: mapped.message,
      });
    }
    if (!seatResult?.success || !seatResult?.rsvp || !seatResult?.membership) {
      throw new Error('INVALID_SEAT_REQUEST_RESPONSE');
    }

    const rsvp = seatResult.rsvp;
    const membership = seatResult.membership;

    // 7. Fire host notifications (in-app row, push and direct message). This
    //    block MUST NEVER
    //    cause the main request to fail. We await it so it completes before
    //    the lambda returns (fire-and-forget isn't reliable on Vercel
    //    serverless), but wrap the whole thing in a try/catch.
    try {
      // The group owner owns membership approval; a separately designated
      // event host owns game/RSVP operations. Notify both authorized actors,
      // de-duplicating the common case where they are the same user. Never
      // fan this private requester payload out to the broader member roster.
      const notificationRecipients = [...new Set(
        [group.owner_id, event.host_id].filter(Boolean).map(String)
      )];
      await Promise.all(notificationRecipients.map((recipientUserId) => (
        dispatchHostNotification(supabase, {
          req,
          host_user_id: recipientUserId,
          requester_user_id: user.id,
          group_id: group.id,
          group_name: group.name,
          event,
          rsvp: {
            response: rsvp.response,
            bringing_guests: rsvp.bringing_guests,
            message: rsvp.message,
          },
        })
      )));
    } catch (notifyErr) { console.warn('[App] Handled exception:', notifyErr?.message || notifyErr); }

    // 8. Done. The caller gets back enough info to render the confirmation UI.
    //    Do NOT include event.address, host PII, or other members' RSVPs here.
    return res.status(200).json({
      success: true,
      data: {
        rsvp,
        membership,
        event: {
          id: event.id,
          title: event.title,
          scheduled_date: event.scheduled_date,
          start_time: event.start_time,
        },
        wait_for_host_approval: seatResult.wait_for_host_approval === true,
      },
    });
  } catch (err) {
    console.warn('[request-seat] error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * ── dispatchHostNotification ────────────────────────────────────────────────
 *  Notify the host that a public user requested a seat. THREE surfaces:
 *    1. Row in public.notifications (in-app bell)
 *    2. OneSignal push (mobile + desktop push banners)
 *    3. Internal messenger DM — requester opens/reuses a 1:1 thread with
 *       the host and posts the seat-request content. Host can reply
 *       directly in the platform messenger.
 *
 *  NO EMAIL. All communication stays inside the platform per product
 *  decision. Email was the dispatch in v1 of this file; Phase 12 replaced
 *  it with push + DM so the home-games funnel stays in-app end-to-end.
 *
 *  Dedup: one deterministic notification UUID claims this exact recipient,
 *  event, and requester tuple. The notifications primary key makes the claim
 *  atomic across concurrent serverless instances. A four-hour lookup remains
 *  only for compatibility with notification rows created before stable IDs.
 *
 *  The helper never throws — the caller wraps it in try/catch for good
 *  measure, but everything inside is swallowed-and-logged.
 * ───────────────────────────────────────────────────────────────────────────
 */
async function dispatchHostNotification(supabase, ctx) {
  const {
    req,
    host_user_id,
    requester_user_id,
    group_id,
    group_name,
    event,
    rsvp,
  } = ctx;

  if (!host_user_id || host_user_id === requester_user_id) {
    // No host (shouldn't happen — owner_id is NOT NULL) OR the host is
    // requesting a seat at their own game (weird edge case). Skip silently.
    return;
  }

  // ── Dedup window ──────────────────────────────────────────────────────────
  // Anchor on the in-app notification row — if one exists for this triple
  // in the last 4 hours, all three surfaces were already fired and we
  // skip the whole dispatch.
  //
  // Filters on the `data` JSONB column — the canonical payload column on
  // public.notifications. Filtering a column that doesn't exist makes
  // PostgREST 42703 the query, leaving `recent` null and disabling dedup
  // entirely, so the error is logged rather than swallowed.
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  try {
    const { data: recent, error: dedupQueryErr } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', host_user_id)
      .eq('type', 'home_game_seat_request')
      .gte('created_at', fourHoursAgo)
      .filter('data->>game_id', 'eq', String(event.id))
      .filter('data->>requester_id', 'eq', String(requester_user_id))
      .limit(1);
    if (dedupQueryErr) console.warn('[request-seat] dedup lookup failed:', dedupQueryErr.message);
    if (recent && recent.length > 0) return;
  } catch (dedupErr) { console.warn('[App] Handled exception:', dedupErr?.message || dedupErr); }

  // ── Resolve profile display names ────────────────────────────────────────
  const [hostProfileRes, requesterProfileRes] = await Promise.allSettled([
    supabase.from('profiles').select('id, display_name, full_name, first_name, username').eq('id', host_user_id).maybeSingle(),
    supabase.from('profiles').select('id, display_name, full_name, first_name, username').eq('id', requester_user_id).maybeSingle(),
  ]);
  const pickName = (p) => (p?.display_name || p?.full_name || p?.first_name || p?.username || null);
  const hostProfile = hostProfileRes.status === 'fulfilled' ? hostProfileRes.value?.data : null;
  const requesterProfile = requesterProfileRes.status === 'fulfilled' ? requesterProfileRes.value?.data : null;
  const hostName = pickName(hostProfile) || 'Host';
  const requesterName = pickName(requesterProfile) || 'Someone';

  const manageUrl = `https://smarter.poker/hub/commander/home-games/${encodeURIComponent(group_id)}/manage`;

  // ── Assemble one metadata object used by all surfaces ────────────────────
  const metadata = {
    game_id: String(event.id),
    group_id: String(group_id),
    group_name,
    event_title: event.title || null,
    scheduled_date: event.scheduled_date,
    start_time: event.start_time || null,
    requester_id: String(requester_user_id),
    requester_name: requesterName,
    rsvp_response: rsvp.response,
    bringing_guests: rsvp.bringing_guests || 0,
    message: rsvp.message || null,
  };

  const isWaitlist = rsvp.response === 'waitlist';
  const titleText = isWaitlist
    ? `New waitlist request from ${requesterName}`
    : `New seat request from ${requesterName}`;
  const bodyText = rsvp.message
    ? `"${String(rsvp.message).slice(0, 140)}${rsvp.message.length > 140 ? '…' : ''}"`
    : `At ${group_name} - tap to approve.`;

  // ── 1. In-app notification row and dispatch claim ─────────────────────────
  // Only real columns on public.notifications: user_id, type, title, message,
  // data, read, actor_id, link. Adding anything else (metadata / action_url /
  // is_read) fails the whole insert with 42703 — which also destroys the dedup
  // anchor above, since this row IS the anchor.
  const notificationId = homeGameSeatNotificationId({
    hostUserId: host_user_id,
    eventId: event.id,
    requesterUserId: requester_user_id,
  });
  try {
    const { error: notifErr } = await supabase.from('notifications').insert({
      id: notificationId,
      user_id: host_user_id,
      // _push:'inline' stops the DB mirror trigger double-pushing this row;
      // the explicit sendPushNotification() below owns delivery.
      type: 'home_game_seat_request',
      title: titleText,
      message: bodyText,
      data: { ...(metadata || {}), _push: 'inline' },
      actor_id: requester_user_id,
      link: manageUrl,
      read: false,
    });
    if (notifErr) {
      // A competing request won the primary-key claim and owns every outward
      // side effect. Returning here is what makes push and DM at-most-once.
      if (notifErr.code === '23505') return;
      console.warn('[request-seat] notifications insert failed:', notifErr.message);
      return;
    }
  } catch (e) {
    console.warn('[request-seat] notifications insert threw:', e?.message || e);
    return;
  }

  // ── 2. OneSignal push to the host's registered devices ───────────────────
  // Uses externalUserIds so the caller doesn't need to look up OneSignal
  // player IDs — the OneSignal SDK registers each user with their Supabase
  // UUID as external_user_id. If the host has no devices registered, this
  // is a soft no-op.
  try {
    await sendPushNotification({
      externalUserIds: [host_user_id],
      title: titleText,
      message: bodyText,
      url: manageUrl,
      data: {
        ...metadata,
        notification_type: 'home_game_seat_request',
      },
    });
  } catch (e) {
    console.warn('[request-seat] push dispatch threw:', e?.message || e);
  }

  // ── 3. Internal messenger DM from requester -> host ──────────────────────
  // The requester opens (or reuses) a 1:1 conversation with the host and
  // sends a message carrying their seat request. The host sees it in their
  // inbox and can reply directly in-platform.
  const dateStr = event.scheduled_date || '';
  const timeStr = event.start_time ? ` at ${String(event.start_time).slice(0, 5)}` : '';
  const eventLabel = event.title ? `"${event.title}"` : `your game on ${dateStr}${timeStr}`;
  const guestsSuffix = Number(rsvp.bringing_guests) > 0 ? ` (bringing +${rsvp.bringing_guests})` : '';
  const waitlistPrefix = isWaitlist ? '[waitlist] ' : '';
  const messageNote = rsvp.message ? `\n\n${rsvp.message}` : '';

  const dmContent =
    `${waitlistPrefix}Hi ${hostName} - ${requesterName} here. ` +
    `I'd love a seat at ${eventLabel}${guestsSuffix}. ` +
    `Requested via your public home-game page.` +
    messageNote +
    `\n\nApprove here: ${manageUrl}`;

  try {
    await sendDirectMessageBetweenUsers(supabase, {
      fromUserId: requester_user_id,
      toUserId: host_user_id,
      content: dmContent,
      messageType: 'text',
    });
  } catch (e) {
      try { reportApiError(e, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[request-seat] DM dispatch threw:', e?.message || e);
  }
}
