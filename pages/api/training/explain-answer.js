/**
 * 🧠 REAL-TIME GTO EXPLANATION ENGINE
 * ═══════════════════════════════════════════════════════════════════════════
 * Provides deep solver-level analysis for any training answer
 * Uses Grok to generate contextual, educational explanations
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { getGrokClient } from '../../../src/lib/grokClient';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const {
        question,      // The original question object
        userAnswer,    // What the user selected
        correctAnswer, // The correct answer
        wasCorrect,    // Boolean
        gameId,        // Game context
        level,         // Difficulty level
    } = req.body;

    if (!question || !userAnswer || !correctAnswer) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
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
            console.log(`[GrokExplain] ✅ Generated explanation for ${gameId}`);

            return res.status(200).json({
                success: true,
                explanation,
                wasCorrect,
                generatedBy: 'grok-3'
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
            generatedBy: 'grok-3-fallback'
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
            generatedBy: 'fallback'
        });
    }
}
