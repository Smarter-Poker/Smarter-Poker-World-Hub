/* ═══════════════════════════════════════════════════════════════════════════
   GEEVES API v2.0 — Smart Caching + Grok-powered poker strategy expert
   - First checks cache for existing answers
   - Falls back to Grok for new questions
   - Stores all new answers in cache for future use
   ═══════════════════════════════════════════════════════════════════════════ */

import { getGrokClient } from '../../../src/lib/grokClient';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ═══════════════════════════════════════════════════════════════════════════
// GEEVES SYSTEM PROMPT — Comprehensive poker knowledge
// ═══════════════════════════════════════════════════════════════════════════
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

FORMAT YOUR RESPONSES:
- Use **bold** for key concepts
- Use bullet points for lists
- Use code blocks for ranges (e.g., \`AA, KK, QQ, AKs\`)
- Keep paragraphs concise
- Use headers (##) for sections when appropriate

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

Remember: You are Geeves, the poker expert. Be sophisticated, knowledgeable, and helpful!`;

// ═══════════════════════════════════════════════════════════════════════════
// CACHE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function normalizeQuestion(question) {
    return question
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ');
}

function hashQuestion(question) {
    const normalized = normalizeQuestion(question);
    return crypto.createHash('md5').update(normalized).digest('hex');
}

function detectQuestionType(question) {
    const q = question.toLowerCase();

    if (q.includes('gto') || q.includes('optimal') || q.includes('theory')) return 'gto';
    if (q.includes('tournament') || q.includes('icm') || q.includes('bubble')) return 'tournament';
    if (q.includes('cash') || q.includes('cash game')) return 'cash_game';
    if (q.includes('hand') || q.includes('analyze') || q.includes('should i')) return 'hand_analysis';
    if (q.includes('range') || q.includes('3-bet') || q.includes('3bet') || q.includes('open')) return 'ranges';
    if (q.includes('equity') || q.includes('odds') || q.includes('math') || q.includes('ev')) return 'math';
    if (q.includes('study') || q.includes('learn') || q.includes('improve')) return 'learning';

    return 'general';
}

function extractTags(question) {
    const tags = [];
    const q = question.toLowerCase();

    // Position tags
    if (q.includes('button') || q.includes('btn')) tags.push('button');
    if (q.includes('cutoff') || q.includes('co')) tags.push('cutoff');
    if (q.includes('utg') || q.includes('under the gun')) tags.push('utg');
    if (q.includes('blind') || q.includes('sb') || q.includes('bb')) tags.push('blinds');

    // Game type tags
    if (q.includes('holdem') || q.includes('hold\'em') || q.includes('nlhe')) tags.push('holdem');
    if (q.includes('plo') || q.includes('omaha')) tags.push('plo');
    if (q.includes('tournament') || q.includes('mtt')) tags.push('tournament');
    if (q.includes('cash')) tags.push('cash');

    // Concept tags
    if (q.includes('bluff')) tags.push('bluffing');
    if (q.includes('value')) tags.push('value');
    if (q.includes('fold')) tags.push('folding');
    if (q.includes('raise') || q.includes('bet')) tags.push('betting');
    if (q.includes('call')) tags.push('calling');

    return tags;
}

// ═══════════════════════════════════════════════════════════════════════════
// CACHE LOOKUP
// ═══════════════════════════════════════════════════════════════════════════

async function checkExactCache(questionHash) {
    const { data, error } = await supabase
        .from('geeves_knowledge_cache')
        .select('*')
        .eq('question_hash', questionHash)
        .single();

    if (error || !data) return null;
    return data;
}

async function checkSimilarCache(question) {
    // Use PostgreSQL full-text search for similar questions
    const { data, error } = await supabase
        .rpc('find_similar_questions', {
            search_query: question,
            similarity_threshold: 0.3,
            max_results: 1
        });

    if (error || !data || data.length === 0) return null;

    // Only return if similarity is high enough
    if (data[0].similarity >= 0.5) {
        return data[0];
    }

    return null;
}

async function incrementCacheServed(cacheId) {
    await supabase.rpc('increment_cache_served', { cache_uuid: cacheId });
}

async function saveToCache(question, answer, questionType, userId) {
    const { data, error } = await supabase
        .from('geeves_knowledge_cache')
        .insert({
            question_normalized: normalizeQuestion(question),
            question_hash: hashQuestion(question),
            question_original: question,
            answer: answer,
            answer_tokens: answer.split(/\s+/).length,
            question_type: questionType,
            tags: extractTags(question),
            created_by: userId,
            times_served: 1,
            last_served_at: new Date().toISOString()
        })
        .select()
        .single();

    if (error) {
        console.error('[Geeves Cache] Failed to save:', error);
        return null;
    }

    return data;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

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

        const questionHash = hashQuestion(question);
        const questionType = detectQuestionType(question);

        console.log('[Geeves] Processing:', question.substring(0, 80));
        console.log('[Geeves] Hash:', questionHash);

        // ═══════════════════════════════════════════════════════════════════
        // STEP 1: Check exact cache match
        // ═══════════════════════════════════════════════════════════════════
        let cachedAnswer = await checkExactCache(questionHash);

        if (cachedAnswer) {
            console.log('[Geeves] ✅ EXACT CACHE HIT! Times served:', cachedAnswer.times_served + 1);

            await incrementCacheServed(cachedAnswer.id);

            // Save to conversation if ID provided
            if (conversationId) {
                await saveConversationMessages(conversationId, question, cachedAnswer.answer, cachedAnswer.id, true);
            }

            // Track analytics
            await trackAnalytics(user.id, questionType, question, cachedAnswer.answer.length, true);

            return res.status(200).json({
                answer: cachedAnswer.answer,
                questionType,
                fromCache: true,
                cacheId: cachedAnswer.id,
                timesServed: cachedAnswer.times_served + 1,
                avgRating: cachedAnswer.avg_rating
            });
        }

        // ═══════════════════════════════════════════════════════════════════
        // STEP 2: Check similar questions (fuzzy match)
        // ═══════════════════════════════════════════════════════════════════
        const similarAnswer = await checkSimilarCache(question);

        if (similarAnswer) {
            console.log('[Geeves] ✅ SIMILAR CACHE HIT! Similarity:', similarAnswer.similarity);

            await incrementCacheServed(similarAnswer.id);

            if (conversationId) {
                await saveConversationMessages(conversationId, question, similarAnswer.answer, similarAnswer.id, true);
            }

            await trackAnalytics(user.id, questionType, question, similarAnswer.answer.length, true);

            return res.status(200).json({
                answer: similarAnswer.answer,
                questionType,
                fromCache: true,
                cacheId: similarAnswer.id,
                timesServed: similarAnswer.times_served + 1,
                avgRating: similarAnswer.avg_rating,
                similarTo: similarAnswer.question_original
            });
        }

        // ═══════════════════════════════════════════════════════════════════
        // STEP 3: No cache hit — call Grok
        // ═══════════════════════════════════════════════════════════════════
        console.log('[Geeves] ❌ Cache miss — calling Grok API...');

        const grok = getGrokClient();

        // Build messages array with conversation history
        const messages = [
            { role: 'system', content: GEEVES_SYSTEM_PROMPT }
        ];

        // Add conversation history if provided (for context)
        if (conversationHistory && conversationHistory.length > 0) {
            // Only include last 6 messages for context
            const recentHistory = conversationHistory.slice(-6);
            recentHistory.forEach(msg => {
                messages.push({
                    role: msg.isUser ? 'user' : 'assistant',
                    content: msg.content
                });
            });
        }

        messages.push({ role: 'user', content: question });

        const response = await grok.chat.completions.create({
            model: 'grok-beta',
            messages,
            temperature: 0.7,
            max_tokens: 2000,
            stream: false
        });

        const answer = response.choices[0].message.content;
        console.log('[Geeves] Grok response received:', answer.substring(0, 100));

        // ═══════════════════════════════════════════════════════════════════
        // STEP 4: Save to cache for future use
        // ═══════════════════════════════════════════════════════════════════
        const cacheEntry = await saveToCache(question, answer, questionType, user.id);
        console.log('[Geeves] 💾 Saved to cache:', cacheEntry?.id);

        // Save to conversation
        if (conversationId) {
            await saveConversationMessages(conversationId, question, answer, cacheEntry?.id, false);
        }

        // Track analytics
        await trackAnalytics(user.id, questionType, question, answer.length, false);

        return res.status(200).json({
            answer,
            questionType,
            fromCache: false,
            cacheId: cacheEntry?.id,
            timesServed: 1
        });

    } catch (error) {
        console.error('[Geeves] Error:', error);
        return res.status(500).json({
            error: 'Failed to process question',
            details: error.message
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function saveConversationMessages(conversationId, question, answer, cacheId, fromCache) {
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
        is_user: false,
        cache_id: cacheId,
        from_cache: fromCache
    });

    // Update conversation timestamp
    await supabase
        .from('geeves_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);
}

async function trackAnalytics(userId, questionType, question, responseLength, fromCache) {
    await supabase.from('geeves_analytics').insert({
        user_id: userId,
        question_type: questionType,
        question: question.substring(0, 500),
        response_length: responseLength,
        metadata: { from_cache: fromCache }
    });
}
