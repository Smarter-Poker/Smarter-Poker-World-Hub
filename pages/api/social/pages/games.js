/**
 * Club Live Games API
 *
 * GET    /api/social/pages/games?page_id=xxx           - List games for a page
 * GET    /api/social/pages/games?game_id=xxx            - Get single game with seats
 * POST   /api/social/pages/games                        - Create a live game (owner only)
 * PUT    /api/social/pages/games                        - Update game status/details
 * DELETE /api/social/pages/games?id=xxx&owner_id=xxx    - Delete a game
 *
 * POST   /api/social/pages/games (action=take_seat)     - Reserve a seat
 * POST   /api/social/pages/games (action=join_waitlist) - Join waitlist
 * POST   /api/social/pages/games (action=leave)         - Leave seat/waitlist
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { requireAuth } from '../../../../src/lib/auth-middleware';
import { reportApiError } from '../../../../src/lib/sentryWrap';

import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;


let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// PII: the GET branch of this endpoint is PUBLICLY READABLE — requireAuth is only
// applied to POST/PUT/PATCH/DELETE — and it queries with the service role, so RLS
// does not apply. On the Commander-bridged path the player names come from the
// VENUE'S MEMBER RECORDS (commander_table_sessions / commander_dealer_rotations),
// which the player never consented to publish. Redact them to "First L." here,
// server-side, so the full name never enters the JSON payload. Format matches the
// public TV display endpoint (smarter-poker-commander pages/api/displays/[deviceId]/
// content.js, 2026-07-25) so both public surfaces agree.
// The club_game_seats path is deliberately left alone: those names are self-entered
// by the player into the social page to reserve a seat, and are consented for it.
function redactName(name) {
  if (!name || typeof name !== 'string' || !name.trim()) return 'Player';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (!supabaseUrl || !supabaseServiceKey) {
          return res.status(500).json({ success: false, error: 'Server configuration error' });
      }

      // ===== GET =====
      if (req.method === 'GET') {
          // Live game lists are safe to cache 30s at the CDN edge.
          // Seat count changes are reflected via optimistic UI; CDN handles the background pull.
          res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
          const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
          const page_id = safeQ(req.query.page_id);
          const game_id = safeQ(req.query.game_id);

          if (game_id) {
              // Single game with all seats
              const { data: game, error: gErr } = await getSupabase()
                  .from('club_live_games').select('*').eq('id', game_id).maybeSingle();
              if (gErr || !game) return res.status(404).json({ success: false, error: 'Game not found' });

              const { data: seats } = await getSupabase()
                  .from('club_game_seats').select('*').eq('game_id', game_id)
                  .order('seat_number', { ascending: true, nullsFirst: false });

              return res.status(200).json({ success: true, data: { ...game, seats: seats || [] } });
          }

          if (page_id) {
              // All games for a page (open + running)
              const { data: games, error } = await getSupabase()
                  .from('club_live_games').select('*')
                  .eq('page_id', page_id)
                  .in('status', ['open', 'running'])
                  .order('created_at', { ascending: false })
                      .limit(100);

              if (error) return res.status(500).json({ success: false, error: 'Internal server error' });

              // Fetch all seats for these games
              const gameIds = (games || []).map(g => g.id);
              let allSeats = [];
              if (gameIds.length > 0) {
                  const { data: seatData } = await getSupabase()
                      .from('club_game_seats').select('*').in('game_id', gameIds)
                      .order('seat_number', { ascending: true, nullsFirst: false })
                          .limit(100);
                  allSeats = seatData || [];
              }

              // Enrich social seats with profile pictures
              const socialPlayerIds = allSeats.map(s => s.player_id).filter(Boolean);
              let socialProfilePicMap = {};
              if (socialPlayerIds.length > 0) {
                  try {
                      const { data: profiles } = await getSupabase()
                          .from('profiles')
                          .select('id, avatar_url')
                          .in('id', socialPlayerIds)
                              .limit(100);
                      (profiles || []).forEach(p => { socialProfilePicMap[p.id] = p.avatar_url; });
                  } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
              }

              const enriched = (games || []).map(g => ({
                  ...g,
                  seats: allSeats.filter(s => s.game_id === g.id).map(s => ({
                      ...s,
                      avatar_url: s.player_id ? (socialProfilePicMap[s.player_id] || null) : null,
                  })),
                  seated_count: allSeats.filter(s => s.game_id === g.id && s.status !== 'waitlist').length,
                  waitlist_count: allSeats.filter(s => s.game_id === g.id && s.status === 'waitlist').length,
              }));

              // If no club_live_games, bridge from Commander games via linked_venue_id
              if (enriched.length === 0) {
                  const { data: pageData } = await getSupabase()
                      .from('social_pages')
                      .select('linked_venue_id, metadata')
                      .eq('id', page_id)
                      .maybeSingle();

                  const rawVenueId = pageData?.linked_venue_id || pageData?.metadata?.linked_venue_id;
                  const venueId = rawVenueId ? parseInt(rawVenueId, 10) : null;
                  if (venueId && !isNaN(venueId)) {
                      // The live floor lives in commander_tables + commander_table_sessions.
                      // The legacy commander_games / commander_seats pair has had no activity
                      // since 2026-02-28, so filtering it on status IN ('running','waiting')
                      // matched nothing and this tab rendered "No Live Games Right Now" while
                      // the floor was running. Source-of-truth queries, status filters and the
                      // cash/tournament split below mirror Commander's own floor code
                      // (smarter-poker-commander pages/commander/table-tablets.js and
                      // pages/api/dealer/sessions-batch.js).
                      const { data: cmdTables } = await getSupabase()
                          .from('commander_tables')
                          .select('id, venue_id, table_number, table_name, max_seats, status, mode, table_purpose, game_type, stakes, tournament_id')
                          .eq('venue_id', venueId)
                          .eq('status', 'in_use')
                          .order('table_number', { ascending: true })
                              .limit(100);

                      // Cash floor only — tournaments have their own Schedule tab. Mirrors
                      // isTournamentTable() in table-tablets.js, widened with the table_purpose
                      // test used by sessions-batch.js so a tournament table is never mistaken
                      // for a cash game on a public surface.
                      const isTournamentTable = (t) => (
                          (t.mode || t.table_purpose || 'cash') === 'tournament'
                          || t.table_purpose === 'tournament'
                      );
                      const cashTables = (cmdTables || []).filter(t => !isTournamentTable(t));

                      if (cashTables.length > 0) {
                          const tableNumbers = cashTables
                              .map(t => t.table_number)
                              .filter(n => n !== null && n !== undefined);

                          // Seat occupancy is derived from live sessions: the denormalised
                          // commander_tables.occupied_seats / .player_count counters are not
                          // maintained (they read zero across the whole floor).
                          let allSessions = [];
                          if (tableNumbers.length > 0) {
                              try {
                                  const { data: sessions } = await getSupabase()
                                      .from('commander_table_sessions')
                                      .select('id, table_number, seat_number, player_name, started_at, status, time_allocated_minutes, time_added_minutes')
                                      .eq('venue_id', venueId)
                                      .in('table_number', tableNumbers)
                                      .in('status', ['active', 'paused', 'meal_break'])
                                      .order('seat_number', { ascending: true })
                                          .limit(500);
                                  allSessions = sessions || [];
                              } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                          }

                          // Fetch venue type for timer mode
                          let venueType = 'texas';
                          try {
                              const { data: venueSettings } = await getSupabase()
                                  .from('commander_venue_settings')
                                  .select('venue_type')
                                  .eq('venue_id', venueId)
                                  .maybeSingle();
                              if (venueSettings?.venue_type) venueType = venueSettings.venue_type;
                          } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

                          // Active dealer rotations, keyed by table_number (most recent wins),
                          // matching the rotation lookup in Commander's tablet-data endpoint.
                          //
                          // Do NOT PostgREST-embed commander_dealers here. There is no foreign
                          // key from commander_dealer_rotations.dealer_id to commander_dealers.id
                          // (the table's only FKs are table_id and venue_id), so an embedded
                          // select fails the WHOLE query with PGRST200 and returns null data.
                          // That silently left this map empty and made dealer_name null on every
                          // game. dealer_name is stored inline on the rotation row, so no join is
                          // needed. The error is surfaced rather than swallowed so a future
                          // schema drift here fails loudly instead of blanking the dealer.
                          let dealerRotationMap = {};
                          if (tableNumbers.length > 0) {
                              try {
                                  const { data: rotations, error: rotErr } = await getSupabase()
                                      .from('commander_dealer_rotations')
                                      .select('table_number, dealer_name, started_at')
                                      .eq('venue_id', venueId)
                                      .in('table_number', tableNumbers)
                                      .is('ended_at', null)
                                      .order('started_at', { ascending: false })
                                          .limit(500);
                                  if (rotErr) console.warn('[games] dealer rotation lookup failed:', rotErr.message);
                                  (rotations || []).forEach(r => {
                                      const name = r.dealer_name || null;
                                      if (name && r.table_number !== null && r.table_number !== undefined
                                          && dealerRotationMap[r.table_number] === undefined) {
                                          dealerRotationMap[r.table_number] = name;
                                      }
                                  });
                              } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                          }

                          const now = new Date();

                          const mapped = cashTables.map(t => {
                              const tableSessions = allSessions.filter(s => s.table_number === t.table_number);

                              // Dealer for this table.
                              // PII: venue STAFF, not a player — redacted on the same grounds as
                              // the seat names below. This endpoint is public, so publishing a
                              // dealer's full legal name against a specific table would disclose
                              // an identifiable person's real-time physical location and shift
                              // pattern. null is preserved deliberately — the clients render
                              // `dealer_name || 'No Dealer'`, so an absent dealer must stay null
                              // rather than becoming redactName()'s empty-input fallback.
                              const rawDealerName = dealerRotationMap[t.table_number] || null;
                              const dealerName = (rawDealerName && rawDealerName.trim())
                                  ? redactName(rawDealerName)
                                  : null;

                              const mappedSessions = tableSessions.map(s => {
                                  const totalAllocatedSeconds = ((s.time_allocated_minutes || 0) + (s.time_added_minutes || 0)) * 60;
                                  const elapsedSeconds = Math.floor((now - new Date(s.started_at)) / 1000);
                                  const timeRemaining = Math.max(0, totalAllocatedSeconds - elapsedSeconds);
                                  return {
                                      seat_number: s.seat_number,
                                      // PII: venue member record — redacted for this public endpoint
                                      player_name: redactName(s.player_name),
                                      started_at: s.started_at,
                                      time_allocated_minutes: s.time_allocated_minutes || 0,
                                      time_added_minutes: s.time_added_minutes || 0,
                                      time_remaining: timeRemaining,
                                      elapsed_seconds: elapsedSeconds,
                                      is_low: timeRemaining <= 900 && timeRemaining > 0,
                                      is_critical: timeRemaining <= 300 && timeRemaining > 0,
                                      is_expired: totalAllocatedSeconds > 0 && timeRemaining <= 0,
                                  };
                              });

                              // Each live session is one occupied seat. player_id and avatar_url
                              // stay null: a session carries member_id, which is a
                              // commander_members row (venue membership), not a Smarter.Poker
                              // profiles id, so there is no linked account photo to resolve.
                              const mappedSeats = tableSessions
                                  .filter(s => s.seat_number !== null && s.seat_number !== undefined)
                                  .map(s => ({
                                      id: s.id,
                                      game_id: t.id,
                                      seat_number: s.seat_number,
                                      // PII: venue member record — redacted for this public endpoint
                                      player_name: s.player_name ? redactName(s.player_name) : null,
                                      player_id: null,
                                      avatar_url: null,
                                      status: 'reserved',
                                  }));

                              // No started_at on the table itself; use the earliest live session.
                              const startedAt = tableSessions.reduce((earliest, s) => {
                                  if (!s.started_at) return earliest;
                                  return (!earliest || s.started_at < earliest) ? s.started_at : earliest;
                              }, null);

                              const tableName = t.table_name || `Table ${t.table_number}`;

                              return {
                                  id: t.id,
                                  game_name: `${(t.game_type || 'NLH').toUpperCase()} ${t.stakes || ''}`.trim(),
                                  game_type: t.game_type || 'NLH',
                                  stakes: t.stakes || '',
                                  max_seats: t.max_seats || 9,
                                  status: 'running',
                                  started_at: startedAt,
                                  source: 'commander',
                                  table_number: tableName,
                                  seats: mappedSeats,
                                  seated_count: mappedSeats.length,
                                  waitlist_count: 0,
                                  dealer_name: dealerName,
                                  venue_type: venueType,
                                  sessions: mappedSessions,
                              };
                          });
                          return res.status(200).json({ success: true, data: mapped, source: 'commander', venue_id: venueId });
                      }
                  }
              }

              return res.status(200).json({ success: true, data: enriched });
          }

          return res.status(400).json({ success: false, error: 'page_id or game_id required' });
      }

      // ===== POST =====
      if (req.method === 'POST') {
          // Require JWT auth for all game write operations
          const authUser = await requireAuth(req, res);
          if (!authUser) return;
          const verified_user_id = authUser.id;

          const { action } = req.body;

          // === SEAT ACTIONS ===
          // Helper: check follow status before allowing seat/waitlist actions
          const checkFollowStatus = async (game_id, player_id) => {
              if (!player_id) return { allowed: false, reason: 'You must be logged in to join a game' };
              // Get the page_id for this game
              const { data: game } = await getSupabase()
                  .from('club_live_games').select('page_id').eq('id', game_id).maybeSingle();
              if (!game) return { allowed: false, reason: 'Game not found' };
              // Check if player follows the page
              const { data: follow } = await getSupabase()
                  .from('social_page_followers')
                  .select('status')
                  .eq('page_id', game.page_id).eq('user_id', player_id)
                  .maybeSingle();
              if (!follow) return { allowed: false, reason: 'You must follow this page to join a game', code: 'NOT_FOLLOWING' };
              if (follow.status === 'pending') return { allowed: false, reason: 'Your follow request is pending approval', code: 'PENDING_APPROVAL' };
              return { allowed: true };
          };

          if (action === 'take_seat') {
              const { game_id, seat_number, player_name } = req.body;
              const player_id = verified_user_id;
              if (!game_id || !seat_number || !player_name) {
                  return res.status(400).json({ success: false, error: 'game_id, seat_number, and player_name required' });
              }

              // Follow-gate: must be an approved follower
              const followCheck = await checkFollowStatus(game_id, player_id);
              if (!followCheck.allowed) {
                  return res.status(403).json({ success: false, error: followCheck.reason, code: followCheck.code });
              }

              // Check seat is available
              const { data: existing } = await getSupabase()
                  .from('club_game_seats').select('id')
                  .eq('game_id', game_id).eq('seat_number', seat_number).maybeSingle();

              if (existing) {
                  return res.status(409).json({ success: false, error: 'Seat already taken', code: 'SEAT_TAKEN' });
              }

              // Check player isn't already in this game (by player_id, not name)
              const { data: playerSeat } = await getSupabase()
                  .from('club_game_seats').select('id')
                  .eq('game_id', game_id).eq('player_id', player_id)
                  .neq('status', 'waitlist').maybeSingle();

              if (playerSeat) {
                  return res.status(409).json({ success: false, error: 'You already have a seat in this game', code: 'ALREADY_SEATED' });
              }

              const { data, error } = await getSupabase()
                  .from('club_game_seats').insert({
                      game_id, seat_number, player_id: player_id || null,
                      player_name, status: 'reserved'
                  }).select().maybeSingle();

              if (error) {
                  if (error.code === '23505') return res.status(409).json({ success: false, error: 'Seat already taken', code: 'SEAT_TAKEN' });
                  return res.status(500).json({ success: false, error: 'Internal server error' });
              }
              return res.status(201).json({ success: true, data });
          }

          if (action === 'join_waitlist') {
              const { game_id, player_name } = req.body;
              const player_id = verified_user_id;
              if (!game_id || !player_name) {
                  return res.status(400).json({ success: false, error: 'game_id and player_name required' });
              }

              // Follow-gate: must be an approved follower
              const followCheck = await checkFollowStatus(game_id, player_id);
              if (!followCheck.allowed) {
                  return res.status(403).json({ success: false, error: followCheck.reason, code: followCheck.code });
              }

              // Get current max waitlist position
              const { data: maxPos } = await getSupabase()
                  .from('club_game_seats').select('waitlist_position')
                  .eq('game_id', game_id).eq('status', 'waitlist')
                  .order('waitlist_position', { ascending: false }).limit(1).maybeSingle();

              const nextPos = (maxPos?.waitlist_position || 0) + 1;

              const { data, error } = await getSupabase()
                  .from('club_game_seats').insert({
                      game_id, seat_number: null, player_id: player_id || null,
                      player_name, status: 'waitlist', waitlist_position: nextPos
                  }).select().maybeSingle();

              if (error) return res.status(500).json({ success: false, error: 'Internal server error' });
              return res.status(201).json({ success: true, data, position: nextPos });
          }

          if (action === 'leave') {
              const { game_id, player_name, seat_id } = req.body;
              if (!game_id) return res.status(400).json({ success: false, error: 'game_id required' });

              // Verify the authenticated user owns the seat, or is the page/game owner
              let canRemove = false;
              if (seat_id) {
                  const { data: seatCheck } = await getSupabase()
                      .from('club_game_seats').select('player_id').eq('id', seat_id).maybeSingle();
                  canRemove = seatCheck?.player_id === verified_user_id;
              } else if (player_name) {
                  const { data: seatCheck } = await getSupabase()
                      .from('club_game_seats').select('player_id').eq('game_id', game_id).eq('player_name', player_name).limit(1).maybeSingle();
                  canRemove = seatCheck?.player_id === verified_user_id;
              }

              // Also allow page owner or game creator to remove anyone
              if (!canRemove) {
                  const { data: gameInfo } = await getSupabase()
                      .from('club_live_games').select('created_by, page_id').eq('id', game_id).maybeSingle();
                  if (gameInfo) {
                      if (gameInfo.created_by === verified_user_id) canRemove = true;
                      else {
                          const { data: pageInfo } = await getSupabase()
                              .from('social_pages').select('owner_id').eq('id', gameInfo.page_id).maybeSingle();
                          if (pageInfo?.owner_id === verified_user_id) canRemove = true;
                      }
                  }
              }

              if (!canRemove) {
                  return res.status(403).json({ success: false, error: 'You can only remove yourself or players from your own game' });
              }

              let query = getSupabase().from('club_game_seats').delete().eq('game_id', game_id);
              if (seat_id) query = query.eq('id', seat_id);
              else if (player_name) query = query.eq('player_name', player_name);
              else return res.status(400).json({ success: false, error: 'player_name or seat_id required' });

              const { error } = await query;
              if (error) return res.status(500).json({ success: false, error: 'Internal server error' });
              return res.status(200).json({ success: true });
          }

          // === CREATE GAME ===
          const { page_id, game_name, game_type, stakes, max_seats, table_number, notes } = req.body;
          if (!page_id || !game_name) {
              return res.status(400).json({ success: false, error: 'page_id and game_name required' });
          }

          // Verify user is page owner or admin before allowing game creation
          const { data: pageOwnerCheck } = await getSupabase()
              .from('social_pages').select('owner_id').eq('id', page_id).maybeSingle();
          if (!pageOwnerCheck) return res.status(404).json({ success: false, error: 'Page not found' });
          if (pageOwnerCheck.owner_id !== verified_user_id) {
              // Check if admin/moderator
              const { data: memberCheck } = await getSupabase()
                  .from('social_page_followers').select('role')
                  .eq('page_id', page_id).eq('user_id', verified_user_id).maybeSingle();
              if (!memberCheck || !['admin', 'moderator', 'owner'].includes(memberCheck.role)) {
                  return res.status(403).json({ success: false, error: 'Only page owners and admins can create games' });
              }
          }

          const { data, error } = await getSupabase()
              .from('club_live_games').insert({
                  page_id, game_name, game_type: game_type || 'NLH',
                  stakes: stakes || '1/2', max_seats: max_seats || 9,
                  table_number: table_number || null, notes: notes || null,
                  created_by: verified_user_id, status: 'open'
              }).select().maybeSingle();

          if (error) return res.status(500).json({ success: false, error: 'Internal server error' });
          return res.status(201).json({ success: true, data });
      }

      // ===== PUT =====
      if (req.method === 'PUT') {
          const authUser = await requireAuth(req, res);
          if (!authUser) return;

          const { id, status, game_name, stakes, max_seats, notes, table_number } = req.body;
          if (!id) return res.status(400).json({ success: false, error: 'id required' });

          // Verify game ownership: must be creator or page owner
          const { data: gameCheck } = await getSupabase()
              .from('club_live_games').select('created_by, page_id').eq('id', id).maybeSingle();
          if (!gameCheck) return res.status(404).json({ success: false, error: 'Game not found' });
          if (gameCheck.created_by !== authUser.id) {
              const { data: pageCheck } = await getSupabase()
                  .from('social_pages').select('owner_id').eq('id', gameCheck.page_id).maybeSingle();
              if (!pageCheck || pageCheck.owner_id !== authUser.id) {
                  return res.status(403).json({ success: false, error: 'Not authorized to update this game' });
              }
          }

          const updates = {};
          if (status) {
              updates.status = status;
              if (status === 'running') updates.started_at = new Date().toISOString();
              if (status === 'closed') updates.closed_at = new Date().toISOString();
          }
          if (game_name) updates.game_name = game_name;
          if (stakes) updates.stakes = stakes;
          if (max_seats) updates.max_seats = max_seats;
          if (notes !== undefined) updates.notes = notes;
          if (table_number !== undefined) updates.table_number = table_number;

          const { data, error } = await getSupabase()
              .from('club_live_games').update(updates).eq('id', id).select().maybeSingle();

          if (error || !data) return res.status(404).json({ success: false, error: 'Game not found' });
          return res.status(200).json({ success: true, data });
      }

      // ===== DELETE =====
      if (req.method === 'DELETE') {
          const authUser = await requireAuth(req, res);
          if (!authUser) return;

          const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
          const id = safeQ(req.query.id);
          if (!id) return res.status(400).json({ success: false, error: 'id required' });

          // Verify game ownership: must be creator or page owner
          const { data: gameCheck } = await getSupabase()
              .from('club_live_games').select('created_by, page_id').eq('id', id).maybeSingle();
          if (!gameCheck) return res.status(404).json({ success: false, error: 'Game not found' });
          if (gameCheck.created_by !== authUser.id) {
              const { data: pageCheck } = await getSupabase()
                  .from('social_pages').select('owner_id').eq('id', gameCheck.page_id).maybeSingle();
              if (!pageCheck || pageCheck.owner_id !== authUser.id) {
                  return res.status(403).json({ success: false, error: 'Not authorized to delete this game' });
              }
          }

          const { error } = await getSupabase().from('club_live_games').delete().eq('id', id);
          if (error) return res.status(500).json({ success: false, error: 'Internal server error' });
          return res.status(200).json({ success: true });
      }

      return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
