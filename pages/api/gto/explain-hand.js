/**
 * 🤖 Explain Hand API
 * 
 * Uses Grok to explain why a specific poker action is GTO-correct.
 * Returns natural language explanation of the solver logic.
 * 
 * POST /api/gto/explain-hand
 * Body: { hand, position, stackDepth, correctAction, userAction, scenario }
 */

import { getGrokClient } from '../../../src/lib/grokClient';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            hand,           // e.g., "JTs"
            position,       // e.g., "CO"
            stackDepth,     // e.g., 100
            correctAction,  // e.g., "call"
            userAction,     // e.g., "fold" (what user selected)
            scenario        // Full scenario context
        } = req.body;

        if (!hand || !correctAction) {
            return res.status(400).json({
                error: 'Missing required fields: hand, correctAction'
            });
        }

        const prompt = buildExplanationPrompt(
            hand,
            position,
            stackDepth,
            correctAction,
            userAction,
            scenario
        );

        const grok = getGrokClient();
        const completion = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [
                {
                    role: 'system',
                    content: `You are a GTO poker coach explaining strategic concepts to students. 
                    Be concise but insightful. Explain the "why" behind the GTO decision.
                    Use poker terminology but keep explanations accessible.
                    Format: 2-3 short sentences, then a key takeaway.
                    Never be condescending - treat the player as a fellow poker enthusiast learning.`
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.6,
            max_tokens: 300,
        });

        const explanation = completion.choices[0]?.message?.content;

        if (!explanation) {
            throw new Error('Empty response from Grok');
        }

        return res.status(200).json({
            success: true,
            hand,
            correctAction,
            userAction,
            explanation: explanation.trim(),
            generatedAt: new Date().toISOString(),
        });

    } catch (error) {
        console.error('[ExplainHand] Error:', error);

        // Graceful fallback
        return res.status(200).json({
            success: true,
            hand: req.body.hand,
            correctAction: req.body.correctAction,
            userAction: req.body.userAction,
            explanation: getDefaultExplanation(
                req.body.hand,
                req.body.correctAction,
                req.body.userAction
            ),
            fallback: true,
            generatedAt: new Date().toISOString(),
        });
    }
}

function buildExplanationPrompt(hand, position, stackDepth, correctAction, userAction, scenario) {
    const userMistake = userAction && userAction !== correctAction
        ? `The player chose to ${userAction} instead.`
        : '';

    return `Explain why ${hand} should be a ${correctAction.toUpperCase()} in this poker spot:

Position: ${position || 'Unknown'}
Stack Depth: ${stackDepth || 100}bb
Scenario: ${scenario?.title || 'Standard preflop spot'}
${scenario?.description ? `Context: ${scenario.description}` : ''}

${userMistake}

Explain the GTO reasoning for why ${hand} should ${correctAction}. Consider:
- Hand equity and playability
- Position dynamics
- Stack-to-pot ratio implications
- Why the alternative action (${userAction || 'fold'}) is suboptimal

Be direct and insightful. Focus on the "why" not just the "what".`;
}

function getDefaultExplanation(hand, correctAction, userAction) {
    const handStrength = getHandStrengthDescription(hand);
    const actionVerb = correctAction === 'raise' ? 'raising'
        : correctAction === 'call' ? 'calling'
            : correctAction === '3bet' ? '3-betting'
                : 'playing';

    return `${hand} has ${handStrength}, making ${actionVerb} the correct play in this spot. ` +
        `The hand's playability and equity distribution favor an aggressive approach. ` +
        `💡 Key insight: Position and stack depth heavily influence preflop decisions.`;
}

function getHandStrengthDescription(hand) {
    if (!hand) return 'good potential';

    // Pocket pairs
    if (hand.length === 2 && hand[0] === hand[1]) {
        const rank = hand[0];
        if ('AKQJ'.includes(rank)) return 'premium pair strength';
        if ('T987'.includes(rank)) return 'medium pair value';
        return 'small pair set-mining potential';
    }

    // Suited hands
    if (hand.endsWith('s')) {
        if (hand.startsWith('A')) return 'suited ace playability';
        if ('KQ'.includes(hand[0]) && 'AKQJ'.includes(hand[1])) return 'strong broadway potential';
        if ('987654'.includes(hand[0]) && '87654'.includes(hand[1])) return 'suited connector value';
        return 'reasonable suited hand equity';
    }

    // Offsuit
    if (hand.endsWith('o')) {
        if (hand.startsWith('A') && 'KQJ'.includes(hand[1])) return 'strong offsuit broadway value';
        return 'marginal offsuit holding';
    }

    return 'reasonable hand strength';
}
