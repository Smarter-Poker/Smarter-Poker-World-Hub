import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * DAILY TRIVIA API - Fetch Today's Questions
 * ═══════════════════════════════════════════════════════════════════════════
 * Returns today's trivia roster. All dates are in CST (America/Chicago);
 * the day rolls over at midnight CST.
 *
 * Roster policy (the 60-day no-repeat guarantee, daily-mode edition):
 *   1. Serve the roster already tagged with daily_date = today.
 *   2. If there isn't one, BUILD one from the live pool, preferring questions
 *      that have never been used or were last used more than 60 days ago,
 *      then tag those rows (daily_date + order_index) with the service-role
 *      client so every player gets the same set and the rotation is durable.
 *   3. Only top up from the static FALLBACK set when the live pool cannot
 *      supply enough rows — and even then, blend rather than discard the real
 *      questions, and vary the fallback selection by date.
 *   4. Record the served roster in the caller's question history so other
 *      modes exclude it too.
 *
 * Previously the route only ever ran query (1) against a column nothing in the
 * active codebase writes, then threw away any roster smaller than 10, so it
 * served the same 10 hardcoded questions with the same answers forever.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';
import {
    getRecentlySeenIds,
    recordQuestionsSeen,
    NO_REPEAT_WINDOW_DAYS,
} from '../../../src/lib/triviaQuestionLoader';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

const ROSTER_SIZE = 20;
const QUALITY_FLOOR = 6;
const CANDIDATE_POOL_SIZE = 400;

let _supabase = null;
let _warnedNoServiceRole = false;
let _hasServiceRole = false;

function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        _hasServiceRole = !!serviceKey;
        if (!serviceKey && !_warnedNoServiceRole) {
            _warnedNoServiceRole = true;
            // Silent-degradation guard: with the anon key and no user session
            // attached, every RLS-locked read below returns zero rows, so
            // hasPlayedToday is permanently false and roster tagging fails —
            // a misconfiguration that used to look like a behaviour bug.
            console.warn('[Trivia API] SUPABASE_SERVICE_ROLE_KEY missing — RLS reads/writes will silently fail');
        }
        const key = serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// ═══════════════════════════════════════════════════════════════════════════
// FALLBACK QUESTIONS (used only when the live pool cannot fill the roster)
// 30 curated questions; 20 are selected deterministically per CST date, so
// even a degraded day differs from the day before instead of being identical.
// ═══════════════════════════════════════════════════════════════════════════

const FALLBACK_QUESTIONS = [
    {
        id: 'fb1',
        category: 'poker_history',
        difficulty: 'medium',
        question: 'In what year was the first World Series of Poker Main Event held?',
        options: ['1968', '1970', '1972', '1975'],
        correct_index: 1,
        explanation: 'The first WSOP was held in 1970 at Binion\'s Horseshoe Casino in Las Vegas. Johnny Moss was voted champion by his peers.'
    },
    {
        id: 'fb2',
        category: 'famous_hands',
        difficulty: 'medium',
        question: 'What hand did Chris Moneymaker hold when he won the 2003 WSOP Main Event?',
        options: ['5-4 suited', 'A-K suited', 'Pocket Fives', '7-2 offsuit'],
        correct_index: 2,
        explanation: 'Chris Moneymaker held pocket fives and made a full house to beat Sam Farha\'s top pair, sparking the "poker boom."'
    },
    {
        id: 'fb3',
        category: 'gto_theory',
        difficulty: 'hard',
        question: 'In GTO poker, what is the "Minimum Defense Frequency" concept used for?',
        options: ['Calculating pot odds', 'Determining how often to call to prevent profitable bluffs', 'Sizing your bets', 'Choosing starting hands'],
        correct_index: 1,
        explanation: 'MDF tells you the minimum frequency you must call/continue to prevent your opponent from profitably bluffing with any two cards.'
    },
    {
        id: 'fb4',
        category: 'player_profiles',
        difficulty: 'easy',
        question: 'Which player holds the record for most WSOP bracelets?',
        options: ['Phil Ivey', 'Doyle Brunson', 'Phil Hellmuth', 'Johnny Chan'],
        correct_index: 2,
        explanation: 'Phil Hellmuth holds the record with 17 WSOP bracelets, more than any other player in history.'
    },
    {
        id: 'fb5',
        category: 'tournament_facts',
        difficulty: 'medium',
        question: 'What is the largest first-place prize ever awarded in a poker tournament?',
        options: ['$8.5 million', '$10 million', '$12 million', '$18.3 million'],
        correct_index: 3,
        explanation: 'Antonio Esfandiari won $18.3 million in the 2012 Big One for One Drop, the largest first-place prize in poker history.'
    },
    {
        id: 'fb6',
        category: 'rule_knowledge',
        difficulty: 'easy',
        question: 'In Texas Hold\'em, what happens if two players have the exact same hand?',
        options: ['The player with position wins', 'The pot is split equally', 'There\'s a runout card', 'The player who bet first wins'],
        correct_index: 1,
        explanation: 'When hands are identical, the pot is split equally among the tied players. This is called a "chop."'
    },
    {
        id: 'fb7',
        category: 'poker_history',
        difficulty: 'hard',
        question: 'Who is credited with inventing Texas Hold\'em poker?',
        options: ['Doyle Brunson', 'Unknown - originated in Robstown, Texas', 'Johnny Moss', 'Benny Binion'],
        correct_index: 1,
        explanation: 'The origins of Texas Hold\'em are unclear, but it\'s believed to have originated in Robstown, Texas in the early 1900s.'
    },
    {
        id: 'fb8',
        category: 'famous_hands',
        difficulty: 'medium',
        question: 'What is the "Dead Man\'s Hand" in poker?',
        options: ['Pocket Kings', 'Aces and Eights (black)', 'Queen-Seven offsuit', 'Two-Seven offsuit'],
        correct_index: 1,
        explanation: 'The Dead Man\'s Hand is two pair of black aces and black eights. It\'s the hand Wild Bill Hickok allegedly held when he was shot and killed in 1876.'
    },
    {
        id: 'fb9',
        category: 'gto_theory',
        difficulty: 'medium',
        question: 'What does "polarized range" mean in poker?',
        options: ['Playing only premium hands', 'A range containing only very strong hands or bluffs', 'Adjusting to opponent tendencies', 'Playing in position only'],
        correct_index: 1,
        explanation: 'A polarized range contains only the strongest value hands and bluffs, with no medium-strength hands.'
    },
    {
        id: 'fb10',
        category: 'tournament_facts',
        difficulty: 'easy',
        question: 'What is the buy-in for the WSOP Main Event?',
        options: ['$5,000', '$10,000', '$25,000', '$50,000'],
        correct_index: 1,
        explanation: 'The WSOP Main Event has had a $10,000 buy-in since its inception in 1970.'
    },
    {
        id: 'fb11',
        category: 'rule_knowledge',
        difficulty: 'easy',
        question: 'How many cards are dealt on the flop in Texas Hold\'em?',
        options: ['One', 'Two', 'Three', 'Four'],
        correct_index: 2,
        explanation: 'The flop is the first three community cards, dealt face up all at once after the first betting round.'
    },
    {
        id: 'fb12',
        category: 'rule_knowledge',
        difficulty: 'medium',
        question: 'In Texas Hold\'em, which hand ranks higher: a flush or a full house?',
        options: ['Flush', 'Full house', 'They are equal', 'Depends on the suit'],
        correct_index: 1,
        explanation: 'A full house beats a flush. The standard ranking from the top is: royal flush, straight flush, four of a kind, full house, flush, straight.'
    },
    {
        id: 'fb13',
        category: 'rule_knowledge',
        difficulty: 'medium',
        question: 'What is a "string bet"?',
        options: ['A bet made with chips of mixed denominations', 'A bet placed in multiple motions without declaring the amount', 'A minimum-sized bet', 'A bet made out of turn'],
        correct_index: 1,
        explanation: 'A string bet is placing chips into the pot in more than one motion without first declaring the full amount. It is not allowed, and the bet is typically ruled as only the first portion put forward.'
    },
    {
        id: 'fb14',
        category: 'rule_knowledge',
        difficulty: 'hard',
        question: 'In a no-limit hold\'em cash game, what is the minimum legal raise?',
        options: ['Double the big blind', 'At least the size of the previous bet or raise', 'Any amount above the current bet', 'Half the pot'],
        correct_index: 1,
        explanation: 'A raise must be at least as large as the previous bet or raise in that round. Facing a bet of 100, the minimum raise is to 200.'
    },
    {
        id: 'fb15',
        category: 'gto_theory',
        difficulty: 'medium',
        question: 'If you face a pot-sized bet on the river, what pot odds are you being offered?',
        options: ['2 to 1', '3 to 1', '1 to 1', '4 to 1'],
        correct_index: 0,
        explanation: 'A pot-sized bet means you call one unit to win two (the original pot plus the bet), which is 2 to 1, so you need roughly 33% equity to break even.'
    },
    {
        id: 'fb16',
        category: 'gto_theory',
        difficulty: 'medium',
        question: 'Roughly what percentage of the time will you complete a flush draw from the flop to the river?',
        options: ['About 20%', 'About 35%', 'About 50%', 'About 65%'],
        correct_index: 1,
        explanation: 'A nine-out flush draw completes about 35% of the time across two cards. The "rule of four" (9 outs x 4) gives a close approximation.'
    },
    {
        id: 'fb17',
        category: 'gto_theory',
        difficulty: 'hard',
        question: 'What does SPR stand for in poker strategy?',
        options: ['Standard Pot Ratio', 'Stack-to-Pot Ratio', 'Squeeze Play Range', 'Suited Playable Range'],
        correct_index: 1,
        explanation: 'Stack-to-Pot Ratio is the effective stack divided by the current pot. Low SPR favours committing with top pair; high SPR demands stronger hands to stack off.'
    },
    {
        id: 'fb18',
        category: 'gto_theory',
        difficulty: 'hard',
        question: 'In GTO terms, what is a "blocker"?',
        options: ['A player who slows the game down', 'A card in your hand that reduces the combinations of hands your opponent can hold', 'A bet that prevents a raise', 'A rule preventing a re-raise'],
        correct_index: 1,
        explanation: 'A blocker is a card you hold that removes combinations from your opponent\'s range. Holding the ace of spades blocks the nut flush, which makes bluffing more effective.'
    },
    {
        id: 'fb19',
        category: 'icm_chip_ev',
        difficulty: 'medium',
        question: 'What does ICM stand for in tournament poker?',
        options: ['Independent Chip Model', 'International Card Metric', 'Implied Chip Multiplier', 'Inverse Commitment Model'],
        correct_index: 0,
        explanation: 'The Independent Chip Model converts tournament chip stacks into an expected share of the prize pool, which is why chips gained are worth less than chips lost near a pay jump.'
    },
    {
        id: 'fb20',
        category: 'icm_chip_ev',
        difficulty: 'hard',
        question: 'Under ICM pressure on a tournament bubble, how should a medium stack generally adjust?',
        options: ['Call much wider to accumulate chips', 'Play tighter against big stacks because busting costs real equity', 'Ignore ICM and play chip EV', 'Shove every hand to build a stack'],
        correct_index: 1,
        explanation: 'On the bubble, busting forfeits a large share of prize-pool equity, so medium stacks tighten their calling ranges against covering stacks while pressuring shorter stacks.'
    },
    {
        id: 'fb21',
        category: 'mtt_situations',
        difficulty: 'medium',
        question: 'With a 12 big blind stack in a tournament, what is generally the preferred pre-flop strategy?',
        options: ['Limp and see flops cheaply', 'Open-raise small and fold to 3-bets', 'Play a push-or-fold style', 'Min-raise every hand'],
        correct_index: 2,
        explanation: 'Around 10 to 13 big blinds, open-shoving or folding captures most of the available EV because any raise commits a large share of the stack and gives up fold equity.'
    },
    {
        id: 'fb22',
        category: 'mtt_situations',
        difficulty: 'easy',
        question: 'What does "on the bubble" mean in a poker tournament?',
        options: ['The final table has been reached', 'One elimination remains before everyone is paid', 'Blinds are about to increase', 'Registration has just closed'],
        correct_index: 1,
        explanation: 'The bubble is the point where one more elimination puts every remaining player in the money, which is when ICM pressure peaks.'
    },
    {
        id: 'fb23',
        category: 'cash_game_situations',
        difficulty: 'medium',
        question: 'What is a "continuation bet" (c-bet)?',
        options: ['A bet made by the pre-flop aggressor on the flop', 'A bet that continues from the previous street\'s size', 'A call intended to continue in the hand', 'A bet made after an opponent checks twice'],
        correct_index: 0,
        explanation: 'A continuation bet is a bet made on the flop by the player who took the aggressive pre-flop action, continuing the story their pre-flop range tells.'
    },
    {
        id: 'fb24',
        category: 'cash_game_situations',
        difficulty: 'hard',
        question: 'What is "set mining"?',
        options: ['Calling pre-flop with a pocket pair hoping to flop three of a kind', 'Bluffing with a set to induce calls', 'Searching for tells in an opponent', 'Slow-playing a made straight'],
        correct_index: 0,
        explanation: 'Set mining is calling a raise with a small pocket pair to hit a set, which happens about one time in eight on the flop. It needs deep stacks and good implied odds to be profitable.'
    },
    {
        id: 'fb25',
        category: 'player_profiles',
        difficulty: 'medium',
        question: 'Which player is known as "The Poker Brat"?',
        options: ['Daniel Negreanu', 'Phil Hellmuth', 'Mike Matusow', 'Tony G'],
        correct_index: 1,
        explanation: 'Phil Hellmuth earned the nickname "The Poker Brat" for his outbursts at the table, and it became the title of his own poker book brand.'
    },
    {
        id: 'fb26',
        category: 'player_profiles',
        difficulty: 'medium',
        question: 'Which player is nicknamed "Kid Poker"?',
        options: ['Daniel Negreanu', 'Phil Ivey', 'Erik Seidel', 'Antonio Esfandiari'],
        correct_index: 0,
        explanation: 'Daniel Negreanu picked up the nickname "Kid Poker" after winning his first WSOP bracelet in 1998 at age 23, at the time the youngest bracelet winner.'
    },
    {
        id: 'fb27',
        category: 'poker_history',
        difficulty: 'medium',
        question: 'What event is commonly referred to as "Black Friday" in online poker?',
        options: ['The 2008 financial crisis', 'The 2011 US indictment of major online poker sites', 'The 2006 UIGEA vote', 'The 2003 Moneymaker win'],
        correct_index: 1,
        explanation: 'On April 15, 2011, the US Department of Justice unsealed indictments against PokerStars, Full Tilt Poker and Absolute Poker, shutting US players out of those sites.'
    },
    {
        id: 'fb28',
        category: 'tournament_facts',
        difficulty: 'medium',
        question: 'What does WPT stand for?',
        options: ['World Poker Tour', 'World Player Tournament', 'Worldwide Poker Trophy', 'Western Poker Tour'],
        correct_index: 0,
        explanation: 'The World Poker Tour launched in 2002 and its televised final tables were a major driver of the early-2000s poker boom.'
    },
    {
        id: 'fb29',
        category: 'famous_hands',
        difficulty: 'hard',
        question: 'In the 1988 WSOP Main Event, which hand did Johnny Chan use to beat Erik Seidel heads-up?',
        options: ['Pocket aces', 'A jack-high straight', 'A flush', 'A full house'],
        correct_index: 1,
        explanation: 'Chan flopped a straight with J-9, checked it down, and induced Seidel to shove with top pair. The hand was later immortalised in the film Rounders.'
    },
    {
        id: 'fb30',
        category: 'rule_knowledge',
        difficulty: 'hard',
        question: 'In a tournament, what does the "one-player-to-a-hand" rule prohibit?',
        options: ['Playing two tables at once', 'Receiving advice about your hand from anyone else', 'Holding more than one stack of chips', 'Entering a tournament twice'],
        correct_index: 1,
        explanation: 'One player to a hand means every decision must be made by the player alone. Coaching, discussing a live hand, or acting on someone else\'s advice is a penalty.'
    }
];

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/** Deterministic 32-bit hash so a given CST date always yields the same order. */
function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** Date-seeded shuffle — same output all day, different output tomorrow. */
function seededShuffle(array, seed) {
    const arr = [...array];
    let state = hashString(String(seed)) || 1;
    const next = () => {
        state ^= state << 13; state >>>= 0;
        state ^= state >> 17;
        state ^= state << 5; state >>>= 0;
        return state / 4294967296;
    };
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

const PUBLIC_QUESTION_COLUMNS = 'id, category, difficulty, question, options, correct_index, explanation';

/**
 * Build (and persist) today's roster from the live pool.
 * Prefers questions never used, or last used outside the no-repeat window.
 * @returns {Promise<object[]>}
 */
async function buildRosterFromPool(supabase, today) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - NO_REPEAT_WINDOW_DAYS);

    const select = async (onlyUnused) => {
        let q = supabase
            .from('trivia_questions')
            .select(`${PUBLIC_QUESTION_COLUMNS}, last_used_at`)
            .gte('quality_score', QUALITY_FLOOR)
            .is('daily_date', null);
        if (onlyUnused) q = q.or(`last_used_at.is.null,last_used_at.lt.${cutoff.toISOString()}`);
        const { data, error } = await q
            .order('last_used_at', { ascending: true, nullsFirst: true })
            .limit(CANDIDATE_POOL_SIZE);
        if (error) {
            console.warn('[Trivia API] roster candidate query failed:', error.message || error);
            return [];
        }
        return data || [];
    };

    // Tier 1: questions outside the 60-day rotation window.
    let candidates = await select(true);
    // Tier 2: pool exhausted — take the OLDEST-used questions rather than
    // failing or repeating something served this week.
    if (candidates.length < ROSTER_SIZE) {
        console.warn(
            `[Trivia API] only ${candidates.length} questions outside the ${NO_REPEAT_WINDOW_DAYS}-day window; ` +
            'falling back to oldest-used. Pool depth is below the no-repeat requirement.'
        );
        candidates = await select(false);
    }
    if (candidates.length === 0) return [];

    // Shuffle within the oldest slice so the roster is not literally the same
    // ordering every day, but stays inside the least-recently-used set.
    const slice = candidates.slice(0, Math.max(ROSTER_SIZE * 3, ROSTER_SIZE));
    const chosen = shuffleArray(slice).slice(0, ROSTER_SIZE);

    // Tag the chosen rows so every player today gets the same roster and the
    // rotation is recorded. Requires the service-role key; failure is
    // non-fatal (we still serve the questions for this request).
    const nowIso = new Date().toISOString();
    if (!_hasServiceRole) {
        console.warn('[Trivia API] skipping roster tagging — no service-role key, RLS would reject the write');
        return chosen.map(({ last_used_at: _lastUsed, ...rest }) => rest);
    }
    await Promise.all(chosen.map((q, idx) =>
        supabase
            .from('trivia_questions')
            .update({ daily_date: today, order_index: idx, last_used_at: nowIso })
            .eq('id', q.id)
            .then(({ error }) => {
                if (error) console.warn('[Trivia API] roster tag failed:', error.message || error);
            })
    ));

    return chosen.map(({ last_used_at: _lastUsed, ...rest }) => rest);
}

// ═══════════════════════════════════════════════════════════════════════════
// API HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  try {
      if (req.method !== 'GET') {
          res.setHeader('Allow', 'GET');
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const today = getTodayCST();

      try {
          const supabase = getSupabase();

          // Phase 55: enforce gameplay quality floor (qs >= 6) so reported-bad
          // (qs=2 via 3-strike auto-demote) and unclear-English (qs=4 via Flesch
          // check in audit cron) questions never land on the public daily roster.
          const { data: rosterRows, error } = await supabase
              .from('trivia_questions')
              .select(PUBLIC_QUESTION_COLUMNS)
              .eq('daily_date', today)
              .gte('quality_score', QUALITY_FLOOR)
              .order('order_index', { ascending: true })
              .limit(100);

          if (error) {
              console.warn('[Trivia API] Database error:', error);
          }

          let questions = rosterRows || [];
          let rosterSource = 'daily_date';

          // No roster tagged for today — build one from the live pool.
          if (questions.length < ROSTER_SIZE) {
              const built = await buildRosterFromPool(supabase, today);
              if (built.length > questions.length) {
                  questions = built;
                  rosterSource = 'pool';
              }
          }

          // Blend, never discard: keep every real question and top up the
          // shortfall from the curated fallback set (date-seeded so degraded
          // days still differ from one another).
          let degraded = false;
          if (questions.length < ROSTER_SIZE) {
              degraded = true;
              const need = ROSTER_SIZE - questions.length;
              const filler = seededShuffle(FALLBACK_QUESTIONS, today).slice(0, need);
              questions = [...questions, ...filler];
              if (rosterSource === 'daily_date' && questions.length === filler.length) rosterSource = 'fallback';
              else rosterSource = `${rosterSource}+fallback`;
          }

          // Real user stats if Bearer JWT present.
          let userStats = { totalPlayed: 0, bestScore: 0, currentStreak: 0 };
          let hasPlayedToday = false;
          let todayScore = null;
          let seenCount = 0;
          const authHeader = req.headers.authorization;
          if (authHeader?.startsWith('Bearer ')) {
              try {
                  // Resolve identity through the shared server-auth helper so
                  // the session-cookie fallback keeps working alongside the
                  // bearer token (devhead change, preserved here).
                  const { user: authUser } = await getServerUserWithFallback(req, supabase);
                  const userId = authUser?.id;
                  if (userId) {
                      // daily_trivia_plays has NO score column (id, user_id,
                      // trivia_question_id, played_date, was_correct,
                      // streak_at_time, created_at). Selecting `score` made the
                      // whole query error out, so hasPlayedToday was always
                      // false for every user. Score comes from trivia_scores.
                      const [{ data: todayPlay }, { data: todayScoreRow }, { data: streak }] = await Promise.all([
                          supabase
                              .from('daily_trivia_plays')
                              .select('id, was_correct, streak_at_time')
                              .eq('user_id', userId)
                              .eq('played_date', today)
                              .maybeSingle(),
                          supabase
                              .from('trivia_scores')
                              .select('score')
                              .eq('user_id', userId)
                              .eq('mode', 'daily')
                              .eq('play_date', today)
                              .order('score', { ascending: false })
                              .limit(1)
                              .maybeSingle(),
                          supabase
                              .from('trivia_streaks')
                              .select('current_streak, best_streak, total_games_played, total_correct')
                              .eq('user_id', userId)
                              .maybeSingle(),
                      ]);

                      hasPlayedToday = !!todayPlay || !!todayScoreRow;
                      todayScore = todayScoreRow?.score ?? null;

                      if (streak) {
                          userStats = {
                              totalPlayed: streak.total_games_played || 0,
                              bestScore: streak.best_streak || 0,
                              currentStreak: streak.current_streak || 0,
                              totalCorrect: streak.total_correct || 0
                          };
                      }

                      // How much of today's roster has this player already
                      // seen in ANY mode inside the no-repeat window? Surfaced
                      // so a broken guarantee is visible rather than silent.
                      const seenIds = new Set(await getRecentlySeenIds(supabase, userId));
                      seenCount = questions.filter(q => seenIds.has(q.id)).length;

                      // Record the served roster so other modes exclude it.
                      // Fire-and-forget: never block the response on it.
                      recordQuestionsSeen(
                          supabase,
                          userId,
                          questions.filter(q => typeof q.id === 'string' && q.id.length > 20),
                          'daily'
                      ).catch(e => console.warn('[Trivia API] history record failed:', e?.message || e));
                  }
              } catch (e) {
                  console.warn('[Trivia API] auth/stats lookup failed:', e?.message || e);
                  // Fall through with default zero-stats — non-fatal
              }
          }

          // Today's leaderboard, scoped to the daily mode and deduped per user
          // (one player with several submissions used to occupy all 10 slots,
          // and survival-scale scores used to sit alongside daily scores).
          const { data: leaderboardRows } = await supabase
              .from('trivia_scores')
              .select('username, score')
              .eq('play_date', today)
              .eq('mode', 'daily')
              .order('score', { ascending: false })
              .limit(50);

          const bestByUser = new Map();
          for (const row of leaderboardRows || []) {
              const name = row?.username || 'Player';
              const prev = bestByUser.get(name);
              if (!prev || (row.score || 0) > prev.score) bestByUser.set(name, { username: name, score: row.score || 0 });
          }
          const leaderboard = [...bestByUser.values()].sort((a, b) => b.score - a.score).slice(0, 10);

          // CRITICAL: do not s-maxage cache personalized data. Drop CDN cache when auth header was used.
          if (!authHeader) {
              res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
          } else {
              res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
          }
          return res.status(200).json({
              success: true,
              date: today,
              questions,
              rosterSource,
              degraded,
              repeatsInRoster: seenCount,
              hasPlayedToday,
              todayScore,
              leaderboard,
              userStats
          });

      } catch (error) {
          console.warn('[Trivia API] Error:', error);
          // Make outages visible instead of masking them as a healthy 200.
          try { reportApiError(error, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }

          return res.status(200).json({
              success: true,
              degraded: true,
              date: today,
              rosterSource: 'fallback',
              questions: seededShuffle(FALLBACK_QUESTIONS, today).slice(0, ROSTER_SIZE),
              hasPlayedToday: false,
              todayScore: null,
              leaderboard: [],
              userStats: { totalPlayed: 0, bestScore: 0, currentStreak: 0 }
          });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
