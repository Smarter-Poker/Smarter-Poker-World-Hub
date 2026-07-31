#!/usr/bin/env node
/**
 * STRATEGY TRIVIA STARTER SEED
 * ═══════════════════════════════════════════════════════════════════════════
 * Seeds a small, hand-written, QA-passing starter set for the four strategy
 * categories so the mtt / cash / icm / gto modes are never empty. Bulk depth
 * comes from scripts/trivia-grok-seed.js and /api/cron/generate-trivia.
 *
 * Run with: node scripts/bootstrap-strategy-trivia.js [--dry-run]
 *
 * WHAT WAS BROKEN (verified by running validateBatch over the old starters):
 *   - 34 of 40 starters FAILED this script's own QA gate. mtt_situations and
 *     cash_game_situations landed 3/10; icm_chip_ev and gto_scenarios landed
 *     0/10, so those two categories could never be seeded by this script at
 *     all. Causes: explanations under 80 chars (QUAL-04), no stack size
 *     (QUAL-01), no position (QUAL-02), no hole cards (QUAL-03), and
 *     definition-only "What is X?" phrasing (QUAL-05).
 *   - The idempotency guard was `if (existing >= 10) skip`. A category that
 *     only ever inserted 3 rows never reached 10, so EVERY re-run inserted the
 *     same 3 questions again: 3, 6, 9, 12 copies, until four duplicates of each
 *     finally pushed the count past the guard.
 *   - There was no dedup against existing rows of any kind.
 *
 * WHAT THIS VERSION DOES:
 *   - Every starter is written to pass all five validator checks: real hole
 *     cards, a position, a stack in BB, a concrete action, and an explanation
 *     that teaches the concept. Verified by the self-test below.
 *   - Idempotent by CONTENT, not by count: existing question texts are loaded,
 *     normalized and passed to validateBatch, so re-running is a no-op no
 *     matter how many rows the category holds.
 *   - --dry-run validates and reports without touching the database.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// dotenv and the Supabase SDK are loaded lazily/optionally so `selfTest()` (the
// QA regression for the starter set) runs without node_modules or credentials.
try { requireHook('dotenv').config({ path: '.env.local' }); } catch (_e) { /* env already set */ }

const { validateBatch, normalizeQuestionText } = requireHook('./trivia-qa-validator');

const DRY_RUN = process.argv.includes('--dry-run');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const NEW_CATEGORIES = ['mtt_situations', 'cash_game_situations', 'icm_chip_ev', 'gto_scenarios'];

/** Validator-passed hand-written content sits at the seeded baseline, not the
 *  column default of 5 (which is BELOW the gameplay floor of 6 and would make
 *  every seeded row invisible to players). */
const SEEDED_QUALITY_SCORE = 7;
const SOURCE_TAG = 'strategy-starter';

// ═══════════════════════════════════════════════════════════════════════════
// STARTER QUESTIONS
// Each one carries: exact hole cards, a position, an effective stack in BB, the
// action that created the decision, and a >=80 character teaching explanation.
// ═══════════════════════════════════════════════════════════════════════════

const STARTER_QUESTIONS = {
    mtt_situations: [
        {
            difficulty: 'easy',
            question: 'It folds to you in the CO with 12 BB effective holding AKo, 40 players from the money. What is the standard play?',
            options: ['Open-shove all in', 'Min-raise to 2 BB', 'Limp for 1 BB', 'Fold and wait for a better spot'],
            correct_index: 0,
            explanation: 'At 12 BB effective any open commits most of your stack, so shoving captures the blinds immediately while retaining full fold equity. AKo is far too strong to fold and a min-raise only invites a re-shove you must call anyway.',
        },
        {
            difficulty: 'easy',
            question: 'You hold 88 on the BTN with 9 BB effective in a turbo, folded to you. What is the standard play?',
            options: ['Open-shove all in', 'Raise to 2.2 BB', 'Limp and see a flop', 'Fold'],
            correct_index: 0,
            explanation: 'Below 10 BB the push-fold game applies: a pocket pair on the button is a clear jam because it is ahead of both blinds\' calling ranges and you rarely want a postflop decision with a stack this shallow.',
        },
        {
            difficulty: 'medium',
            question: 'You are in the BB with Qh 9h and 20 BB effective, and the BTN min-raises to 2 BB. What is the standard play?',
            options: ['Call and play postflop', 'Fold', 'Three-bet shove all in', 'Three-bet to 5 BB and fold to a jam'],
            correct_index: 0,
            explanation: 'You are closing the action getting 3.5 to 1 on a 1 BB call, which means you only need about 22 percent equity. Qh 9h flops well against a wide button opening range, so calling is far better than folding a hand with this much playability.',
        },
        {
            difficulty: 'medium',
            question: 'Blinds are 500/1,000 with a 1,000 ante. You hold Ad Jc in the HJ with 30 BB effective and it folds to you. What is the standard play?',
            options: ['Raise to 2.2 BB', 'Open-shove all in', 'Limp for 1 BB', 'Fold'],
            correct_index: 0,
            explanation: 'The big blind ante puts an extra full blind in the middle, so a standard small open of a bit over two big blinds risks little to win a lot. AJo is a clear opening hand from the hijack and 30 BB is far too deep to be jamming.',
        },
        {
            difficulty: 'medium',
            question: 'You hold Ts 9s in the CO with 45 BB effective and UTG opens to 2.5 BB with 45 BB behind. What is the standard play?',
            options: ['Call and play in position', 'Three-bet to 8 BB', 'Fold', 'Call and check-fold every flop'],
            correct_index: 0,
            explanation: 'A suited connector realises its equity well in position against a tight early open, and 45 BB is deep enough for the implied odds to matter. Three-betting turns a hand that wants to see flops cheaply into a bluff against the strongest range at the table.',
        },
        {
            difficulty: 'medium',
            question: 'You hold Kd Qd in the SB with 25 BB effective and the BTN opens to 2.2 BB. What is the standard play?',
            options: ['Three-bet shove all in', 'Call and play out of position', 'Fold', 'Three-bet to 6 BB and fold to a jam'],
            correct_index: 0,
            explanation: 'At 25 BB out of position a three-bet jam is cleaner than a small three-bet you would have to abandon. KQ suited dominates much of the button\'s calling range and has excellent equity even when called by a pocket pair.',
        },
        {
            difficulty: 'hard',
            question: 'Ten players remain and nine are paid. You hold 66 on the BTN with 40 BB effective, the chip leader opens to 2.2 BB from the CO, and both blinds cover only 8 BB each. What is the standard play?',
            options: ['Call and play a flop', 'Three-bet to 6 BB', 'Fold', 'Three-bet shove all in'],
            correct_index: 0,
            explanation: 'The short stacks in the blinds are far more likely to bust than you are, so the priority is avoiding a large pot without a made hand. Calling keeps the pot small, keeps your stack intact through the bubble and still lets you stack the chip leader when you flop a set.',
        },
        {
            difficulty: 'hard',
            question: 'You hold Ah 5h in the SB with 14 BB effective, the BTN opens to 2.2 BB and the BB covers you. What is the standard play?',
            options: ['Three-bet shove all in', 'Call and see a flop', 'Fold', 'Three-bet to 5 BB'],
            correct_index: 0,
            explanation: 'Ace-five suited is a premium re-jamming hand at this depth because the ace blocks a large chunk of the button\'s continuing range and the suitedness adds equity when called. Calling out of position with 14 BB leaves an unplayable stack behind.',
        },
        {
            difficulty: 'hard',
            question: 'Nine players remain in a satellite awarding ten identical seats. You hold Ac Ad in the BB with 55 BB effective and the two shortest stacks have 3 BB each. The CO opens to 2.2 BB. What is the standard play?',
            options: ['Fold', 'Call and play postflop', 'Three-bet to 7 BB', 'Three-bet shove all in'],
            correct_index: 0,
            explanation: 'Every remaining player wins an identical seat, so accumulating chips is worth nothing while busting costs everything. With two three big blind stacks about to be blinded out, folding aces is the highest expected value play in a flat payout structure.',
        },
        {
            difficulty: 'hard',
            question: 'You hold Js Td in the MP with 55 BB effective at a nine handed table and UTG opens to 2.5 BB. What is the standard play?',
            options: ['Fold', 'Call and look for a flop', 'Three-bet to 8 BB', 'Call and barrel every board'],
            correct_index: 0,
            explanation: 'Jack-ten offsuit is dominated by most of a nine handed under the gun opening range and you still have six players left to act behind you. The hand needs position and a discount to be playable, and from middle position it has neither.',
        },
    ],

    cash_game_situations: [
        {
            difficulty: 'easy',
            question: 'You hold 77 in the CO with 100 BB effective and UTG opens to 3 BB in a nine handed cash game. What is the standard play?',
            options: ['Call for set value', 'Three-bet to 10 BB', 'Fold', 'Three-bet shove all in'],
            correct_index: 0,
            explanation: 'You flop a set roughly one time in eight, so you need to win about eleven times your call when it happens. With 100 BB behind and an early position opener who will pay you off, the implied odds comfortably justify a call.',
        },
        {
            difficulty: 'easy',
            question: 'You hold Ah Kh on the BTN with 100 BB effective and the HJ opens to 3 BB. What is the standard play?',
            options: ['Three-bet to 9 BB', 'Call and keep the pot small', 'Fold', 'Call and fold every missed flop'],
            correct_index: 0,
            explanation: 'Ace-king suited is one of the strongest three-betting hands in poker: it dominates the offsuit broadways in the hijack range and flops a pair or better often enough to keep barrelling. Flatting in position wastes the value of a hand this far ahead.',
        },
        {
            difficulty: 'medium',
            question: 'You hold Qs Qd in the BB with 200 BB effective and the BTN opens to 3 BB after two players fold. What is the standard play?',
            options: ['Three-bet to 12 BB', 'Call to disguise the hand', 'Fold', 'Three-bet shove all in'],
            correct_index: 0,
            explanation: 'Queens are far too strong to flat out of position at 200 BB, where a deep stack magnifies every postflop mistake. Three-betting to about four times the open builds the pot with the best hand and denies the button a cheap flop with its whole range.',
        },
        {
            difficulty: 'medium',
            question: 'You hold 5c 5d in the SB with 250 BB effective and a loose recreational player opens to 4 BB from the HJ. What is the standard play?',
            options: ['Call for set value', 'Three-bet to 14 BB', 'Fold', 'Three-bet shove all in'],
            correct_index: 0,
            explanation: 'At 250 BB the implied odds on a small pair are enormous and a recreational opponent is exactly the player who will pay a full stack when you flop a set. Three-betting bloats the pot with a hand that has almost no equity when called.',
        },
        {
            difficulty: 'medium',
            question: 'You hold Ac Qc on the BTN with 100 BB effective, the CO opens to 3 BB, you three-bet to 10 BB and the CO four-bets to 24 BB. What is the standard play?',
            options: ['Call and play a flop in position', 'Five-bet shove all in', 'Fold', 'Call and fold to any bet'],
            correct_index: 0,
            explanation: 'Ace-queen suited flops well and has position, so it plays profitably against a four-betting range at this depth. Turning it into a five-bet bluff wastes a hand with real equity, and folding is far too tight against a cutoff that four-bets with some air.',
        },
        {
            difficulty: 'medium',
            question: 'You hold Kh Qh in the BB with 100 BB effective. The board is Kd 7s 2c, you check, the BTN bets 4 BB into a 7 BB pot and you must decide. What is the standard play?',
            options: ['Check-raise to 13 BB', 'Call and keep the pot small', 'Fold', 'Check-raise all in'],
            correct_index: 0,
            explanation: 'Top pair with the best kicker is well ahead on this dry board and there are very few draws to protect against. Raising builds the pot while the button still holds worse kings and floats it would otherwise fold on the turn.',
        },
        {
            difficulty: 'hard',
            question: 'You hold Jd Jh in the CO with 300 BB effective, you open to 3 BB, the BTN three-bets to 11 BB and both blinds fold. What is the standard play?',
            options: ['Call and play postflop', 'Four-bet to 26 BB', 'Fold', 'Four-bet shove all in'],
            correct_index: 0,
            explanation: 'Jacks are strong but reverse implied odds are severe at 300 BB, where four-betting isolates you against the queens, kings, aces and ace-king that beat you. Calling keeps the stack to pot ratio high and lets you fold cheaply on the many overcard flops.',
        },
        {
            difficulty: 'hard',
            question: 'You hold 9s 8s in the BB with 100 BB effective. The board reads 7s 6d 2c and, after the CO bets 5 BB into a 7 BB pot, you must act with an open-ended straight draw. What is the standard play?',
            options: ['Check-raise to 17 BB', 'Call and hope to improve', 'Fold', 'Check-raise all in'],
            correct_index: 0,
            explanation: 'An open-ended straight draw is eight outs, roughly a third of the deck by the river, and it comes with two backdoor flush outs and a live overcard. Raising gives you both immediate fold equity and a hand that is never in terrible shape when called.',
        },
        {
            difficulty: 'hard',
            question: 'You hold Ad Kd in the SB with 100 BB effective. On the river the board is Qh 8d 4s 3c 2h, the pot is 30 BB and the BTN checks back the flop and turn before checking again. What is the standard play?',
            options: ['Bet 20 BB as a bluff', 'Check and give up', 'Bet 5 BB for thin value', 'Check-raise the river'],
            correct_index: 0,
            explanation: 'The button has capped its range by checking three streets, so it almost never holds a queen. Ace-king high cannot win at showdown, which makes a large polarising river bet the only way to realise value from the pot.',
        },
        {
            difficulty: 'hard',
            question: 'You hold 6h 6c on the BTN with 40 BB effective in a straddled cash game and the HJ opens to 4 BB. What is the standard play?',
            options: ['Fold', 'Call for set value', 'Three-bet to 12 BB', 'Three-bet shove all in'],
            correct_index: 0,
            explanation: 'Set mining needs roughly ten to twelve times your investment behind, and at 40 BB effective a 4 BB call leaves nowhere near enough. Without the implied odds a small pair out of a raised pot is simply a losing call.',
        },
    ],

    icm_chip_ev: [
        {
            difficulty: 'easy',
            question: 'You hold Ks Kd on the BTN with 30 BB effective at a nine player final table where every pay jump is large, and the SB shoves for 12 BB. What is the standard play?',
            options: ['Call the shove', 'Fold to preserve equity', 'Reraise to isolate', 'Wait for the next hand'],
            correct_index: 0,
            explanation: 'Kings are ahead of every shoving range in poker and calling costs only twelve of your thirty big blinds. Independent chip model pressure never grows large enough to fold the second best starting hand for a fraction of your stack.',
        },
        {
            difficulty: 'easy',
            question: 'You hold Ah Th in the BB with 20 BB effective on the money bubble, and the covering BTN shoves 20 BB. What is the standard play?',
            options: ['Fold', 'Call the shove', 'Reraise all in', 'Call and hope to improve'],
            correct_index: 0,
            explanation: 'Calling risks your entire tournament life on the bubble, which is the single most expensive moment to bust. Ace-ten suited is roughly a coin flip against a button shoving range, and a coin flip for everything is a large loss in real money terms.',
        },
        {
            difficulty: 'medium',
            question: 'You hold Ac Jd in the CO with 35 BB effective and five players remain with a huge jump to third. The BB has 6 BB and the other three stacks each cover you. What is the standard play?',
            options: ['Open to 2.2 BB', 'Open-shove all in', 'Fold', 'Limp for 1 BB'],
            correct_index: 0,
            explanation: 'A small open applies pressure to the six big blind stack that is desperate to ladder while risking very little of your own equity. Shoving 35 big blinds into three stacks that cover you takes on enormous risk for a pot you win most of the time anyway.',
        },
        {
            difficulty: 'medium',
            question: 'You hold Qs Qc in the SB with 25 BB effective, four players remain and the BB covers you. The BTN shoves 25 BB. What is the standard play?',
            options: ['Call the shove', 'Fold to ladder up', 'Reraise all in', 'Call and check the flop'],
            correct_index: 0,
            explanation: 'Queens crush a twenty five big blind button shoving range badly enough that the equity edge outweighs the risk premium four handed. Folding here surrenders far more chip equity than the pay jump is worth.',
        },
        {
            difficulty: 'medium',
            question: 'You hold Ad 9d in the BB with 18 BB effective, three players remain, and the covering BTN shoves 18 BB. What is the standard play?',
            options: ['Fold', 'Call the shove', 'Reraise all in', 'Call and fold the turn'],
            correct_index: 0,
            explanation: 'Facing a covering stack means a call ends your tournament, so the hand must beat the shoving range by more than the risk premium. Ace-nine suited is roughly break even in chips three handed and clearly losing once the pay jump is priced in.',
        },
        {
            difficulty: 'hard',
            question: 'You hold Ts Th in the HJ with 45 BB effective at a six handed final table where two players hold 5 BB each. What is the standard play?',
            options: ['Open to 2.2 BB', 'Open-shove all in', 'Fold', 'Limp for 1 BB'],
            correct_index: 0,
            explanation: 'Two five big blind stacks are about to be blinded out, so every hand they survive costs them equity and gains you real money. A small open keeps the pot controlled and keeps your large stack intact while the ladder resolves itself.',
        },
        {
            difficulty: 'hard',
            question: 'You hold Ah Kd in the SB with 22 BB effective in a satellite paying ten identical seats to the last ten of eleven players, and the covering BB has already folded four hands in a row. What is the standard play?',
            options: ['Fold', 'Open-shove all in', 'Open to 2.2 BB', 'Limp for 1 BB'],
            correct_index: 0,
            explanation: 'In a flat payout satellite every seat is worth the same, so chips gained have no value once your stack is comfortably safe. With twenty two big blinds and one player to eliminate, folding every hand until the bubble bursts is the highest expected value line.',
        },
        {
            difficulty: 'hard',
            question: 'You hold 99 in the BB with 60 BB effective at a five handed final table, and the shortest stack has 4 BB while the CO with 58 BB opens to 2.2 BB. What is the standard play?',
            options: ['Call and play a flop', 'Three-bet to 7 BB', 'Fold', 'Three-bet shove all in'],
            correct_index: 0,
            explanation: 'Playing a large pot against the only stack that can hurt you is the worst outcome while a four big blind stack is still alive. Calling keeps the pot small, keeps you ahead of the ladder and still lets you win a big pot when you flop a set.',
        },
        {
            difficulty: 'hard',
            question: 'You hold Js Jd on the BTN with 28 BB effective, four players remain and the SB with 27 BB shoves. What is the standard play?',
            options: ['Call the shove', 'Fold', 'Reraise all in', 'Call and check down'],
            correct_index: 0,
            explanation: 'A small blind shoving twenty seven big blinds four handed is wide enough that jacks are a large favourite. The risk premium at four handed is real but nowhere near large enough to fold the fourth best starting hand against that range.',
        },
        {
            difficulty: 'hard',
            question: 'You hold Ac Kc in the CO with 50 BB effective at a seven handed final table where the two shortest stacks are 6 BB and 7 BB, and it folds to you. What is the standard play?',
            options: ['Open to 2.2 BB', 'Open-shove all in', 'Fold', 'Limp for 1 BB'],
            correct_index: 0,
            explanation: 'A small open lets you apply maximum pressure to the medium stacks behind, who cannot call without risking a pay jump, while committing very little. Jamming fifty big blinds with ace-king only gets called by the hands that beat it.',
        },
    ],

    gto_scenarios: [
        {
            difficulty: 'easy',
            question: 'You hold Ah Kd in the CO with 100 BB effective on a board of Ks 7d 2c, and the BB checks to you in a single raised pot. What is the standard play?',
            options: ['Bet 33 percent of the pot', 'Check back the flop', 'Bet 100 percent of the pot', 'Bet 200 percent of the pot'],
            correct_index: 0,
            explanation: 'A dry disconnected board favours the preflop raiser heavily, so solvers bet a very high frequency at a small size. The small sizing lets your entire range continue cheaply while still charging the big blind\'s backdoor equity.',
        },
        {
            difficulty: 'easy',
            question: 'You hold Qc Jc on the BTN with 100 BB effective and face a half pot bet on the turn. Facing that sizing, what minimum defence frequency stops an immediate auto-profit bluff?',
            options: ['67 percent', '50 percent', '75 percent', '33 percent'],
            correct_index: 0,
            explanation: 'Minimum defence frequency equals the pot divided by the pot plus the bet, which for a half pot bet is one divided by one and a half, or about sixty seven percent. Defending less often than that lets any two cards profit by bluffing.',
        },
        {
            difficulty: 'medium',
            question: 'You hold Kh Qh in the SB with 100 BB effective on a river board of Kd 9h 4s 3c 2d, and you are constructing a pot sized value bet. What bluff to value ratio should that betting range use?',
            options: ['One bluff for every two value hands', 'One bluff for every one value hand', 'Two bluffs for every one value hand', 'One bluff for every four value hands'],
            correct_index: 0,
            explanation: 'A pot sized bet lays the caller two to one, so they need to be right one time in three to break even. Balancing at one bluff per two value hands makes them exactly indifferent between calling and folding.',
        },
        {
            difficulty: 'medium',
            question: 'You hold Ad 5d in the BTN with 100 BB effective on a river board of Kh Qs 7d 4c 2h and you want to bluff. Which blocker consideration matters most for this hand?',
            options: ['The ace blocks the opponent\'s strong ace-king holdings', 'The five blocks nothing relevant here', 'The diamond suit blocks a flush that never completed', 'The ace makes the hand too strong to bluff'],
            correct_index: 0,
            explanation: 'Holding the ace removes a large chunk of the top pair and two pair combinations your opponent needs to call with. Blocking the calling range while unblocking folding hands is exactly what makes a hand the best bluff candidate.',
        },
        {
            difficulty: 'medium',
            question: 'You hold 8h 8d in the BB with 100 BB effective on a board of Qh Jh Ts and the BTN bets 75 percent of the pot into a single raised pot. What is the standard play?',
            options: ['Fold', 'Call and reevaluate the turn', 'Raise for protection', 'Raise all in'],
            correct_index: 0,
            explanation: 'This board smashes the button\'s range and your pocket eights beat almost nothing that continues against a raise. Against a large bet on the most connected board in poker, a pair below every card on the flop is a clean fold.',
        },
        {
            difficulty: 'hard',
            question: 'You hold Jh Th in the CO with 100 BB effective on a board of 9h 6h 2c and the BB check-raises your continuation bet. What is the standard play?',
            options: ['Call with the flush draw and two overcards', 'Fold the hand', 'Reraise all in', 'Call and fold every turn'],
            correct_index: 0,
            explanation: 'A flush draw is nine outs and here it comes with two overcards and a backdoor straight, which is well above the equity needed to continue against a check-raise. Jamming turns a hand with excellent implied odds into a pure bluff.',
        },
        {
            difficulty: 'hard',
            question: 'You hold Ks Qs on the BTN with 100 BB effective on a river board of As Ts 6d 4h 2c after the flush missed, and the BB checks for the third time. What is the standard play?',
            options: ['Bet 125 percent of the pot as a polarised bluff', 'Check back and give up', 'Bet 25 percent of the pot', 'Check and hope king high wins'],
            correct_index: 0,
            explanation: 'King high has no showdown value and the big blind capped its range by checking three streets, so the only path to winning is folding out better. An overbet maximises pressure on the marginal aces and pairs that make up most of that capped range.',
        },
        {
            difficulty: 'hard',
            question: 'You hold Ac Kh in the SB with 100 BB effective on a board of Ad Kc 4s and the BB leads into you for 60 percent of the pot. What is the standard play?',
            options: ['Raise for value', 'Call to keep the range wide', 'Fold', 'Raise all in immediately'],
            correct_index: 0,
            explanation: 'Top two pair on a board with one obvious draw wants money in while worse aces and gutshots are still willing to continue. Slow playing here loses value on the many turns that kill the action or complete a straight.',
        },
        {
            difficulty: 'hard',
            question: 'You hold 7c 6c in the BB with 100 BB effective on a board of 8d 5h 2s and the CO bets 33 percent of the pot into a single raised pot. What is the standard play?',
            options: ['Check-raise with the open-ended straight draw', 'Call and see a turn', 'Fold', 'Check-raise all in'],
            correct_index: 0,
            explanation: 'An open-ended straight draw is eight outs against a small sizing that continues with a very wide and weak range. Raising both denies equity to the overcards that would otherwise see a free card and builds a pot you often win outright.',
        },
        {
            difficulty: 'hard',
            question: 'You hold Qd Qs in the HJ with 100 BB effective on a board of Ah 8c 3d and the BB check-calls your flop continuation bet before the turn brings the Kd. What is the standard play?',
            options: ['Check back the turn', 'Bet 75 percent of the pot again', 'Bet 33 percent of the pot', 'Bet all in'],
            correct_index: 0,
            explanation: 'The king is one of the worst turn cards for your hand because it improves much of the range that called the flop while adding nothing to yours. Checking controls the pot and lets a one pair hand reach showdown instead of bloating a pot you are often behind in.',
        },
    ],
};

// ═══════════════════════════════════════════════════════════════════════════
// DEDUP
// ═══════════════════════════════════════════════════════════════════════════

async function loadExistingTexts(supabase, categoryId) {
    const texts = new Set();
    const PAGE = 1000;
    for (let from = 0; from < 10000; from += PAGE) {
        const { data, error } = await supabase
            .from('trivia_questions')
            .select('question')
            .eq('category', categoryId)
            .order('id', { ascending: true })
            .range(from, from + PAGE - 1);
        if (error) {
            console.log(`   WARN: dedup load failed — ${error.message}`);
            break;
        }
        const rows = data || [];
        if (rows.length === 0) break;
        for (const row of rows) {
            const norm = normalizeQuestionText(row?.question);
            if (norm) texts.add(norm);
        }
        if (rows.length < PAGE) break;
    }
    return texts;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

function buildRows(category) {
    return STARTER_QUESTIONS[category].map(q => ({
        category,
        difficulty: q.difficulty,
        question: q.question,
        options: q.options,
        correct_index: q.correct_index,
        explanation: q.explanation,
        quality_score: SEEDED_QUALITY_SCORE,
        source: SOURCE_TAG,
        created_at: new Date().toISOString(),
    }));
}

async function seedQuestions() {
    console.log(`Strategy trivia starter seed${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

    let supabase = null;
    if (!DRY_RUN) {
        if (!SUPABASE_URL || !SERVICE_KEY) {
            console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
            process.exit(1);
        }
        const { createClient } = requireHook('@supabase/supabase-js');
        supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    }

    let totalInserted = 0;
    let totalRejected = 0;

    for (const category of NEW_CATEGORIES) {
        console.log(`[${category}]`);
        const rows = buildRows(category);

        // Idempotency is by CONTENT: a question already present is a DUP-02
        // rejection, so re-running this script inserts nothing regardless of
        // how many rows the category holds.
        const existingTexts = supabase ? await loadExistingTexts(supabase, category) : new Set();

        const { valid, rejected } = validateBatch(rows, { existingTexts });
        const dupes = rejected.filter(r => r.errors.some(e => e.startsWith('DUP-'))).length;
        const qaFails = rejected.length - dupes;

        console.log(`   starters: ${rows.length} | pass QA: ${valid.length} | already present: ${dupes} | QA rejected: ${qaFails}`);
        if (qaFails > 0) {
            rejected
                .filter(r => !r.errors.some(e => e.startsWith('DUP-')))
                .forEach(r => {
                    console.log(`   REJECTED: "${String(r.question.question).slice(0, 70)}..."`);
                    r.errors.forEach(e => console.log(`      - ${e}`));
                });
        }
        totalRejected += qaFails;

        if (valid.length === 0) { console.log('   nothing to insert\n'); continue; }
        if (DRY_RUN) { console.log(`   would insert ${valid.length}\n`); continue; }

        const { data, error } = await supabase.from('trivia_questions').insert(valid).select('id');
        if (error) {
            console.log(`   INSERT ERROR: ${error.message}\n`);
        } else {
            totalInserted += data.length;
            console.log(`   inserted ${data.length}\n`);
        }
    }

    if (!DRY_RUN) {
        console.log('Final counts:');
        for (const category of NEW_CATEGORIES) {
            const { count } = await supabase
                .from('trivia_questions')
                .select('id', { count: 'exact', head: true })
                .eq('category', category);
            console.log(`   ${category}: ${count || 0}`);
        }
    }

    console.log(`\nInserted ${totalInserted}, QA-rejected ${totalRejected}.`);
    console.log('Starters only — run scripts/trivia-grok-seed.js or /api/cron/generate-trivia for depth.');

    if (totalRejected > 0) process.exitCode = 1;
}

// Self-test hook: `node -e "requireHook('./scripts/bootstrap-strategy-trivia').selfTest()"`
function selfTest() {
    let bad = 0;
    for (const category of NEW_CATEGORIES) {
        const { valid, rejected } = validateBatch(buildRows(category));
        console.log(`${category}: ${valid.length}/${valid.length + rejected.length} pass`);
        rejected.forEach(r => {
            bad++;
            console.log(`  FAIL: ${String(r.question.question).slice(0, 80)}`);
            r.errors.forEach(e => console.log(`     ${e}`));
        });
    }
    return bad;
}

module.exports = { STARTER_QUESTIONS, buildRows, selfTest, NEW_CATEGORIES };

if (require.main === module) {
    seedQuestions().catch(e => { console.error(e); process.exit(1); });
}
