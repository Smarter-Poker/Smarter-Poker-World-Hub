/**
 * Jarvis Lobby Suggestions API
 * 
 * Returns personalized training suggestions for the lobby based on
 * user's training journey, time since last session, and learning gaps.
 * 
 * GET /api/gto/lobby-suggestions
 * User identity is derived exclusively from the bearer token.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

let _supabase = null;
const TRAINING_POSITIONS = new Set(['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
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
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');

  try {
    // BUG #244 FIX: Require JWT auth — these routes use paid AI APIs
    const _authSupa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const _token = req.headers.authorization?.replace('Bearer ', '');
    if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: authData, error: _authErr } = await _authSupa.auth.getUser(_token);
    const _authUser = authData?.user;
    if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const userId = _authUser.id; // Trust JWT, not client-supplied query param

          // Build the profile from server-sealed session projections. The
          // retired Jarvis profile/session tables accepted browser-authored
          // claims and are not an authority for lobby recommendations.
          const { data: sessions, error: sessionsError } = await getSupabase()
              .from('training_sessions')
              .select('game_id, game_name, hands_played, correct_count, accuracy, level, position_stats, classification_counts, hand_history, attempt_id, created_at, training_attempts!training_sessions_attempt_fk!inner(id, user_id, status, practice_only)')
              .eq('user_id', userId)
              .eq('training_attempts.user_id', userId)
              .eq('training_attempts.status', 'completed')
              .not('attempt_id', 'is', null)
              .eq('training_attempts.practice_only', false)
              .order('created_at', { ascending: false })
              .limit(100);
          if (sessionsError) throw sessionsError;

          const verifiedSessions = sessions || [];
          const profile = deriveVerifiedProfile(verifiedSessions);
          const lastSession = verifiedSessions[0]
              ? {
                  ...verifiedSessions[0],
                  category: primaryPosition(verifiedSessions[0]) || verifiedSessions[0].game_id || null,
              }
              : null;

          // Calculate time since last session
          const hoursSinceLastSession = lastSession
              ? (Date.now() - new Date(lastSession.created_at).getTime()) / (1000 * 60 * 60)
              : 999;

          // Generate suggestions
          const suggestions = generateLobbySuggestions(
              profile,
              lastSession,
              hoursSinceLastSession
          );

          return res.status(200).json({
              success: true,
              suggestions,
              isNewUser: verifiedSessions.length === 0,
              context: {
                  hoursSinceLastSession: Math.floor(hoursSinceLastSession),
                  lastCategory: lastSession?.category,
                  skillLevel: profile?.skill_assessment || 'New Player'
              }
          });

      } catch (error) {
          console.warn('[LobbySuggestions] Error:', error);
          return res.status(503).json({
              success: false,
              unavailable: true,
              code: 'VERIFIED_LOBBY_SUGGESTIONS_UNAVAILABLE',
              error: 'Verified lobby suggestions are temporarily unavailable',
          });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

function primaryPosition(session) {
    const stats = session?.position_stats && typeof session.position_stats === 'object'
        ? session.position_stats
        : {};
    return Object.entries(stats)
        .map(([position, values]) => ({
            position: String(position || '').toUpperCase(),
            total: Number(values?.total) || 0,
        }))
        .filter(({ position, total }) => TRAINING_POSITIONS.has(position) && total > 0)
        .sort((a, b) => b.total - a.total)[0]?.position || null;
}

export function deriveVerifiedProfile(sessions) {
    const positionErrors = {};
    let totalQuestions = 0;
    let totalCorrect = 0;

    for (const session of sessions || []) {
        totalQuestions += Number(session?.hands_played) || 0;
        totalCorrect += Number(session?.correct_count) || 0;
        const stats = session?.position_stats && typeof session.position_stats === 'object'
            ? session.position_stats
            : {};
        for (const [position, values] of Object.entries(stats)) {
            const errors = Math.max(0, (Number(values?.total) || 0) - (Number(values?.correct) || 0));
            if (errors > 0) positionErrors[position] = (positionErrors[position] || 0) + errors;
        }
    }

    const accuracy = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : null;
    const skillAssessment = accuracy === null
        ? 'New Player'
        : accuracy >= 90 ? 'Expert'
            : accuracy >= 80 ? 'Advanced'
                : accuracy >= 70 ? 'Intermediate'
                    : accuracy >= 55 ? 'Developing'
                        : 'Beginner';

    return {
        total_sessions: (sessions || []).length,
        total_questions: totalQuestions,
        total_correct: totalCorrect,
        overall_accuracy: accuracy,
        skill_assessment: skillAssessment,
        identified_leaks: Object.entries(positionErrors)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([position]) => `${String(position).toUpperCase()} Play`),
    };
}

function generateLobbySuggestions(profile, lastSession, hoursSinceLastSession) {
    const suggestions = [];

    if (!lastSession) return getDefaultSuggestions();

    // Welcome back message
    if (hoursSinceLastSession > 24) {
        suggestions.push({
            type: 'welcome_back',
            priority: 1,
            message: 'Welcome back! Ready to sharpen those skills?',
            action: 'Start Daily Challenge',
            actionType: 'daily_challenge'
        });
    }

    // Streak maintenance
    if (hoursSinceLastSession >= 20 && hoursSinceLastSession < 28) {
        suggestions.push({
            type: 'streak_warning',
            priority: 0,
            message: 'Play now to keep your streak alive!',
            action: 'Quick Game',
            actionType: 'quick_game'
        });
    }

    // Weakness-based suggestion
    const leaks = profile?.identified_leaks || [];
    if (leaks.length > 0) {
        const primaryLeak = leaks[0];
        suggestions.push({
            type: 'weakness_training',
            priority: 2,
            message: `Focus on: ${primaryLeak}`,
            action: 'Smart Practice',
            actionType: 'adaptive_training'
        });
    }

    // Level progression
    const skillLevel = profile?.skill_assessment || 'Beginner';
    const levelMap = { 'Beginner': 2, 'Developing': 4, 'Intermediate': 6, 'Advanced': 8, 'Expert': 10 };
    const recommendedLevel = levelMap[skillLevel] || 3;

    suggestions.push({
        type: 'level_recommendation',
        priority: 3,
        message: `Try Level ${recommendedLevel} - matches your current skill`,
        action: `Start Level ${recommendedLevel}`,
        actionType: 'start_level',
        levelId: recommendedLevel
    });

    // Variety suggestion if stuck on one category
    if (TRAINING_POSITIONS.has(lastSession?.category) && profile?.total_sessions > 5) {
        const categories = ['UTG', 'CO', 'BTN', 'BB'];
        const otherCategory = categories.find(c => c !== lastSession.category) || 'CO';
        suggestions.push({
            type: 'variety',
            priority: 4,
            message: `Mix it up: Practice ${otherCategory} position`,
            action: `Train ${otherCategory}`,
            actionType: 'position_training',
            position: otherCategory
        });
    }

    // Sort by priority and return top 3
    return suggestions.sort((a, b) => a.priority - b.priority).slice(0, 3);
}

function getDefaultSuggestions() {
    return [
        {
            type: 'daily_challenge',
            priority: 1,
            message: 'Complete the Daily Challenge for bonus diamonds!',
            action: 'Start Challenge',
            actionType: 'daily_challenge'
        },
        {
            type: 'beginner_tip',
            priority: 2,
            message: 'Start with Level 1 to learn the basics',
            action: 'Neural Boot',
            actionType: 'start_level',
            levelId: 1
        }
    ];
}
