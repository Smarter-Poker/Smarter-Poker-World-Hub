/**
 * 💬 POST-GAME AI COACHING SESSION
 * ═══════════════════════════════════════════════════════════════════════════
 * After completing a level, Grok provides personalized coaching feedback
 * Analyzes performance patterns and gives actionable advice
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { getGrokClient } from '../../../src/lib/grokClient';
import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── Auth: verify JWT (prevent unauthenticated AI API abuse) ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Auth required' });
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const {
        gameId,
        gameName,
        level,
        questionsAnswered,
        questionsCorrect,
        accuracy,
        streak,
        timeSpentSeconds,
        mistakes,  // Array of { question, userAnswer, correctAnswer }
    } = req.body;

    if (!gameId || !level || questionsAnswered === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const grok = getGrokClient();
        const mistakesStr = mistakes?.length > 0
            ? mistakes.map((m, i) => `
Mistake ${i + 1}:
- Question: ${m.question?.question || 'Unknown'}
- User answered: ${m.userAnswer}
- Correct was: ${m.correctAnswer}
- Scenario: ${JSON.stringify(m.question?.scenario || {})}`).join('\n')
            : 'No mistakes - perfect round!';

        const prompt = `You are an elite GTO poker coach providing a post-session debrief.

TRAINING SESSION RESULTS:
- Game: ${gameName || gameId}
- Level: ${level}/10
- Score: ${questionsCorrect}/${questionsAnswered} (${accuracy}%)
- Best Streak: ${streak || 0}
- Time: ${Math.round((timeSpentSeconds || 0) / 60)} minutes

MISTAKES MADE:
${mistakesStr}

Provide coaching feedback in this JSON format:
{
    "overallGrade": "${accuracy >= 90 ? 'A' : accuracy >= 80 ? 'B' : accuracy >= 70 ? 'C' : 'D'}",
    "headline": "Brief encouraging headline about their performance",
    "strengths": ["List 1-2 things they did well"],
    "areasToImprove": ["List 1-2 specific concepts to work on based on their mistakes"],
    "detailedFeedback": "2-3 sentences of personalized coaching. Reference their specific mistakes if any.",
    "recommendedDrill": {
        "name": "Specific drill or game to try next",
        "reason": "Why this will help"
    },
    "motivationalQuote": "A short poker wisdom quote to inspire them",
    "readyForNextLevel": ${accuracy >= 70 ? 'true' : 'false'}
}

Be encouraging but honest. Reference specific mistakes they made. Keep it conversational like a real coach.`;

        const response = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 500,
        });

        const content = response.choices[0]?.message?.content || '';

        // Try to extract JSON
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const coaching = JSON.parse(jsonMatch[0]);

            return res.status(200).json({
                success: true,
                coaching,
                generatedBy: 'grok-3'
            });
        }

        // Fallback
        return res.status(200).json({
            success: true,
            coaching: generateFallbackCoaching(accuracy, questionsCorrect, questionsAnswered, level),
            generatedBy: 'fallback'
        });

    } catch (error) {
        console.error('[GrokCoaching] Error:', error.message);

        return res.status(200).json({
            success: true,
            coaching: generateFallbackCoaching(accuracy, questionsCorrect, questionsAnswered, level),
            generatedBy: 'fallback'
        });
    }
}

function generateFallbackCoaching(accuracy, correct, total, level) {
    const isPassing = accuracy >= 70;
    const isPerfect = accuracy === 100;

    return {
        overallGrade: accuracy >= 90 ? 'A' : accuracy >= 80 ? 'B' : accuracy >= 70 ? 'C' : 'D',
        headline: isPerfect
            ? '🏆 Perfect Score! Flawless execution!'
            : isPassing
                ? '✅ Great work! You passed this level.'
                : '📚 Keep practicing - you\'ll get there!',
        strengths: isPassing
            ? ['Solid decision-making under pressure', 'Good understanding of fundamentals']
            : ['You\'re putting in the work', 'Learning from mistakes'],
        areasToImprove: isPassing
            ? ['Continue to edge cases and advanced spots']
            : ['Review the basic concepts for this game', 'Take your time with each decision'],
        detailedFeedback: isPassing
            ? `You scored ${correct}/${total} at Level ${level}. Great job! Focus on any mistakes you made and understand why the GTO play differs from your instinct.`
            : `You scored ${correct}/${total} at Level ${level}. Don't be discouraged - poker is complex. Review each mistake and understand the solver's reasoning.`,
        recommendedDrill: {
            name: isPassing ? 'Try the next level!' : 'Retry this level',
            reason: isPassing ? 'You\'re ready for more challenge' : 'Solidify these concepts before advancing'
        },
        motivationalQuote: '"The best players are always learning." - Daniel Negreanu',
        readyForNextLevel: isPassing
    };
}
