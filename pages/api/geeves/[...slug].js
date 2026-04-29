/**
 * /api/geeves/* — Hono catch-all router (Phase 4.4 module #17, 2026-04-28)
 *
 * Consolidates 8 Geeves AI assistant handlers (7 flat + 1 nested dynamic [id])
 * under a single Hono app. Demonstrates Hono's :id parameter routing for the
 * previously separate Next.js dynamic-route file.
 *
 * Routes (mounted at /api/geeves):
 *   GET    /conversations           — list user's recent conversations
 *   GET    /conversation/:id        — load one conversation + last 100 messages
 *   POST   /start-conversation      — create new convo + greeting
 *   POST   /ask                     — main Q&A: KB → cache → Grok pipeline
 *   POST   /chat                    — widget Q&A: short responses (Grok)
 *   POST   /analyze-screenshot      — Grok-2-vision poker table analysis
 *   POST   /rate                    — user rating on cached answer
 *   GET    /analytics               — admin-only summary / top_missed
 *   POST   /analytics               — admin-only mark_resolved
 *
 * Replaces 8 source files totalling 1399 LOC.
 *
 * Auth pattern (post-4.1d ESM-clean):
 *   `getServerUserWithFallback(req, supabase)` — local HMAC verify (Web Crypto)
 *   first, GoTrue network fallback if JWT secret missing. Distinct from the
 *   older direct GoTrue call.
 *
 * Auth nuance — /ask + /chat have a guest-mode fallback when the local KB
 * returns a high-confidence hit. The middleware below sets `c.var.user` if
 * present but does NOT 401 unauthenticated — each route decides whether
 * unauthenticated callers get a KB-only response or a 401.
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import crypto from 'crypto';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getGrokClient } from '../../../src/lib/grokClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { lookupKnowledgeBase } from '../../../src/lib/geevesKnowledgeBase';
import { getRoleBoosts } from '../../../src/lib/geevesKB/rolePersonalization';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');

// ─── Cached Supabase service-role client ──────────────────────────────────
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// ─── Hono app ─────────────────────────────────────────────────────────────
const app = new Hono().basePath('/api/geeves');

// Soft auth middleware — sets user if present, never 401s.
// Each route decides whether unauthenticated is acceptable (KB fallback) or
// returns its own 401.
app.use('*', async (c, next) => {
  const req = c.env?.req;
  const supabase = getSupabase();
  c.set('supabase', supabase);
  try {
    const { user } = await getServerUserWithFallback(req, supabase);
    c.set('user', user || null);
  } catch {
    c.set('user', null);
  }
  await next();
});

// Write rate-limit factory
const writeLimit = async (c, next) => {
  const req = c.env?.req;
  const res = c.env?.res;
  if (req && res && !applyRateLimit(req, res, LIMITS.write)) {
    return c.body(null, 429);
  }
  await next();
};

// ─── Shared GEEVES system prompts ─────────────────────────────────────────
const GEEVES_FULL_SYSTEM_PROMPT = `You are Geeves, a world-class poker strategy expert and AI assistant. You are the poker knowledge companion to Jarvis, who handles platform questions.

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
- Short stack: Push/fold charts, 10-15BB is critical zone

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

const GEEVES_WIDGET_SYSTEM_PROMPT = `You are Geeves, a world-class poker strategy expert and AI assistant.

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

// ─── Cache utilities (shared across /ask + /chat) ─────────────────────────
function normalizeQuestion(q) {
  return q.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
}

function hashQuestion(q) {
  return crypto.createHash('md5').update(normalizeQuestion(q)).digest('hex');
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
  if (q.includes('button') || q.includes('btn')) tags.push('button');
  if (q.includes('cutoff') || q.includes('co')) tags.push('cutoff');
  if (q.includes('utg') || q.includes('Under-the-Gun')) tags.push('utg');
  if (q.includes('blind') || q.includes('sb') || q.includes('bb')) tags.push('blinds');
  if (q.includes('holdem') || q.includes('hold\'em') || q.includes('nlhe')) tags.push('holdem');
  if (q.includes('plo') || q.includes('omaha')) tags.push('plo');
  if (q.includes('tournament') || q.includes('mtt')) tags.push('tournament');
  if (q.includes('cash')) tags.push('cash');
  if (q.includes('bluff')) tags.push('bluffing');
  if (q.includes('value')) tags.push('value');
  if (q.includes('fold')) tags.push('folding');
  if (q.includes('raise') || q.includes('bet')) tags.push('betting');
  if (q.includes('call')) tags.push('calling');
  return tags;
}

async function checkExactCache(supabase, questionHash) {
  const { data, error } = await supabase
    .from('geeves_knowledge_cache')
    .select('*')
    .eq('question_hash', questionHash)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function checkSimilarCache(supabase, question) {
  const { data, error } = await supabase.rpc('find_similar_questions', {
    search_query: question,
    similarity_threshold: 0.3,
    max_results: 1,
  });
  if (error || !data || data.length === 0) return null;
  if (data[0].similarity >= 0.5) return data[0];
  return null;
}

async function incrementCacheServed(supabase, cacheId) {
  await supabase.rpc('increment_cache_served', { cache_uuid: cacheId });
}

async function saveToCache(supabase, question, answer, questionType, userId) {
  const { data, error } = await supabase
    .from('geeves_knowledge_cache')
    .insert({
      question_normalized: normalizeQuestion(question),
      question_hash: hashQuestion(question),
      question_original: question,
      answer,
      answer_tokens: answer.split(/\s+/).length,
      question_type: questionType,
      tags: extractTags(question),
      created_by: userId,
      times_served: 1,
      last_served_at: new Date().toISOString(),
    })
    .select()
    .maybeSingle();
  if (error) {
    console.warn('[geeves cache] failed to save:', error);
    return null;
  }
  return data;
}

async function saveConversationMessages(supabase, conversationId, question, answer, cacheId, fromCache) {
  await supabase.from('geeves_messages').insert({
    conversation_id: conversationId,
    content: question,
    is_user: true,
  });
  await supabase.from('geeves_messages').insert({
    conversation_id: conversationId,
    content: answer,
    is_user: false,
    cache_id: cacheId,
    from_cache: fromCache,
  });
  const { data: conv } = await supabase
    .from('geeves_conversations')
    .select('title')
    .eq('id', conversationId)
    .maybeSingle();
  const isDefaultTitle = !conv?.title || conv.title === 'New Poker Conversation';
  const newTitle = isDefaultTitle
    ? question.substring(0, 80) + (question.length > 80 ? '...' : '')
    : conv.title;
  await supabase
    .from('geeves_conversations')
    .update({
      updated_at: new Date().toISOString(),
      ...(isDefaultTitle ? { title: newTitle } : {}),
    })
    .eq('id', conversationId);
}

async function trackAnalytics(supabase, userId, questionType, question, responseLength, fromCache) {
  await supabase.from('geeves_analytics').insert({
    user_id: userId,
    question_type: questionType,
    question: question.substring(0, 500),
    response_length: responseLength,
    metadata: { from_cache: fromCache },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /conversations
// ═══════════════════════════════════════════════════════════════════════════
app.get('/conversations', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const supabase = c.get('supabase');
  const limit = parseInt(c.req.query('limit') || '10', 10);

  const { data: conversations, error } = await supabase
    .from('geeves_conversations')
    .select('id, title, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[geeves/conversations] query error:', error);
    return c.json({ conversations: [] });
  }

  const formatted = (conversations || []).map((conv) => ({
    id: conv.id,
    title: conv.title,
    createdAt: conv.created_at,
    updatedAt: conv.updated_at,
    messageCount: 0,
  }));

  return c.json({ conversations: formatted });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /conversation/:id
// ═══════════════════════════════════════════════════════════════════════════
app.get('/conversation/:id', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const supabase = c.get('supabase');
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Conversation ID is required' }, 400);

  const { data: conversation, error: convError } = await supabase
    .from('geeves_conversations')
    .select('id, title, user_id')
    .eq('id', id)
    .maybeSingle();

  if (convError || !conversation) return c.json({ error: 'Conversation not found' }, 404);
  if (conversation.user_id !== user.id) return c.json({ error: 'Access denied' }, 403);

  const { data: messages, error: msgError } = await supabase
    .from('geeves_messages')
    .select('id, content, is_user, cache_id, from_cache, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })
    .limit(100);

  if (msgError) {
    console.warn('[geeves/conversation/:id] msg error:', msgError);
    return c.json({ error: 'Failed to fetch conversation' }, 500);
  }

  return c.json({
    conversation: { id: conversation.id, title: conversation.title },
    messages: (messages || []).map((msg) => ({
      id: msg.id,
      content: msg.content,
      isUser: msg.is_user,
      cacheId: msg.cache_id,
      fromCache: msg.from_cache,
      timestamp: msg.created_at,
    })),
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /start-conversation
// ═══════════════════════════════════════════════════════════════════════════
app.post('/start-conversation', writeLimit, async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const supabase = c.get('supabase');

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, username')
      .eq('id', user.id)
      .maybeSingle();

    const userName = profile?.first_name || profile?.username || 'there';

    const { data: conversation, error: convError } = await supabase
      .from('geeves_conversations')
      .insert({ user_id: user.id, title: 'New Poker Conversation' })
      .select()
      .maybeSingle();

    if (convError) throw convError;
    if (!conversation) return c.json({ error: 'Failed to create conversation' }, 500);

    const greeting = `Good evening, ${userName}! I'm Geeves, your poker strategy expert.

  I have deep knowledge of:
  • **GTO Strategy** — Optimal play theory
  • **Tournament Poker** — ICM, bubble play, final tables
  • **Cash Games** — All stakes and formats
  • **Hand Analysis** — Detailed breakdowns
  • **Poker Math** — Equity, odds, EV calculations

  What poker question can I help you with today?`;

    await supabase.from('geeves_messages').insert({
      conversation_id: conversation.id,
      content: greeting,
      is_user: false,
    });

    return c.json({ conversationId: conversation.id, greeting });
  } catch (error) {
    console.warn('[geeves/start-conversation] error:', error);
    return c.json({ error: 'Failed to start conversation' }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /ask — KB → cache → Grok pipeline (full UI)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/ask', writeLimit, async (c) => {
  const supabase = c.get('supabase');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { question, conversationId, conversationHistory, currentPage } = body;

  if (!question) return c.json({ error: 'Question is required' }, 400);

  // STEP 0: Local KB (FREE, no auth needed)
  const kbResult = lookupKnowledgeBase(question, currentPage);
  if (kbResult && kbResult.confidence >= 45) {
    if (conversationId && user) {
      try {
        await saveConversationMessages(supabase, conversationId, question, kbResult.answer, null, false);
      } catch { /* non-critical */ }
    }
    return c.json({
      answer: kbResult.answer,
      questionType: kbResult.category,
      fromLocalKB: true,
      followUps: kbResult.followUps || [],
      confidence: kbResult.confidence,
      entryId: kbResult.entryId,
    });
  }

  // Auth gate for cache + Grok tiers
  if (!user) {
    if (kbResult && kbResult.confidence >= 30) {
      return c.json({
        answer: kbResult.answer,
        questionType: kbResult.category,
        fromLocalKB: true,
        followUps: kbResult.followUps || [],
        confidence: kbResult.confidence,
        guestMode: true,
      });
    }
    return c.json({ error: 'Sign in for AI-powered answers to this question' }, 401);
  }

  try {
    const questionHash = hashQuestion(question);
    const questionType = detectQuestionType(question);

    // STEP 1: Exact cache match
    const cachedAnswer = await checkExactCache(supabase, questionHash);
    if (cachedAnswer) {
      await incrementCacheServed(supabase, cachedAnswer.id);
      if (conversationId) {
        await saveConversationMessages(supabase, conversationId, question, cachedAnswer.answer, cachedAnswer.id, true);
      }
      await trackAnalytics(supabase, user.id, questionType, question, cachedAnswer.answer.length, true);
      return c.json({
        answer: cachedAnswer.answer,
        questionType,
        fromCache: true,
        cacheId: cachedAnswer.id,
        timesServed: cachedAnswer.times_served + 1,
        avgRating: cachedAnswer.avg_rating,
      });
    }

    // STEP 2: Fuzzy match
    const similarAnswer = await checkSimilarCache(supabase, question);
    if (similarAnswer) {
      await incrementCacheServed(supabase, similarAnswer.id);
      if (conversationId) {
        await saveConversationMessages(supabase, conversationId, question, similarAnswer.answer, similarAnswer.id, true);
      }
      await trackAnalytics(supabase, user.id, questionType, question, similarAnswer.answer.length, true);
      return c.json({
        answer: similarAnswer.answer,
        questionType,
        fromCache: true,
        cacheId: similarAnswer.id,
        timesServed: similarAnswer.times_served + 1,
        avgRating: similarAnswer.avg_rating,
        similarTo: similarAnswer.question_original,
      });
    }

    // STEP 3: Call Grok
    const grok = getGrokClient();
    const messages = [{ role: 'system', content: GEEVES_FULL_SYSTEM_PROMPT }];
    if (conversationHistory && conversationHistory.length > 0) {
      const recent = conversationHistory.slice(-6);
      recent.forEach((msg) => {
        messages.push({ role: msg.isUser ? 'user' : 'assistant', content: msg.content });
      });
    }
    messages.push({ role: 'user', content: question });

    const response = await grok.chat.completions.create({
      model: 'grok-beta',
      messages,
      temperature: 0.7,
      max_tokens: 2000,
      stream: false,
    });

    const answer = response.choices[0].message.content;

    // STEP 4: Save to cache + log missed
    const cacheEntry = await saveToCache(supabase, question, answer, questionType, user.id);

    try {
      await supabase.rpc('geeves_upsert_missed_question', {
        p_question: question,
        p_hash: questionHash,
        p_page: currentPage || null,
        p_grok_answer: answer,
      });
    } catch (err) {
      console.warn('[geeves/ask] failed to log missed question:', err.message);
    }

    if (conversationId) {
      await saveConversationMessages(supabase, conversationId, question, answer, cacheEntry?.id, false);
    }
    await trackAnalytics(supabase, user.id, questionType, question, answer.length, false);

    return c.json({
      answer,
      questionType,
      fromCache: false,
      cacheId: cacheEntry?.id,
      timesServed: 1,
      missedQuestion: true,
    });
  } catch (error) {
    console.warn('[geeves/ask] error:', error);
    return c.json({ error: 'Failed to process question', details: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /chat — Lightweight widget endpoint
// ═══════════════════════════════════════════════════════════════════════════
app.post('/chat', writeLimit, async (c) => {
  const supabase = c.get('supabase');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { message, conversationHistory, currentPage, userRole, isVIP } = body;

  if (!message) return c.json({ success: false, error: 'Message is required' }, 400);

  // STEP 0: Local KB with role boosts
  const clientRoleBoosts = getRoleBoosts(userRole || null, Boolean(isVIP));
  const kbResult = lookupKnowledgeBase(message, currentPage, clientRoleBoosts);
  if (kbResult && kbResult.confidence >= 45) {
    return c.json({
      response: kbResult.answer,
      message: kbResult.answer,
      success: true,
      fromLocalKB: true,
      followUps: kbResult.followUps || [],
    });
  }

  // Auth gate
  if (!user) {
    if (kbResult && kbResult.confidence >= 30) {
      return c.json({
        response: kbResult.answer,
        message: kbResult.answer,
        success: true,
        fromLocalKB: true,
        followUps: kbResult.followUps || [],
        guestMode: true,
      });
    }
    return c.json({ success: false, error: 'Sign in for AI-powered answers' }, 401);
  }

  try {
    const questionHash = hashQuestion(message);

    // Cache check
    try {
      const { data: cached } = await supabase
        .from('geeves_knowledge_cache')
        .select('id, answer, times_served, avg_rating')
        .eq('question_hash', questionHash)
        .maybeSingle();

      if (cached) {
        await supabase.rpc('increment_cache_served', { cache_uuid: cached.id })
          .catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e));
        return c.json({
          response: cached.answer,
          message: cached.answer,
          success: true,
          fromCache: true,
          cacheId: cached.id,
        });
      }
    } catch (cacheErr) {
      console.warn('[App] Handled exception:', cacheErr?.message || cacheErr);
    }

    // Call Grok
    const grok = getGrokClient();
    const grokMessages = [{ role: 'system', content: GEEVES_WIDGET_SYSTEM_PROMPT }];

    if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      const recent = conversationHistory.slice(-6);
      recent.forEach((msg) => {
        grokMessages.push({
          role: msg.isUser ? 'user' : 'assistant',
          content: String(msg.content || '').slice(0, 600),
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

    // Save to cache
    let cacheId = null;
    try {
      const { data: newCache } = await supabase
        .from('geeves_knowledge_cache')
        .insert({
          question_normalized: normalizeQuestion(message),
          question_hash: questionHash,
          question_original: message,
          answer,
          answer_tokens: answer.split(/\s+/).length,
          question_type: 'general',
          tags: [],
          created_by: user.id,
          times_served: 1,
          last_served_at: new Date().toISOString(),
        })
        .select('id')
        .maybeSingle();
      cacheId = newCache?.id || null;
    } catch (saveErr) {
      console.warn('[geeves/chat] cache save failed (non-critical):', saveErr.message);
    }

    // Log missed question
    try {
      await supabase.rpc('geeves_upsert_missed_question', {
        p_question: message,
        p_hash: questionHash,
        p_page: currentPage || null,
        p_grok_answer: answer,
      });
    } catch (_rpcErr) {
      console.warn('[geeves/chat] RPC upsert failed, falling back to insert:', _rpcErr?.message || _rpcErr);
      try {
        const { error: insErr } = await supabase
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
          await supabase.rpc('geeves_increment_missed_count', {
            p_hash: questionHash,
            p_grok_answer: answer.slice(0, 2000),
            p_page: currentPage || null,
          }).catch(async () => {
            await supabase
              .from('geeves_missed_questions')
              .update({
                last_asked: new Date().toISOString(),
                grok_answer: answer.slice(0, 2000),
              })
              .eq('question_hash', questionHash);
          });
        }
      } catch { /* truly silent */ }
    }

    return c.json({
      response: answer,
      message: answer,
      success: true,
      fromCache: false,
      cacheId,
      missedQuestion: true,
    });
  } catch (error) {
    console.warn('[geeves/chat] error:', error);
    return c.json({
      success: false,
      error: 'Failed to process message',
      response: "I'm having trouble connecting right now. Please try again.",
      message: "I'm having trouble connecting right now. Please try again.",
    }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /analyze-screenshot — Grok Vision poker table analysis
// ═══════════════════════════════════════════════════════════════════════════
app.post('/analyze-screenshot', writeLimit, async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Authentication required' }, 401);

  const body = await c.req.json().catch(() => ({}));
  const { image } = body;
  if (!image) return c.json({ error: 'Image is required' }, 400);

  try {
    const grok = getGrokClient();
    const response = await grok.chat.completions.create({
      model: 'grok-2-vision-1212',
      messages: [
        {
          role: 'system',
          content: `You are Geeves, a world-class poker strategy expert analyzing a poker table screenshot.

  When analyzing a screenshot:
  1. Identify the poker variant (Hold'em, PLO, etc.)
  2. Read the board cards if visible
  3. Note stack sizes and pot size
  4. Identify player positions
  5. Read any hole cards shown
  6. Assess the current action

  Provide strategic advice based on what you see. Be specific and actionable.
  If anything is unclear, mention it but still provide the best analysis you can.`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Please analyze this poker table screenshot and provide strategic advice.' },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ],
      max_tokens: 1000,
    });

    const analysis = response.choices[0]?.message?.content
      || "I couldn't analyze this image. Please try a clearer screenshot of the poker table.";

    return c.json({ analysis, timestamp: new Date().toISOString() });
  } catch (error) {
    console.warn('[geeves/analyze-screenshot] error:', error);
    return c.json({ error: 'Failed to analyze screenshot', details: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /rate — User rating on cached answer
// ═══════════════════════════════════════════════════════════════════════════
app.post('/rate', writeLimit, async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);

  const supabase = c.get('supabase');
  const body = await c.req.json().catch(() => ({}));
  const { cacheId, rating, feedback } = body;

  if (!cacheId) return c.json({ success: false, error: 'Cache ID is required' }, 400);
  if (!rating || rating < 1 || rating > 5) {
    return c.json({ success: false, error: 'Rating must be between 1 and 5' }, 400);
  }

  try {
    const { data: existingRating } = await supabase
      .from('geeves_answer_ratings')
      .select('id, rating')
      .eq('cache_id', cacheId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingRating) {
      const { error: updateError } = await supabase
        .from('geeves_answer_ratings')
        .update({ rating, feedback })
        .eq('id', existingRating.id);
      if (updateError) throw updateError;

      const ratingDiff = rating - existingRating.rating;
      if (ratingDiff !== 0) {
        const { data: cacheRow } = await supabase
          .from('geeves_knowledge_cache')
          .select('rating_sum')
          .eq('id', cacheId)
          .maybeSingle();
        if (cacheRow) {
          await supabase
            .from('geeves_knowledge_cache')
            .update({ rating_sum: (cacheRow.rating_sum || 0) + ratingDiff })
            .eq('id', cacheId);
        }
      }

      return c.json({
        success: true,
        message: 'Rating updated',
        previousRating: existingRating.rating,
        newRating: rating,
      });
    }

    const { error: insertError } = await supabase
      .from('geeves_answer_ratings')
      .insert({ cache_id: cacheId, user_id: user.id, rating, feedback });
    if (insertError) throw insertError;

    const { data: cacheData } = await supabase
      .from('geeves_knowledge_cache')
      .select('avg_rating, total_ratings')
      .eq('id', cacheId)
      .maybeSingle();

    return c.json({
      success: true,
      message: 'Rating saved',
      rating,
      avgRating: cacheData?.avg_rating,
      totalRatings: cacheData?.total_ratings,
    });
  } catch (error) {
    console.warn('[geeves/rate] error:', error);
    return c.json({ success: false, error: 'Failed to save rating', details: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// /analytics — Admin only (GET summary/top_missed, POST mark_resolved)
// ═══════════════════════════════════════════════════════════════════════════
async function requireAdmin(c) {
  const user = c.get('user');
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' };
  const supabase = c.get('supabase');
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || !['admin', 'superadmin', 'god'].includes(profile.role)) {
    return { ok: false, status: 403, error: 'Admin access required' };
  }
  return { ok: true, supabase, user };
}

app.get('/analytics', async (c) => {
  const guard = await requireAdmin(c);
  if (!guard.ok) return c.json({ success: false, error: guard.error }, guard.status);
  const { supabase } = guard;

  const action = c.req.query('action') || 'summary';

  if (action === 'top_missed') {
    const { data, error } = await supabase
      .from('geeves_missed_questions')
      .select('id, question, page, asked_count, first_asked, last_asked, resolved, added_to_kb, grok_answer')
      .eq('resolved', false)
      .order('asked_count', { ascending: false })
      .limit(50);
    if (error) return c.json({ success: false, error: 'Internal server error' }, 500);
    return c.json({ success: true, questions: data || [] });
  }

  if (action === 'summary') {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [
      { count: totalMissed },
      { count: totalResolved },
      { count: totalAddedToKB },
      cacheRes,
    ] = await Promise.all([
      supabase.from('geeves_missed_questions').select('*', { count: 'exact', head: true }).gte('last_asked', weekAgo),
      supabase.from('geeves_missed_questions').select('*', { count: 'exact', head: true }).eq('resolved', true).gte('last_asked', weekAgo),
      supabase.from('geeves_missed_questions').select('*', { count: 'exact', head: true }).eq('added_to_kb', true),
      supabase.from('geeves_knowledge_cache').select('times_served, avg_rating').gte('created_at', weekAgo).limit(500),
    ]);

    const cacheData = cacheRes.data || [];
    const totalCacheServed = cacheData.reduce((s, r) => s + (r.times_served || 0), 0);
    const avgRating = cacheData.length > 0
      ? (cacheData.reduce((s, r) => s + (r.avg_rating || 0), 0) / cacheData.length).toFixed(2)
      : null;

    return c.json({
      success: true,
      summary: {
        missedThisWeek: totalMissed || 0,
        resolvedThisWeek: totalResolved || 0,
        totalAddedToKB: totalAddedToKB || 0,
        cacheAnswersServedThisWeek: totalCacheServed,
        avgCacheRating: avgRating,
      },
    });
  }

  return c.json({ success: false, error: 'Unknown action' }, 400);
});

app.post('/analytics', writeLimit, async (c) => {
  const guard = await requireAdmin(c);
  if (!guard.ok) return c.json({ success: false, error: guard.error }, guard.status);
  const { supabase } = guard;

  const body = await c.req.json().catch(() => ({}));
  const { action, id, added_to_kb } = body;

  if (action === 'mark_resolved') {
    if (!id) return c.json({ success: false, error: 'id required' }, 400);
    const { error } = await supabase
      .from('geeves_missed_questions')
      .update({ resolved: true, added_to_kb: Boolean(added_to_kb) })
      .eq('id', id);
    if (error) return c.json({ success: false, error: 'Internal server error' }, 500);
    return c.json({ success: true });
  }

  return c.json({ success: false, error: 'Unknown action' }, 400);
});

// ─── Vercel adapter ───────────────────────────────────────────────────────
const handler = handle(app);

export default async function vercelHandler(req, res) {
  try {
    return await handler(req, res);
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[geeves] handled exception:', _sentryErr?.message ?? _sentryErr);
    }
    console.warn('[geeves] router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
