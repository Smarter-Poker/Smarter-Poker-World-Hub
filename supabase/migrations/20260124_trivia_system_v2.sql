-- ═══════════════════════════════════════════════════════════════════════════
-- TRIVIA SYSTEM V2 - Complete AI-Powered Poker Trivia
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop old tables if they exist (for clean migration)
DROP TABLE IF EXISTS trivia_streaks CASCADE;
DROP TABLE IF EXISTS trivia_scores CASCADE;
DROP TABLE IF EXISTS daily_trivia_plays CASCADE;
DROP TABLE IF EXISTS trivia_questions CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIVIA QUESTIONS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE trivia_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL CHECK (category IN (
        'poker_history',
        'famous_hands',
        'gto_theory',
        'player_profiles',
        'tournament_facts',
        'rule_knowledge'
    )),
    difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    question TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_index INTEGER NOT NULL CHECK (correct_index >= 0 AND correct_index <= 3),
    explanation TEXT,
    daily_date DATE,
    order_index INTEGER DEFAULT 0,
    times_shown INTEGER DEFAULT 0,
    times_correct INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trivia_questions_daily_date ON trivia_questions(daily_date);
CREATE INDEX idx_trivia_questions_category ON trivia_questions(category);
CREATE INDEX idx_trivia_questions_difficulty ON trivia_questions(difficulty);

-- ═══════════════════════════════════════════════════════════════════════════
-- DAILY TRIVIA PLAYS - Track one play per user per day
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE daily_trivia_plays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    trivia_question_id UUID REFERENCES trivia_questions(id) ON DELETE SET NULL,
    played_date DATE NOT NULL,
    was_correct BOOLEAN NOT NULL DEFAULT false,
    streak_at_time INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, played_date)
);

CREATE INDEX idx_daily_trivia_plays_user ON daily_trivia_plays(user_id);
CREATE INDEX idx_daily_trivia_plays_date ON daily_trivia_plays(played_date);

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIVIA SCORES - All trivia session results
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE trivia_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT,
    mode TEXT NOT NULL CHECK (mode IN ('daily', 'history', 'rules', 'pro', 'arcade')),
    score INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    total_questions INTEGER NOT NULL DEFAULT 10,
    time_spent INTEGER DEFAULT 0,
    xp_earned INTEGER NOT NULL DEFAULT 0,
    diamonds_earned INTEGER NOT NULL DEFAULT 0,
    play_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trivia_scores_user ON trivia_scores(user_id);
CREATE INDEX idx_trivia_scores_mode ON trivia_scores(mode);
CREATE INDEX idx_trivia_scores_date ON trivia_scores(play_date);
CREATE INDEX idx_trivia_scores_leaderboard ON trivia_scores(mode, play_date, score DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIVIA STREAKS - Track user streaks
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE trivia_streaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    current_streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    last_play_date DATE,
    total_games_played INTEGER NOT NULL DEFAULT 0,
    total_correct INTEGER NOT NULL DEFAULT 0,
    total_xp_earned INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trivia_streaks_user ON trivia_streaks(user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE trivia_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_trivia_plays ENABLE ROW LEVEL SECURITY;
ALTER TABLE trivia_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE trivia_streaks ENABLE ROW LEVEL SECURITY;

-- Questions are readable by everyone
CREATE POLICY "Trivia questions are viewable by all"
    ON trivia_questions FOR SELECT USING (true);

-- Service role can manage questions
CREATE POLICY "Service role can manage trivia questions"
    ON trivia_questions FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Daily plays
CREATE POLICY "Users can view their own daily plays"
    ON daily_trivia_plays FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own daily plays"
    ON daily_trivia_plays FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage daily plays"
    ON daily_trivia_plays FOR ALL
    USING (auth.role() = 'service_role');

-- Scores - readable by all for leaderboard
CREATE POLICY "Trivia scores are viewable by all"
    ON trivia_scores FOR SELECT USING (true);

CREATE POLICY "Users can insert their own scores"
    ON trivia_scores FOR INSERT
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Service role can manage scores"
    ON trivia_scores FOR ALL
    USING (auth.role() = 'service_role');

-- Streaks
CREATE POLICY "Users can view their own streaks"
    ON trivia_streaks FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own streaks"
    ON trivia_streaks FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage streaks"
    ON trivia_streaks FOR ALL
    USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════
-- GRANTS
-- ═══════════════════════════════════════════════════════════════════════════

GRANT SELECT ON trivia_questions TO anon, authenticated;
GRANT SELECT, INSERT ON daily_trivia_plays TO authenticated;
GRANT SELECT, INSERT ON trivia_scores TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON trivia_streaks TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED INITIAL QUESTIONS
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO trivia_questions (category, difficulty, question, options, correct_index, explanation) VALUES
('poker_history', 'medium', 'In what year was the first World Series of Poker Main Event held?', '["1968", "1970", "1972", "1975"]', 1, 'The first WSOP was held in 1970 at Binion''s Horseshoe Casino in Las Vegas. Johnny Moss was voted champion by his peers.'),
('poker_history', 'hard', 'Who is credited with bringing Texas Hold''em to Las Vegas?', '["Doyle Brunson", "Johnny Moss", "Felton \"Corky\" McCorquodale", "Benny Binion"]', 2, 'Corky McCorquodale is credited with bringing Texas Hold''em from Texas to Las Vegas in 1963.'),
('poker_history', 'easy', 'What casino hosted the first WSOP?', '["Bellagio", "Caesars Palace", "Binion''s Horseshoe", "Golden Nugget"]', 2, 'The WSOP was founded at Binion''s Horseshoe Casino by Benny Binion in 1970.'),

('famous_hands', 'medium', 'What hand did Chris Moneymaker hold when he won the 2003 WSOP Main Event?', '["5-4 suited", "A-K suited", "Pocket Fives", "7-2 offsuit"]', 2, 'Chris Moneymaker held pocket fives and made a full house to beat Sam Farha''s top pair.'),
('famous_hands', 'medium', 'What is the "Dead Man''s Hand" in poker?', '["Pocket Kings", "Aces and Eights (black)", "Queen-Seven offsuit", "Two-Seven offsuit"]', 1, 'The Dead Man''s Hand is two pair of black aces and black eights, allegedly held by Wild Bill Hickok when shot.'),
('famous_hands', 'hard', 'In the famous 2005 WSOP Main Event, what hand did Joe Hachem win with?', '["7-3 offsuit", "K-Q suited", "Pocket Sevens", "A-J suited"]', 0, 'Joe Hachem won the 2005 WSOP Main Event with 7-3 offsuit, making a straight.'),

('player_profiles', 'easy', 'Which player holds the record for most WSOP bracelets?', '["Phil Ivey", "Doyle Brunson", "Phil Hellmuth", "Johnny Chan"]', 2, 'Phil Hellmuth holds the record with 17 WSOP bracelets.'),
('player_profiles', 'medium', 'Who wrote the influential poker book "Super/System"?', '["David Sklansky", "Doyle Brunson", "Dan Harrington", "Phil Gordon"]', 1, 'Doyle Brunson wrote Super/System in 1979, considered the first professional poker strategy guide.'),
('player_profiles', 'hard', 'Which female player has won the most WSOP bracelets?', '["Vanessa Selbst", "Jennifer Harman", "Kristen Bicknell", "Maria Ho"]', 0, 'Vanessa Selbst has won 3 WSOP bracelets, the most by any female player.'),

('gto_theory', 'medium', 'What does MDF stand for in GTO poker strategy?', '["Maximum Defense Frequency", "Minimum Defense Frequency", "Mean Defensive Fold", "Marginal Defense Factor"]', 1, 'MDF (Minimum Defense Frequency) tells you how often to call to prevent opponent from profitably bluffing.'),
('gto_theory', 'hard', 'In GTO, what is a "polarized" betting range?', '["A range of only medium-strength hands", "A range containing only value bets and bluffs", "A range weighted toward draws", "A range of only premium hands"]', 1, 'A polarized range contains only the strongest hands (value) and bluffs, with no medium-strength hands.'),
('gto_theory', 'medium', 'What percentage of the pot should you bet to make opponent indifferent between calling and folding with a bluff-catcher?', '["50%", "66%", "75%", "100%"]', 2, 'A 75% pot bet means opponent needs 43% equity to call, making them roughly indifferent with bluff-catchers.'),

('tournament_facts', 'easy', 'What is the buy-in for the WSOP Main Event?', '["$5,000", "$10,000", "$25,000", "$50,000"]', 1, 'The WSOP Main Event has had a $10,000 buy-in since its inception in 1970.'),
('tournament_facts', 'medium', 'What is the largest first-place prize ever awarded in a poker tournament?', '["$8.5 million", "$12 million", "$18.3 million", "$22 million"]', 2, 'Antonio Esfandiari won $18.3 million in the 2012 Big One for One Drop.'),
('tournament_facts', 'hard', 'In what year did the WSOP Main Event first exceed 1,000 players?', '["1991", "2000", "2003", "2006"]', 2, 'The 2003 WSOP Main Event had 839 players, but it first exceeded 1,000 in that year''s satellite era boom.'),

('rule_knowledge', 'easy', 'In Texas Hold''em, how many community cards are dealt in total?', '["3", "4", "5", "7"]', 2, 'Five community cards are dealt: 3 on the flop, 1 on the turn, and 1 on the river.'),
('rule_knowledge', 'medium', 'What happens if two players have identical hands in Texas Hold''em?', '["The player with position wins", "The pot is split equally", "There is a card-off", "The player who bet first wins"]', 1, 'When hands are identical, the pot is split equally (chopped) between the tied players.'),
('rule_knowledge', 'hard', 'In tournament poker, what is the "forward motion" rule?', '["Chips pushed forward are committed", "You must move chips forward to bet", "Cards dealt forward cannot be redrawn", "Forward players act first"]', 0, 'The forward motion rule states that once chips cross the betting line or are clearly pushed forward, they are committed to the pot.');
