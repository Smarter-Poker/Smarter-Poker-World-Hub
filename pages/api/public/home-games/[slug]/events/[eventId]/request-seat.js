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
 *    2. Resolve the eventId → commander_home_games row. Must be in the
 *       same group_id as the page's linked_entity_id, status='scheduled',
 *       and scheduled_date >= today. 404 on any miss.
 *    3. Upsert commander_home_members (group_id, user_id):
 *         - New member  -> status='pending' (host approves later)
 *         - Existing    -> status left alone (could be approved, pending,
 *                          rejected, etc.)
 *    4. Upsert commander_home_rsvps (game_id, user_id):
 *         - response    -> 'yes' if capacity available, else 'waitlist'
 *         - is_confirmed=false  (host must confirm)
 *         - message     -> optional note from body.message (≤500 chars)
 *         - bringing_guests, guest_names honored if event.allow_guests
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
 *    - Upserts on both tables, so retries are safe. A re-POST with the
 *      same body will overwrite the response/message/guest fields and
 *      return the same row.
 */

import { createClient } from '../../../../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../../../../src/lib/apiRateLimit';
import { sendPushNotification } from '../../../../../../../src/lib/commander/pushNotifications';
import { sendDirectMessageBetweenUsers } from '../../../../../../../src/lib/home-games/messenger';
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
    if (page.is_public === false) {
      return res.status(404).json({ success: false, error: 'Home game not found' });
    }

    const groupId = String(page.linked_entity_id);

    // 4. Resolve eventId → scheduled upcoming event in this group
    // Timezone safety: toISOString() is UTC, so from ~5pm local onward in US
    // timezones the UTC date is already tomorrow — an evening seat request for
    // TONIGHT's game would be rejected as "no longer accepting seat requests".
    // Shift 12h west so the cutoff never runs ahead of any US local date; the
    // rsvp_closes_at check below still enforces the host's real deadline.
    const today = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: event, error: eventErr } = await supabase
      .from('commander_home_games')
      .select('id, group_id, host_id, scheduled_date, start_time, status, max_players, rsvp_yes, allow_guests, guest_limit, title, rsvp_closes_at, cancelled_at')
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
    // phase40: state + time-window gate. Public seat requests are only
    // valid for games that are actively scheduled/confirmed, not cancelled,
    // whose scheduled_date is today-or-later, and whose rsvp_closes_at (if
    // set) hasn't elapsed.
    const acceptingStatuses = new Set(['scheduled', 'confirmed']);
    if (!acceptingStatuses.has(event.status) || event.cancelled_at || event.scheduled_date < today) {
      return res.status(400).json({
        success: false,
        error: 'This game is no longer accepting seat requests',
      });
    }
    if (event.rsvp_closes_at && new Date(event.rsvp_closes_at).getTime() <= Date.now()) {
      return res.status(400).json({
        success: false,
        error: 'Seat requests are closed for this event',
      });
    }

    // 4b. Load the group row for host owner_id + display name. We'll need
    //     these for the notification dispatch in step 9. Also cheap to use
    //     `game_type` + `stakes` for a nicer email body.
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
    let bringingGuests = Number.isFinite(Number(body.bringing_guests)) ? Math.max(0, parseInt(body.bringing_guests, 10)) : 0;
    const guestNamesRaw = Array.isArray(body.guest_names) ? body.guest_names : [];
    const guestNames = guestNamesRaw
      .filter((n) => typeof n === 'string')
      .map((n) => n.trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 10);

    // Enforce guest rules
    if (bringingGuests > 0) {
      if (!event.allow_guests) {
        bringingGuests = 0;
      } else if (event.guest_limit && bringingGuests > event.guest_limit) {
        bringingGuests = event.guest_limit;
      }
    }

    // 6. Determine waitlist vs yes based on capacity.
    //    NOTE: this is a read of a denormalized counter, so it is only a first
    //    guess — step 8b re-checks it against the real rows after the write.
    let response = 'yes';
    const spotsNeeded = 1 + bringingGuests;
    const currentYes = Number(event.rsvp_yes || 0);
    if (event.max_players && currentYes + spotsNeeded > event.max_players) {
      response = 'waitlist';
    }

    // 6b. Did this user already hold a confirmed-yes seat before this request?
    //     A re-POST (editing the message, changing guests) must never knock an
    //     existing seat holder onto the waitlist in step 8b just because the
    //     game is already at capacity — they are part of that capacity.
    const { data: priorRsvp } = await supabase
      .from('commander_home_rsvps')
      .select('id, response')
      .eq('game_id', eventId)
      .eq('user_id', user.id)
      .maybeSingle();
    const alreadyHeldSeat = priorRsvp?.response === 'yes';

    // 7. Upsert membership (no-op if the user is already a member,
    //    regardless of status — we don't want to demote an approved
    //    member to pending by accident).
    const { data: existingMember } = await supabase
      .from('commander_home_members')
      .select('id, status, role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle();

    let membership = existingMember;
    if (!existingMember) {
      const { data: newMember, error: memErr } = await supabase
        .from('commander_home_members')
        .insert({
          group_id: groupId,
          user_id: user.id,
          role: 'member',
          status: 'pending',
          joined_at: null,
          notifications_enabled: true,
          notify_announcements: true,
          notify_new_games: true,
          notify_game_reminders: true,
          notify_rsvp_updates: true,
        })
        .select('id, status, role')
        .maybeSingle();
      if (memErr) throw memErr;
      membership = newMember;
    }

    // 8. Upsert the RSVP itself. We DO NOT set is_confirmed=true — the host
    //    must manually approve so the address stays private until they do.
    //    Use ON CONFLICT (game_id, user_id) to keep this idempotent.
    const rsvpPayload = {
      game_id: eventId,
      user_id: user.id,
      response,
      bringing_guests: bringingGuests,
      guest_names: guestNames,
      message: message || null,
      is_confirmed: false,
      updated_at: new Date().toISOString(),
    };

    const { data: rsvp, error: rsvpErr } = await supabase
      .from('commander_home_rsvps')
      .upsert(rsvpPayload, { onConflict: 'game_id,user_id' })
      .select('id, response, is_confirmed, bringing_guests, message, responded_at, updated_at')
      .maybeSingle();

    if (rsvpErr) throw rsvpErr;

    // 8b. Post-write capacity re-check (self-correcting overbooking guard).
    //     Step 6 reads event.rsvp_yes and step 8 writes the row — that is a
    //     non-atomic read-then-write, so two requests racing for the last seat
    //     can both read the same rsvp_yes, both pass the check, and both land on
    //     response='yes', putting the game past max_players. There is no atomic
    //     seat-claim RPC available, so instead of pretending the race can't
    //     happen we detect it after the fact: re-count the actual yes rows (each
    //     row occupies 1 seat + its guests) and, if the game is now over
    //     capacity, demote THIS request to waitlist. Last writer loses, so the
    //     RSVP that got there first keeps its seat, and this caller is told the
    //     truth instead of being promised a seat that doesn't exist.
    if (response === 'yes' && event.max_players && !alreadyHeldSeat) {
      try {
        const { data: yesRows, error: recountErr } = await supabase
          .from('commander_home_rsvps')
          .select('user_id, bringing_guests')
          .eq('game_id', eventId)
          .eq('response', 'yes');
        if (recountErr) throw recountErr;

        const seatsTaken = (yesRows || []).reduce(
          (sum, r) => sum + 1 + Math.max(0, Number(r.bringing_guests) || 0),
          0
        );

        if (seatsTaken > event.max_players) {
          // Only touch our own row, and only while it is still 'yes', so a host
          // action that landed in between isn't clobbered.
          const { data: demoted, error: demoteErr } = await supabase
            .from('commander_home_rsvps')
            .update({ response: 'waitlist', updated_at: new Date().toISOString() })
            .eq('game_id', eventId)
            .eq('user_id', user.id)
            .eq('response', 'yes')
            .select('id');
          if (demoteErr) throw demoteErr;
          if (demoted && demoted.length > 0) response = 'waitlist';
        }
      } catch (capacityErr) {
        // Non-fatal: fall back to the step 6 decision rather than failing the
        // request, but log it — a silent failure here means an overbooked game.
        console.warn('[request-seat] capacity re-check failed:', capacityErr?.message || capacityErr);
      }
    }

    // 9. Fire host notifications (in-app row + email). This block MUST NEVER
    //    cause the main request to fail. We await it so it completes before
    //    the lambda returns (fire-and-forget isn't reliable on Vercel
    //    serverless), but wrap the whole thing in a try/catch.
    try {
      await dispatchHostNotification(supabase, {
        req,
        host_user_id: group.owner_id,
        requester_user_id: user.id,
        group_id: group.id,
        group_name: group.name,
        event,
        rsvp: {
          response,
          bringing_guests: bringingGuests,
          message: message || null,
        },
      });
    } catch (notifyErr) { console.warn('[App] Handled exception:', notifyErr?.message || notifyErr); }

    // 10. Done. The caller gets back enough info to render the confirmation UI.
    //    Do NOT include event.address, host PII, or other members' RSVPs here.
    return res.status(200).json({
      success: true,
      data: {
        rsvp: {
          id: rsvp?.id,
          response,
          is_confirmed: false,
          bringing_guests: bringingGuests,
          message: rsvp?.message || null,
          responded_at: rsvp?.responded_at,
          updated_at: rsvp?.updated_at,
        },
        membership: {
          status: membership?.status || 'pending',
          is_new: !existingMember,
        },
        event: {
          id: event.id,
          title: event.title,
          scheduled_date: event.scheduled_date,
          start_time: event.start_time,
        },
        wait_for_host_approval: !rsvp?.is_confirmed,
      },
    });
  } catch (err) {
    console.warn('[request-seat] error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
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
 *  Dedup: skips ALL THREE surfaces if a notification of the same type was
 *  already written for this (host, event, requester) triple within the last
 *  4 hours. This matters because the Phase 9 endpoint is intentionally
 *  idempotent — a user who edits their message and re-submits shouldn't
 *  spam the host. The in-app row is the dedup anchor; if it exists, the
 *  push + DM were already fired.
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
    : `At ${group_name} — tap to approve.`;

  // ── 1. In-app notification row ────────────────────────────────────────────
  // Only real columns on public.notifications: user_id, type, title, message,
  // data, read, actor_id, link. Adding anything else (metadata / action_url /
  // is_read) fails the whole insert with 42703 — which also destroys the dedup
  // anchor above, since this row IS the anchor.
  try {
    const { error: notifErr } = await supabase.from('notifications').insert({
      user_id: host_user_id,
      type: 'home_game_seat_request',
      title: titleText,
      message: bodyText,
      data: metadata,
      actor_id: requester_user_id,
      link: manageUrl,
      read: false,
    });
    if (notifErr) {
      console.warn('[request-seat] notifications insert failed:', notifErr.message);
    }
  } catch (e) {
    console.warn('[request-seat] notifications insert threw:', e?.message || e);
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
    `${waitlistPrefix}Hi ${hostName} — ${requesterName} here. ` +
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
