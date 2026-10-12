/**
 * TRAINING TOURNAMENTS API
 *
 * Tournament reads remain available. Registration, lifecycle, score, and
 * economy writes are retired until their Phase 11 replacement is one atomic,
 * server-authoritative transaction backed by verified Training attempts.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { sanitizeParam, withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

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

// A signed-out viewer gets the shared listing without account identifiers:
// entry rows keep their public profile (username, avatar) and results but not
// the raw auth user id, and a tournament row does not name its creator.
function withoutUserIds(row) {
    if (!row || typeof row !== 'object') return row;
    const { user_id: _userId, created_by: _createdBy, ...rest } = row;
    return rest;
}

function failTournamentRead(res, operation, error) {
    console.warn(`[Tournaments] ${operation} failed:`, error?.message || error);
    return res.status(503).json({
        success: false,
        error: 'Tournament data is temporarily unavailable',
        code: 'TRAINING_TOURNAMENTS_READ_FAILED',
        operation,
    });
}

export default async function handler(req, res) {
  try {
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('Vary', 'Authorization');
      withTiming(res);

      if (req.method === 'POST' || req.method === 'PUT') {
          return res.status(410).json({
              success: false,
              error: 'Tournament registration and scoring require server-authoritative settlement.',
              code: 'TRAINING_TOURNAMENTS_SERVER_AUTHORITY_REQUIRED',
          });
      }
      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      const supabase = getSupabase();

      // Tournament listings and standings are shared reference content and
      // open to everyone (Dan, 2026-10-12: "THEY SHOULD OPEN TO EVERYONE").
      // Only the viewer's own entry needs an identity: a request without a
      // credential gets the shared data with every per-user field absent, and
      // a request that presents a credential is still verified, so an invalid
      // token keeps its 401. This route has no write path for anyone.
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim() || null;
      let userId = null;
      if (token) {
          const { data: authData, error: authErr } = await supabase.auth.getUser(token);
          const user = authData?.user;
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });
          userId = user.id;
      }

      const safeQ = (value) => value
          ? (Array.isArray(value) ? String(value[0]) : typeof value === 'object' ? null : String(value))
          : value;
      const rawStatus = safeQ(req.query.status);
      const rawTournamentId = safeQ(req.query.tournamentId);
      const status = ['live', 'scheduled', 'completed'].includes(rawStatus) ? rawStatus : null;
      const tournamentId = rawTournamentId ? sanitizeParam(rawTournamentId, 100) : null;
      if (rawStatus && !status) {
          return res.status(400).json({
              success: false,
              error: 'Invalid tournament status',
              code: 'INVALID_TOURNAMENT_STATUS',
          });
      }

      try {
          if (tournamentId) {
              const [tournamentResult, entriesResult] = await Promise.all([
                  supabase
                      .from('training_tournaments')
                      .select('*')
                      .eq('id', tournamentId)
                      .maybeSingle(),
                  supabase
                      .from('training_tournament_entries')
                      .select(`
                          *,
                          profiles:user_id (username, avatar_url)
                      `)
                      .eq('tournament_id', tournamentId)
                      .order('score', { ascending: false })
                      .limit(100)
              ]);

              if (tournamentResult.error) {
                  return failTournamentRead(res, 'tournament-detail', tournamentResult.error);
              }
              if (entriesResult.error) {
                  return failTournamentRead(res, 'tournament-entries', entriesResult.error);
              }

              const { data: tournament } = tournamentResult;
              const { data: entries } = entriesResult;
              if (!tournament) {
                  return res.status(404).json({ success: false, error: 'Tournament not found' });
              }

              if (!userId) {
                  const publicEntries = (entries || []).map(withoutUserIds);
                  return res.status(200).json({
                      success: true,
                      tournament: withoutUserIds(tournament),
                      entries: publicEntries,
                      leaderboard: publicEntries.slice(0, 10)
                  });
              }

              return res.status(200).json({
                  success: true,
                  tournament,
                  entries: entries || [],
                  userEntry: entries?.find((entry) => entry.user_id === userId) || null,
                  leaderboard: (entries || []).slice(0, 10)
              });
          }

          let query = supabase
              .from('training_tournaments')
              .select('*, entry_count')
              .order('start_time', { ascending: true })
              .limit(100);

          if (status === 'live') {
              query = query.eq('status', 'live').limit(100);
          } else if (status === 'scheduled') {
              query = query.eq('status', 'scheduled').limit(100);
          } else if (status === 'completed') {
              query = query.eq('status', 'complete').limit(100);
          }

          const tournamentsResult = await query.limit(20);
          if (tournamentsResult.error) {
              return failTournamentRead(res, 'tournament-list', tournamentsResult.error);
          }

          const tournaments = tournamentsResult.data;
          if (!userId) {
              return res.status(200).json({
                  success: true,
                  tournaments: (tournaments || []).map(withoutUserIds),
              });
          }

          const entriesResult = await supabase
              .from('training_tournament_entries')
              .select('tournament_id, status, score, final_rank')
              .eq('user_id', userId);
          if (entriesResult.error) {
              return failTournamentRead(res, 'user-entries', entriesResult.error);
          }

          const entries = entriesResult.data;

          return res.status(200).json({
              success: true,
              tournaments: tournaments || [],
              userEntries: entries || []
          });
      } catch (error) {
          return failTournamentRead(res, 'unexpected-read', error);
      }
  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
      console.warn('[API Error]', err);
      if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
