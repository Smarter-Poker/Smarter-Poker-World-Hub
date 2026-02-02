/**
 * 📊 WEEKLY LEAK REPORT CRON — JARVIS ANALYSIS
 * ═══════════════════════════════════════════════════════════════════════════
 * Runs every Monday at 8 AM UTC
 * Analyzes each user's training sessions from the past week
 * Generates personalized leak reports using Grok
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { getGrokClient } from '../../../src/lib/grokClient';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    // Verify cron secret
    if (process.env.NODE_ENV === 'production') {
        const authHeader = req.headers.authorization;
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Missing Supabase configuration' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        console.log('[WeeklyLeakReport] 📊 Starting weekly analysis...');

        // Calculate current week identifier
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - 7);
        const reportWeek = getWeekIdentifier(now);

        // Get all users who trained this week
        const { data: sessions, error: sessionsError } = await supabase
            .from('jarvis_training_sessions')
            .select('user_id, game_id, category, accuracy, questions_answered, questions_correct, answers_data, leaks_detected')
            .gte('created_at', weekStart.toISOString())
            .order('user_id');

        if (sessionsError) {
            throw sessionsError;
        }

        if (!sessions || sessions.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No training sessions this week',
                reportsGenerated: 0
            });
        }

        // Group sessions by user
        const userSessions = {};
        sessions.forEach(session => {
            if (!userSessions[session.user_id]) {
                userSessions[session.user_id] = [];
            }
            userSessions[session.user_id].push(session);
        });

        const grok = getGrokClient();
        let reportsGenerated = 0;

        // Generate report for each user
        for (const [userId, userSessionList] of Object.entries(userSessions)) {
            try {
                const report = await generateWeeklyReport(grok, userSessionList, userId);

                await supabase
                    .from('jarvis_weekly_reports')
                    .upsert({
                        user_id: userId,
                        report_week: reportWeek,
                        sessions_count: userSessionList.length,
                        questions_count: userSessionList.reduce((sum, s) => sum + s.questions_answered, 0),
                        accuracy: calculateAverageAccuracy(userSessionList),
                        primary_leaks: report.leaks,
                        improvements: report.improvements,
                        recommendations: report.recommendations,
                        grok_analysis: report.analysis,
                        created_at: new Date().toISOString(),
                    }, { onConflict: 'user_id,report_week' });

                reportsGenerated++;
            } catch (err) {
                console.error(`[WeeklyLeakReport] Error for user ${userId}:`, err.message);
            }
        }

        console.log(`[WeeklyLeakReport] ✅ Generated ${reportsGenerated} reports`);

        return res.status(200).json({
            success: true,
            message: 'Weekly reports generated',
            reportsGenerated,
            reportWeek,
        });

    } catch (error) {
        console.error('[WeeklyLeakReport] Error:', error);
        return res.status(500).json({ error: 'Failed to generate reports', details: error.message });
    }
}

async function generateWeeklyReport(grok, sessions, userId) {
    // Aggregate session data
    const totalQuestions = sessions.reduce((sum, s) => sum + s.questions_answered, 0);
    const totalCorrect = sessions.reduce((sum, s) => sum + s.questions_correct, 0);
    const avgAccuracy = totalQuestions > 0 ? (totalCorrect / totalQuestions * 100).toFixed(1) : 0;

    const allLeaks = sessions.flatMap(s => s.leaks_detected || []);
    const categories = [...new Set(sessions.map(s => s.category))];

    const prompt = `You are Jarvis, the personal poker AI coach. Generate a weekly training report.

USER'S WEEK:
- Sessions: ${sessions.length}
- Questions Answered: ${totalQuestions}
- Correct Answers: ${totalCorrect}
- Accuracy: ${avgAccuracy}%
- Categories Trained: ${categories.join(', ')}
- Detected Leaks: ${allLeaks.slice(0, 5).join(', ') || 'None'}

Generate a personalized weekly coaching report in JSON:
{
    "leaks": ["Top 3 most important leaks to fix"],
    "improvements": ["Areas where they improved this week"],
    "recommendations": ["3 specific drills or games to play next week"],
    "analysis": "2-3 sentence personalized coaching message"
}

Be encouraging but specific. Reference their actual performance.`;

    try {
        const response = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 400,
        });

        const content = response.choices[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (err) {
        console.error('[WeeklyLeakReport] Grok error:', err.message);
    }

    // Fallback report
    return {
        leaks: allLeaks.slice(0, 3),
        improvements: avgAccuracy >= 70 ? ['Overall accuracy is solid'] : ['Keep practicing!'],
        recommendations: ['Continue with your current training games'],
        analysis: `You completed ${sessions.length} training sessions this week with ${avgAccuracy}% accuracy. ${avgAccuracy >= 70 ? 'Great progress!' : 'Keep working on the fundamentals.'}`
    };
}

function getWeekIdentifier(date) {
    const year = date.getFullYear();
    const oneJan = new Date(year, 0, 1);
    const weekNum = Math.ceil((((date - oneJan) / 86400000) + oneJan.getDay() + 1) / 7);
    return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

function calculateAverageAccuracy(sessions) {
    const total = sessions.reduce((sum, s) => sum + s.questions_answered, 0);
    const correct = sessions.reduce((sum, s) => sum + s.questions_correct, 0);
    return total > 0 ? (correct / total * 100) : 0;
}
