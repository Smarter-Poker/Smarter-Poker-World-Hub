/**
 * POST /api/assistant/sandbox/analyze
 * Runs GTO analysis on a sandbox scenario
 *
 * Currently uses AI approximation. Can be upgraded to solver-verified data later.
 */

import { createClient } from '@supabase/supabase-js';

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
// GTO APPROXIMATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

// GTO approximation engine
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

    // Run analysis
    const analysis = analyzeScenario({
      heroHand,
      heroPosition,
      heroStack,
      gameType,
      villains,
      board,
      potSize: potSize || 0
    });

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
            source: 'ai_approx',
            template_id: generateTemplateId({ heroHand, heroPosition, heroStack, gameType, villains, board }),
            stack_format_hash: generateStackFormatHash(heroStack, gameType, villains),
            timestamp: new Date().toISOString(),
            model_version: 'gto-approx-v1.0.0'
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

    return res.status(200).json({
      success: true,
      sessionId,
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
