/**
 * 🧠 REAL-TIME GTO EXPLANATION ENGINE (WITH CACHING)
 * ═══════════════════════════════════════════════════════════════════════════
 * Provides deep solver-level analysis for any training answer
 * CACHES Grok responses to prevent redundant API calls
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { getGrokClient } from '../../../src/lib/grokClient';
import { createClient } from '../../../src/lib/supabaseServerClient';
import crypto from 'crypto';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';

// ── Lazy Supabase getter (SSG-safe) ─────────────────────────────
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _supabase;
}

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
  try {
      withTiming(res);
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          if (!applyRateLimit(req, res, LIMITS.write)) return;
      }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // Body size guard (50KB max)
      const bodySize = JSON.stringify(req.body || {}).length;
      if (bodySize > 51200) {
          return res.status(413).json({ success: false, error: 'Request body too large' });
      }

      // Prevent caching of personalized AI responses
      res.setHeader('Cache-Control', 'no-store');
      // ── Auth: verify JWT (prevent unauthenticated AI API abuse) ──
      const supabase = getSupabase();
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
          // ═══ PHASE 14: Enhanced coaching data ═══
          gtoFrequencies,   // Real solver frequencies { action: pct }
          classification,   // 'BEST', 'CORRECT', 'INACCURACY', 'WRONG', 'BLUNDER'
          evLoss,           // Numeric EV loss in BB
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
              .maybeSingle();

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

          // ═══ PHASE 14: Build frequency context string for solver-aware coaching ═══
          let frequencyContext = '';
          const freqs = gtoFrequencies || question.gtoFrequencies;
          if (freqs && Object.keys(freqs).length > 0) {
              const freqLines = Object.entries(freqs)
                  .sort(([, a], [, b]) => b - a)
                  .map(([action, pct]) => `  ${action}: ${pct}%`)
                  .join('\n');
              frequencyContext = `\n  SOLVER FREQUENCIES (GTO mixed strategy):\n${freqLines}`;

              // Detect if this is a mixed strategy spot
              const sortedFreqs = Object.values(freqs).sort((a, b) => b - a);
              if (sortedFreqs.length >= 2 && sortedFreqs[1] >= 20) {
                  frequencyContext += '\n  NOTE: This is a MIXED STRATEGY spot — multiple actions are solver-approved at significant frequencies.';
              }
          }

          // ═══ PHASE 14: Level-appropriate coaching language ═══
          const levelNum = parseInt(level, 10) || 1;
          let coachingTone;
          if (levelNum <= 3) {
              coachingTone = 'Use simple language. Avoid heavy jargon. Focus on the one key concept. Think of the student as a beginner learning fundamentals.';
          } else if (levelNum <= 6) {
              coachingTone = 'Use intermediate poker terminology. Reference ranges, equity, and board texture. The student understands basic GTO concepts.';
          } else {
              coachingTone = 'Use advanced solver terminology freely. Reference node locking, range advantage, geometric sizing, polarization, and mixed strategies. The student is advanced.';
          }

          // ═══ PHASE 14: Classification-aware feedback ═══
          let classificationContext = '';
          if (classification) {
              const evLossStr = typeof evLoss === 'number' ? ` (EV loss: ${evLoss.toFixed(2)} BB)` : '';
              classificationContext = `\n  MOVE CLASSIFICATION: ${classification}${evLossStr}`;
              if (classification === 'BEST' || classification === 'CORRECT') {
                  classificationContext += '\n  The student chose a solver-approved action.';
              } else if (classification === 'INACCURACY') {
                  classificationContext += '\n  The student chose a minor inaccuracy — their action has some solver frequency but is not the primary play.';
              } else if (classification === 'BLUNDER') {
                  classificationContext += '\n  This was a significant mistake — the chosen action has 0% solver frequency at this node.';
              }
          }

          const prompt = `You are a world-class GTO poker coach (like GTO Wizard's analysis engine). A student just ${wasCorrect ? 'CORRECTLY' : 'INCORRECTLY'} answered a training question.

  QUESTION: ${question.question}
  SCENARIO:
  - Hero Position: ${scenario.heroPosition || 'Unknown'}
  - Hero Hand: ${scenario.heroHand || question.heroCards?.join('') || 'Unknown'}
  - Board: ${scenario.board || question.boardCards?.join(' ') || 'Preflop'}
  - Pot Size: ${scenario.pot || 'N/A'} BB
  - Villain Position: ${scenario.villainPosition || 'Unknown'}
  - Action Facing: ${scenario.action || scenario.context || 'N/A'}
  - Stack Depth: ${scenario.heroStack || 100}bb
  - Street: ${scenario.street || 'flop'}${frequencyContext}${classificationContext}

  USER'S ANSWER: ${userAnswer}
  CORRECT ANSWER: ${correctAnswer}
  RESULT: ${wasCorrect ? '✅ CORRECT' : '❌ INCORRECT'}

  COACHING TONE: ${coachingTone}

  ${wasCorrect
                  ? 'Reinforce WHY this is correct with solver-level analysis. If this is a mixed strategy spot, explain that the student chose a valid line and mention the mixing frequencies. Make the student feel confident.'
                  : 'Explain WHY their answer was suboptimal and WHY the correct answer is preferred by the solver. If their action has SOME frequency, acknowledge it but explain why the solver prefers the alternative. Be encouraging but precise.'}

  Provide your analysis in this JSON format:
  {
      "headline": "A specific, insightful 3-6 word headline about THIS spot",
      "shortExplanation": "One sentence capturing the core concept (range advantage, board texture, sizing tells, etc.)",
      "deepDive": {
          "equityAnalysis": "Hero's equity vs villain's range on this board texture",
          "rangeConsiderations": "What ranges are we representing? What does villain's range look like here?",
          "evCalculation": "Brief EV breakdown showing why the correct action maximizes value",
          "boardTexture": "How does this specific board favor hero or villain? Mention specific card interactions."
      },
      "keyTakeaway": "The #1 actionable principle to remember (e.g., 'On dry paired boards, BB should check-raise at high frequency')",
      "similarSpots": "1-2 similar spots where this same concept applies",
      "mixedStrategyNote": "If applicable: explain the mixing frequencies and why both actions can be correct",
      "confidence": ${wasCorrect ? '0.95' : '0.7'}
  }

  Be specific to THIS hand — reference the actual cards, positions, and board texture. Avoid generic advice.`;

          const response = await grok.chat.completions.create({
              model: 'grok-3',
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.7,
              max_tokens: 600,
          }, { signal: AbortSignal.timeout(15000) });

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
                  .then(() => console.log(`[GrokExplain] 💾 Cached response for ${cacheKey.slice(0, 8)}...`))
                  .catch(e => console.warn('[GrokExplain] Cache save failed:', e.message));

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

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
