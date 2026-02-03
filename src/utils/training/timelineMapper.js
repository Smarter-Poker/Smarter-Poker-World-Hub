/**
 * 🎯 Timeline Mapper — Deterministic Pio → GSAP Timeline Transformer
 * ═══════════════════════════════════════════════════════════════════
 * Transforms Supabase Pio-derived data into GSAP-friendly step arrays.
 * FAIL-CLOSED: Returns error state on invalid data.
 * ═══════════════════════════════════════════════════════════════════
 */

// Valid action types
const VALID_ACTIONS = ['fold', 'call', 'raise', 'check', 'bet', 'post_sb', 'post_bb', 'post_ante'];
const VALID_STREETS = ['preflop', 'flop', 'turn', 'river'];

/**
 * Validate a single timeline step
 * @param {Object} step - The step to validate
 * @param {number} index - Step index for error reporting
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateStep(step, index) {
    const errors = [];

    if (typeof step.stepIndex !== 'number') {
        errors.push(`Step ${index}: missing stepIndex`);
    }

    if (!VALID_STREETS.includes(step.street)) {
        errors.push(`Step ${index}: invalid street "${step.street}"`);
    }

    if (typeof step.actorSeatId !== 'number') {
        errors.push(`Step ${index}: missing actorSeatId`);
    }

    if (!VALID_ACTIONS.includes(step.action)) {
        errors.push(`Step ${index}: invalid action "${step.action}"`);
    }

    if (typeof step.potAfterBB !== 'number') {
        errors.push(`Step ${index}: missing potAfterBB`);
    }

    if (!Array.isArray(step.board)) {
        errors.push(`Step ${index}: board must be an array`);
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validate the entire scenario schema
 * @param {Object} scenario - Raw scenario from Supabase
 * @returns {{ valid: boolean, errors: string[], sanitized: Object|null }}
 */
export function validateScenarioSchema(scenario) {
    const errors = [];

    // Required top-level fields
    if (!scenario.id) errors.push('Missing scenario id');
    if (!scenario.game_id) errors.push('Missing game_id');
    if (!scenario.question_text) errors.push('Missing question_text');
    if (!Array.isArray(scenario.answers) || scenario.answers.length !== 4) {
        errors.push('answers must be an array of exactly 4 choices');
    }
    if (!Array.isArray(scenario.timeline_steps) || scenario.timeline_steps.length === 0) {
        errors.push('timeline_steps must be a non-empty array');
    }
    if (typeof scenario.seat_count !== 'number' || scenario.seat_count < 2 || scenario.seat_count > 9) {
        errors.push('seat_count must be 2-9');
    }
    if (!Array.isArray(scenario.seats)) {
        errors.push('seats must be an array');
    }
    if (!scenario.blinds || typeof scenario.blinds !== 'object') {
        errors.push('blinds must be an object with sbBB and bbBB');
    }
    if (typeof scenario.decision_step_index !== 'number') {
        errors.push('Missing decision_step_index');
    }

    // Validate each step
    if (Array.isArray(scenario.timeline_steps)) {
        scenario.timeline_steps.forEach((step, i) => {
            const stepValidation = validateStep(step, i);
            errors.push(...stepValidation.errors);
        });
    }

    // Validate answers
    if (Array.isArray(scenario.answers)) {
        scenario.answers.forEach((answer, i) => {
            if (!answer.label) errors.push(`Answer ${i}: missing label`);
            if (typeof answer.isCorrect !== 'boolean') {
                errors.push(`Answer ${i}: missing isCorrect boolean`);
            }
        });

        // Exactly one correct answer
        const correctCount = scenario.answers.filter(a => a.isCorrect).length;
        if (correctCount !== 1) {
            errors.push(`Expected exactly 1 correct answer, found ${correctCount}`);
        }
    }

    if (errors.length > 0) {
        return { valid: false, errors, sanitized: null };
    }

    // Return sanitized/normalized scenario
    return {
        valid: true,
        errors: [],
        sanitized: {
            id: scenario.id,
            gameId: scenario.game_id,
            scenarioType: scenario.scenario_type || 'pio_derived',
            question: {
                text: scenario.question_text,
                subtext: scenario.question_subtext || 'Choose the best action',
            },
            answers: scenario.answers.map((a, i) => ({
                id: i,
                label: a.label,
                value: a.value || a.label,
                isCorrect: a.isCorrect,
                frequency: a.frequency || null,
                evDiff: a.evDiff || null,
            })),
            timeline: {
                steps: scenario.timeline_steps.map(normalizeStep),
                stepCount: scenario.timeline_steps.length,
                decisionStepIndex: scenario.decision_step_index,
            },
            table: {
                seatCount: scenario.seat_count,
                seats: scenario.seats.map((s, i) => ({
                    seatId: s.seatId ?? i,
                    position: s.positionLabel || s.position,
                    playerName: s.playerName || `Player ${i + 1}`,
                    isHero: s.isHero || false,
                    startingStackBB: s.startingStackBB || 100,
                })),
                blinds: {
                    sbBB: scenario.blinds.sbBB || 0.5,
                    bbBB: scenario.blinds.bbBB || 1,
                    anteBB: scenario.blinds.anteBB || 0,
                },
                heroCards: scenario.hero_cards || null,
            },
            coaching: {
                explanation: scenario.explanation || null,
                gtoApproach: scenario.gto_approach || null,
                evAnalysis: scenario.ev_analysis || null,
                alternateLines: scenario.alternate_lines || null,
            },
        },
    };
}

/**
 * Normalize a timeline step for GSAP consumption
 */
function normalizeStep(step) {
    return {
        stepIndex: step.stepIndex,
        street: step.street,
        actorSeatId: step.actorSeatId,
        action: step.action,
        amountBB: step.amountBB ?? null,
        potAfterBB: step.potAfterBB,
        stacksAfter: step.stacksAfter || [],
        board: step.board || [],
        heroCards: step.heroCards || null,
        notes: step.notes || null,
        isDecisionPoint: step.isDecisionPoint || false,
        // Animation timing
        durationMs: step.durationMs || 600,
    };
}

/**
 * Calculate the visual state at any given step index
 * DETERMINISTIC: Same stepIndex always returns same state
 * @param {Object} timeline - The normalized timeline
 * @param {number} stepIndex - Target step (0-based)
 * @returns {Object} Visual state at that step
 */
export function getStateAtStep(timeline, stepIndex) {
    const { steps, decisionStepIndex } = timeline;
    const clampedIndex = Math.max(0, Math.min(stepIndex, steps.length - 1));

    const currentStep = steps[clampedIndex];

    // Accumulate actions up to this point for action log
    const actionLog = steps.slice(0, clampedIndex + 1).map(s => ({
        seatId: s.actorSeatId,
        action: s.action,
        amount: s.amountBB,
        street: s.street,
    }));

    return {
        stepIndex: clampedIndex,
        street: currentStep.street,
        board: currentStep.board,
        potBB: currentStep.potAfterBB,
        activePlayerSeatId: currentStep.actorSeatId,
        lastAction: {
            seatId: currentStep.actorSeatId,
            action: currentStep.action,
            amount: currentStep.amountBB,
        },
        stacksAfter: currentStep.stacksAfter,
        isDecisionPoint: clampedIndex >= decisionStepIndex,
        actionLog,
    };
}

/**
 * Create GSAP-friendly keyframes from timeline
 * @param {Array} steps - Normalized steps
 * @returns {Array} GSAP keyframe configs
 */
export function createGSAPKeyframes(steps) {
    return steps.map((step, i) => ({
        stepIndex: i,
        duration: step.durationMs / 1000,
        data: step,
        // Easing for chip animations
        ease: 'power2.out',
    }));
}

export default {
    validateScenarioSchema,
    getStateAtStep,
    createGSAPKeyframes,
};
