/**
 * 🎰 SEED GTO PLAYING STYLES FOR GRINDER HORSES
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Creates unique poker AI personalities for all 100 horses that integrate
 * with the PioSolver-solved hand database (solved_spots_gold, memory_charts_gold).
 * 
 * Each horse gets:
 * - GTO deviation tendencies (how strictly they follow solver output)
 * - Stack depth preferences (20bb, 40bb, 100bb specialist, etc.)
 * - Game type specialization (Cash, MTT, Spin)
 * - Aggression/passivity calibration
 * - Mixed strategy interpretation (how they handle 50/50 spots)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
);

// ═══════════════════════════════════════════════════════════════════════════
// GTO PLAYING STYLE ARCHETYPES
// ═══════════════════════════════════════════════════════════════════════════

const PLAYING_ARCHETYPES = [
    // Pure GTO (10%)
    {
        name: 'GTO_Purist',
        weight: 10,
        traits: {
            gto_vs_exploitative: 'gto_purist',
            gto_adherence: 95, // 95% follows solver exactly
            aggression_level: 6,
            risk_tolerance: 'moderate',
            deviation_trigger: 'never', // Never deviates from GTO
            mixed_strategy_bias: 'balanced' // True randomization
        }
    },
    // Balanced GTO (30%)
    {
        name: 'Balanced',
        weight: 30,
        traits: {
            gto_vs_exploitative: 'balanced',
            gto_adherence: 85,
            aggression_level: 5,
            risk_tolerance: 'moderate',
            deviation_trigger: 'strong_read',
            mixed_strategy_bias: 'balanced'
        }
    },
    // Aggressive GTO (20%)
    {
        name: 'Aggressive_GTO',
        weight: 20,
        traits: {
            gto_vs_exploitative: 'balanced',
            gto_adherence: 80,
            aggression_level: 8,
            risk_tolerance: 'aggressive',
            deviation_trigger: 'weak_opponent',
            mixed_strategy_bias: 'aggressive' // Leans toward aggressive in mixed spots
        }
    },
    // Passive GTO (10%)
    {
        name: 'Passive_GTO',
        weight: 10,
        traits: {
            gto_vs_exploitative: 'balanced',
            gto_adherence: 80,
            aggression_level: 3,
            risk_tolerance: 'conservative',
            deviation_trigger: 'never',
            mixed_strategy_bias: 'defensive' // Leans toward calls/folds in mixed spots
        }
    },
    // Exploitative (15%)
    {
        name: 'Exploitative',
        weight: 15,
        traits: {
            gto_vs_exploitative: 'exploitative',
            gto_adherence: 60,
            aggression_level: 7,
            risk_tolerance: 'aggressive',
            deviation_trigger: 'any_read',
            mixed_strategy_bias: 'situational'
        }
    },
    // Tournament Specialist (10%)
    {
        name: 'MTT_Specialist',
        weight: 10,
        traits: {
            gto_vs_exploitative: 'balanced',
            gto_adherence: 90,
            aggression_level: 6,
            risk_tolerance: 'conservative', // ICM aware
            deviation_trigger: 'icm_pressure',
            mixed_strategy_bias: 'survival'
        }
    },
    // Degen (5%)
    {
        name: 'Degen',
        weight: 5,
        traits: {
            gto_vs_exploitative: 'exploitative',
            gto_adherence: 40,
            aggression_level: 9,
            risk_tolerance: 'degen',
            deviation_trigger: 'always',
            mixed_strategy_bias: 'max_variance'
        }
    }
];

// Stack depth specializations
const STACK_DEPTH_PREFS = [
    { depths: [20, 40], name: 'short_stack', weight: 25 },
    { depths: [40, 60], name: 'mid_stack', weight: 30 },
    { depths: [60, 100], name: 'deep_stack', weight: 30 },
    { depths: [100, 200], name: 'ultra_deep', weight: 15 }
];

// Game type preferences
const GAME_TYPE_PREFS = [
    { types: ['Cash'], name: 'cash_specialist', weight: 40 },
    { types: ['MTT', 'Spin'], name: 'tournament_specialist', weight: 35 },
    { types: ['Cash', 'MTT', 'Spin'], name: 'all_around', weight: 25 }
];

// Topology preferences
const TOPOLOGY_PREFS = [
    { topologies: ['HU'], name: 'heads_up_specialist', weight: 15 },
    { topologies: ['6-Max'], name: 'shorthanded', weight: 45 },
    { topologies: ['9-Max'], name: 'full_ring', weight: 25 },
    { topologies: ['HU', '3-Max', '6-Max', '9-Max'], name: 'all_formats', weight: 15 }
];

// Poker catchphrases/tells
const CATCHPHRASES = [
    "Check the solver, always.",
    "EV is king.",
    "In position = in profit.",
    "GTO is the baseline, not the ceiling.",
    "Variance is temporary, EV is forever.",
    "Fold equity is real equity.",
    "Never bluff a calling station.",
    "Position, position, position.",
    "The math doesn't lie.",
    "Play the player, not just the cards.",
    "ICM is just math.",
    "Blockers matter more than you think.",
    "If you never get caught bluffing, you're not bluffing enough.",
    "Every decision is a frequency.",
    "Trust the process.",
    "Stack-to-pot ratio tells all.",
    "Your range is your identity.",
    "Mixed strategies defeat exploitation.",
    "Thin value > missed value.",
    "Node-lock and destroy."
];

const PET_PEEVES = [
    "Players who tank on obvious decisions",
    "Limp-callers from UTG",
    "Min-3bets",
    "Time bank abusers",
    "People who show bluffs",
    "Recreational players who got lucky once",
    "Anyone who says 'standard play'",
    "Slow-rolling the nuts",
    "Over-limping in pots",
    "Players who think GTO is 'robotic'"
];

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function weightedRandom(items) {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;

    for (const item of items) {
        random -= item.weight;
        if (random <= 0) return item;
    }
    return items[items.length - 1];
}

function randomRange(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleArray(arr) {
    return [...arr].sort(() => Math.random() - 0.5);
}

function generateOriginStory(specialty, voice) {
    const origins = [
        `Cut my teeth in underground ${specialty === 'cash_games' ? 'cash games' : 'tournaments'} before going legit.`,
        `Former ${specialty === 'online' ? 'online grinding beast' : 'live poker regular'} who discovered solver work.`,
        `Started with play money, now playing for life-changing pots.`,
        `Converted from ${specialty === 'tournaments' ? 'cash' : 'tournaments'} after studying the math.`,
        `Self-taught through thousands of hours of theory and practice.`,
        `Came up through the micro stakes, volume grinding my way up.`,
        `Former professional ${['chess player', 'trader', 'gamer', 'athlete'][randomRange(0, 3)]} who found poker.`
    ];
    return origins[randomRange(0, origins.length - 1)];
}

function generateBiggestWin(stakes) {
    const amounts = ['$5K', '$10K', '$25K', '$50K', '$100K', '$250K'];
    const events = [
        'Sunday Major',
        'live 2/5 session',
        'high stakes home game',
        'WSOP Circuit event',
        'online MTT series',
        'heads-up challenge match'
    ];
    return `${amounts[randomRange(0, amounts.length - 1)]} in a ${events[randomRange(0, events.length - 1)]}`;
}

function generateCurrentGoals(archetype) {
    const goals = {
        'GTO_Purist': 'Achieve perfect GTO implementation across all stack depths.',
        'Balanced': 'Maintain a balanced style while recognizing key exploitation spots.',
        'Aggressive_GTO': 'Apply maximum pressure while staying within GTO boundaries.',
        'Passive_GTO': 'Minimize variance while extracting maximum EV.',
        'Exploitative': 'Map and exploit every player\'s specific leaks.',
        'MTT_Specialist': 'Win a major tournament with perfect ICM play.',
        'Degen': 'Ship it or go home. Life\'s too short for small pots.'
    };
    return goals[archetype] || 'Continuously improve through study and practice.';
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SEEDING FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

async function seedGTOPersonalities() {
    console.log('🎰 SEEDING GTO PLAYING STYLES FOR GRINDER HORSES');
    console.log('═'.repeat(60));

    // Fetch all active horses
    const { data: horses, error } = await supabase
        .from('content_authors')
        .select('id, name, specialty, voice, stakes')
        .eq('is_active', true)
        .order('id');

    if (error) {
        console.error('Failed to fetch horses:', error.message);
        return;
    }

    console.log(`Found ${horses.length} horses to configure\n`);

    let successCount = 0;
    let failCount = 0;

    for (const horse of horses) {
        try {
            // Select archetype
            const archetype = weightedRandom(PLAYING_ARCHETYPES);
            const stackPref = weightedRandom(STACK_DEPTH_PREFS);
            const gamePref = weightedRandom(GAME_TYPE_PREFS);
            const topologyPref = weightedRandom(TOPOLOGY_PREFS);

            // Build personality record
            const personality = {
                author_id: horse.id,

                // Core playing traits
                gto_vs_exploitative: archetype.traits.gto_vs_exploitative,
                gto_adherence: archetype.traits.gto_adherence + randomRange(-5, 5),
                aggression_level: Math.min(10, Math.max(1, archetype.traits.aggression_level + randomRange(-1, 1))),
                risk_tolerance: archetype.traits.risk_tolerance,

                // GTO integration traits
                deviation_trigger: archetype.traits.deviation_trigger,
                mixed_strategy_bias: archetype.traits.mixed_strategy_bias,

                // General personality
                humor_level: randomRange(2, 8),
                technical_depth: randomRange(4, 10),
                contrarian_tendency: randomRange(1, 7),

                // Specializations (for querying solved_spots_gold)
                preferred_stack_depths: stackPref.depths,
                preferred_game_types: gamePref.types,
                preferred_topologies: topologyPref.topologies,

                // Topic preferences
                preferred_topics: {
                    'hand_analysis': randomRange(5, 10),
                    'strategy': randomRange(5, 10),
                    'variance_discussion': randomRange(3, 8),
                    'solver_talk': archetype.name === 'GTO_Purist' ? 10 : randomRange(4, 9),
                    'lifestyle': randomRange(2, 6)
                },
                avoided_topics: shuffleArray(PET_PEEVES).slice(0, randomRange(2, 4)),

                // Flavor
                catchphrases: shuffleArray(CATCHPHRASES).slice(0, randomRange(2, 4)),
                pet_peeves: shuffleArray(PET_PEEVES).slice(0, randomRange(2, 4)),

                // Story
                origin_story: generateOriginStory(horse.specialty, horse.voice),
                biggest_win: generateBiggestWin(horse.stakes),
                current_goals: generateCurrentGoals(archetype.name),
                archetype_name: archetype.name,

                updated_at: new Date().toISOString()
            };

            // Upsert to database
            const { error: upsertError } = await supabase
                .from('horse_personality')
                .upsert(personality, { onConflict: 'author_id' });

            if (upsertError) {
                console.error(`  ❌ ${horse.name}: ${upsertError.message}`);
                failCount++;
            } else {
                console.log(`  ✅ ${horse.name}: ${archetype.name} (${stackPref.name}, ${gamePref.name})`);
                successCount++;
            }

        } catch (err) {
            console.error(`  ❌ ${horse.name}: ${err.message}`);
            failCount++;
        }
    }

    console.log('\n' + '═'.repeat(60));
    console.log(`📊 RESULTS: ${successCount} success, ${failCount} failed`);
    console.log('═'.repeat(60));
}

// Run
seedGTOPersonalities();
