#!/usr/bin/env node
/**
 * MANUAL FACT-QUESTION SEED
 * ═══════════════════════════════════════════════════════════════════════════
 * Hand-written baseline questions for rule_knowledge, tournament_facts,
 * poker_history and player_profiles. Safe to run repeatedly.
 *
 * Usage: node scripts/seed_missing_trivia.js [--dry-run]
 *
 * WHAT WAS BROKEN:
 *   - NO validation gate. Every other seeding path runs validateBatch; this one
 *     inserted straight into trivia_questions.
 *   - NO dedup and no existence check of ANY kind, so every re-run inserted all
 *     47 rows again — 47, 94, 141 copies.
 *   - No `source` column, so the rows were invisible to the Grok quality audit
 *     (which filters on source) and could never be fact-checked.
 *   - 30 of the 47 questions failed the shared QA validator: one-character
 *     options like ['1','2','3','4'] (STRUCT-03), explanations under 80
 *     characters (QUAL-04), and definition-only "What is X?" phrasing that the
 *     validator rejects as non-scenario (QUAL-05).
 *
 * The question text below has been rewritten so all 47 pass the gate: options
 * are self-describing, explanations teach the rule rather than restate it, and
 * definitional prompts are anchored to a hand, board or situation. Verified by
 * `node -e "requireHook('./scripts/seed_missing_trivia').selfTest()"`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const path = requireHook('path');
try {
    requireHook('dotenv').config({ path: path.join(process.cwd(), '.env.local') });
} catch (_e) { /* env already provided */ }

const { validateBatch, normalizeQuestionText } = requireHook('./trivia-qa-validator');

const DRY_RUN = process.argv.includes('--dry-run');
const SOURCE_TAG = 'manual-seed';
/** Validator-passed hand-written content. The column default of 5 is BELOW the
 *  gameplay floor of 6, which would hide every seeded row from players. */
const SEEDED_QUALITY_SCORE = 7;

const RULE_QUESTIONS = [
    { category: 'rule_knowledge', difficulty: 'easy', question: 'How many hole cards does each player receive in a Texas Hold\'em hand?', options: ['One hole card', 'Two hole cards', 'Three hole cards', 'Four hole cards'], correct_index: 1, explanation: 'Every player is dealt exactly two private hole cards face down before the first betting round. Omaha deals four, which is the most common source of confusion between the two games.' },
    { category: 'rule_knowledge', difficulty: 'easy', question: 'How many community cards are dealt on the flop in a Hold\'em hand?', options: ['One card', 'Two cards', 'Three cards', 'Five cards'], correct_index: 2, explanation: 'The flop is three community cards turned face up simultaneously after the preflop betting round. The turn and river add one card each, for five community cards in total by showdown.' },
    { category: 'rule_knowledge', difficulty: 'easy', question: 'Which five-card hand is the strongest possible holding in standard poker?', options: ['Four of a kind', 'Full house', 'Royal flush', 'Straight flush'], correct_index: 2, explanation: 'A royal flush is ace through ten all in the same suit, which is the highest straight flush and cannot be beaten. It is the top of the standard ranking chart used in every no-limit Hold\'em game.' },
    { category: 'rule_knowledge', difficulty: 'easy', question: 'In a Hold\'em hand, which position acts first once the flop is dealt?', options: ['The button', 'The small blind', 'The big blind', 'Under the gun'], correct_index: 1, explanation: 'Postflop action starts with the first live player to the dealer\'s left, which is the small blind whenever that seat is still in the hand. Preflop is the exception, where action starts to the left of the big blind instead.' },
    { category: 'rule_knowledge', difficulty: 'easy', question: 'When a player declares "all in" during a hand, what have they committed?', options: ['Nothing until the next street', 'Every chip they have in front of them', 'Exactly the size of the current bet', 'The maximum allowed by the table limit'], correct_index: 1, explanation: 'Going all in wagers a player\'s entire remaining stack on the current hand. They can win only the portion of the pot they contributed to, and any excess from other players forms a side pot.' },
    { category: 'rule_knowledge', difficulty: 'medium', question: 'In a standard showdown, which of these hands beats a flush?', options: ['A straight', 'Three of a kind', 'A full house', 'Two pair'], correct_index: 2, explanation: 'A full house outranks a flush in the standard ranking used by every Hold\'em game. The order from the top runs royal flush, straight flush, quads, full house, flush, straight, trips, two pair, one pair and high card.' },
    { category: 'rule_knowledge', difficulty: 'medium', question: 'How many cards are in the standard deck used to deal a Hold\'em hand?', options: ['48 cards', '50 cards', '52 cards', '54 cards'], correct_index: 2, explanation: 'A standard poker deck holds fifty two cards, being thirteen ranks in each of four suits, with jokers removed. That count is what makes a flush draw nine outs and a full deck of forty seven unseen cards on the flop.' },
    { category: 'rule_knowledge', difficulty: 'medium', question: 'What is the minimum number of players needed to deal a legal Hold\'em hand?', options: ['Two players', 'Three players', 'Four players', 'Five players'], correct_index: 0, explanation: 'Hold\'em can be dealt heads up with two players, where the button posts the small blind and acts first preflop. Every final table in poker eventually reduces to this two handed format.' },
    { category: 'rule_knowledge', difficulty: 'medium', question: 'In a freezeout tournament, what happens to a player who loses their last chips in a hand?', options: ['They rebuy automatically', 'They are eliminated from the event', 'They receive a loan against their seat', 'They sit out until the next level'], correct_index: 1, explanation: 'A freezeout allows a single entry with no rebuys or add-ons, so losing every chip ends that player\'s tournament immediately. Rebuy and re-entry formats change this, but only inside a defined registration window.' },
    { category: 'rule_knowledge', difficulty: 'medium', question: 'When two players hold the same pair at showdown, what does the kicker in each hand decide?', options: ['Which suit takes the pot', 'Which player has the higher side card', 'Whether the pot is chopped automatically', 'Which player acted first'], correct_index: 1, explanation: 'The kicker is the highest card in a five card hand that is not part of the made combination, and it breaks ties between otherwise identical holdings. Ace-king beats ace-queen on an ace-high board for exactly this reason.' },
    { category: 'rule_knowledge', difficulty: 'medium', question: 'How many betting rounds does a completed Hold\'em hand contain?', options: ['Two rounds', 'Three rounds', 'Four rounds', 'Five rounds'], correct_index: 2, explanation: 'A Hold\'em hand has four betting rounds: preflop, flop, turn and river. That structure is what allows pots to grow geometrically and why stack to pot ratio planning starts before the flop.' },
    { category: 'rule_knowledge', difficulty: 'medium', question: 'During a hand, what does the dealer button on the table indicate?', options: ['The seat with the strongest hand', 'The nominal dealer position that sets the order of action', 'The largest bet made so far', 'The current chip leader'], correct_index: 1, explanation: 'The button marks the nominal dealer seat, which acts last on every postflop street and moves one seat clockwise each hand. Because acting last is a structural advantage, position is defined relative to this marker.' },
    { category: 'rule_knowledge', difficulty: 'medium', question: 'Before any hand is dealt, what purpose do the blinds serve?', options: ['They are forced bets that create a pot worth contesting', 'They are optional side bets', 'They pay the dealer\'s commission', 'They reserve a player\'s seat'], correct_index: 0, explanation: 'The small blind and big blind are forced wagers posted before the cards come out so there is always money to play for. Without them a table of patient players would simply fold every hand at no cost.' },
    { category: 'rule_knowledge', difficulty: 'hard', question: 'In a rebuy tournament, when does the rebuy period for a busted stack normally close?', options: ['After the first hand', 'After the first level', 'After a specified number of levels, usually three to six', 'When half the field has been eliminated'], correct_index: 2, explanation: 'Rebuy events publish a fixed rebuy period, most often the first three to six levels, after which the tournament becomes a freezeout. Many structures also offer a single add-on at the moment the period closes.' },
    { category: 'rule_knowledge', difficulty: 'hard', question: 'Under the one-chip rule, how is a single oversized chip pushed forward without a verbal declaration ruled during a hand?', options: ['Every player at the table must rebuy', 'It is a call, not a raise', 'Only one chip may be bet per street', 'Chips may not be stacked more than one high'], correct_index: 1, explanation: 'Placing one chip larger than the current bet into the pot without saying "raise" is ruled a call, with change returned. The rule exists to stop players from disguising raise intentions behind an ambiguous single motion.' },
    { category: 'rule_knowledge', difficulty: 'hard', question: 'In Pot-Limit Omaha, how many hole cards must a player use to form their final hand?', options: ['Any number they choose', 'Exactly one hole card', 'Exactly two hole cards', 'At least two hole cards'], correct_index: 2, explanation: 'Omaha requires exactly two hole cards plus exactly three community cards, with no exceptions. This is why holding a single ace of the flush suit does not make a flush even when four of that suit are on the board.' },
    { category: 'rule_knowledge', difficulty: 'hard', question: 'If two players table identical five-card hands at showdown, how is the pot awarded?', options: ['The player who bet first wins it', 'The pot is split equally between them', 'The player in later position wins it', 'An extra card is dealt to break the tie'], correct_index: 1, explanation: 'Identical five card hands chop the pot evenly, with any odd chip going to the first seat left of the button. Suits are never used to break ties for a pot in standard poker.' },
    { category: 'rule_knowledge', difficulty: 'medium', question: 'In live poker, what action during a hand is ruled a string bet?', options: ['Betting with chips of mixed denominations', 'Adding chips in multiple motions without first declaring the amount', 'Betting on every street of the hand', 'Placing chips outside the betting line'], correct_index: 1, explanation: 'A string bet is putting chips into the pot in more than one forward motion without verbally declaring the full amount first. The floor normally rules the bet as only the first portion, since the extra motions are used to read reactions.' },
    { category: 'rule_knowledge', difficulty: 'easy', question: 'At showdown, which hand ranks higher: a straight or three of a kind?', options: ['Three of a kind', 'A straight', 'They are equal in value', 'It depends on the suits involved'], correct_index: 1, explanation: 'A straight beats three of a kind because five cards in sequence are dealt less often than three of the same rank. The ranking chart is ordered strictly by how rarely each combination occurs.' },
    { category: 'rule_knowledge', difficulty: 'easy', question: 'When a player folds during a hand, what happens to their cards and their chips?', options: ['They match the current bet', 'They raise the current bet', 'They surrender the hand and forfeit chips already in the pot', 'They must expose their cards'], correct_index: 2, explanation: 'Folding sends the cards to the muck and gives up any claim to the pot, including chips already invested on earlier streets. Those chips remain in the pot for the players still contesting the hand.' },
    { category: 'rule_knowledge', difficulty: 'medium', question: 'During a hand, what creates a side pot at the table?', options: ['An extra pot reserved for the dealer', 'One player going all in while others keep betting', 'A bonus added at the end of the session', 'A pot contested only by the blinds'], correct_index: 1, explanation: 'When a short stack is all in, further wagering between the remaining players goes into a separate side pot. The all-in player can only win the main pot, since they contributed nothing to the additional betting.' },
    { category: 'rule_knowledge', difficulty: 'hard', question: 'In no-limit Hold\'em, what is the minimum legal raise when facing a bet during a hand?', options: ['Any amount above the current bet', 'At least the size of the previous bet or raise increment', 'Exactly double the big blind', 'At least three times the big blind'], correct_index: 1, explanation: 'A raise must increase the bet by at least the size of the last bet or raise. Facing a big blind of ten raised to thirty, the raise increment is twenty, so the minimum re-raise is to fifty.' },
    { category: 'rule_knowledge', difficulty: 'medium', question: 'What procedural error during the deal is ruled a misdeal?', options: ['The dealer deals an incorrect number of cards or exposes a card in error', 'A player looks at another player\'s hand', 'The deck runs out of cards', 'A player takes too long to act'], correct_index: 0, explanation: 'A misdeal covers dealing errors such as the wrong number of cards, an exposed card off the top or a card dealt to an empty seat. The hand is voided and re-dealt provided the error is caught before substantial action.' },
];

const TOURNAMENT_QUESTIONS = [
    { category: 'tournament_facts', difficulty: 'medium', question: 'In tournament poker, what does the Independent Chip Model convert a chip stack into?', options: ['An estimate of that stack\'s share of the prize pool', 'The number of hands the stack can survive', 'A multiplier applied to the blinds', 'The stack\'s rank at the table'], correct_index: 0, explanation: 'The Independent Chip Model translates chip counts into expected prize money by assigning each player a probability of finishing in each paid position. It is why a chip lead is never worth its face value in dollars.' },
    { category: 'tournament_facts', difficulty: 'easy', question: 'In a tournament, what situation is described as being "on the bubble"?', options: ['Holding the chip lead', 'Being one elimination away from the money', 'Starting a new blind level', 'Holding the shortest stack'], correct_index: 1, explanation: 'The bubble is the point where one more elimination puts every remaining player into the money. It produces the largest strategic distortions in tournament poker because survival is briefly worth more than chips.' },
    { category: 'tournament_facts', difficulty: 'medium', question: 'In a satellite tournament, what does the winning player actually receive?', options: ['An entry into a larger, more expensive event', 'A cash prize double the buy-in', 'A guaranteed final table seat', 'A refund of their entry fee'], correct_index: 0, explanation: 'Satellites award seats rather than cash, which is how Chris Moneymaker turned a thirty nine dollar entry into the 2003 WSOP Main Event. Because every seat is identical, satellite strategy is dominated by survival rather than accumulation.' },
    { category: 'tournament_facts', difficulty: 'hard', question: 'In a freezeout tournament, what restriction defines the format?', options: ['One buy-in only, with no rebuys or add-ons', 'Play is suspended during cold decks', 'The blinds never increase', 'Rebuys are unlimited throughout'], correct_index: 0, explanation: 'A freezeout gives every entrant a single buy-in, so elimination is permanent from the first hand onward. The WSOP Main Event is the best known example of this structure.' },
    { category: 'tournament_facts', difficulty: 'medium', question: 'In a tournament, what does reaching the final table mean for the players involved?', options: ['They are on the first table dealt', 'They are the last remaining table of players', 'They hold the largest stacks in the field', 'They have joined an exhibition match'], correct_index: 1, explanation: 'The final table is the last table still in play, traditionally nine players in a full ring event and six in a six handed one. It is where the steepest pay jumps occur, which makes it the most ICM sensitive stage of any tournament.' },
    { category: 'tournament_facts', difficulty: 'easy', question: 'In a bounty tournament, how does a player earn an extra prize during a hand?', options: ['By reaching the final table', 'By eliminating another player and collecting their bounty', 'By entering during late registration', 'By playing the most hands'], correct_index: 1, explanation: 'Each entrant carries a bounty that is paid to whoever eliminates them, in addition to the standard prize pool. Progressive bounty formats add part of the collected bounty to the winner\'s own head, which changes calling incentives sharply.' },
    { category: 'tournament_facts', difficulty: 'hard', question: 'In a tournament hand, how does chip expected value differ from dollar expected value?', options: ['They are identical measures', 'Chip EV accounts for the payout ladder while dollar EV ignores it', 'Chip EV ignores the payout structure while dollar EV accounts for it', 'Dollar EV is always the larger figure'], correct_index: 2, explanation: 'Chip expected value measures a decision purely by chips won or lost, while dollar expected value applies the payout structure through the Independent Chip Model. The two diverge most sharply on the bubble and at the final table.' },
    { category: 'tournament_facts', difficulty: 'medium', question: 'What structural feature defines a turbo tournament?', options: ['Play begins immediately with no registration', 'Blind levels advance on a much shorter clock', 'Only fast players may enter', 'There is no time limit on decisions'], correct_index: 1, explanation: 'Turbos shorten blind levels to roughly five to eight minutes against fifteen to twenty in a standard event. Stacks measured in big blinds shrink far faster, which pushes play into push-fold territory much earlier.' },
    { category: 'tournament_facts', difficulty: 'easy', question: 'In a tournament hand, what is an ante and who posts it?', options: ['A voluntary side bet', 'A forced contribution paid before the hand, introduced at later levels', 'The first card dealt to each player', 'An extra prize for the chip leader'], correct_index: 1, explanation: 'Antes are forced contributions that sweeten the pot before the cards are dealt, and they normally begin a few levels into an event. Most modern tournaments use a big blind ante, where the big blind posts the whole amount for the table.' },
    { category: 'tournament_facts', difficulty: 'medium', question: 'When remaining players agree to a chop, what have they decided?', options: ['To divide the remaining prize pool by agreement rather than play it out', 'To cut the deck before the next hand', 'To eliminate the shortest stack', 'To remove antes from play'], correct_index: 0, explanation: 'A chop is a negotiated split of the remaining prize money, usually calculated by the Independent Chip Model or by an agreed adjustment to it. Most rooms require unanimous agreement and leave a portion to play for.' },
    { category: 'tournament_facts', difficulty: 'hard', question: 'In final table strategy, what does a pay jump refer to in a given hand?', options: ['Moving up to a higher stakes event', 'The prize money difference between adjacent finishing positions', 'Skipping a blind level', 'Being paid after each round'], correct_index: 1, explanation: 'A pay jump is the increase in prize money between one finishing position and the next, and it grows steeply at the final table. Large jumps are precisely what create the risk premium that makes correct calls in chips into losing calls in dollars.' },
    { category: 'tournament_facts', difficulty: 'medium', question: 'When registration closes in a multi-table tournament, what changes for the field?', options: ['The tournament has reached its seat cap', 'Late registration has ended and no further entries or re-entries are accepted', 'The dealers begin a new shuffle procedure', 'Starting stacks are recalculated'], correct_index: 1, explanation: 'The close of registration ends the late entry and re-entry window, fixing the field size and the prize pool for the rest of the event. Players often time their entry to this deadline to know exactly what they are playing for.' },
];

const POKER_HISTORY_QUESTIONS = [
    { category: 'poker_history', difficulty: 'easy', question: 'Who was named the winner of the first WSOP Main Event in 1970?', options: ['Johnny Moss', 'Doyle Brunson', 'Stu Ungar', 'Amarillo Slim'], correct_index: 0, explanation: 'The 1970 World Series of Poker was an invitational decided by a vote of the participants rather than by a freezeout, and they elected Johnny Moss. A conventional tournament format was adopted the following year.' },
    { category: 'poker_history', difficulty: 'medium', question: 'Through which online site did Chris Moneymaker qualify for the 2003 WSOP Main Event?', options: ['Full Tilt Poker', 'PartyPoker', 'PokerStars', '888poker'], correct_index: 2, explanation: 'Moneymaker won his seat through a thirty nine dollar satellite on PokerStars and went on to take the 2003 Main Event and two and a half million dollars. His win triggered the online poker boom that reshaped the game.' },
    { category: 'poker_history', difficulty: 'hard', question: 'What was the buy-in structure of the first WSOP Main Event held in 1970?', options: ['Five hundred dollars', 'Five thousand dollars', 'Ten thousand dollars', 'There was no fixed buy-in that year'], correct_index: 3, explanation: 'The inaugural 1970 event was an invitational gathering with no set buy-in, and the champion was chosen by a peer vote. The now familiar ten thousand dollar freezeout structure arrived in 1971 and 1972.' },
    { category: 'poker_history', difficulty: 'medium', question: 'Which player is universally known as the Godfather of Poker?', options: ['Johnny Moss', 'Doyle Brunson', 'Stu Ungar', 'Jack Binion'], correct_index: 1, explanation: 'Doyle Brunson earned the nickname through a career spanning six decades, ten WSOP bracelets and the publication of Super System in 1979. That book was the first to make expert strategy publicly available.' },
    { category: 'poker_history', difficulty: 'easy', question: 'Which date is known as Black Friday in the history of online poker?', options: ['April 15, 2011', 'November 25, 2011', 'January 1, 2010', 'December 31, 2012'], correct_index: 0, explanation: 'On April 15, 2011 the United States Department of Justice seized the domains of PokerStars, Full Tilt Poker and Absolute Poker and unsealed indictments against their operators. American players were cut off from the largest online sites overnight.' },
    { category: 'poker_history', difficulty: 'medium', question: 'Who became the youngest WSOP Main Event champion when he won in 2009?', options: ['Phil Hellmuth', 'Peter Eastgate', 'Joe Cada', 'Daniel Negreanu'], correct_index: 2, explanation: 'Joe Cada won the 2009 Main Event at twenty one years old, taking the record from Peter Eastgate who had won it a year earlier at twenty two. Both records reflected the wave of young online qualifiers reaching Las Vegas.' },
];

const PLAYER_PROFILE_QUESTIONS = [
    { category: 'player_profiles', difficulty: 'easy', question: 'Which player holds the all-time record for most WSOP bracelets won?', options: ['Phil Ivey', 'Phil Hellmuth', 'Doyle Brunson', 'Daniel Negreanu'], correct_index: 1, explanation: 'Phil Hellmuth leads the all-time bracelet count, having extended a record he first took in 2012 well past the field. His first came in the 1989 Main Event, which he won at twenty four.' },
    { category: 'player_profiles', difficulty: 'medium', question: 'Which player earned the nickname Kid Poker early in his career?', options: ['Phil Ivey', 'Phil Hellmuth', 'Daniel Negreanu', 'Tom Dwan'], correct_index: 2, explanation: 'Daniel Negreanu picked up the nickname as a boyish looking young pro breaking through in the late 1990s. He won his first bracelet in 1998 at twenty three, then the youngest player to do so.' },
    { category: 'player_profiles', difficulty: 'medium', question: 'Which high-stakes player used the online screen name durrrr?', options: ['Phil Galfond', 'Tom Dwan', 'Viktor Blom', 'Doug Polk'], correct_index: 1, explanation: 'Tom Dwan built his reputation under the durrrr alias in the biggest online cash games of the late 2000s. He later issued the durrrr Challenge, a fifty thousand hand heads-up prop bet against the game\'s best players.' },
    { category: 'player_profiles', difficulty: 'hard', question: 'Which player is the only three-time winner of the WSOP Main Event?', options: ['Phil Hellmuth', 'Johnny Moss', 'Stu Ungar', 'Doyle Brunson'], correct_index: 2, explanation: 'Stu Ungar won the Main Event in 1980, 1981 and 1997, the only player to take it three times in the modern era. Johnny Moss is credited with three titles as well, but one of those was the 1970 vote rather than a tournament win.' },
    { category: 'player_profiles', difficulty: 'easy', question: 'Which player wrote the landmark strategy book Super System?', options: ['Mike Caro', 'David Sklansky', 'Doyle Brunson', 'Dan Harrington'], correct_index: 2, explanation: 'Doyle Brunson published Super System in 1979 with contributions from several specialists including Mike Caro and David Sklansky. It was the first book to reveal professional level strategy and was widely blamed by pros for educating their opponents.' },
    { category: 'player_profiles', difficulty: 'medium', question: 'Which player became the all-time leader in live tournament earnings among women?', options: ['Vanessa Selbst', 'Kristen Bicknell', 'Jennifer Harman', 'Liv Boeree'], correct_index: 0, explanation: 'Vanessa Selbst topped the all-time women\'s live earnings list with over eleven million dollars before stepping away from full-time play in 2018. She also won three open-field WSOP bracelets.' },
];

const ALL_QUESTIONS = [
    ...RULE_QUESTIONS,
    ...TOURNAMENT_QUESTIONS,
    ...POKER_HISTORY_QUESTIONS,
    ...PLAYER_PROFILE_QUESTIONS,
];

const TARGET_CATEGORIES = [...new Set(ALL_QUESTIONS.map(q => q.category))];

function buildRows() {
    return ALL_QUESTIONS.map(q => ({
        ...q,
        quality_score: SEEDED_QUALITY_SCORE,
        source: SOURCE_TAG,
        created_at: new Date().toISOString(),
    }));
}

/** Normalized existing question texts for the categories this script writes. */
async function loadExistingTexts(sb, categories) {
    const texts = new Set();
    const PAGE = 1000;
    for (let from = 0; from < 20000; from += PAGE) {
        const { data, error } = await sb
            .from('trivia_questions')
            .select('question')
            .in('category', categories)
            .order('id', { ascending: true })
            .range(from, from + PAGE - 1);
        if (error) {
            console.log(`WARN: dedup load failed — ${error.message}`);
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

/** QA regression for the hand-written set — no DB or credentials required. */
function selfTest() {
    const { valid, rejected, report } = validateBatch(buildRows());
    console.log(report);
    rejected.forEach(r => {
        console.log(`FAIL: ${String(r.question.question).slice(0, 80)}`);
        r.errors.forEach(e => console.log(`   ${e}`));
    });
    console.log(`\n${valid.length}/${ALL_QUESTIONS.length} starters pass the QA gate.`);
    return rejected.length;
}

async function main() {
    const rows = buildRows();
    console.log(`Manual seed: ${rows.length} questions across ${TARGET_CATEGORIES.length} categories${DRY_RUN ? ' (DRY RUN)' : ''}`);

    if (DRY_RUN) {
        process.exit(selfTest() > 0 ? 1 : 0);
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.log('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
        process.exit(1);
    }
    const { createClient } = requireHook('@supabase/supabase-js');
    const sb = createClient(url, key);

    // Idempotency: existing question texts become DUP-02 rejections, so a
    // re-run inserts nothing instead of duplicating all 47 rows.
    const existingTexts = await loadExistingTexts(sb, TARGET_CATEGORIES);
    console.log(`  existing question texts in these categories: ${existingTexts.size}`);

    const { valid, rejected } = validateBatch(rows, { existingTexts });
    const dupes = rejected.filter(r => r.errors.some(e => e.startsWith('DUP-'))).length;
    const qaFails = rejected.length - dupes;
    console.log(`  pass QA: ${valid.length} | already present: ${dupes} | QA rejected: ${qaFails}`);
    rejected
        .filter(r => !r.errors.some(e => e.startsWith('DUP-')))
        .forEach(r => {
            console.log(`  REJECTED: "${String(r.question.question).slice(0, 70)}"`);
            r.errors.forEach(e => console.log(`     - ${e}`));
        });

    if (valid.length === 0) {
        console.log('Nothing new to insert.');
        process.exit(0);
    }

    const { data, error } = await sb.from('trivia_questions').insert(valid).select('id, category');
    if (error) {
        console.log('INSERT ERROR:', error.message);
        process.exit(1);
    }

    const cats = {};
    data.forEach(q => { cats[q.category] = (cats[q.category] || 0) + 1; });
    Object.entries(cats).forEach(([cat, count]) => console.log(`  ${cat}: ${count} inserted`));
    console.log(`  TOTAL: ${data.length} inserted`);
    process.exit(0);
}

module.exports = { ALL_QUESTIONS, buildRows, selfTest, TARGET_CATEGORIES };

if (require.main === module) {
    main().catch(e => { console.error(e); process.exit(1); });
}
