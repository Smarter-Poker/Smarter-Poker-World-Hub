/**
 * 📊 TRAINING DATA → JARVIS INTEGRATION
 * ═══════════════════════════════════════════════════════════════════════════
 * Pushes all training session data to Jarvis (Personal Assistant)
 * Enables personalized coaching insights and leak detection
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const {
        userId,
        sessionId,
        gameId,
        gameName,
        category,
        level,
        questionsAnswered,
        questionsCorrect,
        accuracy,
        streak,
        timeSpentSeconds,
        answers,     // Array of { questionId, userAnswer, correctAnswer, wasCorrect, scenario }
        leaksDetected,  // Array of detected patterns/leaks
        timestamp,
    } = req.body;

    if (!userId || !gameId) {
        return res.status(400).json({ error: 'userId and gameId are required' });
    }

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Missing Supabase configuration' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        console.log(`[JarvisTraining] 📊 Recording session for user ${userId}: ${gameId} Level ${level}`);

        // 1. Store training session data for Jarvis analysis
        const sessionData = {
            user_id: userId,
            session_id: sessionId || `session_${Date.now()}`,
            game_id: gameId,
            game_name: gameName || gameId,
            category: category || 'UNKNOWN',
            level: level || 1,
            questions_answered: questionsAnswered || 0,
            questions_correct: questionsCorrect || 0,
            accuracy: accuracy || 0,
            best_streak: streak || 0,
            time_spent_seconds: timeSpentSeconds || 0,
            answers_data: answers || [],
            leaks_detected: leaksDetected || [],
            created_at: timestamp || new Date().toISOString(),
        };

        const { error: insertError } = await supabase
            .from('jarvis_training_sessions')
            .upsert(sessionData, { onConflict: 'session_id' });

        if (insertError) {
            console.error('[JarvisTraining] Insert error:', insertError);
            // Continue anyway - we don't want to break training flow
        }

        // 2. Analyze patterns and update user's training profile
        const analysisResult = analyzeSessionForLeaks(answers || []);

        // 3. Update Jarvis knowledge about this user
        const { data: existingProfile } = await supabase
            .from('jarvis_user_training_profile')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

        const updatedProfile = mergeTrainingProfile(existingProfile, {
            lastSession: sessionData,
            analysis: analysisResult,
            totalSessions: (existingProfile?.total_sessions || 0) + 1,
            totalQuestions: (existingProfile?.total_questions || 0) + questionsAnswered,
            overallAccuracy: calculateOverallAccuracy(existingProfile, questionsAnswered, questionsCorrect),
        });

        await supabase
            .from('jarvis_user_training_profile')
            .upsert({
                user_id: userId,
                ...updatedProfile,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });

        console.log(`[JarvisTraining] ✅ Data pushed to Jarvis for user ${userId}`);

        return res.status(200).json({
            success: true,
            message: 'Training session recorded for Jarvis',
            analysis: analysisResult,
            sessionId: sessionData.session_id,
        });

    } catch (error) {
        console.error('[JarvisTraining] Error:', error);
        return res.status(200).json({
            success: true,  // Don't fail the training session
            message: 'Session recorded (analysis deferred)',
            error: error.message,
        });
    }
}

/**
 * Analyze session answers for leak patterns
 */
function analyzeSessionForLeaks(answers) {
    if (!answers || answers.length === 0) {
        return { leaks: [], strengths: [], patterns: {} };
    }

    const leaks = [];
    const strengths = [];
    const patterns = {
        preflopMistakes: 0,
        postflopMistakes: 0,
        riverMistakes: 0,
        foldingTooMuch: 0,
        callingTooMuch: 0,
        bluffCatches: { correct: 0, incorrect: 0 },
        valueBets: { correct: 0, incorrect: 0 },
    };

    answers.forEach(answer => {
        if (!answer.wasCorrect) {
            const scenario = answer.scenario || {};
            const board = scenario.board || '';

            // Track street-based mistakes
            if (!board || board === 'Preflop') {
                patterns.preflopMistakes++;
            } else if (board.split(' ').length <= 3) {
                patterns.postflopMistakes++;
            } else {
                patterns.riverMistakes++;
            }

            // Track action-based mistakes
            if (answer.userAnswer?.toLowerCase().includes('fold')) {
                patterns.foldingTooMuch++;
            }
            if (answer.userAnswer?.toLowerCase().includes('call')) {
                patterns.callingTooMuch++;
            }
        }
    });

    // Generate leak insights
    const totalMistakes = answers.filter(a => !a.wasCorrect).length;
    if (patterns.riverMistakes > totalMistakes * 0.4) {
        leaks.push('River decisions are your biggest leak');
    }
    if (patterns.foldingTooMuch > totalMistakes * 0.3) {
        leaks.push('You may be folding too often in key spots');
    }
    if (patterns.callingTooMuch > totalMistakes * 0.3) {
        leaks.push('Consider raising more instead of flat calling');
    }

    // Generate strength insights
    const correctAnswers = answers.filter(a => a.wasCorrect).length;
    const accuracy = (correctAnswers / answers.length) * 100;
    if (accuracy >= 80) {
        strengths.push('Strong overall GTO understanding');
    }
    if (patterns.preflopMistakes === 0 && answers.length >= 5) {
        strengths.push('Solid preflop fundamentals');
    }

    return { leaks, strengths, patterns, accuracy };
}

/**
 * Merge new session data with existing profile
 */
function mergeTrainingProfile(existing, newData) {
    return {
        total_sessions: newData.totalSessions,
        total_questions: newData.totalQuestions,
        overall_accuracy: newData.overallAccuracy,
        last_session_date: new Date().toISOString(),
        favorite_games: updateFavoriteGames(existing?.favorite_games, newData.lastSession.game_id),
        identified_leaks: mergeLeaks(existing?.identified_leaks, newData.analysis.leaks),
        identified_strengths: mergeLeaks(existing?.identified_strengths, newData.analysis.strengths),
        skill_assessment: calculateSkillLevel(newData.overallAccuracy, newData.totalSessions),
    };
}

function calculateOverallAccuracy(existing, newAnswered, newCorrect) {
    if (!existing) return newAnswered > 0 ? (newCorrect / newAnswered) * 100 : 0;

    const totalAnswered = (existing.total_questions || 0) + newAnswered;
    const totalCorrect = ((existing.overall_accuracy || 0) / 100 * (existing.total_questions || 0)) + newCorrect;

    return totalAnswered > 0 ? (totalCorrect / totalAnswered) * 100 : 0;
}

function updateFavoriteGames(existing, gameId) {
    const games = existing || {};
    games[gameId] = (games[gameId] || 0) + 1;
    return games;
}

function mergeLeaks(existing, newLeaks) {
    const combined = new Set([...(existing || []), ...(newLeaks || [])]);
    return [...combined].slice(0, 10);  // Keep top 10
}

function calculateSkillLevel(accuracy, sessions) {
    if (sessions < 5) return 'Beginner';
    if (accuracy >= 90) return 'Expert';
    if (accuracy >= 80) return 'Advanced';
    if (accuracy >= 70) return 'Intermediate';
    return 'Developing';
}
