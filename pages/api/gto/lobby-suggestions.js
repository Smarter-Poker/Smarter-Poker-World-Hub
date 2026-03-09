/**
 * Jarvis Lobby Suggestions API
 * 
 * Returns personalized training suggestions for the lobby based on
 * user's training journey, time since last session, and learning gaps.
 * 
 * GET /api/gto/lobby-suggestions?userId=xxx
 */

import { createClient } from '../../../src/lib/supabaseServerClient';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // BUG #244 FIX: Require JWT auth — these routes use paid AI APIs
  const _authSupa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const _token = req.headers.authorization?.replace('Bearer ', '');
  if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
  const { data: { user: _authUser }, error: _authErr } = await _authSupa.auth.getUser(_token);
  if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const userId = _authUser.id; // Trust JWT, not client-supplied query param

        // Get user's training profile
        const { data: profile } = await supabase
            .from('jarvis_user_training_profile')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

        // Get last session
        const { data: lastSession } = await supabase
            .from('jarvis_training_sessions')
            .select('created_at, category, accuracy')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

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
            context: {
                hoursSinceLastSession: Math.floor(hoursSinceLastSession),
                lastCategory: lastSession?.category,
                skillLevel: profile?.skill_assessment || 'New Player'
            }
        });

    } catch (error) {
        console.error('[LobbySuggestions] Error:', error);
        return res.status(200).json({
            success: true,
            suggestions: getDefaultSuggestions(),
            fallback: true
        });
    }
}

function generateLobbySuggestions(profile, lastSession, hoursSinceLastSession) {
    const suggestions = [];

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
    if (lastSession?.category && profile?.total_sessions > 5) {
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
