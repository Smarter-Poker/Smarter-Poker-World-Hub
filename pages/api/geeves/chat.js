/* ═══════════════════════════════════════════════════════════════════════════
   GEEVES CHAT API — Lightweight endpoint for GeevesMenuWidget
   Now includes cache lookup before calling Grok for efficiency
   ═══════════════════════════════════════════════════════════════════════════ */

import { getGrokClient } from '../../../src/lib/grokClient';
import { createClient } from '../../../src/lib/supabaseServerClient';
import crypto from 'crypto';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { lookupKnowledgeBase } from '../../../src/lib/geevesKnowledgeBase';
import { getRoleBoosts } from '../../../src/lib/geevesKB/rolePersonalization';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

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
  try {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          if (!applyRateLimit(req, res, LIMITS.write)) return;
      }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // ── Parse body first (before auth, so KB can serve guests) ──
      const { message, context, conversationHistory, currentPage, userRole, isVIP } = req.body;

      if (!message) {
          return res.status(400).json({ success: false, error: 'Message is required' });
      }

      // ── STEP 0: Check Local KB (FREE, instant, no auth needed) ──
      // Pass role boosts from the client (extracted client-side from JWT payload, used for scoring only)
      const clientRoleBoosts = getRoleBoosts(userRole || null, Boolean(isVIP));
      const kbResult = lookupKnowledgeBase(message, currentPage, clientRoleBoosts);
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
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

      try {

          // ── STEP 1: Check cache before calling Grok ──
          const questionHash = hashQuestion(message);
          try {
              const { data: cached } = await getSupabase()
                  .from('geeves_knowledge_cache')
                  .select('id, answer, times_served, avg_rating')
                  .eq('question_hash', questionHash)
                  .maybeSingle();

              if (cached) {
                  // Increment served counter
                  const { error: incErr } = await getSupabase().rpc('increment_cache_served', { cache_uuid: cached.id });
                  if (incErr) console.warn('[App] Handled promise rejection:', incErr.message);

                  return res.status(200).json({
                      response: cached.answer,
                      message: cached.answer,
                      success: true,
                      fromCache: true,
                      cacheId: cached.id,
                  });
              }
          } catch (cacheErr) { console.warn('[App] Handled exception:', cacheErr?.message || cacheErr); }

          // ── STEP 2: No cache hit — call Grok with conversation context ──
          const grok = getGrokClient();

          // Build messages array with system prompt
          const grokMessages = [
              { role: 'system', content: GEEVES_SYSTEM_PROMPT },
          ];

          // Feature 2: Conversation Memory — prepend last 6 turns so follow-up questions
          // have context ("how do I close it?" knows "it" = settlement period, etc.)
          if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
              const recentHistory = conversationHistory.slice(-6); // Max 6 turns (3 exchanges)
              recentHistory.forEach(msg => {
                  grokMessages.push({
                      role: msg.isUser ? 'user' : 'assistant',
                      content: String(msg.content || '').slice(0, 600), // Trim long answers
                  });
              });
          }

          grokMessages.push({ role: 'user', content: message });

          const response = await grok.chat.completions.create({
              model: 'grok-beta',
              messages: grokMessages,
              temperature: 0.7,
              max_tokens: 800,
              stream: false,
          });

          const answer = response.choices[0].message.content;

          // ── STEP 3: Save to cache for future use ──
          let cacheId = null;
          try {
              const { data: newCache } = await getSupabase()
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

          // ── STEP 4: Auto-Learning Loop — log missed question to Supabase ──
          // This feeds the Geeves Analytics dashboard in Horses so admins can
          // identify knowledge gaps and add them to the KB.
          try {
              // Use raw SQL so we can do a proper ON CONFLICT DO UPDATE with arithmetic
              // The RPC is preferred but falls back to direct PostgREST if not yet created.
              const { error: upsertErr } = await getSupabase().rpc('geeves_upsert_missed_question', {
                  p_question: message,
                  p_hash: questionHash,
                  p_page: currentPage || null,
                  p_grok_answer: answer,
              });
              if (upsertErr) throw upsertErr; // fall into catch → insert fallback
          } catch (_rpcErr) {
              console.warn('[Geeves Chat] RPC upsert failed, falling back to insert:', _rpcErr?.message || _rpcErr);
              try {
                  const { error: insErr } = await getSupabase()
                      .from('geeves_missed_questions')
                      .insert({
                          question: message,
                          question_hash: questionHash,
                          page: currentPage || null,
                          grok_answer: answer.slice(0, 2000),
                          asked_count: 1,
                          first_asked: new Date().toISOString(),
                          last_asked: new Date().toISOString(),
                      });

                  if (insErr && insErr.code === '23505') {
                      // Unique constraint violation = already exists, increment count
                      const { error: incrErr } = await getSupabase().rpc('geeves_increment_missed_count', {
                          p_hash: questionHash,
                          p_grok_answer: answer.slice(0, 2000),
                          p_page: currentPage || null,
                      });
                      if (incrErr) {
                          // Final fallback: direct update
                          const { error: err_geeves_missed_questions_r5udf } = await getSupabase()
                            .from('geeves_missed_questions')
                            .update({ last_asked: new Date().toISOString(), grok_answer: answer.slice(0, 2000) })
                              .eq('question_hash', questionHash);
                          if (err_geeves_missed_questions_r5udf) console.warn('[Supabase] Silent mutation failed in geeves_missed_questions:', err_geeves_missed_questions_r5udf.message);
                      }
                  }
              } catch { /* truly silent — never break the user experience */ }
          }

          return res.status(200).json({
              response: answer,
              message: answer,
              success: true,
              fromCache: false,
              cacheId,
              missedQuestion: true
          });

      } catch (error) {
          console.warn('[Geeves Chat] Error:', error);
          return res.status(500).json({
              success: false, error: 'Failed to process message',
              response: "I'm having trouble connecting right now. Please try again.",
              message: "I'm having trouble connecting right now. Please try again."
          });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
