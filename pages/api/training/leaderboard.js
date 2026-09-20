/**
 * TRAINING LEADERBOARD API
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Daily/weekly/all-time rankings for training performance
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { sanitizeParam, clampPagination, withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { getLeaderboardPeriodKey } from '../../../src/lib/training/leaderboardPeriod.mjs';
import {
    getTrainingLeaderboardCategory,
    normalizeTrainingLeaderboardCategory,
} from '../../../src/lib/training/leaderboardDimensions.mjs';

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
      res.setHeader('Vary', 'Authorization');
      withTiming(res);

      if (req.method === 'POST') {
          return res.status(410).json({
              success: false,
              error: 'Leaderboard totals are recorded only by verified Training completion.',
              code: 'TRAINING_LEADERBOARD_VERIFIED_ATTEMPT_REQUIRED',
          });
      }

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const supabase = getSupabase();
      const hasAuthorization = typeof req.headers?.authorization === 'string'
          && req.headers.authorization.trim().length > 0;
      // An authenticated response contains the caller's private rank/entry and
      // must never be stored in a shared CDN cache. Anonymous rankings remain
      // safely cacheable for the public leaderboard surface.
      res.setHeader(
          'Cache-Control',
          hasAuthorization
              ? 'private, no-store'
              : 'public, s-maxage=30, stale-while-revalidate=120'
      );

      const {
          period: rawPeriod = 'daily',
          limit: rawLimit = '20',
          gameId: rawGameId,
          category: rawCategory,
      } = req.query;
      const period = ['daily', 'weekly', 'monthly', 'alltime'].includes(rawPeriod) ? rawPeriod : 'daily';
      const gameId = rawGameId ? sanitizeParam(rawGameId, 100)?.toLowerCase() : null;
      const category = rawCategory
          ? normalizeTrainingLeaderboardCategory(rawCategory)
          : null;
      if (rawCategory && !category) {
          return res.status(400).json({
              success: false,
              code: 'TRAINING_LEADERBOARD_CATEGORY_INVALID',
              error: 'This Training leaderboard category is not supported.',
          });
      }
      if (gameId && !getTrainingLeaderboardCategory(gameId)) {
          return res.status(400).json({
              success: false,
              code: 'TRAINING_LEADERBOARD_GAME_INVALID',
              error: 'This Training leaderboard game is not supported.',
          });
      }
      if (gameId && category) {
          return res.status(400).json({
              success: false,
              code: 'TRAINING_LEADERBOARD_FILTER_CONFLICT',
              error: 'Choose either a game or category leaderboard.',
          });
      }
      const { limit: boundedLimit } = clampPagination(rawLimit, 1);

      let viewer = null;
      if (hasAuthorization) {
          const { user, error: authError } = await getServerUserWithFallback(req, supabase);
          if (authError || !user?.id) {
              return res.status(401).json({
                  success: false,
                  code: 'TRAINING_LEADERBOARD_AUTH_INVALID',
                  error: 'Invalid authentication token.',
              });
          }
          viewer = user;
      }

      try {
          // Use the same ISO-8601 UTC key contract as the completion RPC
          // (`IYYY-"W"IW`), including week-year rollover at New Year.
          const periodKey = getLeaderboardPeriodKey(period, new Date());
          const dimensionType = gameId ? 'game' : category ? 'category' : 'overall';
          const dimensionKey = gameId || category || 'overall';

          // Only the clean, service-owned aggregate is competition authority.
          // The legacy training_leaderboard table remains preserved for audit
          // continuity, but its historical browser-authored rows are excluded.
          let leaderboardQuery = supabase
              .from('training_verified_leaderboard')
              .select(`
                  user_id,
                  sessions_completed,
                  questions_answered,
                  questions_correct,
                  accuracy,
                  gtow_score_avg,
                  best_streak
              `)
              .eq('period_type', period)
              .eq('period_key', periodKey);

          if (gameId) {
              leaderboardQuery = leaderboardQuery
                  .eq('dimension_type', 'game')
                  .eq('game_id', gameId);
          } else if (category) {
              leaderboardQuery = leaderboardQuery
                  .eq('dimension_type', 'category')
                  .eq('category', category);
          } else {
              leaderboardQuery = leaderboardQuery.eq('dimension_type', 'overall');
          }

          const { data: leaderboard, error } = await leaderboardQuery
              .order('accuracy', { ascending: false })
              .order('questions_correct', { ascending: false })
              .order('user_id', { ascending: true })
              .limit(boundedLimit);

          if (error) throw error;

          let viewerRank = { myRank: null, myEntry: null };
          if (viewer) {
              const { data: rankData, error: rankError } = await supabase.rpc(
                  'fn_training_verified_leaderboard_rank_v2',
                  {
                      p_user_id: viewer.id,
                      p_period_type: period,
                      p_period_key: periodKey,
                      p_dimension_type: dimensionType,
                      p_dimension_key: dimensionKey,
                  }
              );
              if (rankError) throw rankError;
              if (rankData && typeof rankData === 'object') {
                  const parsedRank = rankData.myRank === null || rankData.myRank === ''
                      ? null
                      : Number(rankData.myRank);
                  viewerRank = {
                      myRank: Number.isInteger(parsedRank) && parsedRank >= 1
                          ? parsedRank
                          : null,
                      myEntry: rankData.myEntry && typeof rankData.myEntry === 'object'
                          ? rankData.myEntry
                          : null,
                  };
              }
          }

          // Fetch profiles separately for any entries
          const userIds = [...new Set([
              ...(leaderboard || []).map(e => e.user_id),
              ...(viewerRank.myEntry?.userId ? [viewerRank.myEntry.userId] : []),
          ])];
          let profilesMap = {};

          if (userIds.length > 0) {
              const { data: profiles, error: profilesError } = await supabase
                  .from('profiles')
                  .select('id, username, avatar_url')
                  .in('id', userIds);

              if (profilesError) throw profilesError;

              profilesMap = (profiles || []).reduce((acc, p) => {
                  acc[p.id] = p;
                  return acc;
              }, {});
          }

          // Format response with rankings
          const rankings = (leaderboard || []).map((entry, index) => ({
              rank: index + 1,
              userId: entry.user_id,
              username: profilesMap[entry.user_id]?.username || 'Anonymous',
              avatarUrl: profilesMap[entry.user_id]?.avatar_url,
              accuracy: entry.accuracy,
              sessionsCompleted: entry.sessions_completed,
              questionsAnswered: entry.questions_answered,
              questionsCorrect: entry.questions_correct,
              gtowScoreAvg: entry.gtow_score_avg,
              bestStreak: entry.best_streak
          }));
          const myEntry = viewerRank.myEntry
              ? {
                  ...viewerRank.myEntry,
                  username: profilesMap[viewerRank.myEntry.userId]?.username || 'Anonymous',
                  avatarUrl: profilesMap[viewerRank.myEntry.userId]?.avatar_url,
              }
              : null;

          return res.status(200).json({
              success: true,
              period,
              periodKey,
              dimensionType,
              dimensionKey,
              leaderboard: rankings,
              myRank: viewerRank.myRank,
              myEntry,
              timestamp: new Date().toISOString()
          });

      } catch (error) {
          console.warn('[Leaderboard] Error:', error.message);
          return res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
