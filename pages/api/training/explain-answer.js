/**
 * 🧠 REAL-TIME GTO EXPLANATION ENGINE (WITH CACHING)
 * ═══════════════════════════════════════════════════════════════════════════
 * Provides deep solver-level analysis for any training answer
 * CACHES Grok responses to prevent redundant API calls
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { getGrokClient } from '../../../src/lib/grokClient';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Generate a hash key for the scenario (for cache lookup)
function generateCacheKey(question, correctAnswer) {
    const scenario = question.scenario || {};
    const keyData = JSON.stringify({
        q: question.question,
        heroPos: scenario.heroPosition,
        heroHand: scenario.heroHand,
        board: scenario.board,
        action: scenario.action,
        villainPos: scenario.villainPosition,
        correctAnswer
    });
    return crypto.createHash('md5').update(keyData).digest('hex');
}

export default async function handler(req, res) {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // ── Auth: verify JWT (prevent unauthenticated AI API abuse) ──
    const supabase = createClient(supabaseUrl, supabaseKey);
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const {
        question,      // The original question object
        userAnswer,    // What the user selected
        correctAnswer, // The correct answer
        wasCorrect,    // Boolean
        gameId,        // Game context
        level,         // Difficulty level
    } = req.body;

    if (!question || !userAnswer || !correctAnswer) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const cacheKey = generateCacheKey(question, correctAnswer);

    try {
        // 🔍 CHECK CACHE FIRST
        const { data: cached } = await supabase
            .from('grok_explanation_cache')
            .select('explanation, was_correct')
            .eq('cache_key', cacheKey)
            .eq('was_correct', wasCorrect)
            .single();

        if (cached?.explanation) {
            return res.status(200).json({
                success: true,
                explanation: cached.explanation,
                wasCorrect,
                generatedBy: 'cache',
                cached: true
            });
        }


        // 🧠 QUERY GROK
        const grok = getGrokClient();
        const scenario = question.scenario || {};

        const prompt = `You are a world-class GTO poker coach. A student just ${wasCorrect ? 'CORRECTLY' : 'INCORRECTLY'} answered a training question.

QUESTION: ${question.question}
SCENARIO:
- Hero Position: ${scenario.heroPosition || 'Unknown'}
- Hero Hand: ${scenario.heroHand || 'Unknown'}
- Board: ${scenario.board || 'Preflop'}
- Pot Size: ${scenario.pot || 'N/A'}
- Villain Position: ${scenario.villainPosition || 'Unknown'}
- Action: ${scenario.action || 'N/A'}
- Stack Depth: ${scenario.heroStack || 100}bb

USER'S ANSWER: ${userAnswer}
CORRECT ANSWER: ${correctAnswer}
RESULT: ${wasCorrect ? '✅ CORRECT' : '❌ INCORRECT'}

${wasCorrect
                ? 'Reinforce WHY this is correct with solver-level analysis. Make the student feel confident in their decision.'
                : 'Explain WHY their answer was wrong and WHY the correct answer is optimal. Be encouraging but educational.'}

Provide your analysis in this JSON format:
{
    "headline": "${wasCorrect ? 'Excellent decision!' : 'Good learning opportunity'}",
    "shortExplanation": "One sentence summary of the key concept",
    "deepDive": {
        "equityAnalysis": "How does hero's equity compare vs villain's range?",
        "rangeConsiderations": "What ranges are we representing and what does villain have?",
        "evCalculation": "Brief EV breakdown if relevant",
        "boardTexture": "How does the board favor hero or villain's range?"
    },
    "keyTakeaway": "The #1 thing to remember from this spot",
    "similarSpots": "When else should you apply this concept?",
    "confidence": ${wasCorrect ? '0.95' : '0.7'}
}

Keep explanations concise but insightful. Use poker terminology appropriately for the skill level.`;

        const response = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 600,
        });

        const content = response.choices[0]?.message?.content || '';

        // Try to extract JSON
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const explanation = JSON.parse(jsonMatch[0]);

            // 💾 SAVE TO CACHE
            await supabase
                .from('grok_explanation_cache')
                .upsert({
                    cache_key: cacheKey,
                    was_correct: wasCorrect,
                    question_hash: cacheKey,
                    game_id: gameId,
                    explanation,
                    hit_count: 1,
                    created_at: new Date().toISOString()
                }, { onConflict: 'cache_key,was_correct' })
                .then(() => console.log(`[GrokExplain] 💾 Cached response for ${cacheKey.slice(0, 8)}...`));

            return res.status(200).json({
                success: true,
                explanation,
                wasCorrect,
                generatedBy: 'grok-3',
                cached: false
            });
        }

        // Fallback if JSON extraction fails
        return res.status(200).json({
            success: true,
            explanation: {
                headline: wasCorrect ? 'Great play!' : 'Almost there!',
                shortExplanation: content.slice(0, 200),
                deepDive: null,
                keyTakeaway: wasCorrect
                    ? 'Your understanding of this concept is solid.'
                    : 'Review the correct answer and the reasoning behind it.',
                confidence: 0.5
            },
            wasCorrect,
            generatedBy: 'grok-3-fallback',
            cached: false
        });

    } catch (error) {
        console.error('[GrokExplain] Error:', error.message);

        // Return graceful fallback
        return res.status(200).json({
            success: true,
            explanation: {
                headline: wasCorrect ? 'Correct!' : 'Incorrect',
                shortExplanation: question.explanation || 'Review the solver-approved play for this spot.',
                keyTakeaway: wasCorrect
                    ? 'You made the GTO-optimal decision.'
                    : 'The solver recommends a different action here.',
                confidence: 0.3
            },
            wasCorrect,
            generatedBy: 'fallback',
            cached: false
        });
    }
}
