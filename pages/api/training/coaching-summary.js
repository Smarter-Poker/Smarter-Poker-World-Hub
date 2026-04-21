/**
 * 💬 POST-GAME AI COACHING SESSION
 * ═══════════════════════════════════════════════════════════════════════════
 * After completing a level, Grok provides personalized coaching feedback
 * Analyzes performance patterns and gives actionable advice
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { getGrokClient } from '../../../src/lib/grokClient';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';

// ── Lazy Supabase getter (SSG-safe) ─────────────────────────────
let _supabaseAdmin = null;
function getSupabaseAdmin() {
    if (!_supabaseAdmin) {
        _supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _supabaseAdmin;
}
export default async function handler(req, res) {
  try {
      withTiming(res);
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
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

      res.setHeader('Cache-Control', 'no-store');
      // ── Auth: verify JWT (prevent unauthenticated AI API abuse) ──
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { data: { user }, error: authErr } = await getSupabaseAdmin().auth.getUser(token);
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

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
          // ═══ PHASE 14: Enhanced coaching data ═══
          gtowScore,           // 0-100 GTOW score
          totalEVLoss,         // Total EV loss in BB
          classificationCounts, // { best: N, correct: N, inaccuracy: N, wrong: N, blunder: N }
          positionStats,       // { BTN: { correct: N, total: N }, ... }
          weakSpots,           // [{ position, street, spotType, mistakeRate }]
          // ═══ PHASE 17: Cross-session analytics context ═══
          crossSessionContext, // { scoreTrend, milestones, mistakePatterns, ... }
      } = req.body;

      if (!gameId || !level || questionsAnswered === undefined) {
          return res.status(400).json({ success: false, error: 'Missing required fields' });
      }

      try {
          const grok = getGrokClient();
          const mistakesStr = mistakes?.length > 0
              ? mistakes.slice(0, 8).map((m, i) => `
  Mistake ${i + 1}:
  - Question: ${m.question?.question || 'Unknown'}
  - User answered: ${m.userAnswer}
  - Correct was: ${m.correctAnswer}
  - Position: ${m.question?.scenario?.heroPosition || '?'} vs ${m.question?.scenario?.villainPosition || '?'}
  - Street: ${m.question?.scenario?.street || '?'}
  - Board: ${m.question?.scenario?.board || '?'}`).join('\n')
              : 'No mistakes - perfect round!';

          // ═══ PHASE 14: Build rich performance context ═══
          let performanceContext = '';
          if (gtowScore !== undefined) {
              performanceContext += `\n  GTOW SCORE: ${gtowScore}/100`;
          }
          if (totalEVLoss !== undefined) {
              performanceContext += `\n  TOTAL EV LOSS: ${typeof totalEVLoss === 'number' ? totalEVLoss.toFixed(2) : totalEVLoss} BB`;
          }
          if (classificationCounts && Object.keys(classificationCounts).length > 0) {
              const cc = classificationCounts;
              performanceContext += `\n  MOVE CLASSIFICATION BREAKDOWN: Best: ${cc.best || 0}, Correct: ${cc.correct || 0}, Inaccuracy: ${cc.inaccuracy || 0}, Wrong: ${cc.wrong || 0}, Blunder: ${cc.blunder || 0}`;
          }
          if (positionStats && Object.keys(positionStats).length > 0) {
              const posLines = Object.entries(positionStats)
                  .map(([pos, stats]) => `    ${pos}: ${stats.correct || 0}/${stats.total || 0}`)
                  .join('\n');
              performanceContext += `\n  BY POSITION:\n${posLines}`;
          }
          if (weakSpots && weakSpots.length > 0) {
              const weakLines = weakSpots.slice(0, 3)
                  .map(s => `    ${s.position}/${s.street}/${s.spotType}: ${Math.round((s.mistakeRate || 0) * 100)}% mistake rate`)
                  .join('\n');
              performanceContext += `\n  IDENTIFIED WEAK SPOTS:\n${weakLines}`;
          }

          // ═══ PHASE 17: Build cross-session context ═══
          let crossSessionStr = '';
          if (crossSessionContext) {
              const ctx = crossSessionContext;
              if (ctx.milestones) {
                  const m = ctx.milestones;
                  crossSessionStr += `\n\n  CROSS-SESSION ANALYTICS (last 30 days):`;
                  crossSessionStr += `\n  - Total sessions: ${m.totalSessions}, Total hands: ${m.totalHands}`;
                  crossSessionStr += `\n  - Rolling avg score (last 5): ${m.last5Avg}%${m.prev5Avg !== null ? ` (was ${m.prev5Avg}%)` : ''}`;
                  crossSessionStr += `\n  - Overall accuracy: ${m.overallAccuracy}%, Avg EV/hand: ${m.avgEvPerHand}`;
                  crossSessionStr += `\n  - Trend: ${m.trending || 'unknown'}${m.trendDelta ? ` (${m.trendDelta > 0 ? '+' : ''}${m.trendDelta}pts)` : ''}`;
                  crossSessionStr += `\n  - Current streak: ${m.currentStreak} sessions passed`;
              }
              if (ctx.mistakePatterns && ctx.mistakePatterns.length > 0) {
                  crossSessionStr += `\n  TOP RECURRING MISTAKES (cross-session):`;
                  ctx.mistakePatterns.slice(0, 3).forEach((p, i) => {
                      crossSessionStr += `\n    ${i + 1}. ${p.spotType} from ${p.position} on ${p.street}: ${p.count}× mistakes, -${p.avgEvLoss.toFixed(2)} avg EV`;
                  });
              }
              if (ctx.weakPosition) {
                  crossSessionStr += `\n  WEAKEST POSITION (cross-session): ${ctx.weakPosition.position} at ${ctx.weakPosition.accuracy}%`;
              }
              if (ctx.weakStreet) {
                  crossSessionStr += `\n  WEAKEST STREET (cross-session): ${ctx.weakStreet.street} at ${ctx.weakStreet.accuracy}%`;
              }
          }

          const prompt = `You are an elite GTO poker coach (think GTO Wizard's post-session analysis). Provide a personalized debrief.

  TRAINING SESSION RESULTS:
  - Game: ${gameName || gameId}
  - Level: ${level}/10
  - Score: ${questionsCorrect}/${questionsAnswered} (${accuracy}%)
  - Best Streak: ${streak || 0}
  - Time: ${Math.round((timeSpentSeconds || 0) / 60)} minutes${performanceContext}

  MISTAKES MADE:
  ${mistakesStr}${crossSessionStr}

  Provide coaching feedback in this JSON format:
  {
      "overallGrade": "${accuracy >= 90 ? 'A' : accuracy >= 80 ? 'B' : accuracy >= 70 ? 'C' : 'D'}",
      "headline": "A specific, encouraging headline about THEIR performance pattern (not generic)",
      "strengths": ["1-2 specific things they did well, referencing positions or spot types where they excelled"],
      "areasToImprove": ["1-2 specific concepts to work on, directly referencing their weak spots and mistake patterns"],
      "detailedFeedback": "3-4 sentences of personalized coaching. Reference their specific mistakes, weak spots, and GTOW score. Give concrete advice like 'When facing c-bets from the BB on dry boards, remember to...'",
      "recommendedDrill": {
          "name": "Specific drill targeting their weakest area",
          "reason": "Why this will directly address their weakest spot"
      },
      "weakSpotDrill": "If weak spots exist, suggest a specific practice focus like 'BB defense vs BTN c-bets on low boards'",
      "motivationalQuote": "A short poker wisdom quote relevant to their performance level",
      "readyForNextLevel": ${accuracy >= 70 ? 'true' : 'false'}
  }

  Be specific. Reference their actual mistakes, positions, and board textures. Avoid generic advice. Coach like you can see their solver data.`;

          const response = await grok.chat.completions.create({
              model: 'grok-3',
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.7,
              max_tokens: 500,
          }, { signal: AbortSignal.timeout(15000) });

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

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
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
