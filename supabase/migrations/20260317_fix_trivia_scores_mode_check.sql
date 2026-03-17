-- ═══════════════════════════════════════════════════════════════════════════
-- Fix trivia_scores mode CHECK constraint — Add missing game modes
-- ═══════════════════════════════════════════════════════════════════════════
-- The original constraint only allowed: daily, history, rules, pro, arcade
-- But the app supports: mtt, cash, icm, gto, survival, endless, tournaments
-- Score INSERTs for the new modes silently fail with CHECK violation.
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop the restrictive constraint
ALTER TABLE trivia_scores DROP CONSTRAINT IF EXISTS trivia_scores_mode_check;

-- Recreate with all valid modes
ALTER TABLE trivia_scores ADD CONSTRAINT trivia_scores_mode_check 
    CHECK (mode IN (
        'daily', 'history', 'rules', 'pro', 'arcade',
        'mtt', 'cash', 'icm', 'gto',
        'survival', 'endless', 'tournaments'
    ));

-- ═══════════════════════════════════════════════════════════════════════════
-- Fix trivia_questions category CHECK — Add missing categories
-- ═══════════════════════════════════════════════════════════════════════════
-- The original constraint only allowed 6 categories but the app now
-- uses mtt_situations, cash_game_situations, icm_chip_ev, gto_scenarios.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE trivia_questions DROP CONSTRAINT IF EXISTS trivia_questions_category_check;

ALTER TABLE trivia_questions ADD CONSTRAINT trivia_questions_category_check 
    CHECK (category IN (
        'poker_history', 'famous_hands', 'gto_theory',
        'player_profiles', 'tournament_facts', 'rule_knowledge',
        'mtt_situations', 'cash_game_situations', 'icm_chip_ev', 'gto_scenarios'
    ));
