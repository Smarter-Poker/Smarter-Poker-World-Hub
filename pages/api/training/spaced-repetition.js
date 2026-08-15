import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * PHASE 14: Spaced Repetition API
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * POST /api/training/spaced-repetition — Save mistake signatures for future review
 * GET  /api/training/spaced-repetition — Retrieve due review spots
 *
 * Uses a simplified SM-2 algorithm:
 * - Mistakes start with interval = 1 session
 * - Correct reviews double the interval
 * - Failed reviews reset to interval = 1
 * - Priority: higher EV loss mistakes surface first
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';

// ●● Lazy Supabase getter (SSG-safe) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
      withTiming(res);

      // Auth
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

      const userId = user.id;

      // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
      // POST: Save mistake spots for spaced repetition review
      // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
      if (req.method === 'POST') {
          if (!applyRateLimit(req, res, LIMITS.write)) return;

          const bodySize = JSON.stringify(req.body || {}).length;
          if (bodySize > 51200) {
              return res.status(413).json({ success: false, error: 'Request body too large' });
          }

          const { mistakes } = req.body;
          if (!mistakes || !Array.isArray(mistakes) || mistakes.length === 0) {
              return res.status(400).json({ success: false, error: 'mistakes array required' });
          }

          // Batch insert mistake signatures (max 50 per request)
          const rows = mistakes.slice(0, 50).map(m => ({
              user_id: userId,
              game_id: m.gameId || 'unknown',
              spot_signature: buildSpotSignature(m),
              hero_position: m.heroPosition || null,
              villain_position: m.villainPosition || null,
              street: m.street || null,
              spot_type: m.spotType || null,
              classification: m.classification || 'WRONG',
              ev_loss: typeof m.evLoss === 'number' ? m.evLoss : 0,
              hero_hand: m.heroHand || null,
              board: m.board || null,
              correct_action: m.correctAction || null,
              chosen_action: m.chosenAction || null,
              // SM-2 fields
              review_interval: 1,
              ease_factor: 2.5,
              next_review_at: new Date().toISOString(), // Due immediately for first review
              review_count: 0,
              created_at: new Date().toISOString(),
          }));

          // Upsert by spot_signature to avoid duplicates (player may fail same spot twice)
          const { error: insertErr } = await getSupabase()
              .from('training_spaced_repetition')
              .upsert(rows, {
                  onConflict: 'user_id,spot_signature',
                  ignoreDuplicates: false, // Update existing with new ev_loss/classification
              });

          if (insertErr) {
              // Table may not exist yet — log and return success
              console.warn('[SpacedRepetition] Insert failed (table may not exist):', insertErr.message);
              return res.status(200).json({
                  success: true,
                  saved: 0,
                  note: 'Spaced repetition table not yet provisioned',
              });
          }

          console.debug(`[SpacedRepetition] Saved ${rows.length} mistake spots for user ${userId.slice(0, 8)}`);
          return res.status(200).json({ success: true, saved: rows.length });
      }

      // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
      // GET: Retrieve spots due for review
      // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
      if (req.method === 'GET') {
          if (!applyRateLimit(req, res, LIMITS.read)) return;

          const { gameId, count = '10' } = req.query;
          const limit = Math.min(25, Math.max(1, parseInt(count, 10) || 10));

          let query = getSupabase()
              .from('training_spaced_repetition')
              .select('*')
              .eq('user_id', userId)
              .lte('next_review_at', new Date().toISOString())
              .order('ev_loss', { ascending: false }) // Highest EV loss first
              .limit(limit);

          if (gameId) {
              query = query.eq('game_id', gameId);
          }

          const { data: dueSpots, error: fetchErr } = await query;

          if (fetchErr) {
              // Table may not exist
              console.warn('[SpacedRepetition] Fetch failed:', fetchErr.message);
              return res.status(200).json({ success: true, spots: [], count: 0 });
          }

          return res.status(200).json({
              success: true,
              spots: dueSpots || [],
              count: (dueSpots || []).length,
          });
      }

      // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
      // PATCH: Update review result (correct/wrong on review)
      // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
      if (req.method === 'PATCH') {
          if (!applyRateLimit(req, res, LIMITS.write)) return;

          const { spotSignature, wasCorrect } = req.body;
          if (!spotSignature) {
              return res.status(400).json({ success: false, error: 'spotSignature required' });
          }

          // Fetch current review state
          const { data: spot } = await getSupabase()
              .from('training_spaced_repetition')
              .select('review_interval, ease_factor, review_count')
              .eq('user_id', userId)
              .eq('spot_signature', spotSignature)
              .maybeSingle();

          if (!spot) {
              return res.status(404).json({ success: false, error: 'Spot not found' });
          }

          // SM-2 update
          let newInterval, newEase;
          if (wasCorrect) {
              // Correct: increase interval, slightly increase ease
              newEase = Math.min(3.0, (spot.ease_factor || 2.5) + 0.1);
              newInterval = Math.min(30, Math.ceil((spot.review_interval || 1) * newEase));
          } else {
              // Wrong: reset interval, decrease ease
              newEase = Math.max(1.3, (spot.ease_factor || 2.5) - 0.3);
              newInterval = 1;
          }

          const nextReview = new Date();
          nextReview.setDate(nextReview.getDate() + newInterval);

          const { error: err_training_spaced_repetition_q4afj } = await getSupabase()

            .from('training_spaced_repetition')

            .update({
                  review_interval: newInterval,
                  ease_factor: newEase,
                  review_count: (spot.review_count || 0) + 1,
                  next_review_at: nextReview.toISOString(),
                  // 2026-08-15 CHECK 13 fix: last_reviewed_at is not a column (real:
                  // updated_at) — the update 42703'd, so reviews never advanced the
                  // spaced-repetition schedule.
                  updated_at: new Date().toISOString(),
              })
              .eq('user_id', userId)
              .eq('spot_signature', spotSignature);

          if (err_training_spaced_repetition_q4afj) console.warn('[Supabase] Silent mutation failed in training_spaced_repetition:', err_training_spaced_repetition_q4afj.message);

          return res.status(200).json({ success: true, newInterval, nextReview: nextReview.toISOString() });
      }

      return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[SpacedRepetition API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Build a unique signature for a spot type (position + street + spot type + action scenario)
 * This deduplicates across sessions — same spot = same signature
 */
function buildSpotSignature(mistake) {
    const parts = [
        mistake.gameId || 'unknown',
        mistake.heroPosition || 'UNK',
        mistake.street || 'flop',
        mistake.spotType || 'general',
        mistake.correctAction || 'unknown',
    ];
    return parts.join('_').toLowerCase().replace(/[^a-z0-9_]/g, '');
}
