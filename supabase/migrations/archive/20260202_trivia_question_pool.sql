-- Trivia Question Pool Enhancement Migration
-- Adds columns for better question tracking and 60-day reuse logic

-- Add tracking columns to trivia_questions if they don't exist
ALTER TABLE trivia_questions 
ADD COLUMN IF NOT EXISTS subcategory TEXT,
ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS use_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS quality_score INTEGER DEFAULT 5;

-- Index for efficient 60-day exclusion queries
CREATE INDEX IF NOT EXISTS idx_trivia_questions_last_used 
ON trivia_questions(last_used_at) 
WHERE last_used_at IS NOT NULL;

-- Index for category + difficulty filtering (common query pattern)
CREATE INDEX IF NOT EXISTS idx_trivia_questions_cat_diff 
ON trivia_questions(category, difficulty);

-- Function to update question usage
CREATE OR REPLACE FUNCTION update_question_usage()
RETURNS TRIGGER AS $$
BEGIN
    -- When a question is added to history, update the question's last_used_at
    UPDATE trivia_questions
    SET 
        last_used_at = NEW.seen_at,
        use_count = COALESCE(use_count, 0) + 1
    WHERE id = NEW.question_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update question usage when history is recorded
DROP TRIGGER IF EXISTS trigger_update_question_usage ON trivia_user_question_history;
CREATE TRIGGER trigger_update_question_usage
AFTER INSERT ON trivia_user_question_history
FOR EACH ROW
EXECUTE FUNCTION update_question_usage();

-- View for question pool statistics
CREATE OR REPLACE VIEW trivia_question_pool_stats AS
SELECT 
    category,
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE difficulty = 'easy') as easy_count,
    COUNT(*) FILTER (WHERE difficulty = 'medium') as medium_count,
    COUNT(*) FILTER (WHERE difficulty = 'hard') as hard_count,
    COUNT(*) FILTER (WHERE last_used_at IS NULL) as never_used,
    COUNT(*) FILTER (WHERE last_used_at > NOW() - INTERVAL '60 days') as used_recently,
    COUNT(*) FILTER (WHERE last_used_at IS NULL OR last_used_at <= NOW() - INTERVAL '60 days') as available_now
FROM trivia_questions
GROUP BY category
ORDER BY category;

COMMENT ON TABLE trivia_questions IS 'Trivia question pool with 60-day reuse cycle. Target: 3000 questions per category.';
