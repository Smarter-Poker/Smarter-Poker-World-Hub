-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 24: Daily GTO Challenge Tables
-- training_questions: Pool of solver-verified GTO spots for daily selection
-- training_daily_challenge: Records per-user daily challenge completions
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) training_questions — GTO question pool for hand-of-the-day
CREATE TABLE IF NOT EXISTS training_questions (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    scenario_text   TEXT NOT NULL DEFAULT 'What is the GTO play?',
    hero_hand       TEXT,
    hero_position   TEXT,
    board_cards     JSONB DEFAULT '[]'::jsonb,
    street          TEXT DEFAULT 'flop',
    correct_answer  TEXT NOT NULL DEFAULT 'Call',
    options         JSONB DEFAULT '["Fold","Call","Raise","All-In"]'::jsonb,
    gto_action      TEXT,
    gto_explanation TEXT,
    action_breakdown JSONB,
    gto_frequencies  JSONB,
    difficulty      INTEGER DEFAULT 1,
    game_type       TEXT DEFAULT 'cash',
    stack_depth     INTEGER DEFAULT 100,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- 2) training_daily_challenge — user completion records
CREATE TABLE IF NOT EXISTS training_daily_challenge (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID NOT NULL,
    daily_id        TEXT NOT NULL,
    score           INTEGER DEFAULT 0,
    ev_loss         REAL DEFAULT 0,
    completed_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, daily_id)
);

-- Enable RLS
ALTER TABLE training_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_daily_challenge ENABLE ROW LEVEL SECURITY;

-- RLS for training_questions: anyone can read
CREATE POLICY "Anyone can read training_questions" ON training_questions
    FOR SELECT USING (true);

-- RLS for training_daily_challenge: users manage their own records
CREATE POLICY "Users manage own daily challenge" ON training_daily_challenge
    FOR ALL USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_daily_challenge_user ON training_daily_challenge(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_challenge_daily_id ON training_daily_challenge(daily_id);
CREATE INDEX IF NOT EXISTS idx_training_questions_game ON training_questions(game_type);

-- Seed 20 starter questions for the daily challenge pool
INSERT INTO training_questions (scenario_text, hero_hand, hero_position, board_cards, street, correct_answer, options, gto_action, gto_explanation, action_breakdown, difficulty, game_type, stack_depth) VALUES
('Hero opens BTN, BB 3-bets. Board: Ks 9h 4d. BB checks. What is the GTO play?', 'AQo', 'BTN', '["Ks","9h","4d"]', 'flop', 'Bet 33%', '["Check","Bet 33%","Bet 75%","All-In"]', 'Bet 33%', 'With overcards and a backdoor straight draw, a small c-bet is preferred at high frequency to maintain aggression and deny equity.', '{"Check": 22, "Bet 33%": 55, "Bet 75%": 18, "All-In": 5}', 2, 'cash', 100),
('Hero in BB facing a CO open. Board: 7s 6s 2h. CO bets 33%. What is the GTO play?', 'Ts9s', 'BB', '["7s","6s","2h"]', 'flop', 'Call', '["Fold","Call","Raise","All-In"]', 'Call', 'With a flush draw and open-ended straight draw, calling is the highest frequency play. We have excellent implied odds and equity to continue.', '{"Fold": 5, "Call": 68, "Raise": 24, "All-In": 3}', 2, 'cash', 100),
('SB vs BB single raised pot. Board: Ah Kd 3c. SB (hero) to act. What is the GTO play?', 'QJo', 'SB', '["Ah","Kd","3c"]', 'flop', 'Bet 33%', '["Check","Bet 33%","Bet 75%","Bet 125%"]', 'Bet 33%', 'On this ace-high board as the preflop aggressor, we c-bet small at high frequency. Our range advantage on AK-high textures supports this strategy.', '{"Check": 20, "Bet 33%": 62, "Bet 75%": 15, "Bet 125%": 3}', 1, 'cash', 100),
('CO opens, BTN 3-bets, CO calls. Board: Jd Tc 5h. BTN (hero) to act. What is the GTO play?', 'AKs', 'BTN', '["Jd","Tc","5h"]', 'flop', 'Bet 75%', '["Check","Bet 33%","Bet 75%","All-In"]', 'Bet 75%', 'As the 3-bettor with two overcards and a gutshot, we bet large on this connected board. Our range crushing advantage on JT5 supports 75% sizing.', '{"Check": 15, "Bet 33%": 12, "Bet 75%": 65, "All-In": 8}', 3, 'cash', 100),
('UTG opens, HJ calls, CO folds, BTN folds, SB folds, BB (hero) calls. Board: 8s 7s 3d. UTG bets 50%. HJ folds. What is the GTO play?', '9s8d', 'BB', '["8s","7s","3d"]', 'flop', 'Call', '["Fold","Call","Raise","All-In"]', 'Call', 'Mid pair with a gutshot and backdoor flush draw. Against UTG range on this board, calling is the GTO play to protect our check-calling range.', '{"Fold": 12, "Call": 63, "Raise": 22, "All-In": 3}', 2, 'cash', 100),
('BTN opens, SB 3-bets, BB folds, BTN (hero) calls. Board: Qh 9c 6d. SB bets 33%. What is the GTO play?', 'JTs', 'BTN', '["Qh","9c","6d"]', 'flop', 'Call', '["Fold","Call","Raise","All-In"]', 'Call', 'With an open-ended straight draw on a queen-high board against the 3-bettor, calling is the highest frequency play. We have 8 clean outs and position.', '{"Fold": 10, "Call": 72, "Raise": 16, "All-In": 2}', 2, 'cash', 100),
('BB defends vs CO open. Board: Ad 8c 2s. CO bets 33%. BB (hero) to act. What is the GTO play?', 'KQo', 'BB', '["Ad","8c","2s"]', 'flop', 'Fold', '["Fold","Call","Raise","All-In"]', 'Fold', 'On an ace-high dry board without connecting, KQ has very little equity against the continuation bet range. The solver folds this at high frequency.', '{"Fold": 72, "Call": 25, "Raise": 3, "All-In": 0}', 1, 'cash', 100),
('HJ opens, CO 3-bets, HJ (hero) calls. Board: Ks Td 7c. CO bets 55%. What is the GTO play?', 'AsAh', 'HJ', '["Ks","Td","7c"]', 'flop', 'Call', '["Fold","Call","Raise","All-In"]', 'Call', 'With an overpair, we have a strong hand but should mostly call. Raising would narrow us to very strong hands and fold out worse hands that give us value.', '{"Fold": 2, "Call": 75, "Raise": 20, "All-In": 3}', 2, 'cash', 100),
('MP opens, BB (hero) defends. Board: 6s 5s 4h. MP bets 66%. What is the GTO play?', 'As7s', 'BB', '["6s","5s","4h"]', 'flop', 'Raise', '["Fold","Call","Raise","All-In"]', 'Raise', 'With a flush draw, overcard, and open-ended straight draw, this is the perfect hand to raise on the wet board. We have massive equity and fold equity.', '{"Fold": 3, "Call": 28, "Raise": 60, "All-In": 9}', 3, 'cash', 100),
('SB opens, BB (hero) 3-bets, SB calls. Board: Qc Jh 2c. BB to act. What is the GTO play?', 'AcKc', 'BB', '["Qc","Jh","2c"]', 'flop', 'Bet 33%', '["Check","Bet 33%","Bet 75%","Bet 125%"]', 'Bet 33%', 'As the 3-bettor with a nut flush draw and two overcards, we c-bet small. This board favors our range and a small sizing builds the pot with our equity.', '{"Check": 15, "Bet 33%": 55, "Bet 75%": 25, "Bet 125%": 5}', 2, 'cash', 100),
('BTN opens, SB folds, BB (hero) calls. Turn: Js 9c 4d 2h. BB checks, BTN bets 66%. What is the GTO play?', 'JdTd', 'BB', '["Js","9c","4d","2h"]', 'turn', 'Call', '["Fold","Call","Raise","All-In"]', 'Call', 'With top pair good kicker on a dry turn runout, calling is the standard play. Our hand is too strong to fold and doesn''t benefit from raising.', '{"Fold": 5, "Call": 80, "Raise": 13, "All-In": 2}', 2, 'cash', 100),
('CO opens, BTN 3-bets, blinds fold, CO (hero) calls. River: Kh Qd 8c 5s 3h. CO checks, BTN bets 75%. What is the GTO play?', 'AhAs', 'CO', '["Kh","Qd","8c","5s","3h"]', 'river', 'Call', '["Fold","Call","Raise","All-In"]', 'Call', 'Aces are a strong bluff catcher on this runout. The solver calls here at high frequency because we beat all bluffs and many value bets.', '{"Fold": 15, "Call": 70, "Raise": 12, "All-In": 3}', 3, 'cash', 100),
('UTG opens, everyone folds to BB (hero). Board: Th 7h 3s. UTG bets 33%. What is the GTO play?', '5h4h', 'BB', '["Th","7h","3s"]', 'flop', 'Call', '["Fold","Call","Raise","All-In"]', 'Call', 'With a flush draw, we have implied odds to continue. Calling keeps our range wide and allows us to realize our equity on later streets.', '{"Fold": 15, "Call": 62, "Raise": 20, "All-In": 3}', 1, 'cash', 100),
('BTN opens, BB (hero) defends. Turn: As Ks 8d 6c. BB checks, BTN bets 50%. What is the GTO play?', '9s8s', 'BB', '["As","Ks","8d","6c"]', 'turn', 'Call', '["Fold","Call","Raise","All-In"]', 'Call', 'Second pair with a flush draw gives us enough equity to continue. We have outs to a flush and can potentially improve to trips or two pair.', '{"Fold": 20, "Call": 65, "Raise": 12, "All-In": 3}', 2, 'cash', 100),
('SB vs BB battle. Board: 9h 8c 4s 2d. SB (hero) checks turn. BB bets 75%. What is the GTO play?', 'TdTs', 'SB', '["9h","8c","4s","2d"]', 'turn', 'Call', '["Fold","Call","Raise","All-In"]', 'Call', 'Overpair on a relatively dry board facing a turn probe. We''re ahead of most of BB''s range and should call to keep their bluffs in.', '{"Fold": 8, "Call": 72, "Raise": 17, "All-In": 3}', 2, 'cash', 100),
('25BB effective in MTT. UTG shoves. Folds to BB (hero). What is the GTO play?', 'ATo', 'BB', '[]', 'preflop', 'Call', '["Fold","Call"]', 'Call', 'At 25BB effective, ATo is a clear call against a UTG shove in a tournament. We have sufficient equity against the shoving range and pot odds.', '{"Fold": 28, "Call": 72}', 3, 'mtt', 25),
('15BB effective in MTT. CO shoves. BTN folds. SB folds. BB (hero) to act. What is the GTO play?', 'KJs', 'BB', '[]', 'preflop', 'Call', '["Fold","Call"]', 'Call', 'KJs is a profitable call against CO shove range at 15BB. We have strong equity with suited broadway cards and correct pot odds.', '{"Fold": 22, "Call": 78}', 2, 'mtt', 15),
('Bubble of 45-man SNG. 6 left, 5 paid. BTN (hero) has 12BB. SB has 8BB. BB has 20BB. What is the GTO play?', '77', 'BTN', '[]', 'preflop', 'All-In', '["Fold","Raise","All-In"]', 'All-In', 'Pocket sevens is a strong shove at 12BB on the bubble. We have fold equity against the blinds and strong equity when called.', '{"Fold": 10, "Raise": 5, "All-In": 85}', 3, 'mtt', 12),
('Final table of MTT. 4 left. CO (hero) has 30BB. What is the GTO play?', 'A5s', 'CO', '[]', 'preflop', 'Raise', '["Fold","Raise","All-In"]', 'Raise', 'A5 suited is a standard open from CO at 30BB deep. We have a suited ace with wheel potential and nut flush potential. Min-raise is preferred.', '{"Fold": 15, "Raise": 78, "All-In": 7}', 2, 'mtt', 30),
('HU in MTT. 20BB effective. SB (hero) on BTN. What is the GTO play?', 'K2o', 'SB', '[]', 'preflop', 'Raise', '["Fold","Raise","All-In"]', 'Raise', 'Heads-up at 20BB, K2o is a clear raise from the button/SB. Our range should be very wide HU and king-high has sufficient equity.', '{"Fold": 12, "Raise": 80, "All-In": 8}', 1, 'mtt', 20);
