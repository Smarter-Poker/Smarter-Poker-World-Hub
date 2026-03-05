/**
 * Jarvis Session Recommendations API
 * 
 * Generates personalized end-of-session recommendations based on 
 * the user's performance and training history.
 * 
 * POST /api/gto/session-recommendations
 * Body: { userId, sessionData }
 */

import { createClient } from '@supabase/supabase-js';
import { getGrokClient } from '../../../src/lib/grokClient';
import { getCachedResponse, setCachedResponse } from '../../../src/lib/jarvisCache';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { userId, sessionData } = req.body;

        if (!userId) {
            return res.status(400).json({ success: false, error: 'userId required' });
        }

        // Get user's training profile and recent history
        const profile = await getUserProfile(userId);
        const recentSessions = await getRecentSessions(userId, 5);

        // Generate personalized recommendations
        const recommendations = await generateRecommendations(
            profile,
            recentSessions,
            sessionData
        );

        return res.status(200).json({
            success: true,
            recommendations,
            profile: {
                skillLevel: profile?.skill_assessment || 'Developing',
                totalSessions: profile?.total_sessions || 0,
                accuracy: profile?.overall_accuracy || 0
            }
        });

    } catch (error) {
        console.error('[SessionRecommendations] Error:', error);
        return res.status(200).json({
            success: true,
            recommendations: getDefaultRecommendations(),
            fallback: true
        });
    }
}

async function getUserProfile(userId) {
    const { data } = await supabase
        .from('jarvis_user_training_profile')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    return data;
}

async function getRecentSessions(userId, limit) {
    const { data } = await supabase
        .from('jarvis_training_sessions')
        .select('accuracy, category, answers_data, leaks_detected')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

    return data || [];
}

async function generateRecommendations(profile, recentSessions, currentSession) {
    // Check cache first - base on user's skill level and recent patterns
    const skillLevel = profile?.skill_assessment || 'Developing';
    const avgAccuracy = recentSessions.length > 0
        ? recentSessions.reduce((sum, s) => sum + (s.accuracy || 0), 0) / recentSessions.length
        : 50;

    const cacheParams = {
        skillLevel,
        accuracyBucket: Math.floor(avgAccuracy / 10) * 10 // Bucket by 10s
    };

    const cached = await getCachedResponse('session-recommendations', cacheParams);
    if (cached) {
        return { ...cached, fromCache: true };
    }

    // Build context for Jarvis
    const leaks = [];
    recentSessions.forEach(s => {
        if (s.leaks_detected) {
            leaks.push(...(s.leaks_detected || []));
        }
    });

    // If limited data, return helpful defaults
    if (recentSessions.length < 2) {
        return getDefaultRecommendations();
    }

    try {
        const grok = getGrokClient();

        const completion = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [
                {
                    role: 'system',
                    content: `You are Jarvis, an AI poker coach giving end-of-session recommendations.
                    Be encouraging and specific. Focus on actionable next steps.
                    Return JSON with: nextScenario (object), focusAreas (array), streakTip (string), motivationalNote (string).`
                },
                {
                    role: 'user',
                    content: `Player profile:
- Skill Level: ${skillLevel}
- Recent Accuracy: ${avgAccuracy.toFixed(1)}%
- Total Sessions: ${profile?.total_sessions || 'Few'}
- Identified Leaks: ${leaks.slice(0, 3).join(', ') || 'None yet'}

Recommend:
1. What scenario they should practice next
2. 2-3 focus areas for improvement
3. A tip for maintaining their streak
4. A brief motivational note

Return as JSON only.`
                }
            ],
            temperature: 0.6,
            max_tokens: 600,
        });

        const responseText = completion.choices[0]?.message?.content;
        const cleanedResponse = responseText
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        const recommendations = JSON.parse(cleanedResponse);

        // Cache for 7 days
        await setCachedResponse('session-recommendations', cacheParams, recommendations, 7);

        return recommendations;

    } catch (error) {
        console.error('[SessionRecommendations] Jarvis error:', error);
        return getDefaultRecommendations();
    }
}

function getDefaultRecommendations() {
    return {
        nextScenario: {
            type: 'CO Opening Range',
            level: 3,
            reason: 'A fundamental spot to master'
        },
        focusAreas: [
            'Position awareness',
            'Stack depth adjustments',
            'Range visualization'
        ],
        streakTip: 'Play at least one game daily to build muscle memory',
        motivationalNote: 'Every session makes you a sharper player. Keep grinding!'
    };
}
