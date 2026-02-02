-- ═══════════════════════════════════════════════════════════════════════════
-- 💎 MEMORY MATRIX - ELO RATING COLUMN
-- Add memory_elo column to profiles table
-- ═══════════════════════════════════════════════════════════════════════════

-- Add ELO column to profiles if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'memory_elo'
    ) THEN
        ALTER TABLE profiles ADD COLUMN memory_elo INTEGER DEFAULT 1200;
    END IF;
END $$;

-- Create index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_profiles_memory_elo ON profiles(memory_elo DESC);

-- Create view for ELO leaderboard
CREATE OR REPLACE VIEW memory_elo_leaderboard AS
SELECT 
    p.id,
    p.username,
    p.avatar_url,
    p.memory_elo,
    CASE 
        WHEN p.memory_elo >= 2000 THEN 'GTO Master'
        WHEN p.memory_elo >= 1800 THEN 'Diamond'
        WHEN p.memory_elo >= 1600 THEN 'Platinum'
        WHEN p.memory_elo >= 1400 THEN 'Gold'
        WHEN p.memory_elo >= 1200 THEN 'Silver'
        WHEN p.memory_elo >= 1000 THEN 'Bronze'
        ELSE 'Novice'
    END as rank_title,
    RANK() OVER (ORDER BY p.memory_elo DESC) as global_rank
FROM profiles p
WHERE p.memory_elo IS NOT NULL
ORDER BY p.memory_elo DESC;

-- Grant access to the view
GRANT SELECT ON memory_elo_leaderboard TO authenticated;
GRANT SELECT ON memory_elo_leaderboard TO anon;
