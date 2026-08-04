import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
/**
 * Live Game Detail API
 *
 * GET: Get single live game details
 * POST: Confirm or update a live game report
 * DELETE: Mark a game as expired/ended
 */

import { supabase } from '../../../../src/lib/supabase';
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';

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
    // CDN cache: fresh for 60s, serve stale up to 300s
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    }

    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
      const id = safeQ(req.query.id);

      if (!id) {
          return res.status(400).json({ success: false, error: 'Game ID required' });
      }

      if (req.method === 'GET') {
          return handleGet(req, res, id);
      } else if (req.method === 'POST') {
          return handlePost(req, res, id);
      } else if (req.method === 'DELETE') {
          return handleDelete(req, res, id);
      }

      return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
    try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

async function handleGet(req, res, id) {
    try {
        // NOTE: there is NO foreign key from live_games.venue_id to
        // poker_venues (index.js says the same), so a PostgREST
        // `venue:poker_venues(...)` embed errors out and used to 404 every
        // single detail request. Fetch the venue with a second query instead.
        const { data: game, error } = await getSupabase()
            .from('live_games')
            .select(`
                *,
                confirmations:live_game_confirmations(
                    id, action, seats_open, waitlist_size, notes, created_at,
                    user:profiles(id, username, avatar_url)
                )
            `)
            .eq('id', id)
            .maybeSingle();

        if (error || !game) {
            if (error) console.warn('Live game lookup failed:', error.message);
            return res.status(404).json({ success: false, error: 'Game not found' });
        }

        // Enrich with venue data. Best-effort — a missing/failed venue lookup
        // must not turn a real game into a 404.
        let venue = null;
        if (game.venue_id != null) {
            const { data: venueRow, error: venueErr } = await getSupabase()
                .from('poker_venues')
                .select('id, name, address, city, state, latitude, longitude, phone, website')
                .eq('id', game.venue_id)
                .maybeSingle();
            if (venueErr) console.warn('Live game venue lookup failed:', venueErr.message);
            venue = venueRow || null;
        }

        return res.status(200).json({
            ...game,
            reported_at: game.reported_at || game.created_at,
            venue,
        });

    } catch (error) {
        console.warn('Live game GET error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

async function handlePost(req, res, id) {
    try {
        // Get user from auth header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
        const user = authData?.user;

        if (authErr || !user) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }

        const { action, seats_open, waitlist_size, notes } = req.body;

        // Validate action
        const validActions = ['confirm', 'update', 'expired', 'incorrect'];
        if (!action || !validActions.includes(action)) {
            return res.status(400).json({
                success: false, error: 'Invalid action',
                valid: validActions
            });
        }

        // Get current game
        const { data: game, error: gameError } = await getSupabase()
            .from('live_games')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (gameError || !game) {
            return res.status(404).json({ success: false, error: 'Game not found' });
        }

        // Log the confirmation
        const { error: confirmError } = await getSupabase()
            .from('live_game_confirmations')
            .insert({
                live_game_id: id,
                user_id: user.id,
                action,
                seats_open: seats_open ?? null,
                waitlist_size: waitlist_size ?? null,
                notes: notes || null
            });

        if (confirmError) {
            console.warn('Error logging confirmation:', confirmError);
            return res.status(500).json({ success: false, error: 'Failed to log confirmation' });
        }

        // Update game based on action.
        // live_games has NO last_confirmed_at / seats_open / waitlist_size
        // columns — those live on live_game_confirmations (logged above).
        // Including them here 42703'd the UPDATE, which was only console.warn'd,
        // so confirmations never actually extended expires_at.
        // waitlist_size is folded into the `wait_time` column instead, using the
        // same derivation as the report_live_game RPC.
        const updateData = {};
        // confirmation_count may be absent/null on older rows — coalesce so we
        // never write NaN.
        const nextConfirmationCount = Number(game.confirmation_count || 0) + 1;

        if (action === 'confirm') {
            updateData.confirmation_count = nextConfirmationCount;
            updateData.expires_at = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
        } else if (action === 'update') {
            updateData.confirmation_count = nextConfirmationCount;
            updateData.expires_at = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
            const waitlistNum = Number(waitlist_size);
            if (waitlist_size !== undefined && waitlist_size !== null && Number.isFinite(waitlistNum)) {
                const tables = Math.max(1, Number(game.table_count) || 1);
                updateData.wait_time = waitlistNum <= 0
                    ? 0
                    : Math.min(180, Math.floor((waitlistNum * 10) / tables));
            }
            if (notes) updateData.notes = notes;
        } else if (action === 'expired' || action === 'incorrect') {
            // If multiple people mark as expired/incorrect, deactivate
            const { count } = await getSupabase()
                .from('live_game_confirmations')
                .select('*', { count: 'exact', head: true })
                .eq('live_game_id', id)
                .in('action', ['expired', 'incorrect'])
                    .limit(100);

            if ((count || 0) >= 2) {
                updateData.is_active = false;
            }
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(200).json({
                success: true,
                action,
                message: `Game ${action} recorded`
            });
        }

        const { error: updateError } = await getSupabase()
            .from('live_games')
            .update(updateData)
            .eq('id', id);

        if (updateError) {
            console.warn('Error updating game:', updateError);
        }

        return res.status(200).json({
            success: true,
            action,
            message: `Game ${action} recorded`
        });

    } catch (error) {
        console.warn('Live game POST error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

async function handleDelete(req, res, id) {
    try {
        // Get user from auth header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
        const user = authData?.user;

        if (authErr || !user) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }

        // Check if user is the reporter.
        // The reporter column on live_games is `user_id` — there is no
        // `reported_by` column. Selecting it errored, so gameError was always
        // set and every owner delete returned 404 "Game not found".
        // pages/api/poker/live-games.js DELETE uses user_id for the same check.
        const { data: game, error: gameError } = await getSupabase()
            .from('live_games')
            .select('id, user_id')
            .eq('id', id)
            .maybeSingle();

        if (gameError || !game) {
            if (gameError) console.warn('Live game ownership lookup failed:', gameError.message);
            return res.status(404).json({ success: false, error: 'Game not found' });
        }

        // user_id is stored as TEXT on live_games — compare as strings.
        if (String(game.user_id) !== String(user.id)) {
            return res.status(403).json({ success: false, error: 'Only the reporter can delete this game' });
        }

        // Mark as inactive instead of deleting
        const { error: updateError } = await getSupabase()
            .from('live_games')
            .update({ is_active: false })
            .eq('id', id);

        if (updateError) {
            console.warn('Error deleting game:', updateError);
            return res.status(500).json({ success: false, error: 'Failed to delete game' });
        }

        return res.status(200).json({
            success: true,
            message: 'Game marked as ended'
        });

    } catch (error) {
        try { reportApiError(error, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('Live game DELETE error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
