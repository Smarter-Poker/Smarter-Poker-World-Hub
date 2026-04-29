/**
 * /api/gto/* — Hono catch-all router (Phase 4.4 module #15, 2026-04-28)
 *
 * Consolidates 11 Jarvis/GTO handlers under a single Hono app. Auth +
 * rate-limit middleware lives once at the top instead of being duplicated
 * per handler. Heavy shared constants (position configs, stack depths,
 * action maps) are declared once and reused across routes.
 *
 * Routes (mounted at /api/gto):
 *   GET  /lobby-suggestions       — personalised training lobby cards
 *   GET  /get-weak-spots          — recent-session leak analysis (top 3)
 *   POST /explain-hand            — Grok-3 hand-action explainer (cached)
 *   POST /analyze-game            — Grok-3 post-game JSON analysis (cached)
 *   POST /generate-adaptive       — Grok-3 weakness-targeted scenario
 *   POST /generate-alternate-lines— Grok-3-mini exploit/simplify coaching
 *   POST /generate-batch          — Grok-3 multi-scenario library expansion
 *   POST /generate-scenario       — Grok-3 single training scenario
 *   POST /session-recommendations — Grok-3 end-of-session recs (cached)
 *   POST /gto-analysis            — PioSolver+Grok-3 dual-source analysis
 *   POST /render-analysis-card    — Grok-2-image GTO panel PNG
 *
 * Replaces 11 source files totalling 2770 LOC.
 *
 * Auth pattern (post-4.1d ESM-clean):
 *   `getServerUserWithFallback(req, supabase)` — local HMAC verify (Web Crypto)
 *   first, GoTrue network fallback if JWT secret missing. Distinct from the
 *   older direct GoTrue call.
 *
 * Rate-limit:
 *   - GET routes (lobby-suggestions, get-weak-spots) — no rate limit
 *   - POST routes that call paid AI APIs — LIMITS.ai
 *
 * No premium gate — any authenticated user can call these.
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getGrokClient } from '../../../src/lib/grokClient';
import { getCachedResponse, setCachedResponse } from '../../../src/lib/jarvisCache';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');

// Pages Router config — Grok responses are sometimes large enough that
// responseLimit:false avoids the default 4mb cap on response bodies.
export const config = {
  api: {
    bodyParser: { sizeLimit: '5mb' },
    responseLimit: false,
  },
};

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

// ─── Shared constants ─────────────────────────────────────────────────────

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

const POSITION_CONFIGS = {
  1: ['UTG', 'MP', 'HJ'],
  2: ['UTG', 'MP', 'HJ', 'CO'],
  3: ['UTG', 'MP', 'HJ', 'CO', 'BTN'],
  4: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'],
  5: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  6: ['CO', 'BTN', 'SB', 'BB'],
  7: ['SB', 'BB'],
  8: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  9: ['BTN', 'SB', 'BB'],
  10: ['UTG', 'CO', 'BTN', 'BB'],
};

const STACK_DEPTHS = {
  1: [100],
  2: [100, 50],
  3: [100, 50, 200],
  4: [100, 50, 200, 30],
  5: [100, 50, 200, 30, 150],
  6: [100, 50, 30],
  7: [20, 25, 30],
  8: [100, 200, 150],
  9: [30, 40, 50],
  10: [100, 200, 30, 50],
};

const FORMATS = {
  1: ['Cash 6-max'],
  2: ['Cash 6-max', 'Cash 9-max'],
  3: ['Cash 6-max', 'Cash 9-max', 'MTT'],
  4: ['Cash 6-max', 'Cash 9-max', 'MTT', 'Spin & Go'],
  5: ['Cash 6-max', 'Cash 9-max', 'MTT', 'Spin & Go'],
  6: ['Cash 6-max', 'MTT'],
  7: ['MTT', 'Spin & Go'],
  8: ['Cash 6-max deep', 'Cash 9-max deep'],
  9: ['MTT FT', 'Spin & Go HU'],
  10: ['Cash 6-max', 'MTT', 'Spin & Go', 'Mixed'],
};

const SCENARIO_TYPES = {
  1: ['Open Raise Range'],
  2: ['Open Raise Range', '3-Bet Defense'],
  3: ['Open Raise Range', '3-Bet Defense', 'Squeeze Range'],
  4: ['Open Raise Range', '3-Bet Defense', 'Squeeze Range', 'vs 4-Bet'],
  5: ['Open Raise Range', '3-Bet Defense', 'Squeeze Range', 'vs 4-Bet', 'Blind vs Blind'],
  6: ['3-Bet Range', 'Cold 4-Bet', 'Mixed Frequency'],
  7: ['Push/Fold', 'ICM Spots', 'Bubble Play'],
  8: ['Deep Stack 3-Bet', 'Pot Control', 'Multiway Pots'],
  9: ['Final Table ICM', 'Heads-Up Ranges', 'Short Stack Play'],
  10: ['Expert Mixed', 'Exploitative Adjustments', 'GTO vs Exploit'],
};

const DIFFICULTY_DESCRIPTIONS = {
  1: 'Beginner - Simple, clear ranges with obvious hands',
  2: 'Beginner+ - Slightly wider ranges, basic concepts',
  3: 'Intermediate - Multiple positions, some mixed strategies',
  4: 'Intermediate+ - 4-bet pots, squeeze spots',
  5: 'Advanced - Full position awareness, all stack depths',
  6: 'Advanced+ - Complex 3-bet/4-bet trees',
  7: 'Expert - MTT/ICM considerations, push/fold',
  8: 'Expert+ - Deep stack play, pot control',
  9: 'Master - Final table ICM, short stack optimization',
  10: 'GTO Master - Mixed strategies, exploit vs GTO balance',
};

const ACTION_MAP = {
  c: 'CHECK', x: 'CHECK', f: 'FOLD',
  b: 'BET', b16: 'BET', b25: 'BET', b33: 'BET', b45: 'BET',
  b50: 'BET', b66: 'BET', b75: 'BET', b100: 'BET', b150: 'OVERBET',
  r: 'RAISE', r2x: 'RAISE', r3x: '3-BET', r4x: '4-BET',
  call: 'CALL', allin: 'ALL-IN', ai: 'ALL-IN',
};

const ACTION_COLORS_HEX = {
  FOLD: '#ff4444', CHECK: '#888888', CALL: '#ffaa00', BET: '#00d4ff',
  RAISE: '#00ff88', '3-BET': '#00ff88', '4-BET': '#aa44ff',
  OVERBET: '#ff6600', 'ALL-IN': '#ff00ff',
};

const ACTION_COLORS_PROMPT = {
  FOLD: 'red', CHECK: 'gray', CALL: 'yellow/orange', BET: 'cyan',
  RAISE: 'green neon', '3-BET': 'green neon', '4-BET': 'purple', 'ALL-IN': 'magenta',
};

// ─── Hono app ─────────────────────────────────────────────────────────────
const app = new Hono().basePath('/api/gto');

// ─── Auth middleware (every gto/* route requires a logged-in user) ───────
app.use('*', async (c, next) => {
  const req = c.env?.req;
  try {
    const supabase = getSupabase();
    const { user: localUser } = await getServerUserWithFallback(req, supabase);
    if (!localUser) {
      return c.json({ success: false, error: 'Auth required' }, 401);
    }
    c.set('user', localUser);
    c.set('supabase', supabase);
    await next();
  } catch (err) {
    console.warn('[gto] auth error:', err);
    return c.json({ success: false, error: 'Invalid token' }, 401);
  }
});

// ─── AI rate-limit factory (used on POST routes that call paid APIs) ─────
const aiLimit = async (c, next) => {
  const req = c.env?.req;
  const res = c.env?.res;
  if (req && res && !applyRateLimit(req, res, LIMITS.ai)) {
    return c.body(null, 429);
  }
  await next();
};

// ═══════════════════════════════════════════════════════════════════════════
// GET routes — no AI, no rate-limit (keep snappy for lobby/profile reads)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/gto/lobby-suggestions
app.get('/lobby-suggestions', async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  try {
    const userId = user.id;

    const { data: profile } = await supabase
      .from('jarvis_user_training_profile')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const { data: lastSession } = await supabase
      .from('jarvis_training_sessions')
      .select('created_at, category, accuracy')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const hoursSinceLastSession = lastSession
      ? (Date.now() - new Date(lastSession.created_at).getTime()) / (1000 * 60 * 60)
      : 999;

    const suggestions = generateLobbySuggestions(profile, lastSession, hoursSinceLastSession);

    return c.json({
      success: true,
      suggestions,
      context: {
        hoursSinceLastSession: Math.floor(hoursSinceLastSession),
        lastCategory: lastSession?.category,
        skillLevel: profile?.skill_assessment || 'New Player',
      },
    });
  } catch (error) {
    console.warn('[gto/lobby-suggestions] Error:', error);
    return c.json({ success: true, suggestions: getDefaultLobbySuggestions(), fallback: true });
  }
});

function generateLobbySuggestions(profile, lastSession, hoursSinceLastSession) {
  const suggestions = [];

  if (hoursSinceLastSession > 24) {
    suggestions.push({
      type: 'welcome_back', priority: 1,
      message: 'Welcome back! Ready to sharpen those skills?',
      action: 'Start Daily Challenge', actionType: 'daily_challenge',
    });
  }
  if (hoursSinceLastSession >= 20 && hoursSinceLastSession < 28) {
    suggestions.push({
      type: 'streak_warning', priority: 0,
      message: 'Play now to keep your streak alive!',
      action: 'Quick Game', actionType: 'quick_game',
    });
  }

  const leaks = profile?.identified_leaks || [];
  if (leaks.length > 0) {
    suggestions.push({
      type: 'weakness_training', priority: 2,
      message: `Focus on: ${leaks[0]}`,
      action: 'Smart Practice', actionType: 'adaptive_training',
    });
  }

  const skillLevel = profile?.skill_assessment || 'Beginner';
  const levelMap = { Beginner: 2, Developing: 4, Intermediate: 6, Advanced: 8, Expert: 10 };
  const recommendedLevel = levelMap[skillLevel] || 3;

  suggestions.push({
    type: 'level_recommendation', priority: 3,
    message: `Try Level ${recommendedLevel} - matches your current skill`,
    action: `Start Level ${recommendedLevel}`, actionType: 'start_level',
    levelId: recommendedLevel,
  });

  if (lastSession?.category && profile?.total_sessions > 5) {
    const categories = ['UTG', 'CO', 'BTN', 'BB'];
    const otherCategory = categories.find((c) => c !== lastSession.category) || 'CO';
    suggestions.push({
      type: 'variety', priority: 4,
      message: `Mix it up: Practice ${otherCategory} position`,
      action: `Train ${otherCategory}`, actionType: 'position_training',
      position: otherCategory,
    });
  }

  return suggestions.sort((a, b) => a.priority - b.priority).slice(0, 3);
}

function getDefaultLobbySuggestions() {
  return [
    {
      type: 'daily_challenge', priority: 1,
      message: 'Complete the Daily Challenge for bonus diamonds!',
      action: 'Start Challenge', actionType: 'daily_challenge',
    },
    {
      type: 'beginner_tip', priority: 2,
      message: 'Start with Level 1 to learn the basics',
      action: 'Neural Boot', actionType: 'start_level', levelId: 1,
    },
  ];
}

// GET /api/gto/get-weak-spots
app.get('/get-weak-spots', async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  try {
    const { data: sessions, error } = await supabase
      .from('jarvis_training_sessions')
      .select('answers_data, leaks_detected, accuracy, game_id, level')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    if (!sessions || sessions.length === 0) {
      return c.json({
        success: true,
        weakSpots: [],
        message: 'No training data yet. Play some games to get personalized insights!',
      });
    }

    const weakSpots = analyzeWeakSpots(sessions);
    return c.json({ success: true, weakSpots, sessionsAnalyzed: sessions.length });
  } catch (error) {
    console.warn('[gto/get-weak-spots] Error:', error);
    return c.json({ success: false, error: 'Failed to analyze weak spots' }, 500);
  }
});

function analyzeWeakSpots(sessions) {
  const patterns = { positions: {}, actions: {}, handTypes: {}, stackDepths: {} };
  let totalMistakes = 0;

  sessions.forEach((session) => {
    const answers = session.answers_data || [];
    const leaks = session.leaks_detected || [];

    leaks.forEach((leak) => {
      if (leak.position) patterns.positions[leak.position] = (patterns.positions[leak.position] || 0) + 1;
      if (leak.action) patterns.actions[leak.action] = (patterns.actions[leak.action] || 0) + 1;
      if (leak.handType) patterns.handTypes[leak.handType] = (patterns.handTypes[leak.handType] || 0) + 1;
      totalMistakes++;
    });

    answers.forEach((answer) => {
      if (!answer.correct) {
        if (answer.position) patterns.positions[answer.position] = (patterns.positions[answer.position] || 0) + 1;
        if (answer.userAction && answer.userAction !== answer.correctAction) {
          const actionError = `${answer.userAction}_instead_of_${answer.correctAction}`;
          patterns.actions[actionError] = (patterns.actions[actionError] || 0) + 1;
        }
        if (answer.hand) {
          const handType = categorizeHand(answer.hand);
          patterns.handTypes[handType] = (patterns.handTypes[handType] || 0) + 1;
        }
        totalMistakes++;
      }
    });
  });

  const weakSpots = [];
  const topN = (obj, n) => Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, n);

  topN(patterns.positions, 2).forEach(([position, count]) => {
    if (count >= 2) {
      weakSpots.push({
        area: `${position} Play`, type: 'position', value: position,
        errorCount: count, recommendation: getPositionRecommendation(position),
      });
    }
  });

  topN(patterns.handTypes, 2).forEach(([handType, count]) => {
    if (count >= 2) {
      weakSpots.push({
        area: handType, type: 'handType', value: handType,
        errorCount: count, recommendation: getHandTypeRecommendation(handType),
      });
    }
  });

  topN(patterns.actions, 1).forEach(([action, count]) => {
    if (count >= 2) {
      weakSpots.push({
        area: formatActionPattern(action), type: 'action', value: action,
        errorCount: count, recommendation: 'Study the EV difference between these actions',
      });
    }
  });

  return weakSpots.sort((a, b) => b.errorCount - a.errorCount).slice(0, 3);
}

function categorizeHand(hand) {
  if (!hand) return 'Unknown';
  if (hand.length >= 2 && hand[0] === hand[1]) {
    const rank = hand[0];
    if ('AKQJ'.includes(rank)) return 'Premium Pairs';
    if ('T987'.includes(rank)) return 'Medium Pairs';
    return 'Small Pairs';
  }
  if (hand.includes('s')) {
    if (hand.startsWith('A')) return 'Suited Aces';
    if (['KQ', 'KJ', 'QJ'].some((p) => hand.startsWith(p))) return 'Suited Broadways';
    return 'Suited Connectors';
  }
  if (hand.includes('o')) {
    if (['AK', 'AQ', 'AJ'].some((p) => hand.startsWith(p))) return 'Offsuit Broadways';
    return 'Offsuit Hands';
  }
  return 'Mixed Hands';
}

function formatActionPattern(action) {
  return action
    .replace(/_/g, ' ')
    .replace('instead of', 'vs')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getPositionRecommendation(position) {
  const recs = {
    UTG: 'Focus on tighter UTG ranges - play only premium hands',
    'UTG+1': 'Early position requires discipline - stick to strong holdings',
    MP: 'Middle position allows slight loosening - add some suited connectors',
    HJ: 'Hijack can open wider - include more playable hands',
    CO: 'Cutoff is a steal position - expand your opening range',
    BTN: 'Button is the best position - play a wide range aggressively',
    SB: 'Small blind defense is complex - focus on 3-betting or folding',
    BB: 'Big blind gets good odds - defend wider but know postflop spots',
  };
  return recs[position] || 'Study position-specific ranges';
}

function getHandTypeRecommendation(handType) {
  const recs = {
    'Premium Pairs': 'Premium pairs should almost always be played for value',
    'Medium Pairs': 'Medium pairs need set mining opportunities at deeper stacks',
    'Small Pairs': 'Small pairs need implied odds - fold at shallow stacks',
    'Suited Aces': 'Suited aces have great playability - rarely fold them in position',
    'Suited Broadways': 'Suited broadways connect well with boards - play them actively',
    'Suited Connectors': 'Suited connectors need fold equity or implied odds',
    'Offsuit Broadways': 'Offsuit broadways are marginal - position matters most',
    'Offsuit Hands': 'Offsuit non-premium hands are often folds in early position',
  };
  return recs[handType] || 'Study hand equity and playability';
}

// ═══════════════════════════════════════════════════════════════════════════
// POST routes — paid AI APIs, AI rate-limit applies
// ═══════════════════════════════════════════════════════════════════════════

const stripJsonFences = (s) => (s || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

// POST /api/gto/explain-hand
app.post('/explain-hand', aiLimit, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { hand, position, stackDepth, correctAction, userAction, scenario } = body;

  if (!hand || !correctAction) {
    return c.json({ success: false, error: 'Missing required fields: hand, correctAction' }, 400);
  }

  try {
    const cacheParams = { hand, position, stackDepth, correctAction, scenarioTitle: scenario?.title };
    const cached = await getCachedResponse('explain-hand', cacheParams);
    if (cached) return c.json({ ...cached, fromCache: true });

    const userMistake = userAction && userAction !== correctAction
      ? `The player chose to ${userAction} instead.` : '';
    const prompt = `Explain why ${hand} should be a ${correctAction.toUpperCase()} in this poker spot:

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
                      Never be condescending - treat the player as a fellow poker enthusiast learning.`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.6,
      max_tokens: 300,
    });

    const explanation = completion.choices[0]?.message?.content;
    if (!explanation) throw new Error('Empty response from Grok');

    const response = {
      success: true,
      hand,
      correctAction,
      userAction,
      explanation: explanation.trim(),
      generatedAt: new Date().toISOString(),
    };

    await setCachedResponse('explain-hand', cacheParams, response, 30);
    return c.json(response);
  } catch (error) {
    console.warn('[gto/explain-hand] Error:', error);
    return c.json({
      success: true,
      hand,
      correctAction,
      userAction,
      explanation: getDefaultExplanation(hand, correctAction, userAction),
      fallback: true,
      generatedAt: new Date().toISOString(),
    });
  }
});

function getDefaultExplanation(hand, correctAction, userAction) {
  const handStrength = getHandStrengthDescription(hand);
  const actionVerb = correctAction === 'raise' ? 'raising'
    : correctAction === 'call' ? 'calling'
    : correctAction === '3bet' ? '3-betting'
    : 'playing';
  return `${hand} has ${handStrength}, making ${actionVerb} the correct play in this spot. ` +
    `The hand's playability and equity distribution favor an aggressive approach. ` +
    `Key insight: Position and stack depth heavily influence preflop decisions.`;
}

function getHandStrengthDescription(hand) {
  if (!hand) return 'good potential';
  if (hand.length === 2 && hand[0] === hand[1]) {
    const rank = hand[0];
    if ('AKQJ'.includes(rank)) return 'premium pair strength';
    if ('T987'.includes(rank)) return 'medium pair value';
    return 'small pair set-mining potential';
  }
  if (hand.endsWith('s')) {
    if (hand.startsWith('A')) return 'suited ace playability';
    if ('KQ'.includes(hand[0]) && 'AKQJ'.includes(hand[1])) return 'strong broadway potential';
    if ('987654'.includes(hand[0]) && '87654'.includes(hand[1])) return 'suited connector value';
    return 'reasonable suited hand equity';
  }
  if (hand.endsWith('o')) {
    if (hand.startsWith('A') && 'KQJ'.includes(hand[1])) return 'strong offsuit broadway value';
    return 'marginal offsuit holding';
  }
  return 'reasonable hand strength';
}

// POST /api/gto/analyze-game
app.post('/analyze-game', aiLimit, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { mistakes, scenario, finalScore, position, stackDepth } = body;

  if (!mistakes || mistakes.length === 0) {
    return c.json({
      success: true,
      analysis: {
        summary: 'Perfect game! No mistakes to analyze.',
        recommendations: ['Keep practicing to maintain your edge!'],
        patternInsights: [],
      },
    });
  }

  try {
    const sortedMistakes = mistakes.map((m) => `${m.hand}:${m.userAction}`).sort().join('|');
    const cacheParams = { mistakesHash: sortedMistakes, scenarioTitle: scenario?.title, position, stackDepth };

    const cached = await getCachedResponse('analyze-game', cacheParams);
    if (cached) return c.json({ ...cached, fromCache: true });

    const mistakesList = mistakes
      .map((m, i) => `${i + 1}. ${m.hand}: Chose ${m.userAction?.toUpperCase() || 'FOLD'}, should be ${m.correctAction?.toUpperCase()}`)
      .join('\n');

    const prompt = `Analyze this poker training session:

SCENARIO: ${scenario?.title || 'Range Training'}
Position: ${position || 'Unknown'}
Stack Depth: ${stackDepth || 100}bb
Final Score: ${finalScore}%

MISTAKES MADE (${mistakes.length} total):
${mistakesList}

Provide analysis in this JSON format:
{
    "summary": "2-3 sentence overview of their performance and main issue",
    "patternInsights": [
        { "pattern": "Pattern name", "insight": "Specific observation about their mistakes" }
    ],
    "recommendations": [
        "Actionable improvement tip 1",
        "Actionable improvement tip 2"
    ]
}

Focus on:
- Patterns in their mistakes (e.g., folding too many suited connectors, missing 3-bet opportunities)
- Position-specific issues
- Actionable study recommendations

Be encouraging but analytical. Return ONLY valid JSON.`;

    const grok = getGrokClient();
    const completion = await grok.chat.completions.create({
      model: 'grok-3',
      messages: [
        {
          role: 'system',
          content: `You are Jarvis, an elite GTO poker coach providing post-game analysis.
                      Be encouraging but direct. Focus on patterns and actionable improvements.
                      Format your response as JSON with: summary, patternInsights[], recommendations[].
                      Keep insights concise (max 2 sentences each). Max 3 recommendations.`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 800,
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) throw new Error('Empty response from Jarvis');

    let analysis;
    try {
      analysis = JSON.parse(stripJsonFences(responseText));
    } catch {
      analysis = {
        summary: responseText.slice(0, 200),
        patternInsights: [],
        recommendations: ['Review your range construction'],
      };
    }

    const response = {
      success: true,
      analysis,
      meta: { mistakeCount: mistakes.length, score: finalScore, generatedAt: new Date().toISOString() },
    };

    await setCachedResponse('analyze-game', cacheParams, response, 30);
    return c.json(response);
  } catch (error) {
    console.warn('[gto/analyze-game] Error:', error);
    const mistakeCount = mistakes?.length || 0;
    return c.json({
      success: true,
      analysis: {
        summary: `You made ${mistakeCount} mistake${mistakeCount !== 1 ? 's' : ''} this game. ${getEncouragement(finalScore)}`,
        patternInsights: [
          { pattern: 'Range Construction', insight: 'Focus on memorizing starting ranges by position.' },
        ],
        recommendations: [
          'Practice this scenario again to reinforce the correct plays',
          'Review the hands you missed most frequently',
        ],
      },
      fallback: true,
      meta: { mistakeCount, score: finalScore, generatedAt: new Date().toISOString() },
    });
  }
});

function getEncouragement(score) {
  if (score >= 80) return 'Almost perfect! Just a few spots to polish.';
  if (score >= 60) return "Good foundation - let's tighten up some spots.";
  if (score >= 40) return 'Solid effort! Focus on the patterns in your mistakes.';
  return 'Great learning opportunity! Every mistake is a lesson.';
}

// POST /api/gto/generate-adaptive
app.post('/generate-adaptive', aiLimit, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  try {
    const userId = user.id;
    const weakSpots = await fetchAdaptiveWeakSpots(supabase, userId);

    if (!weakSpots || weakSpots.length === 0) {
      return c.json({
        success: true,
        scenario: getDefaultAdaptiveScenario(),
        targetedArea: null,
        message: 'Play more games for personalized training!',
      });
    }

    const targetWeakness = weakSpots[0];
    const scenario = await generateTargetedScenario(targetWeakness);

    return c.json({
      success: true,
      scenario,
      targetedArea: targetWeakness.area,
      weakSpots,
      message: `Targeting your ${targetWeakness.area} weakness`,
    });
  } catch (error) {
    console.warn('[gto/generate-adaptive] Error:', error);
    return c.json({
      success: true,
      scenario: getDefaultAdaptiveScenario(),
      targetedArea: null,
      fallback: true,
    });
  }
});

async function fetchAdaptiveWeakSpots(supabase, userId) {
  const { data: sessions, error } = await supabase
    .from('jarvis_training_sessions')
    .select('answers_data, leaks_detected, accuracy')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(15);

  if (error || !sessions?.length) return [];

  const patterns = {};
  sessions.forEach((session) => {
    const answers = session.answers_data || [];
    answers.forEach((answer) => {
      if (!answer.correct && answer.position) {
        patterns[answer.position] = (patterns[answer.position] || 0) + 1;
      }
    });
  });

  return Object.entries(patterns || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([area, count]) => ({
      area: `${area} Play`, type: 'position', value: area, errorCount: count,
    }));
}

async function generateTargetedScenario(weakness) {
  const position = weakness.value || 'CO';
  const cacheParams = { position, type: 'adaptive-scenario' };
  const cached = await getCachedResponse('generate-adaptive', cacheParams);

  if (cached) {
    return { ...cached, id: `adaptive_${position}_${Date.now()}`, fromCache: true };
  }

  const prompt = `Generate a GTO preflop training scenario specifically targeting ${weakness.area} weakness.

REQUIREMENTS:
- Position: ${position} (the player's weak spot)
- Stack Depth: 100BB (standard)
- Include 15-25 hands in the solution
- Mix of raises, calls, and folds appropriate for the position
- Make it challenging but educational

Return JSON format:
{
    "id": "adaptive_${Date.now()}",
    "title": "${position} Training - Targeted Practice",
    "description": "Practice your ${position} opening range to fill this gap in your game.",
    "position": "${position}",
    "stackDepth": 100,
    "villainPosition": null,
    "action": "open",
    "solution": {
        "AA": "raise",
        "KK": "raise",
        ... (include full range for position)
    }
}`;

  try {
    const grok = getGrokClient();
    const completion = await grok.chat.completions.create({
      model: 'grok-3',
      messages: [
        {
          role: 'system',
          content: `You are a GTO poker coach generating training scenarios.
                    Create scenarios in JSON format with: id, title, description, position, stackDepth, villainPosition, action, solution (object mapping hands to actions).
                    Focus on the player's specific weakness area. Return ONLY valid JSON.`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    const responseText = completion.choices[0]?.message?.content;
    const scenario = JSON.parse(stripJsonFences(responseText));
    scenario.isAdaptive = true;
    scenario.targetedWeakness = weakness.area;

    await setCachedResponse('generate-adaptive', cacheParams, scenario, 14);
    return scenario;
  } catch {
    return getFallbackAdaptiveScenario(weakness);
  }
}

function getFallbackAdaptiveScenario(weakness) {
  const position = weakness?.value || 'CO';
  const fallbackRanges = {
    UTG: {
      title: 'UTG Opening Range',
      description: 'Practice tight UTG opens to improve early position play.',
      solution: {
        AA: 'raise', KK: 'raise', QQ: 'raise', JJ: 'raise', TT: 'raise',
        99: 'raise', 88: 'raise', 77: 'raise',
        AKs: 'raise', AQs: 'raise', AJs: 'raise', ATs: 'raise',
        KQs: 'raise', KJs: 'raise', QJs: 'raise',
        AKo: 'raise', AQo: 'raise', AJo: 'raise',
      },
    },
    CO: {
      title: 'CO Opening Range',
      description: 'Practice cutoff steals to improve late position aggression.',
      solution: {
        AA: 'raise', KK: 'raise', QQ: 'raise', JJ: 'raise', TT: 'raise',
        99: 'raise', 88: 'raise', 77: 'raise', 66: 'raise', 55: 'raise',
        AKs: 'raise', AQs: 'raise', AJs: 'raise', ATs: 'raise',
        A9s: 'raise', A8s: 'raise', A7s: 'raise', A6s: 'raise',
        A5s: 'raise', A4s: 'raise',
        KQs: 'raise', KJs: 'raise', KTs: 'raise', K9s: 'raise',
        QJs: 'raise', QTs: 'raise', Q9s: 'raise',
        JTs: 'raise', J9s: 'raise', T9s: 'raise',
        '98s': 'raise', '87s': 'raise', '76s': 'raise',
        AKo: 'raise', AQo: 'raise', AJo: 'raise', ATo: 'raise',
        KQo: 'raise', KJo: 'raise', QJo: 'raise',
      },
    },
    BTN: {
      title: 'Button Opening Range',
      description: 'Practice wide button opens for maximum position value.',
      solution: {
        AA: 'raise', KK: 'raise', QQ: 'raise', JJ: 'raise', TT: 'raise',
        99: 'raise', 88: 'raise', 77: 'raise', 66: 'raise', 55: 'raise',
        44: 'raise', 33: 'raise', 22: 'raise',
        AKs: 'raise', AQs: 'raise', AJs: 'raise', ATs: 'raise',
        A9s: 'raise', A8s: 'raise', A7s: 'raise', A6s: 'raise',
        A5s: 'raise', A4s: 'raise', A3s: 'raise', A2s: 'raise',
        KQs: 'raise', KJs: 'raise', KTs: 'raise', K9s: 'raise', K8s: 'raise',
        QJs: 'raise', QTs: 'raise', Q9s: 'raise', Q8s: 'raise',
        JTs: 'raise', J9s: 'raise', J8s: 'raise',
        T9s: 'raise', T8s: 'raise',
        '98s': 'raise', '97s': 'raise', '87s': 'raise', '86s': 'raise',
        '76s': 'raise', '75s': 'raise', '65s': 'raise', '54s': 'raise',
        AKo: 'raise', AQo: 'raise', AJo: 'raise', ATo: 'raise', A9o: 'raise',
        KQo: 'raise', KJo: 'raise', KTo: 'raise',
        QJo: 'raise', QTo: 'raise', JTo: 'raise',
      },
    },
  };

  const tpl = fallbackRanges[position] || fallbackRanges.CO;
  return {
    id: `adaptive_${position.toLowerCase()}_${Date.now()}`,
    title: tpl.title,
    description: tpl.description,
    position,
    stackDepth: 100,
    action: 'open',
    isAdaptive: true,
    solution: tpl.solution,
  };
}

function getDefaultAdaptiveScenario() {
  return {
    id: `default_${Date.now()}`,
    title: 'CO Opening Range',
    description: 'Standard cutoff opening range training.',
    position: 'CO',
    stackDepth: 100,
    action: 'open',
    isAdaptive: false,
    solution: {
      AA: 'raise', KK: 'raise', QQ: 'raise', JJ: 'raise', TT: 'raise',
      99: 'raise', 88: 'raise', 77: 'raise', 66: 'raise',
      AKs: 'raise', AQs: 'raise', AJs: 'raise', ATs: 'raise',
      KQs: 'raise', KJs: 'raise', KTs: 'raise',
      QJs: 'raise', QTs: 'raise',
      JTs: 'raise', T9s: 'raise', '98s': 'raise', '87s': 'raise',
      AKo: 'raise', AQo: 'raise', AJo: 'raise',
      KQo: 'raise',
    },
  };
}

// POST /api/gto/generate-alternate-lines
app.post('/generate-alternate-lines', aiLimit, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { scenario } = body;

  if (!scenario) {
    return c.json({ success: false, error: 'Missing scenario data' }, 400);
  }

  try {
    const lines = await generateAlternateLines(scenario);
    return c.json({ success: true, alternate_lines: lines });
  } catch (error) {
    console.warn('[gto/generate-alternate-lines] Error:', error);
    return c.json(
      { success: false, error: 'Failed to generate alternate lines', details: error.message },
      500
    );
  }
});

async function generateAlternateLines(scenario) {
  const XAI_API_KEY = process.env.XAI_API_KEY;
  if (!XAI_API_KEY) throw new Error('XAI_API_KEY not configured');

  const grokInput = {
    hand_context: {
      game: scenario.gameType || 'Cash',
      format: scenario.format || '6-max',
      position: scenario.position || 'UTG',
      hand: scenario.hand || 'AA',
      stack_bb: scenario.stackBb || 100,
      action_so_far: scenario.actionSoFar || 'First to act preflop',
    },
    solver_anchor: {
      recommended_action: scenario.gtoAction || 'RAISE',
      recommended_frequency: scenario.gtoFrequency || 100,
      reason_summary: scenario.gtoReason || 'Premium hand, pure value raise',
    },
    constraints: {
      allowed_actions: scenario.allowedActions || ['RAISE', 'CALL', 'FOLD'],
      pool_assumptions: scenario.poolAssumptions || 'Standard online pool',
    },
  };

  const mainFrequency = scenario.gtoFrequency || 100;
  const remainingFrequency = 100 - mainFrequency;

  const systemPrompt = `You are generating Alternate Plays for a poker training scenario.

CRITICAL RULES:
1. Alternate Plays are COACHING suggestions, NOT GTO or solver-derived
2. You MUST NOT invent fake EV numbers or pretend these are solver outputs
3. You MAY propose exploit/simplification lines based on player-pool tendencies
4. Keep advice concise and actionable
5. The main GTO action is ${grokInput.solver_anchor.recommended_action} at ${mainFrequency}%
${remainingFrequency > 0 ? `6. The remaining ${remainingFrequency}% can be split among alternate lines` : '6. Since main action is 100%, alternates are for EXPLOITATIVE/SIMPLIFY coaching only - no frequencies'}

OUTPUT FORMAT (JSON only):
{
  "alternate_lines": [
    {
      "category": "EXPLOIT" or "SIMPLIFY",
      "action": "string (the action like CALL, FOLD, larger sizing, etc.)",
      ${remainingFrequency > 0 ? '"frequency": number (percentage of the remaining freq to allocate),' : ''}
      "description": "short coaching tip (max 15 words)",
      "when_to_use": "brief condition when this makes sense",
      "risk": "brief downside if misapplied"
    }
  ],
  "disclaimer": "Alternate Plays are coaching options, not solver-derived GTO lines."
}

Provide exactly 2 alternate lines: one EXPLOIT and one SIMPLIFY.`;

  const userPrompt = `Generate alternate plays for this scenario:

Hand Context:
- Game: ${grokInput.hand_context.game} ${grokInput.hand_context.format}
- Position: ${grokInput.hand_context.position}
- Hand: ${grokInput.hand_context.hand}
- Stack: ${grokInput.hand_context.stack_bb}bb
- Action: ${grokInput.hand_context.action_so_far}

Solver Anchor:
- GTO Action: ${grokInput.solver_anchor.recommended_action} (${mainFrequency}%)
- Reason: ${grokInput.solver_anchor.reason_summary}

Pool Assumptions: ${grokInput.constraints.pool_assumptions}

Return JSON only.`;

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'grok-3-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
    }),
  });

  if (!response.ok) throw new Error(`Grok API error: ${response.status}`);

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from Grok');

  const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/```\n?([\s\S]*?)\n?```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : content;
  const parsed = JSON.parse(jsonStr.trim());

  return {
    lines: parsed.alternate_lines || [],
    disclaimer: parsed.disclaimer || 'Coaching suggestions, not GTO.',
    mainAction: grokInput.solver_anchor.recommended_action,
    mainFrequency,
    generatedAt: new Date().toISOString(),
  };
}

// POST /api/gto/generate-batch
app.post('/generate-batch', aiLimit, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { level = 1, count = 5 } = body;

  if (level < 1 || level > 10) {
    return c.json({ success: false, error: 'Level must be between 1 and 10' }, 400);
  }
  if (count < 1 || count > 10) {
    return c.json({ success: false, error: 'Count must be between 1 and 10' }, 400);
  }

  try {
    const grok = getGrokClient();
    const scenarios = [];
    const errors = [];

    for (let i = 0; i < count; i++) {
      try {
        const position = POSITION_CONFIGS[level][Math.floor(Math.random() * POSITION_CONFIGS[level].length)];
        const stackDepth = STACK_DEPTHS[level][Math.floor(Math.random() * STACK_DEPTHS[level].length)];
        const format = FORMATS[level][Math.floor(Math.random() * FORMATS[level].length)];
        const scenarioType = SCENARIO_TYPES[level][Math.floor(Math.random() * SCENARIO_TYPES[level].length)];
        const prompt = buildBatchPrompt(level, position, stackDepth, format, scenarioType, i);

        const completion = await grok.chat.completions.create({
          model: 'grok-3',
          messages: [
            {
              role: 'system',
              content: 'You are a GTO poker expert. Create precise, solver-accurate training scenarios. Respond with valid JSON only.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.8,
          max_tokens: 2000,
        });

        const responseText = completion.choices[0]?.message?.content;
        if (responseText) {
          const scenario = JSON.parse(stripJsonFences(responseText));
          scenario.id = `grok-l${level}-${Date.now()}-${i}`;
          scenario.level = level;
          scenario.position = position;
          scenario.stackDepth = stackDepth;
          scenarios.push(scenario);
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (genError) {
        console.warn(`[gto/generate-batch] error on scenario ${i}:`, genError);
        errors.push({ index: i, error: genError.message });
      }
    }

    return c.json({
      success: true,
      generated: scenarios.length,
      requested: count,
      scenarios,
      errors: errors.length > 0 ? errors : undefined,
      meta: { level, generatedAt: new Date().toISOString() },
    });
  } catch (error) {
    console.warn('[gto/generate-batch] Error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

function buildBatchPrompt(level, position, stackDepth, format, scenarioType, index) {
  return `Generate a unique GTO poker scenario #${index + 1} with:

Level: ${level} (${DIFFICULTY_DESCRIPTIONS[level]})
Position: ${position}
Stack: ${stackDepth}bb
Format: ${format}
Type: ${scenarioType}

Return JSON:
{
    "title": "[Unique descriptive title]",
    "description": "[2-3 sentence explanation]",
    "tip": "[Memory tip for the range]",
    "solution": {
        "AA": "raise",
        "AKs": "raise",
        ... [Include ${15 + level * 3}-${20 + level * 5} hands]
    }
}

Use solver-accurate ranges. Mix strategies for level ${level}+.
JSON ONLY, no markdown.`;
}

// POST /api/gto/generate-scenario
app.post('/generate-scenario', aiLimit, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { level = 1, position, stackDepth, format, scenarioType } = body;

  if (level < 1 || level > 10) {
    return c.json({ success: false, error: 'Level must be between 1 and 10' }, 400);
  }

  try {
    const selectedPosition = position || POSITION_CONFIGS[level][Math.floor(Math.random() * POSITION_CONFIGS[level].length)];
    const selectedStackDepth = stackDepth || STACK_DEPTHS[level][Math.floor(Math.random() * STACK_DEPTHS[level].length)];
    const selectedFormat = format || FORMATS[level][Math.floor(Math.random() * FORMATS[level].length)];
    const selectedType = scenarioType || SCENARIO_TYPES[level][Math.floor(Math.random() * SCENARIO_TYPES[level].length)];

    const prompt = buildSingleScenarioPrompt(level, selectedPosition, selectedStackDepth, selectedFormat, selectedType);

    const grok = getGrokClient();
    const completion = await grok.chat.completions.create({
      model: 'grok-3',
      messages: [
        {
          role: 'system',
          content: 'You are a GTO poker expert and training content creator. You create precise, solver-accurate poker training scenarios. Your solutions must be based on equilibrium strategies from modern solvers. Always respond with valid JSON only, no markdown.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) throw new Error('Empty response from Grok');

    const scenario = JSON.parse(stripJsonFences(responseText));
    const validatedScenario = validateScenario(scenario, level, selectedPosition, selectedStackDepth);

    return c.json({
      success: true,
      scenario: validatedScenario,
      meta: {
        level,
        position: selectedPosition,
        stackDepth: selectedStackDepth,
        format: selectedFormat,
        type: selectedType,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.warn('[gto/generate-scenario] Error:', error);
    return c.json({ success: false, error: error.message || 'Failed to generate scenario' }, 500);
  }
});

function buildSingleScenarioPrompt(level, position, stackDepth, format, scenarioType) {
  return `Generate a GTO poker training scenario with the following parameters:

Level: ${level} (${DIFFICULTY_DESCRIPTIONS[level]})
Position: ${position}
Stack Depth: ${stackDepth}bb
Format: ${format}
Scenario Type: ${scenarioType}

Create a scenario in this exact JSON format:
{
    "id": "grok-${Date.now()}",
    "level": ${level},
    "title": "[Descriptive title for this spot]",
    "position": "${position}",
    "stackDepth": ${stackDepth},
    "description": "[2-3 sentence description of the scenario and why it's important]",
    "tip": "[Helpful tip for remembering this range]",
    "solution": {
        [Map of hands to actions. Format: "AA": "raise", "AKs": "raise", etc.]
        [Include ALL hands that should be played, using standard notation:]
        [- Pairs: AA, KK, QQ, etc.]
        [- Suited: AKs, AQs, T9s, etc.]
        [- Offsuit: AKo, AQo, etc.]
        [Actions can be: "raise", "call", "3bet", "fold", or mixed like "raise70"]
    }
}

IMPORTANT:
- The solution should contain ~${15 + level * 3}-${20 + level * 5} hands for level ${level}
- Use solver-accurate ranges for ${format} at ${stackDepth}bb
- Higher levels should have more complex ranges with mixed strategies
- Include suited connectors, broadway hands, and pocket pairs as appropriate
- For mixed strategies, use format like "raise70" meaning raise 70% of the time

Return ONLY the JSON object, no explanation or markdown.`;
}

function validateScenario(scenario, level, position, stackDepth) {
  if (!scenario.id) scenario.id = `grok-${Date.now()}`;
  if (!scenario.level) scenario.level = level;
  if (!scenario.position) scenario.position = position;
  if (!scenario.stackDepth) scenario.stackDepth = stackDepth;
  if (!scenario.solution) scenario.solution = {};

  const validatedSolution = {};
  for (const [hand, action] of Object.entries(scenario.solution || {})) {
    const normalizedHand = normalizeHandNotation(hand);
    if (normalizedHand && isValidAction(action)) {
      validatedSolution[normalizedHand] = action;
    }
  }
  scenario.solution = validatedSolution;
  return scenario;
}

function normalizeHandNotation(hand) {
  if (!hand || typeof hand !== 'string') return null;
  const upper = hand.toUpperCase().trim();
  if (upper.length === 2 && RANKS.includes(upper[0]) && upper[0] === upper[1]) return upper;
  if (upper.length === 3 && RANKS.includes(upper[0]) && RANKS.includes(upper[1])) {
    const suffix = upper[2].toLowerCase();
    if (suffix === 's' || suffix === 'o') return upper[0] + upper[1] + suffix;
  }
  if (upper.length === 2 && RANKS.includes(upper[0]) && RANKS.includes(upper[1])) {
    if (upper[0] === upper[1]) return upper;
    return upper + 's';
  }
  return null;
}

function isValidAction(action) {
  if (!action || typeof action !== 'string') return false;
  const lower = action.toLowerCase();
  if (['raise', 'call', '3bet', '4bet', 'fold', 'check', 'allin', 'jam'].includes(lower)) return true;
  if (/^(raise|call|3bet|4bet|fold|check)\d+$/.test(lower)) return true;
  return false;
}

// POST /api/gto/session-recommendations
app.post('/session-recommendations', aiLimit, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const body = await c.req.json().catch(() => ({}));
  const { sessionData } = body;

  try {
    const userId = user.id;
    const { data: profile } = await supabase
      .from('jarvis_user_training_profile')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const { data: recentSessions } = await supabase
      .from('jarvis_training_sessions')
      .select('accuracy, category, answers_data, leaks_detected')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    const recommendations = await generateSessionRecommendations(profile, recentSessions || [], sessionData);

    return c.json({
      success: true,
      recommendations,
      profile: {
        skillLevel: profile?.skill_assessment || 'Developing',
        totalSessions: profile?.total_sessions || 0,
        accuracy: profile?.overall_accuracy || 0,
      },
    });
  } catch (error) {
    console.warn('[gto/session-recommendations] Error:', error);
    return c.json({ success: true, recommendations: getDefaultSessionRecommendations(), fallback: true });
  }
});

async function generateSessionRecommendations(profile, recentSessions, currentSession) {
  const skillLevel = profile?.skill_assessment || 'Developing';
  const avgAccuracy = recentSessions.length > 0
    ? recentSessions.reduce((sum, s) => sum + (s.accuracy || 0), 0) / recentSessions.length
    : 50;

  const cacheParams = { skillLevel, accuracyBucket: Math.floor(avgAccuracy / 10) * 10 };
  const cached = await getCachedResponse('session-recommendations', cacheParams);
  if (cached) return { ...cached, fromCache: true };

  const leaks = [];
  recentSessions.forEach((s) => {
    if (s.leaks_detected) leaks.push(...(s.leaks_detected || []));
  });

  if (recentSessions.length < 2) return getDefaultSessionRecommendations();

  try {
    const grok = getGrokClient();
    const completion = await grok.chat.completions.create({
      model: 'grok-3',
      messages: [
        {
          role: 'system',
          content: `You are Jarvis, an AI poker coach giving end-of-session recommendations.
                    Be encouraging and specific. Focus on actionable next steps.
                    Return JSON with: nextScenario (object), focusAreas (array), streakTip (string), motivationalNote (string).`,
        },
        {
          role: 'user',
          content: `Player profile:
- Skill Level: ${skillLevel}
- Recent Accuracy: ${avgAccuracy.toFixed(1)}%
- Total Sessions: ${profile?.total_sessions || 'Few'}
- Identified Leaks: ${leaks.slice(0, 3).join(', ') || 'None yet'}

Recommend:
1. What scenario they should practice next
2. 2-3 focus areas for improvement
3. A tip for maintaining their streak
4. A brief motivational note

Return as JSON only.`,
        },
      ],
      temperature: 0.6,
      max_tokens: 600,
    });

    const responseText = completion.choices[0]?.message?.content;
    const recommendations = JSON.parse(stripJsonFences(responseText));
    await setCachedResponse('session-recommendations', cacheParams, recommendations, 7);
    return recommendations;
  } catch (error) {
    console.warn('[gto/session-recommendations] Jarvis error:', error);
    return getDefaultSessionRecommendations();
  }
}

function getDefaultSessionRecommendations() {
  return {
    nextScenario: {
      type: 'CO Opening Range',
      level: 3,
      reason: 'A fundamental spot to master',
    },
    focusAreas: ['Position awareness', 'Stack depth adjustments', 'Range visualization'],
    streakTip: 'Play at least one game daily to build muscle memory',
    motivationalNote: 'Every session makes you a sharper player. Keep grinding!',
  };
}

// POST /api/gto/gto-analysis
app.post('/gto-analysis', aiLimit, async (c) => {
  const supabase = c.get('supabase');
  const body = await c.req.json().catch(() => ({}));
  const { hand, position, stackDepth, board, street, villainPosition, action, gameType } = body;

  if (!hand) return c.json({ success: false, error: 'Missing required field: hand' }, 400);

  try {
    const boardString = Array.isArray(board) ? board.join('') : (board || '');
    const cacheParams = {
      hand: hand.toLowerCase(),
      position: (position || 'BTN').toUpperCase(),
      stackDepth: stackDepth || 100,
      board: boardString.toLowerCase(),
      street: (street || 'flop').toLowerCase(),
      villainPosition: (villainPosition || 'BB').toUpperCase(),
      action: (action || '').toLowerCase(),
      gameType: (gameType || 'cash').toLowerCase(),
    };

    const cached = await getCachedResponse('gto-analysis', cacheParams);
    if (cached) return c.json({ ...cached, fromCache: true });

    let pioData = null;
    let source = 'GROK_AI';
    try {
      pioData = await queryPioSolverData(supabase, cacheParams);
      if (pioData) source = 'PIO_SOLVER';
    } catch (pioError) {
      console.warn('[gto/gto-analysis] PioSolver query failed:', pioError.message);
    }

    let analysis;
    if (pioData) {
      analysis = buildAnalysisFromPio(pioData, cacheParams);
    } else {
      analysis = await generateAnalysisWithGrok(cacheParams);
    }

    if (!analysis.explanation || analysis.explanation.length < 100) {
      const grokEnhancement = await generateGrokExplanation(cacheParams, analysis.optimalAction);
      analysis.explanation = grokEnhancement.explanation || analysis.explanation;
      analysis.gtoApproach = grokEnhancement.gtoApproach || analysis.gtoApproach;
    }

    const response = {
      success: true,
      ...analysis,
      source,
      generatedAt: new Date().toISOString(),
    };

    await setCachedResponse('gto-analysis', cacheParams, response, 30);
    return c.json(response);
  } catch (error) {
    console.warn('[gto/gto-analysis] Error:', error);
    return c.json({
      success: false,
      error: error.message,
      optimalAction: 'CALL',
      explanation: 'Unable to generate analysis. Please try again.',
      gtoApproach: 'Standard play recommended.',
      evAnalysis: null,
      alternateLines: [],
      isMixed: false,
    }, 500);
  }
});

async function queryPioSolverData(supabase, params) {
  const { street, gameType } = params;

  let pioGameType = 'hu_cash';
  if (gameType === 'mtt' || gameType === 'tournament') {
    pioGameType = street === 'river' ? 'river_mtt_icm' : 'turn_mtt_icm';
  } else if (gameType === 'spin' || gameType === 'sng') {
    pioGameType = 'turn_spin';
  } else if (street === 'turn' || street === 'river') {
    pioGameType = 'postflop_complete';
  }

  const { data, error } = await supabase
    .from('solved_spots_gold')
    .select('*')
    .eq('game_type', pioGameType)
    .eq('street', street)
    .limit(10);

  if (error || !data || data.length === 0) return null;

  for (const scenario of data) {
    if (scenario.strategy_matrix) {
      return {
        scenario,
        strategyMatrix: scenario.strategy_matrix,
        macroMetrics: scenario.macro_metrics,
      };
    }
  }
  return null;
}

function buildAnalysisFromPio(pioData, params) {
  const { strategyMatrix } = pioData;
  const { hand } = params;

  const actions = strategyMatrix.actions || [];
  const frequencies = strategyMatrix.frequencies || {};
  const handEvs = strategyMatrix.hand_evs || {};
  const normalizedHand = hand.toUpperCase();

  let optimalAction = 'CHECK';
  let optimalFreq = 0;
  const handFrequencies = {};

  actions.forEach((action) => {
    const freq = frequencies[action]?.[normalizedHand]
      || frequencies[action]?.[hand]
      || frequencies[action]?.[hand.toLowerCase()]
      || 0;
    if (freq >= 0 && freq <= 1) {
      handFrequencies[action] = freq;
      if (freq > optimalFreq) {
        optimalFreq = freq;
        optimalAction = action;
      }
    }
  });

  const handEv = handEvs[normalizedHand] || handEvs[hand] || handEvs[hand.toLowerCase()] || 0;
  const readableAction = mapActionToReadable(optimalAction);
  const actionColor = ACTION_COLORS_HEX[readableAction] || '#00ff88';
  const isMixed = optimalFreq < 0.95;

  const alternateLines = [];
  if (isMixed) {
    Object.entries(handFrequencies || {})
      .filter(([a, f]) => a !== optimalAction && f > 0.01)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .forEach(([act, freq]) => {
        alternateLines.push({
          action: mapActionToReadable(act),
          actionCode: act,
          frequency: freq,
          frequencyPct: `${(freq * 100).toFixed(0)}%`,
          reason: `Secondary line at ${(freq * 100).toFixed(0)}% frequency`,
        });
      });
  }

  return {
    optimalAction: readableAction,
    actionCode: optimalAction,
    actionColor,
    frequency: optimalFreq,
    frequencyPct: `${(optimalFreq * 100).toFixed(0)}%`,
    isMixed,
    explanation: isMixed
      ? `GTO recommends ${readableAction} ${(optimalFreq * 100).toFixed(0)}% of the time with ${hand}. This is a mixed strategy spot.`
      : `This is a pure ${readableAction} with ${hand} (${(optimalFreq * 100).toFixed(0)}% frequency).`,
    gtoApproach: `${readableAction} is the primary action based on solver frequencies.`,
    evAnalysis: {
      ev: handEv,
      evDisplay: handEv >= 0 ? `+${handEv.toFixed(2)}bb` : `${handEv.toFixed(2)}bb`,
      description: `Expected value of ${handEv >= 0 ? '+' : ''}${handEv.toFixed(2)}bb for this hand.`,
    },
    alternateLines,
  };
}

function mapActionToReadable(action) {
  if (!action) return 'CHECK';
  const normalized = action.toLowerCase();
  return ACTION_MAP[normalized] || action.toUpperCase();
}

async function generateAnalysisWithGrok(params) {
  const { hand, position, stackDepth, board, street, villainPosition, action, gameType } = params;

  try {
    const grok = getGrokClient();
    const prompt = `You are a GTO poker solver expert. Analyze this poker scenario and provide comprehensive GTO analysis.

SCENARIO:
- Hand: ${hand}
- Position: ${position}
- Stack Depth: ${stackDepth}bb
- Board: ${board || 'Preflop'}
- Street: ${street}
- Villain Position: ${villainPosition}
- Action: ${action || 'Standard spot'}
- Game Type: ${gameType || 'Cash game'}

Provide analysis in this EXACT JSON format (no markdown, no code blocks):
{
  "optimalAction": "RAISE",
  "frequency": 0.85,
  "explanation": "Detailed 2-3 sentence explanation of why this is the GTO play, considering equity, position, stack depth, and opponent ranges.",
  "gtoApproach": "Concise solver-based strategy explanation focusing on range construction and balance.",
  "evAnalysis": {
    "ev": 1.5,
    "description": "Brief EV analysis explaining the expected value"
  },
  "alternateLines": [
    {"action": "CALL", "frequency": 0.10, "reason": "Secondary line explanation"},
    {"action": "FOLD", "frequency": 0.05, "reason": "Tertiary line explanation"}
  ],
  "isMixed": true
}

IMPORTANT:
- optimalAction must be one of: FOLD, CHECK, CALL, BET, RAISE, 3-BET, 4-BET, ALL-IN
- frequencies must sum to 1.0 approximately
- isMixed should be true if main action is < 95% frequency
- Only include alternateLines if isMixed is true`;

    const response = await grok.chat.completions.create({
      model: 'grok-3',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      max_tokens: 800,
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const actionColor = ACTION_COLORS_HEX[parsed.optimalAction] || '#00ff88';
      return {
        optimalAction: parsed.optimalAction || 'CALL',
        actionColor,
        frequency: parsed.frequency || 0.5,
        frequencyPct: `${((parsed.frequency || 0.5) * 100).toFixed(0)}%`,
        isMixed: parsed.isMixed !== false,
        explanation: parsed.explanation || 'Standard GTO play.',
        gtoApproach: parsed.gtoApproach || 'Balanced approach recommended.',
        evAnalysis: parsed.evAnalysis || { ev: 0, description: 'EV neutral.' },
        alternateLines: parsed.alternateLines || [],
      };
    }
  } catch (error) {
    console.warn('[gto/gto-analysis] Grok generation error:', error.message);
  }

  return {
    optimalAction: 'CALL',
    actionColor: ACTION_COLORS_HEX.CALL,
    frequency: 0.5,
    frequencyPct: '50%',
    isMixed: true,
    explanation: `With ${hand} in this spot, a balanced approach is recommended.`,
    gtoApproach: 'Consider your range and opponent tendencies.',
    evAnalysis: { ev: 0, description: 'EV neutral spot.' },
    alternateLines: [],
  };
}

async function generateGrokExplanation(params, optimalAction) {
  const { hand, position, stackDepth, board, street } = params;
  try {
    const grok = getGrokClient();
    const prompt = `As a GTO poker coach, provide a detailed explanation and strategic approach for this spot:

SCENARIO:
- Hand: ${hand}
- Position: ${position}
- Stack: ${stackDepth}bb
- Board: ${board || 'Preflop'}
- Street: ${street}
- Optimal Action: ${optimalAction}

Return ONLY JSON (no markdown):
{
  "explanation": "3-4 sentences explaining the strategic reasoning, equity considerations, and why this action is optimal",
  "gtoApproach": "2-3 sentences on the solver-based approach, including range construction and balance considerations"
}`;

    const response = await grok.chat.completions.create({
      model: 'grok-3',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      max_tokens: 400,
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.warn('[gto/gto-analysis] Grok explanation error:', error.message);
  }
  return { explanation: null, gtoApproach: null };
}

// POST /api/gto/render-analysis-card
app.post('/render-analysis-card', aiLimit, async (c) => {
  const supabase = c.get('supabase');
  const body = await c.req.json().catch(() => ({}));
  const {
    action = 'RAISE',
    frequency = 85,
    explanation = '',
    gtoApproach = '',
    evValue = '+1.50BB',
    evDescription = '',
    alternateLines = [],
  } = body;

  try {
    const cacheKey = generateImageCacheKey({
      action, frequency, explanation, gtoApproach, evValue, evDescription, alternateLines,
    });

    const existingUrl = await checkCachedImage(supabase, cacheKey);
    if (existingUrl) {
      return c.json({ success: true, imageUrl: existingUrl, fromCache: true });
    }

    const imageBuffer = await generateGtoPanelWithGrok({
      action, frequency, explanation, gtoApproach, evValue, evDescription, alternateLines,
    });
    const imageUrl = await uploadGtoPanelToStorage(supabase, cacheKey, imageBuffer);

    return c.json({ success: true, imageUrl, fromCache: false });
  } catch (error) {
    console.warn('[gto/render-analysis-card] Error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

async function generateGtoPanelWithGrok({
  action, frequency, explanation, gtoApproach, evValue, evDescription, alternateLines,
}) {
  const actionColor = ACTION_COLORS_PROMPT[action?.toUpperCase()] || 'green neon';
  const evColor = evValue?.startsWith('+') ? 'green' : 'red';

  const prompt = `Create a poker GTO analysis panel with EXACT futuristic metal styling:

FRAME: Dark navy/black gradient background with beveled metallic silver-gray frame. Rounded corners with cyan accent lights at bottom. Tech aesthetic like Iron Man HUD.

HEADER SECTION:
- TOP LEFT: Jarvis humanoid AI avatar (cyan glowing robot face in circular frame) with "JARVIS" label below
- CENTER: Large "${action?.toUpperCase()}" text in ${actionColor} with glow effect, next to "${frequency}%" badge
- TOP RIGHT: "Smarter Poker Data" badge in cyan

CONTENT SECTIONS (4 metal-framed cards with dark backgrounds):

1. EXPLANATION SECTION:
- Header: "ⓘ Explanation" with arrow icon
- Text: "${explanation}"
- Highlight key terms like "${action?.toUpperCase()}", "GTO action", "Expected Value (EV)" in cyan/green

2. GTO APPROACH SECTION:
- Header: "⚙ GTO Approach" with arrow icon
- Text: "${gtoApproach}"
- Highlight "balanced range" in cyan

3. EV ANALYSIS SECTION:
- Header: "$ EV Analysis" with arrow icon
- Large "${evValue}" in ${evColor} with glow
- Text: "${evDescription}"
- Highlight "expected value", "+1.50BB", "pot equity" in cyan/green

4. ALTERNATE LINES SECTION:
- Header: "Y 2 Alternate Lines" with arrow icon
${alternateLines.map((line, i) => `- ${i === 0 ? 'Yellow' : 'Red'} dot: "${line.action?.toUpperCase()}" ${line.frequency || line.frequencyPct} frequency - "${line.reason}"`).join('\n')}

Style: Premium, futuristic, metal-framed UI. Like a high-tech poker solver interface. No plain/basic styling.`;

  const response = await fetch('https://api.x.ai/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-2-image-1212',
      prompt,
      n: 1,
      response_format: 'b64_json',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Grok API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (!data.data?.[0]?.b64_json) throw new Error('Invalid response from Grok API');

  return Buffer.from(data.data[0].b64_json, 'base64');
}

function generateImageCacheKey(data) {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(data));
  return `gto-panel-${hash.digest('hex').substring(0, 16)}`;
}

async function checkCachedImage(supabase, cacheKey) {
  try {
    const { data } = supabase.storage.from('gto-panels').getPublicUrl(`${cacheKey}.png`);
    const response = await fetch(data.publicUrl, { method: 'HEAD' });
    if (response.ok) return data.publicUrl;
  } catch {
    // File doesn't exist, continue to generate
  }
  return null;
}

async function uploadGtoPanelToStorage(supabase, cacheKey, buffer) {
  const { error } = await supabase.storage
    .from('gto-panels')
    .upload(`${cacheKey}.png`, buffer, {
      contentType: 'image/png',
      upsert: true,
    });

  if (error) {
    console.warn('[gto/render-analysis-card] Upload error:', error);
    throw error;
  }

  const { data: urlData } = supabase.storage.from('gto-panels').getPublicUrl(`${cacheKey}.png`);
  return urlData.publicUrl;
}

// ─── Vercel adapter ───────────────────────────────────────────────────────
const handler = handle(app);

export default async function vercelHandler(req, res) {
  try {
    return await handler(req, res);
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[gto] handled exception:', _sentryErr?.message ?? _sentryErr);
    }
    console.warn('[gto] router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
