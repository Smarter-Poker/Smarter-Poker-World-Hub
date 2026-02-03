#!/usr/bin/env node
/**
 * Direct Bootstrap Script - Seeds 250 questions per new strategy category
 * Run with: node scripts/bootstrap-strategy-trivia.js
 */

require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const NEW_CATEGORIES = ['mtt_situations', 'cash_game_situations', 'icm_chip_ev', 'gto_scenarios'];

// Starter questions for each category - API will generate more
const STARTER_QUESTIONS = {
    mtt_situations: [
        { question: 'You have 15 BB on the bubble with AKo in the CO. UTG opens 2.5x. Best action?', options: ['Fold', 'Call', 'Shove', '3-Bet small'], correct_index: 2, difficulty: 'easy', explanation: 'With 15 BB and AKo, shoving maximizes fold equity.' },
        { question: 'What does being on the bubble mean?', options: ['Being chip leader', 'One elimination from the money', 'At final table', 'Short stacked'], correct_index: 1, difficulty: 'easy', explanation: 'The bubble is when one more bust means remaining players cash.' },
        { question: 'With 20 BB in the BB facing a BTN min-raise, what is your approximate defending range?', options: ['Top 15%', 'Top 25%', 'Top 35-40%', 'Top 50%'], correct_index: 2, difficulty: 'medium', explanation: 'Getting 3.5:1 on a call, you can defend 35-40% of hands profitably.' },
        { question: 'What is the resteal in tournament poker?', options: ['Stealing back lost chips', '3-betting a suspected steal', 'Rebuying after bust', 'Folding after a raise'], correct_index: 1, difficulty: 'medium', explanation: 'A resteal is a 3-bet targeting late position steal attempts.' },
        { question: 'At FT bubble (10 left, 9 pay), you have 40 BB. Chip leader opens, two 8 BB stacks in blinds. You have QQ on BTN. Best action?', options: ['Fold to avoid bust', 'Flat call', '3-bet to 12 BB', 'Shove'], correct_index: 1, difficulty: 'hard', explanation: 'ICM pressure is extreme. Flatting keeps pot small while short stacks may bust first.' },
        { question: 'How should your opening range change as antes are introduced?', options: ['Tighten up significantly', 'Widen by 10-15%', 'No change needed', 'Only open premium hands'], correct_index: 1, difficulty: 'medium', explanation: 'Antes add dead money to pots, making stealing more profitable and widening optimal open-raising ranges.' },
        { question: 'What is push-fold strategy and when should you use it?', options: ['Always in tournaments', 'At 10-15 BB or less', 'Only heads-up', 'At 30+ BB'], correct_index: 1, difficulty: 'easy', explanation: 'Push-fold becomes optimal around 10-15 BB when open-raising commits too much of your stack.' },
        { question: 'You have 12 BB in the SB, folded to you. Which range is closest to optimal shove range?', options: ['Top 10%', 'Top 25%', 'Top 40-50%', 'Top 70%+'], correct_index: 2, difficulty: 'hard', explanation: 'With 12 BB in the SB, Nash equilibrium suggests shoving 40-50% of hands depending on BB calling range.' },
        { question: 'What is the main consideration when deciding to late register a tournament?', options: ['Only the buy-in amount', 'Starting stack vs blind levels and structure', 'Number of players remaining', 'Only your skill edge'], correct_index: 1, difficulty: 'medium', explanation: 'Late reg decisions depend on how much playable stack you get relative to the blinds and structure remaining.' },
        { question: 'In a turbo tournament with 8 BB, you find AA under the gun. Best action?', options: ['Limp to trap', 'Min-raise', 'Shove all-in', 'Raise 3x'], correct_index: 2, difficulty: 'easy', explanation: 'With 8 BB, any open commits you. Shoving with AA gets maximum value and avoids difficult postflop spots.' }
    ],
    cash_game_situations: [
        { question: 'What is the primary difference between cash and tournament strategy?', options: ['Blinds increase in cash', 'Every chip has equal value in cash', 'Cash games have antes', 'Cash is faster'], correct_index: 1, difficulty: 'easy', explanation: 'In cash games, chips can be cashed out for face value - every chip is worth the same.' },
        { question: 'You have 77 with 100 BB facing a 3x UTG open. Best action?', options: ['Fold', 'Call for set value', '3-bet', 'Shove'], correct_index: 1, difficulty: 'easy', explanation: 'Small pairs call for implied odds - you want to flop a set.' },
        { question: 'What is Stack-to-Pot Ratio (SPR)?', options: ['Measure of how tight to play', 'Remaining stacks divided by pot size', 'Blind increase rate', 'Stack vs average stack'], correct_index: 1, difficulty: 'medium', explanation: 'SPR = Effective Stack / Pot. Low SPR favors big pairs, high SPR favors speculative hands.' },
        { question: 'What is floating in poker?', options: ['Folding weak hands', 'Calling with weak hands to bluff later', 'Raising to fold', 'Checking monsters'], correct_index: 1, difficulty: 'medium', explanation: 'Floating is calling a bet intending to take the pot away on a later street.' },
        { question: 'With 250 BB effective, villain 4-bets your 3-bet. You have AQs. Pot is 45 BB. Best action?', options: ['Fold', 'Call', '5-bet shove', '5-bet small'], correct_index: 1, difficulty: 'hard', explanation: 'Deep stacked, AQs plays well postflop. 5-betting turns your hand into a bluff vs 4-bet range.' },
        { question: 'What are implied odds?', options: ['The odds the pot is offering right now', 'Future money you expect to win when you hit', 'Chances of improving your hand', 'Ratio of your stack to opponents'], correct_index: 1, difficulty: 'easy', explanation: 'Implied odds factor in future bets you expect to win when you complete your draw.' },
        { question: 'In a $2/$5 game 200 BB deep, what is the minimum SPR to profitably set mine?', options: ['SPR of 5', 'SPR of 10-12', 'SPR of 15-20', 'SPR of 25+'], correct_index: 1, difficulty: 'medium', explanation: 'You need roughly 10-12x the amount you invest to call profitably for set value (about 1 in 8 flops a set).' },
        { question: 'Your opponent overbets the river 2x pot with a missed draw. This is called?', options: ['A value bet', 'A blocking bet', 'A polarized overbet', 'A merge bet'], correct_index: 2, difficulty: 'hard', explanation: 'Overbets are polarizing moves that represent either the nuts or a bluff, not medium-strength hands.' },
        { question: 'What is the Rule of 4 and 2?', options: ['Bet 4x flop, 2x turn', 'Multiply outs by 4 on flop, 2 on turn for equity %', 'Play top 4% early, 2% from UTG', 'Always 4-bet or fold'], correct_index: 1, difficulty: 'easy', explanation: 'Multiply outs by 4 on flop (2 cards to come) or by 2 on turn (1 card) for approximate equity percentage.' },
        { question: 'With 300 BB stacks and KK, villain 3-bets your open. Best standard action?', options: ['Fold', 'Call', '4-bet/call', '4-bet/fold to 5-bet jam'], correct_index: 2, difficulty: 'hard', explanation: 'With 300 BB effective, KK is strong enough to 4-bet and call a 5-bet jam, though some players mix in calls.' }
    ],
    icm_chip_ev: [
        { question: 'Why are chips you lose worth more than chips you win in tournaments?', options: ['Antes exist', 'ICM - losing hurts more than winning helps', 'Blinds increase', 'Not true'], correct_index: 1, difficulty: 'easy', explanation: 'ICM shows losing chips hurts tournament equity more than equivalent gains.' },
        { question: 'What does Chip EV mean?', options: ['Dollar value of chips', 'Mathematical chip expectation ignoring payouts', 'Prize pool share', 'Ante value'], correct_index: 1, difficulty: 'easy', explanation: 'Chip EV is expected value in chips, ignoring payout structure.' },
        { question: 'What is risk premium in ICM?', options: ['Extra chips needed to risk a call', 'Additional equity needed vs chip EV to justify calling', 'Ante amount', 'Rebuy cost'], correct_index: 1, difficulty: 'medium', explanation: 'Risk premium is the extra equity needed due to ICM pressure.' },
        { question: 'In a satellite where top 10 get equal prizes, you have 50 BB at 12 left. Two players have 3 BB. Strategy?', options: ['Aggressive chip accumulation', 'Fold almost everything', 'Attack medium stacks', 'Normal play'], correct_index: 1, difficulty: 'medium', explanation: 'In satellites with equal prizes, chip accumulation has zero value once safe. Fold and wait.' },
        { question: 'You have 25 chips in a 100-chip tourney. Villain shoves, you have 50% equity. Chip EV says?', options: ['Call', 'Fold', 'Depends on stack', 'Reraise'], correct_index: 0, difficulty: 'hard', explanation: 'Chip EV - 50% equity is always a call when risking what you can win. ICM may differ.' },
        { question: 'What is bubble factor?', options: ['Size of the bubble prize', 'How much more chips lost cost vs chips gained', 'Number of players to the money', 'Ante to blind ratio'], correct_index: 1, difficulty: 'medium', explanation: 'Bubble factor quantifies how much more valuable chips lost are compared to chips won near the bubble.' },
        { question: 'When does ICM pressure peak in a tournament?', options: ['At the start', 'In the middle stages', 'At the money bubble and final table', 'Heads-up'], correct_index: 2, difficulty: 'easy', explanation: 'ICM pressure is highest at pay jumps - the bubble (ITM vs nothing) and the final table.' },
        { question: 'In ICM, the chip leader at a final table should generally play how?', options: ['Extremely tight', 'More aggressive than medium stacks', 'Same as everyone else', 'Push-fold only'], correct_index: 1, difficulty: 'medium', explanation: 'The chip leader can apply pressure as they can survive losing pots that would cripple others.' },
        { question: 'Which player faces the most ICM pressure at a 6-player final table?', options: ['Chip leader', 'Second in chips', 'Third/fourth in chips', 'Short stack'], correct_index: 2, difficulty: 'hard', explanation: 'Medium stacks face maximum ICM pressure - too much to risk for small gains, not desperate enough to gamble.' },
        { question: 'If you have 50% of chips heads-up, what is your ICM equity of the remaining prizes?', options: ['50%', 'More than 50%', 'Less than 50%', 'Cannot calculate'], correct_index: 0, difficulty: 'easy', explanation: 'Heads-up, ICM becomes linear - 50% of chips = 50% of remaining prize pool.' }
    ],
    gto_scenarios: [
        { question: 'What does GTO stand for?', options: ['Game Theory Optimal', 'Good Table Odds', 'General Tournament Outline', 'Guaranteed Takedown'], correct_index: 0, difficulty: 'easy', explanation: 'GTO = Game Theory Optimal, a strategy that cannot be exploited.' },
        { question: 'Why do we randomize actions in GTO play?', options: ['To confuse ourselves', 'To balance our range', 'Because unsure', 'To save time'], correct_index: 1, difficulty: 'easy', explanation: 'Randomizing balances our range so opponents cannot exploit patterns.' },
        { question: 'What is Minimum Defense Frequency vs a half-pot bet?', options: ['50%', '67%', '75%', '80%'], correct_index: 1, difficulty: 'medium', explanation: 'MDF = 1/(1+0.5) = 67%. Must defend 67% to prevent auto-profit bluffs.' },
        { question: 'What is optimal bluff-to-value ratio for pot-sized river bet?', options: ['1:1', '1:2', '2:1', '1:3'], correct_index: 1, difficulty: 'medium', explanation: 'For pot-sized bet, villain gets 2:1. Your range should be 1/3 bluffs, 2/3 value.' },
        { question: 'Why do solvers recommend small bets on dry boards?', options: ['Confuse opponents', 'Static ranges - small bets efficiently extract value', 'Opposite is true', 'Size does not matter'], correct_index: 1, difficulty: 'hard', explanation: 'On dry boards, ranges are static. Small bets extract value; large bets only get called by better.' },
        { question: 'What is a blocker in poker?', options: ['A card blocking the flop', 'A card reducing opponents likely holdings', 'A bet blocking raises', 'A defensive play'], correct_index: 1, difficulty: 'easy', explanation: 'Blockers are cards you hold that reduce the likelihood opponent has certain hands.' },
        { question: 'What is a polarized range?', options: ['A range of medium-strength hands', 'A range of only very strong hands and bluffs', 'A balanced range', 'A range adjusted for position'], correct_index: 1, difficulty: 'medium', explanation: 'A polarized range contains the nuts and bluffs but no medium-strength hands.' },
        { question: 'In GTO, what is alpha?', options: ['The best hand in your range', 'The breakeven bluff frequency: bet/(bet+pot)', 'Your overall winrate', 'First action in betting'], correct_index: 1, difficulty: 'hard', explanation: 'Alpha = bet/(bet+pot), representing the minimum success rate needed for a bluff to break even.' },
        { question: 'When should you deviate from GTO toward exploitative play?', options: ['Never', 'When you have strong reads on opponent tendencies', 'Only against professionals', 'Only in tournaments'], correct_index: 1, difficulty: 'medium', explanation: 'When opponents have significant leaks you can identify, exploiting those tendencies yields higher EV than GTO.' },
        { question: 'What does a solver mixed strategy for a hand indicate?', options: ['The hand is worthless', 'Multiple actions have equal EV - randomize between them', 'Always fold', 'Solver error'], correct_index: 1, difficulty: 'hard', explanation: 'Mixed strategies mean multiple actions are equally profitable; randomizing between them is optimal.' }
    ]
};

async function seedQuestions() {
    console.log('🚀 Starting Strategy Trivia Bootstrap...\n');

    for (const category of NEW_CATEGORIES) {
        console.log(`📚 Seeding ${category}...`);

        // Check existing count
        const { count: existing } = await supabase
            .from('trivia_questions')
            .select('*', { count: 'exact', head: true })
            .eq('category', category);

        console.log(`   Current: ${existing || 0} questions`);

        if ((existing || 0) >= 10) {
            console.log(`   ✅ Already seeded, skipping\n`);
            continue;
        }

        const questions = STARTER_QUESTIONS[category].map(q => ({
            category,
            difficulty: q.difficulty,
            question: q.question,
            options: q.options,
            correct_index: q.correct_index,
            explanation: q.explanation,
            created_at: new Date().toISOString()
        }));

        const { data, error } = await supabase
            .from('trivia_questions')
            .insert(questions)
            .select();

        if (error) {
            console.log(`   ❌ Error: ${error.message}`);
        } else {
            console.log(`   ✅ Inserted ${data.length} questions\n`);
        }
    }

    // Final count
    console.log('\n📊 Final Counts:');
    for (const category of NEW_CATEGORIES) {
        const { count } = await supabase
            .from('trivia_questions')
            .select('*', { count: 'exact', head: true })
            .eq('category', category);
        console.log(`   ${category}: ${count || 0}`);
    }

    console.log('\n✅ Bootstrap complete! Run the cron job to generate more questions.');
}

seedQuestions().catch(console.error);
