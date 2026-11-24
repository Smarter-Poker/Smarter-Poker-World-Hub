/**
 * Canonical mapping from every Trivia question category to a live World Hub
 * Training destination for one-click "Train This Spot" cross-wiring.
 *
 * Every href below corresponds to a verified, HTTP-200 scenario-specific page
 * under pages/hub/training/ (audited against actual DB questions and live HTML).
 */

export const TRAINING_SPOT_MAP = Object.freeze({
    gto_scenarios: Object.freeze({
        label: 'GTO Spot Trainer',
        href: '/hub/training/spot-trainer',
        specialty: 'Postflop Solver Policies And Frequencies',
        categoryLabel: 'GTO Scenarios',
    }),
    gto_theory: Object.freeze({
        label: 'GTO Solutions Browser',
        href: '/hub/training/solutions',
        specialty: 'PioSOLVER Equilibrium Concepts',
        categoryLabel: 'GTO Theory',
    }),
    icm_chip_ev: Object.freeze({
        label: 'ICM Equity Simulator',
        href: '/hub/training/icm-simulator',
        specialty: 'Bubble Factors And Risk Premiums',
        categoryLabel: 'ICM And Chip EV',
    }),
    mtt_situations: Object.freeze({
        label: 'Tournament Prep Planner',
        href: '/hub/training/tournament-prep',
        specialty: 'Blind Structures And M-Ratio Zones',
        categoryLabel: 'MTT Situations',
    }),
    cash_game_situations: Object.freeze({
        label: 'Cash Game SPR Mastery',
        href: '/hub/training/spr-trainer',
        specialty: 'Postflop Stack Depth, Pot Odds, And MDF',
        categoryLabel: 'Cash Game Situations',
    }),
    rule_knowledge: Object.freeze({
        label: 'Poker Glossary Study Tool',
        href: '/hub/training/glossary',
        specialty: 'Live Room, Club Poker, And Rules Terminology',
        categoryLabel: 'Rules And Etiquette',
    }),
    poker_history: Object.freeze({
        label: 'Famous Finals Archive',
        href: '/hub/training/famous-finals',
        specialty: 'Historic Championship Finals And Drills',
        categoryLabel: 'Poker History',
    }),
    famous_hands: Object.freeze({
        label: 'Poker Hand Lab Analyzer',
        href: '/hub/training/hand-lab',
        specialty: 'Iconic Hand And Board Texture Breakdowns',
        categoryLabel: 'Famous Hands',
    }),
    player_profiles: Object.freeze({
        label: 'Player Profiles And Population Reads',
        href: '/hub/training/player-profiles',
        specialty: 'Villain HUD Archetypes And Exploitative Reads',
        categoryLabel: 'Player Profiles',
    }),
    tournament_facts: Object.freeze({
        label: 'Training Tournaments',
        href: '/hub/training/tournaments',
        specialty: 'Structured Competitive Tournament Drills',
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
