/* ═══════════════════════════════════════════════════════════════════════════
   GEEVES CHAT API — Lightweight endpoint for GeevesMenuWidget
   Now includes cache lookup before calling Grok for efficiency
   ═══════════════════════════════════════════════════════════════════════════ */

import { getGrokClient } from '../../../src/lib/grokClient';
import { createClient } from '../../../src/lib/supabaseServerClient';
import crypto from 'crypto';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../src/lib/serverAuth';
import { lookupKnowledgeBase } from '../../../src/lib/geevesKnowledgeBase';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GEEVES_SYSTEM_PROMPT = `You are Geeves, a world-class poker strategy expert and AI assistant.

YOUR EXPERTISE:
• Game Theory Optimal (GTO) poker strategy
• Tournament poker (ICM, bubble play, final tables)
• Cash game strategy (all stakes, all formats)
• Hand reading and range construction
• Poker mathematics (pot odds, equity, EV, variance)

YOUR PERSONALITY:
• Professional and sophisticated (like a British butler)
• Patient and educational
• Precise with poker terminology
• Encouraging and supportive

YOUR RESPONSE STYLE:
1. Assess the question clearly
2. Provide the GTO baseline answer
3. Explain the reasoning and theory
4. Give practical, actionable advice
5. Use examples when helpful

Keep responses concise for the messenger widget (2-3 paragraphs max).`;

// ── Cache utilities (shared with ask.js) ──
function normalizeQuestion(q) {
    return q.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
}
function hashQuestion(q) {
    return crypto.createHash('md5').update(normalizeQuestion(q)).digest('hex');
}

export default async function handler(req, res) {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // ── Parse body first (before auth, so KB can serve guests) ──
    const { message, context, history } = req.body;

    if (!message) {
        return res.status(400).json({ success: false, error: 'Message is required' });
    }

    // ── STEP 0: Check Local KB (FREE, instant, no auth needed) ──
    const kbResult = lookupKnowledgeBase(message);
    if (kbResult && kbResult.confidence >= 45) {
        return res.status(200).json({
            response: kbResult.answer,
            message: kbResult.answer,
            success: true,
            fromLocalKB: true,
            followUps: kbResult.followUps || [],
        });
    }

    // ── Auth: required for cache + Grok tiers ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        if (kbResult && kbResult.confidence >= 30) {
            return res.status(200).json({ response: kbResult.answer, message: kbResult.answer, success: true, fromLocalKB: true, followUps: kbResult.followUps || [], guestMode: true });
        }
        return res.status(401).json({ success: false, error: 'Sign in for AI-powered answers' });
    }
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    try {

        // ── STEP 1: Check cache before calling Grok ──
        const questionHash = hashQuestion(message);
        try {
            const { data: cached } = await supabaseAdmin
                .from('geeves_knowledge_cache')
                .select('id, answer, times_served, avg_rating')
                .eq('question_hash', questionHash)
                .maybeSingle();

            if (cached) {
                // Increment served counter
                await supabaseAdmin.rpc('increment_cache_served', { cache_uuid: cached.id }).catch(() => { });

                return res.status(200).json({
                    response: cached.answer,
                    message: cached.answer,
                    success: true,
                    fromCache: true,
                    cacheId: cached.id,
                });
            }
        } catch (cacheErr) {
            // Cache miss or table doesn't exist yet — continue to Grok
            console.warn('[Geeves Chat] Cache lookup failed (non-critical):', cacheErr.message);
        }

        // ── STEP 2: No cache hit — call Grok ──
        const grok = getGrokClient();

        // Build messages array
        const messages = [
            { role: 'system', content: GEEVES_SYSTEM_PROMPT }
        ];

        // Add conversation history if provided
        if (history && history.length > 0) {
            const recentHistory = history.slice(-6);
            recentHistory.forEach(msg => {
                messages.push({
                    role: msg.role === 'user' ? 'user' : 'assistant',
                    content: msg.content
                });
            });
        }

        messages.push({ role: 'user', content: message });

        const response = await grok.chat.completions.create({
            model: 'grok-beta',
            messages,
            temperature: 0.7,
            max_tokens: 800, // Shorter for widget
            stream: false
        });

        const answer = response.choices[0].message.content;

        // ── STEP 3: Save to cache for future use ──
        let cacheId = null;
        try {
            const { data: newCache } = await supabaseAdmin
                .from('geeves_knowledge_cache')
                .insert({
                    question_normalized: normalizeQuestion(message),
                    question_hash: questionHash,
                    question_original: message,
                    answer: answer,
                    answer_tokens: answer.split(/\s+/).length,
                    question_type: 'general',
                    tags: [],
                    created_by: user.id,
                    times_served: 1,
                    last_served_at: new Date().toISOString()
                })
                .select('id')
                .maybeSingle();
            cacheId = newCache?.id || null;
        } catch (saveErr) {
            console.warn('[Geeves Chat] Cache save failed (non-critical):', saveErr.message);
        }

        return res.status(200).json({
            response: answer,
            message: answer, // Fallback for compatibility
            success: true,
            fromCache: false,
            cacheId,
        });

    } catch (error) {
        console.error('[Geeves Chat] Error:', error);
        return res.status(500).json({
            success: false, error: 'Failed to process message',
            response: "I'm having trouble connecting right now. Please try again.",
            message: "I'm having trouble connecting right now. Please try again."
        });
    }
}
