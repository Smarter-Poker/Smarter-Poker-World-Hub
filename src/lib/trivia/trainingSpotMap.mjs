/**
 * Canonical mapping from every Trivia question category to a live World Hub
 * Training destination for one-click "Train This Spot" cross-wiring.
 *
 * Every href below corresponds to an existing page under pages/hub/training/.
 */

export const TRAINING_SPOT_MAP = Object.freeze({
    gto_scenarios: Object.freeze({
        label: 'GTO Spot Trainer',
        href: '/hub/training/spot-trainer',
        specialty: 'Postflop Solver Spots',
        categoryLabel: 'GTO Scenarios',
    }),
    gto_theory: Object.freeze({
        label: 'GTO Solutions Browser',
        href: '/hub/training/solutions',
        specialty: 'Solver Strategy Concepts',
        categoryLabel: 'GTO Theory',
    }),
    icm_chip_ev: Object.freeze({
        label: 'ICM Final Table Simulator',
        href: '/hub/training/icm-simulator',
        specialty: 'ICM And Chip EV Math',
        categoryLabel: 'ICM And Chip EV',
    }),
    mtt_situations: Object.freeze({
        label: 'Tournament Prep Lab',
        href: '/hub/training/tournament-prep',
        specialty: 'MTT Stack Depth Spots',
        categoryLabel: 'MTT Situations',
    }),
    cash_game_situations: Object.freeze({
        label: 'Preflop Range Charts',
        href: '/hub/training/preflop-charts',
        specialty: 'Deep Stack Cash Ranges',
        categoryLabel: 'Cash Game Situations',
    }),
    rule_knowledge: Object.freeze({
        label: 'Poker Rules Glossary',
        href: '/hub/training/glossary',
        specialty: 'Official Poker Terminology',
        categoryLabel: 'Rules And Etiquette',
    }),
    poker_history: Object.freeze({
        label: 'Famous Finals Archive',
        href: '/hub/training/famous-finals',
        specialty: 'Historic Championship Hands',
        categoryLabel: 'Poker History',
    }),
    famous_hands: Object.freeze({
        label: 'Hand Lab Analyzer',
        href: '/hub/training/hand-lab',
        specialty: 'Iconic Hand Breakdowns',
        categoryLabel: 'Famous Hands',
    }),
    player_profiles: Object.freeze({
        label: 'Weekly Study Plan',
        href: '/hub/training/study-plan',
        specialty: 'Pro Study Routines',
        categoryLabel: 'Player Profiles',
    }),
    tournament_facts: Object.freeze({
        label: 'Training Tournaments',
        href: '/hub/training/tournaments',
        specialty: 'Competitive Tournament Drills',
        categoryLabel: 'Tournament Facts',
    }),
});

export const TRIVIA_STUDY_CATEGORIES = Object.freeze(Object.keys(TRAINING_SPOT_MAP));

export const DEFAULT_TRAINING_SPOT = Object.freeze({
    label: 'Weekly Study Plan',
    href: '/hub/training/study-plan',
    specialty: 'Personalized Poker Study',
    categoryLabel: 'Poker Trivia',
});

export function getTrainingSpotForCategory(category) {
    if (typeof category === 'string' && Object.prototype.hasOwnProperty.call(TRAINING_SPOT_MAP, category)) {
        return TRAINING_SPOT_MAP[category];
    }
    return DEFAULT_TRAINING_SPOT;
}
