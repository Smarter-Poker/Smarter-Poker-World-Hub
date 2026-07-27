/**
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * AI COACH ENGINE — Geeves/Jarvis Coaching Integration
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * Smarter.poker's secret weapon — AI-powered coaching that explains
 * GTO concepts in plain English:
 *   - Post-hand analysis with natural language explanations
 *   - "Why was this wrong?" interactive coaching
 *   - Personalized study plans based on leak detection
 *   - Live coaching during training sessions
 *   - Adaptive difficulty recommendations
 *
 * This engine generates coaching prompts and explanations locally.
 * For full AI-powered coaching, integrate with Geeves/Jarvis API.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { MADE_HANDS } from './HandStrengthEngine';
import { MOVE_CLASSIFICATIONS } from './GTOScoreEngine';

// ●● Coaching Tones ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export const COACH_PERSONALITY = {
    GEEVES: {
        name: 'Geeves',
        style: 'formal',
        prefix: 'Sir, if I may...',
        encouragement: 'Excellent play, well done.',
        correction: 'I believe there may be a more optimal approach here.',
        blunder: 'I must respectfully suggest reviewing this decision.',
    },
    JARVIS: {
        name: 'Jarvis',
        style: 'casual',
        prefix: 'Hey, quick thought —',
        encouragement: 'Nice one! That\'s the play.',
        correction: 'Close, but let\'s think about this differently.',
        blunder: 'Whoa, let\'s talk about that one.',
    },
};

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// POST-HAND EXPLANATIONS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Generate a natural language explanation for a decision.
 *
 * @param {Object} decision - Analyzed decision from HandAnalyzer
 * @param {string} [coach='JARVIS'] - Coach personality
 * @returns {{ text: string, detail: string, concepts: string[] }}
 */
export function explainDecision(decision, coach = 'JARVIS') {
    const personality = COACH_PERSONALITY[coach] || COACH_PERSONALITY.JARVIS;
    const concepts = [];

    let text = '';
    let detail = '';

    // Opening based on classification
    if (decision.classification === 'correct') {
        text = personality.encouragement;
    } else if (decision.classification === 'blunder') {
        text = personality.blunder;
    } else {
        text = personality.correction;
    }

    // Board texture explanation
    if (decision.boardTexture) {
        detail += `The board is ${decision.boardTexture}. `;
        concepts.push('board_texture');
    }

    // Hand strength context
    if (decision.madeHand) {
        detail += `You have ${decision.madeHand}`;
        if (decision.draws) {
            detail += ` with ${decision.draws}`;
            concepts.push('draw_equity');
        }
        detail += '. ';
    }

    // Action explanation
    const playerAction = decision.action;
    const gtoAction = decision.gtoAction;

    if (decision.classification === 'correct') {
        detail += _explainCorrectAction(decision, concepts);
    } else {
        detail += _explainMistake(decision, concepts);
    }

    // EV loss context
    if (decision.evLoss > 0) {
        detail += ` This costs approximately ${decision.evLoss.toFixed(1)}BB in expected value.`;
        concepts.push('expected_value');
    }

    return { text, detail: detail.trim(), concepts };
}

function _explainCorrectAction(decision, concepts) {
    const { action, street, madeHand, draws } = decision;

    if (action === 'bet' || action === 'raise') {
        if (decision.madeHandStrength >= 0.70) {
            concepts.push('value_betting');
            return `Betting for value with ${madeHand} is the right play — you want to build the pot and get paid by worse hands.`;
        }
        if (draws) {
            concepts.push('semi_bluff');
            return `Semi-bluffing with ${draws} is great — you have equity if called and fold equity to win the pot now.`;
        }
        concepts.push('bluffing');
        return `This is a well-timed bluff. Your opponent's range is capped and you're representing a strong hand.`;
    }

    if (action === 'check') {
        if (decision.madeHandStrength >= 0.50) {
            concepts.push('pot_control');
            return `Checking for pot control with ${madeHand} is correct. The board is too dangerous to bloat the pot.`;
        }
        concepts.push('range_protection');
        return `Checking keeps your checking range balanced. Not everything needs to be bet.`;
    }

    if (action === 'call') {
        concepts.push('pot_odds');
        return `Calling is correct — you're getting the right price with your hand strength / draw equity.`;
    }

    if (action === 'fold') {
        concepts.push('discipline');
        return `Good fold. Discipline to let go of marginal hands saves you money long-term.`;
    }

    return '';
}

function _explainMistake(decision, concepts) {
    const { action, gtoAction, street, madeHand, madeHandStrength, draws } = decision;

    // Player bet but should have checked
    if ((action === 'bet' || action === 'raise') && gtoAction === 'check') {
        if (madeHandStrength < 0.20) {
            concepts.push('bluff_frequency');
            return `You're bluffing too often in this spot. With ${madeHand || 'a weak hand'}, the GTO play is to give up. Your bluffing frequency is likely above the balanced threshold.`;
        }
        concepts.push('pot_control');
        return `With ${madeHand || 'a medium-strength hand'}, betting here bloats the pot unnecessarily. Check to keep the pot manageable and induce bluffs from your opponent.`;
    }

    // Player checked but should have bet
    if (action === 'check' && (gtoAction === 'bet')) {
        if (madeHandStrength >= 0.50) {
            concepts.push('value_betting', 'thin_value');
            return `You're missing value! ${madeHand || 'Your hand'} is strong enough to bet here. Checking lets your opponent realize their equity for free.`;
        }
        if (draws) {
            concepts.push('semi_bluff');
            return `This is a great semi-bluff spot with ${draws}. Betting puts pressure on your opponent while you still have outs if called.`;
        }
        concepts.push('bluffing');
        return `GTO calls for a bet here as a bluff. Your range needs bluffs in this spot to stay balanced, and this hand is a good candidate.`;
    }

    // Player called but should have folded
    if (action === 'call' && gtoAction === 'fold') {
        concepts.push('pot_odds', 'fold_discipline');
        return `This call is too loose. With ${madeHand || 'your hand'}, you don't have enough equity to justify the call. The pot odds don't compensate for how often you're behind.`;
    }

    // Player folded but should have called
    if (action === 'fold' && (gtoAction === 'call' || gtoAction === 'raise')) {
        concepts.push('minimum_defense_frequency');
        return `You're over-folding here. With ${madeHand || 'this hand'}${draws ? ` and ${draws}` : ''}, you need to defend to prevent your opponent from printing money with bluffs. Remember minimum defense frequency.`;
    }

    // Player called but should have raised
    if (action === 'call' && gtoAction === 'raise') {
        concepts.push('aggression', 'value_raising');
        return `Just calling is too passive. With ${madeHand || 'your hand'}, you should raise for value and protection. Build the pot while you likely have the best hand.`;
    }

    return `GTO prefers ${gtoAction} in this spot. ${decision.gtoReason || ''}`;
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// STUDY PLAN GENERATION
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Generate a personalized study plan based on leak detection.
 *
 * @param {Array} leaks - Output from LeakDetector.detectLeaks()
 * @param {Object} playerProfile - { level, gamesPlayed, avgScore }
 * @returns {{ plan: Array<{ day: number, focus: string, games: string[], duration: string }>, summary: string }}
 */
export function generateStudyPlan(leaks, playerProfile = {}) {
    const plan = [];
    const avgScore = playerProfile.avgScore || 60;

    // Day 1-2: Address critical leaks
    const criticalLeaks = leaks.filter(l => l.severity === 'critical' || l.severity === 'major');
    if (criticalLeaks.length > 0) {
        plan.push({
            day: 1,
            focus: `Fix ${criticalLeaks[0].description.split(' — ')[0]}`,
            games: [criticalLeaks[0].drill?.gameId || 'cash-001'].filter(Boolean),
            duration: '30 min',
            tip: 'Focus on understanding why the GTO action is correct, not just memorizing it.',
        });

        if (criticalLeaks.length > 1) {
            plan.push({
                day: 2,
                focus: `Fix ${criticalLeaks[1].description.split(' — ')[0]}`,
                games: [criticalLeaks[1].drill?.gameId || 'cash-002'].filter(Boolean),
                duration: '30 min',
                tip: 'Review the previous day\'s work before starting today\'s focus.',
            });
        }
    }

    // Day 3-4: Reinforce fundamentals
    plan.push({
        day: plan.length + 1,
        focus: 'Preflop Fundamentals Review',
        games: ['cash-001', 'cash-006'],
        duration: '20 min',
        tip: 'Preflop accuracy is the foundation. Make sure your opening ranges are solid.',
    });

    plan.push({
        day: plan.length + 1,
        focus: 'Postflop Decision Making',
        games: ['cash-002', 'cash-014'],
        duration: '25 min',
        tip: 'Focus on board texture recognition and c-bet strategy.',
    });

    // Day 5: Mixed practice
    plan.push({
        day: plan.length + 1,
        focus: 'Full Session — All Streets',
        games: ['cash-025'],
        duration: '30 min',
        tip: 'Play a full session without looking at feedback until the end.',
    });

    // Day 6-7: Advanced + Review
    if (avgScore >= 70) {
        plan.push({
            day: plan.length + 1,
            focus: 'Advanced: Range Construction',
            games: ['adv-004', 'mixed-strategy-lab'],
            duration: '25 min',
            tip: 'Work on building ranges from scratch to deepen your understanding.',
        });
    }

    plan.push({
        day: plan.length + 1,
        focus: 'Weekly Review & PvP Challenge',
        games: ['quiz-gauntlet'],
        duration: '20 min',
        tip: 'Test yourself with rapid-fire decisions to see how much you\'ve improved.',
    });

    const summary = avgScore < 60
        ? 'Your plan focuses on fixing fundamental leaks first. Spend extra time on understanding board textures and when to c-bet.'
        : avgScore < 80
            ? 'You have a solid foundation. This plan targets specific weak spots while maintaining your strengths.'
            : 'Advanced plan — focus on marginal spots and mixed strategies to push from good to great.';

    return { plan, summary };
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// LIVE COACHING — In-session hints and nudges
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Generate a real-time coaching hint during a training hand.
 * Called before the player makes their decision.
 *
 * @param {Object} context
 * @param {string[]} context.board
 * @param {string[]} context.holeCards
 * @param {string} context.street
 * @param {string} context.madeHand
 * @param {number} context.handStrength
 * @param {string} [context.draws]
 * @param {string} [context.boardTexture]
 * @param {boolean} [context.facingBet]
 * @returns {{ hint: string, concept: string, difficulty: string }}
 */
export function getLiveHint(context) {
    const { board, holeCards, street, madeHand, handStrength, draws, boardTexture, facingBet } = context;

    // Don't give hints for very obvious situations
    if (handStrength >= 0.90) {
        return { hint: 'You have the nuts or close to it. Think about sizing.', concept: 'value_sizing', difficulty: 'easy' };
    }
    if (handStrength <= 0.05 && !draws) {
        return { hint: 'You have nothing. Is this a good bluff spot?', concept: 'bluff_selection', difficulty: 'easy' };
    }

    // Board texture hints
    if (boardTexture) {
        if (boardTexture.toLowerCase().includes('wet')) {
            return {
                hint: `Wet board (${boardTexture}). Protection bets are important — don't let draws get there for free.`,
                concept: 'equity_denial',
                difficulty: 'medium',
            };
        }
        if (boardTexture.toLowerCase().includes('dry')) {
            return {
                hint: `Dry board (${boardTexture}). Small sizing works well here — opponent has few draws to worry about.`,
                concept: 'bet_sizing',
                difficulty: 'medium',
            };
        }
    }

    // Draw hints
    if (draws && draws !== 'No draws') {
        if (facingBet) {
            return {
                hint: `You have ${draws}. Calculate your pot odds — do you have enough equity to call?`,
                concept: 'pot_odds',
                difficulty: 'medium',
            };
        }
        return {
            hint: `You have ${draws}. Semi-bluffing builds the pot when you hit and wins when they fold.`,
            concept: 'semi_bluff',
            difficulty: 'medium',
        };
    }

    // Medium hand hints
    if (handStrength >= 0.30 && handStrength < 0.60) {
        if (facingBet) {
            return {
                hint: `Medium strength hand (${madeHand}). Think about your opponent's range — is this a good bluff-catcher?`,
                concept: 'hand_reading',
                difficulty: 'hard',
            };
        }
        return {
            hint: `${madeHand} — consider pot control. Sometimes the best play is checking to keep the pot small.`,
            concept: 'pot_control',
            difficulty: 'medium',
        };
    }

    return {
        hint: `Think about your hand relative to the board. What does your opponent likely have?`,
        concept: 'range_analysis',
        difficulty: 'hard',
    };
}

// ●● Concept Library ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export const POKER_CONCEPTS = {
    board_texture: { name: 'Board Texture', description: 'Understanding how the community cards interact with ranges' },
    value_betting: { name: 'Value Betting', description: 'Betting with strong hands to extract chips from worse hands' },
    semi_bluff: { name: 'Semi-Bluffing', description: 'Betting with a draw — win now if they fold, or improve if called' },
    bluffing: { name: 'Bluffing', description: 'Betting with a weak hand to make opponents fold better hands' },
    pot_control: { name: 'Pot Control', description: 'Keeping the pot small with medium-strength hands' },
    pot_odds: { name: 'Pot Odds', description: 'The ratio of the current pot to the cost of calling' },
    expected_value: { name: 'Expected Value (EV)', description: 'The average long-run profit or loss of a decision' },
    minimum_defense_frequency: { name: 'MDF', description: 'The minimum percentage of your range you must defend to prevent exploitation' },
    fold_discipline: { name: 'Fold Discipline', description: 'The ability to let go of second-best hands' },
    range_analysis: { name: 'Range Analysis', description: 'Thinking about all possible hands your opponent could have' },
    equity_denial: { name: 'Equity Denial', description: 'Preventing opponents from realizing their share of the pot' },
    bet_sizing: { name: 'Bet Sizing', description: 'Choosing the right bet amount based on hand, board, and range' },
    thin_value: { name: 'Thin Value', description: 'Betting for value with hands that only narrowly beat the calling range' },
    bluff_frequency: { name: 'Bluff Frequency', description: 'The correct ratio of bluffs to value bets in your betting range' },
    hand_reading: { name: 'Hand Reading', description: 'Narrowing down opponent hand ranges based on their actions' },
    aggression: { name: 'Aggression', description: 'Taking the initiative through betting and raising' },
    range_protection: { name: 'Range Protection', description: 'Including strong hands in your checking range to prevent exploitation' },
};

export default {
    explainDecision,
    generateStudyPlan,
    getLiveHint,
    COACH_PERSONALITY,
    POKER_CONCEPTS,
};
