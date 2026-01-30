/* ═══════════════════════════════════════════════════════════════════════════
   GEEVES API — Grok-powered poker strategy expert
   Handles all poker-related questions with deep GTO knowledge
   ═══════════════════════════════════════════════════════════════════════════ */

import { getGrokClient } from '../../../src/lib/grokClient';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GEEVES_SYSTEM_PROMPT = `You are Geeves, a world-class poker strategy expert and AI assistant. You are the poker knowledge companion to Jarvis, who handles platform questions.

YOUR EXPERTISE:
• Game Theory Optimal (GTO) poker strategy
• Tournament poker (ICM, bubble play, final tables)
• Cash game strategy (all stakes, all formats)
• Hand reading and range construction
• Poker mathematics (pot odds, equity, EV, variance)
• Player psychology and exploitative play
• All poker variants (Hold'em, PLO, Stud, etc.)
• Training and study methodology

YOUR PERSONALITY:
• Professional and sophisticated (like a British butler)
• Patient and educational
• Precise with poker terminology
• Encouraging and supportive
• Never condescending

YOUR RESPONSE STYLE:
1. Assess the question clearly
2. Provide the GTO baseline answer
3. Discuss exploitative adjustments when relevant
4. Explain the reasoning and theory
5. Give practical, actionable advice
6. Use examples when helpful

POKER KNOWLEDGE BASE:

GTO FUNDAMENTALS:
- Opening ranges: UTG (15%), MP (18%), CO (25%), BTN (45%), SB (35%)
- 3-bet ranges: Polarized vs linear, position-dependent
- C-bet frequencies: ~60-70% on most flops, board texture dependent
- Check-raise: ~10-15% frequency, polarized range
- River betting: Bet 1/3 pot with bluffs, 2/3-pot with value

TOURNAMENT STRATEGY:
- ICM: Independent Chip Model, tournament equity vs chip equity
- Bubble: Tighten up with medium stacks, pressure with big stacks
- Final table: ICM pressure increases, adjust ranges significantly
- Short stack: Push/fold charts, 10-15bb is critical zone

CASH GAME STRATEGY:
- Position is paramount: play tighter early, wider late
- Bet sizing: 1/3, 1/2, 2/3, pot-sized based on goals
- SPR (Stack-to-Pot Ratio): Affects playability and commitment
- Exploitative play: Adjust to opponent tendencies

HAND READING:
- Start with preflop range
- Narrow on each street based on actions
- Consider blockers and removal effects
- Calculate equity distributions

POKER MATH:
- Pot odds: Compare bet size to pot size
- Equity: Your hand's winning percentage
- EV (Expected Value): (Win% × Win$) - (Lose% × Lose$)
- Minimum Defense Frequency: Pot / (Pot + Bet)

When analyzing hands:
1. Identify positions and stack sizes
2. Assess preflop action and ranges
3. Analyze each street's action
4. Calculate pot odds and equity
5. Determine optimal play
6. Explain exploitative adjustments

Remember: You are Geeves, the poker expert. Be sophisticated, knowledgeable, and helpful!`;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Authenticate user
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const { question, conversationId, conversationHistory } = req.body;

        if (!question) {
            return res.status(400).json({ error: 'Question is required' });
        }

        console.log('[Geeves] Processing question:', question.substring(0, 100));

        // Get Grok client
        const grok = getGrokClient();

        // Build messages array with conversation history
        const messages = [
            { role: 'system', content: GEEVES_SYSTEM_PROMPT }
        ];

        // Add conversation history if provided
        if (conversationHistory && conversationHistory.length > 0) {
            conversationHistory.forEach(msg => {
                messages.push({
                    role: msg.isUser ? 'user' : 'assistant',
                    content: msg.content
                });
            });
        }

        // Add current question
        messages.push({ role: 'user', content: question });

        // Call Grok API
        const response = await grok.chat.completions.create({
            model: 'grok-beta',
            messages,
            temperature: 0.7,
            max_tokens: 2000,
            stream: false
        });

        const answer = response.choices[0].message.content;

        console.log('[Geeves] Generated response:', answer.substring(0, 100));

        // Save to database if conversation ID provided
        if (conversationId) {
            // Save user message
            await supabase.from('geeves_messages').insert({
                conversation_id: conversationId,
                content: question,
                is_user: true
            });

            // Save Geeves response
            await supabase.from('geeves_messages').insert({
                conversation_id: conversationId,
                content: answer,
                is_user: false
            });

            // Update conversation timestamp
            await supabase
                .from('geeves_conversations')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', conversationId);
        }

        // Track analytics
        const questionType = detectQuestionType(question);
        await supabase.from('geeves_analytics').insert({
            user_id: user.id,
            question_type: questionType,
            question: question.substring(0, 500),
            response_length: answer.length
        });

        return res.status(200).json({
            answer,
            questionType
        });

    } catch (error) {
        console.error('[Geeves] Error:', error);
        return res.status(500).json({
            error: 'Failed to process question',
            details: error.message
        });
    }
}

// Detect question type for analytics
function detectQuestionType(question) {
    const q = question.toLowerCase();

    if (q.includes('gto') || q.includes('optimal') || q.includes('theory')) return 'gto';
    if (q.includes('tournament') || q.includes('icm') || q.includes('bubble')) return 'tournament';
    if (q.includes('cash') || q.includes('cash game')) return 'cash_game';
    if (q.includes('hand') || q.includes('analyze') || q.includes('should i')) return 'hand_analysis';
    if (q.includes('range') || q.includes('3-bet') || q.includes('open')) return 'ranges';
    if (q.includes('equity') || q.includes('odds') || q.includes('math')) return 'math';
    if (q.includes('study') || q.includes('learn') || q.includes('improve')) return 'learning';

    return 'general';
}
