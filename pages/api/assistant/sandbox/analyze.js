/**
 * POST /api/assistant/sandbox/analyze
 * Runs GTO analysis on a sandbox scenario
 *
 * Per Masterplan Section VIII: Safety & Friction Elements
 * - Cache repeated sandbox configs
 * - Rate-limit combinatorial exploration
 * - Block reverse-engineering attempts
 * 
 * NEW: Grok AI Integration (Phase 3)
 * - Tier 3 analysis now uses Grok for intelligent reasoning
 */

import { createClient } from '@supabase/supabase-js';
import { checkSandboxAccess } from '../../../../src/lib/personal-assistant/contextAuthority';
import { getGrokClient } from '../../../../src/lib/grokClient';

// ═══════════════════════════════════════════════════════════════════════════
// AI-POWERED ANALYSIS (Tier 3 with Grok)
// ═══════════════════════════════════════════════════════════════════════════

async function analyzeWithGrok(params) {
  try {
    const openai = getGrokClient();

    const { heroHand, heroPosition, heroStack, gameType, villains, board, potSize } = params;

    // Build board string
    const boardCards = [
      ...(board?.flop || []),
      board?.turn,
      board?.river
    ].filter(Boolean);

    const boardStr = boardCards.length > 0 ? boardCards.join(' ') : 'Preflop';
    const villainDesc = villains?.map(v => `${v.archetype?.name || 'Unknown'} (${v.stack}bb)`).join(', ') || 'Unknown';

    const prompt = `You are a GTO poker expert. Analyze this scenario and provide optimal action frequencies.

SCENARIO:
- Hero Hand: ${heroHand?.card1 || 'As'} ${heroHand?.card2 || 'Kd'}
- Hero Position: ${heroPosition || 'BTN'}
- Hero Stack: ${heroStack || 100}bb
- Game Type: ${gameType === 'tournament' ? 'Tournament (ICM)' : 'Cash Game'}
- Pot Size: ${potSize || 0}bb
- Board: ${boardStr}
- Villains: ${villainDesc}

Respond in this exact JSON format:
{
  "primaryAction": "Bet 66% Pot",
  "primaryFrequency": 65,
  "alternatives": [
    {"action": "Check", "frequency": 25},
    {"action": "Bet 33% Pot", "frequency": 10}
  ],
  "whyNot": "Brief explanation why this is the GTO play",
  "confidence": "High"
}

RULES:
- Frequencies must sum to 100
- Provide exactly 2 alternatives
- Actions: Fold, Check, Call, Bet 33% Pot, Bet 66% Pot, Bet 75% Pot, Bet 100% Pot, Raise 2.5x, All-In
- Consider stack depth, position, and villain tendencies
- Be specific about bet sizing`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // Will be mapped to grok-3
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content || '';

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON in response');
    }

    const analysis = JSON.parse(jsonMatch[0]);

    return {
      ...analysis,
      source: 'Grok AI Analysis',
      street: boardCards.length === 0 ? 'preflop' :
        boardCards.length <= 3 ? 'flop' :
          boardCards.length === 4 ? 'turn' : 'river',
      sensitivityFlags: heroStack < 50 ? ['stack_sensitive'] : [],
      context: `${gameType === 'tournament' ? 'Tournament' : 'Cash Game'} - ${heroStack} BB - ${heroPosition} vs ${villainDesc}`,
    };
  } catch (error) {
    console.error('[Sandbox] Grok analysis failed, using fallback:', error.message);
    return null; // Fall back to rule-based
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING & CACHING — Per Masterplan Section VIII

// Simple in-memory cache (in production, use Redis)
const analysisCache = new Map();
const rateLimitMap = new Map();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30; // 30 requests per minute

/**
 * Check rate limit for a user
 */
function checkRateLimit(userId) {
  const now = Date.now();
  const userKey = userId || 'anonymous';

  if (!rateLimitMap.has(userKey)) {
    rateLimitMap.set(userKey, { count: 1, windowStart: now });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
  }

  const userLimit = rateLimitMap.get(userKey);

  // Reset window if expired
  if (now - userLimit.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(userKey, { count: 1, windowStart: now });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
  }

  // Check if over limit
  if (userLimit.count >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfter = Math.ceil((userLimit.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  userLimit.count++;
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - userLimit.count };
}

/**
 * Generate cache key from analysis params
 */
function getCacheKey(params) {
  const { heroHand, heroPosition, heroStack, gameType, villains, board } = params;
  return JSON.stringify({
    h: [heroHand?.card1, heroHand?.card2].sort().join(''),
    p: heroPosition,
    s: Math.round(heroStack / 10) * 10, // Round to nearest 10
    g: gameType,
    v: villains?.map(v => v.archetype?.id).sort().join(','),
    b: [
      ...(board?.flop || []),
      board?.turn,
      board?.river
    ].filter(Boolean).sort().join(''),
  });
}

/**
 * Get cached analysis if available
 */
function getCachedAnalysis(cacheKey) {
  const cached = analysisCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.analysis;
  }
  return null;
}

/**
 * Cache analysis result
 */
function cacheAnalysis(cacheKey, analysis) {
  // Limit cache size
  if (analysisCache.size > 1000) {
    // Remove oldest entries
    const keysToDelete = Array.from(analysisCache.keys()).slice(0, 100);
    keysToDelete.forEach(k => analysisCache.delete(k));
  }

  analysisCache.set(cacheKey, {
    analysis,
    timestamp: Date.now(),
  });
}

/**
 * Detect potential reverse-engineering attempts
 */
function detectReverseEngineering(userId, params) {
  const userKey = userId || 'anonymous';
  const recentRequests = rateLimitMap.get(`${userKey}_history`) || [];
  const now = Date.now();

  // Keep last 5 minutes of request history
  const recent = recentRequests.filter(r => now - r.timestamp < 5 * 60 * 1000);

  // Add current request
  recent.push({
    timestamp: now,
    stack: params.heroStack,
    villains: params.villains?.length || 0,
  });

  rateLimitMap.set(`${userKey}_history`, recent.slice(-50));

  // Check for suspicious patterns
  if (recent.length >= 10) {
    // Rapid stack size iterations (potential range exploration)
    const uniqueStacks = new Set(recent.map(r => r.stack)).size;
    if (uniqueStacks > 8 && recent.length <= 15) {
      return {
        suspicious: true,
        reason: 'rapid_stack_iteration',
        warning: 'Slow down! Exploring many stack sizes quickly may indicate automated range building.',
      };
    }
  }

  return { suspicious: false };
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ═══════════════════════════════════════════════════════════════════════════
// TRUTH SEAL GENERATORS — Ensures reproducibility per Masterplan Section VII
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a unique template ID for this scenario configuration.
 * Identical inputs will always produce identical template IDs.
 */
function generateTemplateId(params) {
  const {
    heroHand,
    heroPosition,
    heroStack,
    gameType,
    villains,
    board,
  } = params;

  // Create deterministic string from all inputs
  const inputString = [
    heroHand?.card1 || '',
    heroHand?.card2 || '',
    heroPosition || '',
    heroStack || 0,
    gameType || 'cash',
    (villains || []).map(v => `${v.archetype?.id || 'gto'}:${v.stack || 100}`).join(','),
    (board?.flop || []).join(''),
    board?.turn || '',
    board?.river || '',
  ].join('|');

  // Simple hash function for deterministic ID
  let hash = 0;
  for (let i = 0; i < inputString.length; i++) {
    const char = inputString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `tmpl_${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

/**
 * Generate a hash representing stack depth and format configuration.
 * Used for cache invalidation and reproducibility verification.
 */
function generateStackFormatHash(heroStack, gameType, villains) {
  const stackDepth = heroStack <= 30 ? 'short' : heroStack <= 60 ? 'medium' : 'deep';
  const avgVillainStack = villains?.length > 0
    ? Math.round(villains.reduce((sum, v) => sum + (v.stack || 100), 0) / villains.length)
    : 100;
  const format = gameType === 'tournament' ? 'icm' : 'chipev';

  return `${stackDepth}_${format}_vs${avgVillainStack}bb`;
}

// ═══════════════════════════════════════════════════════════════════════════
// SOLVER TEMPLATE MATCHING — Tier 1/2 Data Source Hierarchy
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Attempt to find a matching solver template in the database.
 * Returns null if no match found (will fall back to AI approximation).
 */
async function findSolverTemplate(supabase, params) {
  const {
    heroHand,
    heroPosition,
    heroStack,
    gameType,
    board,
  } = params;

  // Normalize stack depth to common ranges solvers use
  const stackDepth = heroStack <= 25 ? 20 :
    heroStack <= 35 ? 30 :
      heroStack <= 50 ? 40 :
        heroStack <= 75 ? 60 :
          heroStack <= 125 ? 100 : 150;

  // Determine street
  const boardCards = [
    ...(board?.flop || []),
    board?.turn,
    board?.river
  ].filter(Boolean);

  const street = boardCards.length === 0 ? 'preflop' :
    boardCards.length <= 3 ? 'flop' :
      boardCards.length === 4 ? 'turn' : 'river';

  // Build board texture classification for matching
  let boardTexture = null;
  if (street !== 'preflop' && board?.flop) {
    const flop = board.flop.filter(Boolean);
    if (flop.length === 3) {
      // Check for monotone, two-tone, rainbow
      const suits = flop.map(c => c[1]);
      const uniqueSuits = new Set(suits).size;
      const ranks = flop.map(c => c[0]);
      const highCards = ranks.filter(r => ['A', 'K', 'Q', 'J', 'T'].includes(r)).length;

      if (uniqueSuits === 1) boardTexture = 'monotone';
      else if (uniqueSuits === 2) boardTexture = 'two_tone';
      else boardTexture = 'rainbow';

      if (highCards >= 2) boardTexture += '_high';
      else if (highCards === 0) boardTexture += '_low';
    }
  }

  try {
    // First try exact template match
    let query = supabase
      .from('solver_templates')
      .select('*')
      .eq('game_type', gameType === 'tournament' ? 'mtt' : 'cash')
      .eq('stack_depth_bb', stackDepth)
      .ilike('position_config', `%${heroPosition}%`);

    if (boardTexture) {
      query = query.ilike('board_texture', `%${boardTexture.split('_')[0]}%`);
    }

    const { data: exactMatch } = await query.limit(1).single();

    if (exactMatch) {
      return {
        template: exactMatch,
        tier: 1,
        source: `Solver-Verified (${exactMatch.solver_version || 'Pio'})`,
      };
    }

    // Try approximate match with nearby stack depth
    const nearbyStacks = [stackDepth - 20, stackDepth + 20].filter(s => s > 0);
    const { data: approxMatch } = await supabase
      .from('solver_templates')
      .select('*')
      .eq('game_type', gameType === 'tournament' ? 'mtt' : 'cash')
      .in('stack_depth_bb', nearbyStacks)
      .ilike('position_config', `%${heroPosition}%`)
      .limit(1)
      .single();

    if (approxMatch) {
      return {
        template: approxMatch,
        tier: 2,
        source: 'Solver-Approximated',
      };
    }

    return null;
  } catch (error) {
    // No match found or query error
    return null;
  }
}

/**
 * Parse solver template frequencies into our output format.
 */
function parseSolverTemplate(template, params) {
  const frequencies = template.frequencies || {};
  const actions = Object.entries(frequencies)
    .map(([action, freq]) => ({ action, frequency: parseFloat(freq) || 0 }))
    .sort((a, b) => b.frequency - a.frequency);

  if (actions.length === 0) {
    return null;
  }

  const primary = actions[0];
  const alternatives = actions.slice(1, 3); // Take top 2 alternatives

  // Ensure we always have 2 alternatives
  while (alternatives.length < 2) {
    alternatives.push({ action: 'Fold', frequency: 0 });
  }

  return {
    primaryAction: primary.action,
    primaryFrequency: Math.round(primary.frequency),
    alternatives: alternatives.map(a => ({
      action: a.action,
      frequency: Math.round(a.frequency)
    })),
    whyNot: template.explanation || 'This action follows GTO equilibrium strategy.',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GTO APPROXIMATION ENGINE (Tier 3 Fallback)
// ═══════════════════════════════════════════════════════════════════════════

// GTO approximation engine - used when no solver data exists
function analyzeScenario(params) {
  const {
    heroHand,
    heroPosition,
    heroStack,
    gameType,
    villains,
    board,
    potSize
  } = params;

  // Parse hero hand
  const hand1 = heroHand?.card1 || 'As';
  const hand2 = heroHand?.card2 || 'Kd';
  const isPair = hand1[0] === hand2[0];
  const isSuited = hand1[1] === hand2[1];
  const highCard = hand1[0];

  // Analyze board texture
  const boardCards = [
    ...(board?.flop || []),
    board?.turn,
    board?.river
  ].filter(Boolean);

  const street = boardCards.length === 0 ? 'preflop' :
    boardCards.length <= 3 ? 'flop' :
      boardCards.length === 4 ? 'turn' : 'river';

  // Check for draws and made hands
  const suitCounts = {};
  const rankCounts = {};
  boardCards.forEach(card => {
    if (card && card.length >= 2) {
      const suit = card[1];
      const rank = card[0];
      suitCounts[suit] = (suitCounts[suit] || 0) + 1;
      rankCounts[rank] = (rankCounts[rank] || 0) + 1;
    }
  });

  const hasFlushDraw = Object.values(suitCounts).some(c => c >= 3);
  const isPaired = Object.values(rankCounts).some(c => c >= 2);
  const isDry = !hasFlushDraw && !isPaired && boardCards.length > 0;

  // Check villain types
  const hasCallingStation = villains?.some(v =>
    v.archetype?.id === 'loose_passive' || v.archetype?.name?.includes('Calling')
  );
  const hasTAG = villains?.some(v =>
    v.archetype?.id === 'tight_aggressive' || v.archetype?.name?.includes('TAG')
  );
  const hasLAG = villains?.some(v =>
    v.archetype?.id === 'loose_aggressive' || v.archetype?.name?.includes('LAG')
  );

  // Position advantage
  const positionValue = {
    'BTN': 5, 'CO': 4, 'HJ': 3, 'MP': 2, 'MP+1': 2, 'UTG+1': 1, 'UTG': 0, 'SB': 1, 'BB': 2
  };
  const posValue = positionValue[heroPosition] || 3;
  const inPosition = posValue >= 4;

  // Generate GTO-like frequencies based on scenario
  let primaryAction = 'Check';
  let primaryFrequency = 50;
  let alternatives = [];
  let whyNot = '';
  let confidence = 'High';
  let dataSource = 'AI Approximation';

  if (street === 'preflop') {
    // Preflop logic
    if (isPair || ['A', 'K', 'Q'].includes(highCard)) {
      primaryAction = 'Raise 2.5x';
      primaryFrequency = 85;
      alternatives = [
        { action: 'Call', frequency: 10 },
        { action: 'Fold', frequency: 5 }
      ];
      whyNot = 'Strong hands should be raised for value and to build the pot.';
    } else {
      primaryAction = inPosition ? 'Raise 2.5x' : 'Fold';
      primaryFrequency = inPosition ? 60 : 70;
      alternatives = inPosition
        ? [{ action: 'Call', frequency: 25 }, { action: 'Fold', frequency: 15 }]
        : [{ action: 'Call', frequency: 20 }, { action: 'Raise 2.5x', frequency: 10 }];
    }
  } else if (street === 'flop') {
    // Flop c-bet logic
    if (isDry && inPosition) {
      primaryAction = 'Bet 33% Pot';
      primaryFrequency = 70;
      alternatives = [
        { action: 'Check', frequency: 20 },
        { action: 'Bet 75% Pot', frequency: 10 }
      ];
      whyNot = hasCallingStation
        ? 'C-betting here maximizes fold equity against the Calling Station.'
        : 'On dry boards in position, small c-bets are highly profitable.';
    } else if (hasFlushDraw) {
      primaryAction = 'Bet 66% Pot';
      primaryFrequency = 55;
      alternatives = [
        { action: 'Check', frequency: 30 },
        { action: 'Bet 33% Pot', frequency: 15 }
      ];
      whyNot = 'Wet boards require larger bets to charge draws.';
    } else {
      primaryAction = 'Check';
      primaryFrequency = 55;
      alternatives = [
        { action: 'Bet 33% Pot', frequency: 30 },
        { action: 'Bet 66% Pot', frequency: 15 }
      ];
      whyNot = 'Mixed strategy is optimal here. Checking protects your checking range.';
    }
  } else if (street === 'turn') {
    // Turn barrel logic
    if (inPosition && !hasFlushDraw) {
      primaryAction = 'Bet 66% Pot';
      primaryFrequency = 50;
      alternatives = [
        { action: 'Check', frequency: 35 },
        { action: 'Bet 33% Pot', frequency: 15 }
      ];
      whyNot = 'Turn barrels apply maximum pressure and deny equity.';
    } else {
      primaryAction = 'Check';
      primaryFrequency = 60;
      alternatives = [
        { action: 'Bet 66% Pot', frequency: 30 },
        { action: 'Bet 100% Pot', frequency: 10 }
      ];
      whyNot = 'Out of position, checking is often correct to control pot size.';
    }
  } else {
    // River logic
    primaryAction = 'Check';
    primaryFrequency = 50;
    alternatives = [
      { action: 'Bet 75% Pot', frequency: 35 },
      { action: 'Bet 125% Pot', frequency: 15 }
    ];
    whyNot = 'River decisions are highly dependent on hand strength and board runout.';
    confidence = 'Medium';
  }

  // Adjust for stack depth
  if (heroStack < 40) {
    confidence = 'Medium';
    dataSource = 'AI Approximation (Short Stack)';
  }

  // Build context string
  const villainTypes = villains?.slice(0, 2).map(v => v.archetype?.name || 'Unknown').join(' & ') || 'Unknown';
  const context = `${gameType === 'tournament' ? 'Tournament' : 'Cash Game'} - ${heroStack} BB - ${heroPosition} vs ${villainTypes}`;

  return {
    primaryAction,
    primaryFrequency,
    alternatives,
    context,
    source: dataSource,
    confidence,
    whyNot,
    street,
    sensitivityFlags: heroStack < 50 ? ['stack_sensitive'] : []
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      userId,
      heroHand,
      heroPosition,
      heroStack,
      gameType,
      villains,
      board,
      betSizing,
      potSize
    } = req.body;

    // Check context authority (Masterplan Section I)
    const contextAccess = await checkSandboxAccess(supabase, userId);
    if (!contextAccess.allowed) {
      return res.status(403).json({
        success: false,
        blocked: true,
        contextState: contextAccess.contextState,
        error: contextAccess.message,
        cooldownRemaining: contextAccess.cooldownRemaining,
      });
    }

    // Check rate limit (Masterplan Section VIII)
    const rateLimit = checkRateLimit(userId);
    if (!rateLimit.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded. Please slow down.',
        retryAfter: rateLimit.retryAfter,
      });
    }

    // Build params for analysis
    const analysisParams = {
      heroHand,
      heroPosition,
      heroStack,
      gameType,
      villains,
      board,
      potSize: potSize || 0
    };

    // Check cache first (Masterplan Section VIII)
    const cacheKey = getCacheKey(analysisParams);
    const cachedResult = getCachedAnalysis(cacheKey);
    if (cachedResult) {
      return res.status(200).json({
        success: true,
        cached: true,
        ...cachedResult,
      });
    }

    // Detect potential reverse-engineering (Masterplan Section VIII)
    const reverseCheck = detectReverseEngineering(userId, analysisParams);
    if (reverseCheck.suspicious) {
      // Add warning but still allow the request
      res.setHeader('X-Warning', reverseCheck.warning);
    }

    // Try to find solver template first (Tier 1/2)
    const solverMatch = await findSolverTemplate(supabase, analysisParams);

    let analysis;
    let dataTier = 3;

    if (solverMatch && solverMatch.template) {
      // Use solver data
      const parsed = parseSolverTemplate(solverMatch.template, analysisParams);
      if (parsed) {
        dataTier = solverMatch.tier;
        const villainTypes = villains?.slice(0, 2).map(v => v.archetype?.name || 'Unknown').join(' & ') || 'Unknown';

        analysis = {
          ...parsed,
          context: `${gameType === 'tournament' ? 'Tournament' : 'Cash Game'} - ${heroStack} BB - ${heroPosition} vs ${villainTypes}`,
          source: solverMatch.source,
          confidence: solverMatch.tier === 1 ? 'High' : 'Medium',
          sensitivityFlags: heroStack < 50 ? ['stack_sensitive'] : [],
          street: analysisParams.board?.flop?.length > 0 ?
            (analysisParams.board?.river ? 'river' : analysisParams.board?.turn ? 'turn' : 'flop') : 'preflop',
        };
      }
    }

    // Fall back to AI approximation (Tier 3) if no solver match
    if (!analysis) {
      // Try Grok AI analysis first (Phase 3 upgrade)
      analysis = await analyzeWithGrok(analysisParams);

      // Fall back to rule-based if Grok fails
      if (!analysis) {
        analysis = analyzeScenario(analysisParams);
      }
      dataTier = 3;
    }

    // Save session to database if userId provided
    let sessionId = null;
    if (userId) {
      const { data: session, error: sessionError } = await supabase
        .from('sandbox_sessions')
        .insert({
          user_id: userId,
          hero_hand: `${heroHand?.card1 || ''}${heroHand?.card2 || ''}`,
          hero_position: heroPosition,
          hero_stack_bb: heroStack,
          game_type: gameType,
          num_opponents: villains?.length || 0,
          board_flop: board?.flop?.join('') || null,
          board_turn: board?.turn || null,
          board_river: board?.river || null,
          villain_config: villains || [],
          bet_sizing_preset: betSizing || 'standard',
          pot_size_bb: potSize || 0
        })
        .select()
        .single();

      if (!sessionError && session) {
        sessionId = session.id;

        // Save results
        await supabase.from('sandbox_results').insert({
          session_id: sessionId,
          primary_action: analysis.primaryAction,
          primary_frequency: analysis.primaryFrequency,
          alternative_actions: analysis.alternatives,
          data_source: analysis.source.includes('Solver') ? 'solver_verified' : 'ai_approx',
          confidence: analysis.confidence.toLowerCase(),
          sensitivity_flags: analysis.sensitivityFlags,
          why_not_check: analysis.whyNot,
          truth_seal: {
            source: dataTier === 1 ? 'solver_verified' : dataTier === 2 ? 'solver_approx' : 'ai_approx',
            template_id: generateTemplateId({ heroHand, heroPosition, heroStack, gameType, villains, board }),
            stack_format_hash: generateStackFormatHash(heroStack, gameType, villains),
            timestamp: new Date().toISOString(),
            model_version: dataTier === 3 ? 'gto-approx-v1.0.0' : (solverMatch?.template?.solver_version || 'pio-2.0')
          }
        });

        // Update user stats
        await supabase.rpc('increment_sandbox_count', { p_user_id: userId }).catch(() => {
          // RPC might not exist, try direct update
          supabase
            .from('user_assistant_stats')
            .upsert({
              user_id: userId,
              sandbox_sessions_count: 1,
              last_sandbox_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
        });
      }
    }

    // Cache the result (Masterplan Section VIII)
    cacheAnalysis(cacheKey, analysis);

    return res.status(200).json({
      success: true,
      sessionId,
      rateLimit: {
        remaining: rateLimit.remaining,
      },
      ...analysis
    });

  } catch (error) {
    console.error('Analysis error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
