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
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData || !authData.user) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
    const user = authData.user;

    // 2. Validate URL params
    const { slug, eventId } = req.query;
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
    if (!page || !page.is_public || page.linked_entity_type !== 'home_group' || !page.linked_entity_id) {
      return res.status(404).json({ success: false, error: 'Home game not found' });
    }

    const groupId = String(page.linked_entity_id);

    // 4. Resolve eventId → scheduled upcoming event in this group
    const today = new Date().toISOString().slice(0, 10);
    const { data: event, error: eventErr } = await supabase
      .from('commander_home_games')
      .select('id, group_id, host_id, scheduled_date, start_time, status, max_players, rsvp_yes, allow_guests, guest_limit, title')
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
    if (event.status !== 'scheduled' || event.scheduled_date < today) {
      return res.status(400).json({
        success: false,
        error: 'This game is no longer accepting seat requests',
      });
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

    // 6. Determine waitlist vs yes based on capacity
    let response = 'yes';
    const spotsNeeded = 1 + bringingGuests;
    const currentYes = Number(event.rsvp_yes || 0);
    if (event.max_players && currentYes + spotsNeeded > event.max_players) {
      response = 'waitlist';
    }

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

    // 9. Done. The caller gets back enough info to render the confirmation UI.
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
    console.error('[request-seat] error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
  }
}
