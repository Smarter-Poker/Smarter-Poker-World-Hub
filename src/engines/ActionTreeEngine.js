/**
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * ACTION TREE ENGINE — Decision Tree Navigation & Sizing
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * Builds the valid action set at any decision node and maps user actions
 * to the closest solver node:
 *   - Build valid actions (fold/check/call/bet/raise)
 *   - Bet sizing options (1/4, 1/3, 1/2, 2/3, 3/4, pot, 1.5x, all-in)
 *   - Map user action to closest solver sizing
 *   - Navigate the GTO strategy tree
 *
 * Works with HandStateMachine for state tracking and
 * PostflopStrategyEngine for GTO strategy at each node.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { getPostflopStrategy, BET_SIZES, ACTIONS } from './PostflopStrategyEngine';

// ●● Standard Bet Sizings ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Standard solver bet sizing nodes.
 * These are the sizes GTO Wizard-style trainers present to the user.
 */
export const STANDARD_SIZINGS = {
    QUARTER: { label: '25%', fraction: 0.25, category: 'small' },
    THIRD: { label: '33%', fraction: 0.33, category: 'small' },
    HALF: { label: '50%', fraction: 0.50, category: 'medium' },
    TWO_THIRDS: { label: '67%', fraction: 0.67, category: 'medium' },
    THREE_QUARTERS: { label: '75%', fraction: 0.75, category: 'large' },
    POT: { label: '100%', fraction: 1.00, category: 'large' },
    OVERBET_150: { label: '150%', fraction: 1.50, category: 'overbet' },
    OVERBET_200: { label: '200%', fraction: 2.00, category: 'overbet' },
    ALL_IN: { label: 'All-In', fraction: Infinity, category: 'allin' },
};

// ●● Action Node ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * An action node in the decision tree.
 * Each node represents a decision point with available actions.
 */
export class ActionNode {
    /**
     * @param {Object} params
     * @param {string} params.street - 'preflop', 'flop', 'turn', 'river'
     * @param {string} params.playerPosition - Position of acting player
     * @param {boolean} params.isHero - Is this the hero's decision?
     * @param {number} params.potSize - Current pot in BB
     * @param {number} params.effectiveStack - Effective stack in BB
     * @param {number} params.currentBet - Current bet to match
     * @param {number} params.playerInvested - Amount player already has in this street
     * @param {string[]} [params.board] - Current board cards
     * @param {string[]} [params.holeCards] - Hero's hole cards
     * @param {boolean} [params.isPFR] - Was hero the PFR?
     */
    constructor(params) {
        this.street = params.street;
        this.playerPosition = params.playerPosition;
        this.isHero = params.isHero;
        this.potSize = params.potSize;
        this.effectiveStack = params.effectiveStack;
        this.currentBet = params.currentBet || 0;
        this.playerInvested = params.playerInvested || 0;
        this.board = params.board || [];
        this.holeCards = params.holeCards || [];
        this.isPFR = params.isPFR ?? true;
    }

    /**
     * Get all valid actions at this node with sizing options.
     * @returns {Array<{ action: string, label: string, amount?: number, fraction?: number }>}
     */
    getActions() {
        const actions = [];
        const callAmount = this.currentBet - this.playerInvested;
        const facingBet = callAmount > 0;

        // Fold (only when facing a bet)
        if (facingBet) {
            actions.push({ action: 'fold', label: 'Fold' });
        }

        // Check (when not facing a bet)
        if (!facingBet) {
            actions.push({ action: 'check', label: 'Check' });
        }

        // Call (when facing a bet)
        if (facingBet) {
            actions.push({
                action: 'call',
                label: `Call ${callAmount.toFixed(1)}BB`,
                amount: callAmount,
            });
        }

        // Bet sizings (when not facing a bet, or raise sizings when facing a bet)
        const sizings = this._getBetSizings(facingBet);
        for (const sizing of sizings) {
            actions.push({
                action: facingBet ? 'raise' : 'bet',
                label: `${facingBet ? 'Raise' : 'Bet'} ${sizing.label}`,
                amount: sizing.amount,
                fraction: sizing.fraction,
                sizingKey: sizing.key,
            });
        }

        // All-in (always available if stack remains)
        if (this.effectiveStack > 0) {
            const allInAmount = this.effectiveStack;
            // Only add if not already covered by a sizing
            const alreadyCoversAllIn = sizings.some(s => Math.abs(s.amount - allInAmount) < 0.5);
            if (!alreadyCoversAllIn) {
                actions.push({
                    action: 'allin',
                    label: `All-In ${allInAmount.toFixed(1)}BB`,
                    amount: allInAmount,
                });
            }
        }

        return actions;
    }

    /**
     * Get valid bet/raise sizing options for this node.
     */
    _getBetSizings(facingBet) {
        const sizings = [];
        const stack = this.effectiveStack;
        const pot = this.potSize;

        if (facingBet) {
            // Raise sizings: typically 2.5x-3x the bet on flop, 2.5x on turn/river
            const raiseMultipliers = [2.5, 3.0, 4.0];
            for (const mult of raiseMultipliers) {
                const raiseAmount = this.currentBet * mult;
                if (raiseAmount <= stack && raiseAmount > this.currentBet) {
                    const fraction = (raiseAmount - this.currentBet) / pot;
                    sizings.push({
                        key: `raise_${mult}x`,
                        label: `${raiseAmount.toFixed(1)}BB (${mult}x)`,
                        amount: raiseAmount,
                        fraction,
                    });
                }
            }
            // Pot-sized raise
            const potRaise = this.currentBet + pot + this.currentBet; // call + pot
            if (potRaise <= stack && !sizings.some(s => Math.abs(s.amount - potRaise) < 0.5)) {
                sizings.push({
                    key: 'raise_pot',
                    label: `${potRaise.toFixed(1)}BB (Pot)`,
                    amount: potRaise,
                    fraction: potRaise / pot,
                });
            }
        } else {
            // Bet sizings as fraction of pot
            const fractions = this.street === 'flop'
                ? [0.25, 0.33, 0.50, 0.75, 1.0]  // Flop: include small sizes
                : this.street === 'turn'
                    ? [0.33, 0.50, 0.67, 0.75, 1.0]  // Turn: medium to large
                    : [0.50, 0.67, 0.75, 1.0, 1.5]; // River: include overbet

            for (const frac of fractions) {
                const amount = pot * frac;
                if (amount >= 0.5 && amount <= stack) { // Min bet 0.5BB
                    const pctLabel = Math.round(frac * 100);
                    sizings.push({
                        key: `bet_${pctLabel}`,
                        label: `${amount.toFixed(1)}BB (${pctLabel}%)`,
                        amount,
                        fraction: frac,
                    });
                }
            }
        }

        return sizings;
    }

    /**
     * Get the GTO strategy recommendation at this node.
     * @param {string} posContext - 'IP' or 'OOP'
     * @param {string} [prevAction] - Previous street action
     * @returns {Object} Strategy from PostflopStrategyEngine
     */
    getGTOStrategy(posContext, prevAction) {
        if (this.board.length < 3 || !this.holeCards.length) return null;

        return getPostflopStrategy({
            holeCards: this.holeCards,
            board: this.board,
            position: posContext,
            street: this.street,
            isPFR: this.isPFR,
            facingBet: (this.currentBet - this.playerInvested) > 0,
            betSize: this.currentBet,
            potSize: this.potSize,
            prevAction,
        });
    }
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// ACTION MAPPING — Map user actions to solver nodes
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Map a user's chosen action to the closest solver action.
 * Solvers use specific sizing nodes; users may bet intermediate amounts.
 *
 * @param {Object} userAction - { action: string, amount?: number }
 * @param {Array} solverActions - Available solver actions
 * @returns {{ solverAction: Object, deviation: number, isExact: boolean }}
 */
export function mapToSolverAction(userAction, solverActions) {
    if (!solverActions || solverActions.length === 0) {
        return { solverAction: userAction, deviation: 0, isExact: true };
    }

    // Exact match for non-sizing actions
    if (['fold', 'check', 'call'].includes(userAction.action)) {
        const exact = solverActions.find(a => a.action === userAction.action);
        return { solverAction: exact || userAction, deviation: 0, isExact: true };
    }

    // For bets/raises, find the closest sizing
    const userAmount = userAction.amount || 0;
    let closestAction = null;
    let closestDiff = Infinity;

    const sameTypeActions = solverActions.filter(a =>
        a.action === 'bet' || a.action === 'raise' || a.action === 'allin'
    );

    for (const solver of sameTypeActions) {
        const diff = Math.abs((solver.amount || 0) - userAmount);
        if (diff < closestDiff) {
            closestDiff = diff;
            closestAction = solver;
        }
    }

    if (!closestAction) {
        return { solverAction: userAction, deviation: 0, isExact: true };
    }

    // Calculate deviation as percentage of pot
    const isExact = closestDiff < 0.5; // Within 0.5BB is exact

    return {
        solverAction: closestAction,
        deviation: closestDiff,
        isExact,
    };
}

/**
 * Score a player's action against the GTO strategy.
 *
 * @param {Object} playerAction - { action: string, amount?: number }
 * @param {Object} gtoStrategy - Strategy from PostflopStrategyEngine
 * @param {number} potSize - Current pot
 * @returns {{ score: number, classification: string, evLoss: number, feedback: string }}
 */
export function scoreAction(playerAction, gtoStrategy, potSize) {
    if (!gtoStrategy) {
        return { score: 50, classification: 'unknown', evLoss: 0, feedback: 'No GTO data available' };
    }

    const gtoAction = gtoStrategy.action || (gtoStrategy.shouldBet ? 'bet' : 'check');
    const playerAct = playerAction.action;

    // Check if action type matches
    const actionMatches =
        (playerAct === gtoAction) ||
        (playerAct === 'check' && gtoAction === 'check') ||
        (playerAct === 'bet' && gtoAction === 'bet') ||
        (playerAct === 'call' && gtoAction === 'call') ||
        (playerAct === 'fold' && gtoAction === 'fold') ||
        (playerAct === 'raise' && gtoAction === 'raise');

    if (actionMatches) {
        // Right action — check sizing
        if (playerAction.amount && gtoStrategy.sizing) {
            const gtoAmount = potSize * gtoStrategy.sizing.fraction;
            const sizingDiff = Math.abs(playerAction.amount - gtoAmount) / potSize;

            if (sizingDiff < 0.10) {
                return { score: 100, classification: 'correct', evLoss: 0, feedback: `Perfect! ${gtoStrategy.reason}` };
            } else if (sizingDiff < 0.25) {
                return { score: 80, classification: 'inaccuracy', evLoss: sizingDiff * 0.5, feedback: `Right action, sizing slightly off. ${gtoStrategy.reason}` };
            } else {
                return { score: 60, classification: 'inaccuracy', evLoss: sizingDiff * 1.0, feedback: `Right action, but sizing deviates. ${gtoStrategy.reason}` };
            }
        }
        return { score: 100, classification: 'correct', evLoss: 0, feedback: `Correct! ${gtoStrategy.reason}` };
    }

    // Wrong action
    const freq = gtoStrategy.frequency || 0;

    // If the GTO action is very mixed (close to 50/50), it's a small mistake
    if (freq > 0.30 && freq < 0.70) {
        return {
            score: 40,
            classification: 'inaccuracy',
            evLoss: 0.5,
            feedback: `Mixed spot — GTO prefers ${gtoAction} at ${Math.round(freq * 100)}% frequency. ${gtoStrategy.reason}`,
        };
    }

    // Clear GTO preference
    if (freq >= 0.70) {
        return {
            score: 10,
            classification: 'mistake',
            evLoss: 2.0,
            feedback: `Mistake. GTO strongly prefers ${gtoAction} here (${Math.round(freq * 100)}%). ${gtoStrategy.reason}`,
        };
    }

    // GTO slightly prefers different action
    return {
        score: 25,
        classification: 'inaccuracy',
        evLoss: 1.0,
        feedback: `Suboptimal. GTO slightly prefers ${gtoAction} (${Math.round(freq * 100)}%). ${gtoStrategy.reason}`,
    };
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// ACTION TREE BUILDER — Build full decision tree for a hand
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Build an ActionNode from HandStateMachine state.
 * @param {Object} handState - State from HandStateMachine.getState()
 * @param {string[]} holeCards - Hero's hole cards
 * @param {boolean} isPFR - Was hero the PFR?
 * @returns {ActionNode}
 */
export function buildActionNode(handState, holeCards, isPFR) {
    const hero = handState.players.find(p => p.isHero);
    const currentPlayer = handState.currentPlayer;

    return new ActionNode({
        street: handState.state,
        playerPosition: currentPlayer?.position || hero?.position || 'BTN',
        isHero: currentPlayer?.isHero ?? true,
        potSize: handState.pot,
        effectiveStack: hero?.stack || 100,
        currentBet: handState.currentBet,
        playerInvested: hero?.streetInvested || 0,
        board: handState.board,
        holeCards,
        isPFR,
    });
}

export default {
    ActionNode,
    STANDARD_SIZINGS,
    mapToSolverAction,
    scoreAction,
    buildActionNode,
};
