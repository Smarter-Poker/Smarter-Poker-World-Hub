-- ═══════════════════════════════════════════════════════════════════════════
-- HORSE PROFILES — Register 100 AI personas as official users
-- Player Numbers: 101-200
-- ═══════════════════════════════════════════════════════════════════════════

-- First, modify the profiles table to allow bot users
-- Remove the foreign key constraint temporarily or add a separate bot_profiles table

-- Option: Create a separate bot_profiles table that mirrors profiles structure
CREATE TABLE IF NOT EXISTS public.bot_profiles (
    id TEXT PRIMARY KEY, -- horse-101, horse-102, etc.
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    player_number INTEGER UNIQUE NOT NULL,
    bio TEXT,
    location TEXT,
    specialty TEXT,
    stakes TEXT,
    voice TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    xp_total INTEGER DEFAULT 0,
    diamonds INTEGER DEFAULT 0,
    total_hands INTEGER DEFAULT 0,
    content_author_id INTEGER, -- Link to content_authors if needed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_bot_profiles_username ON public.bot_profiles(username);
CREATE INDEX IF NOT EXISTS idx_bot_profiles_player_number ON public.bot_profiles(player_number);

-- Enable RLS
ALTER TABLE public.bot_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read bot profiles
DROP POLICY IF EXISTS "Public can read bot profiles" ON public.bot_profiles;
CREATE POLICY "Public can read bot profiles" ON public.bot_profiles
    FOR SELECT USING (true);

-- Policy: Service role can manage bots
DROP POLICY IF EXISTS "Service can manage bots" ON public.bot_profiles;
CREATE POLICY "Service can manage bots" ON public.bot_profiles
    FOR ALL USING (true);

-- Grant access
GRANT SELECT ON public.bot_profiles TO anon;
GRANT SELECT ON public.bot_profiles TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- INSERT THE 100 HORSES
-- ═══════════════════════════════════════════════════════════════════════════

-- Insert horses from content_authors into bot_profiles
INSERT INTO public.bot_profiles (id, username, display_name, avatar_url, player_number, bio, location, specialty, stakes, voice, xp_total, total_hands, content_author_id)
SELECT 
    'horse-' || LPAD((ROW_NUMBER() OVER (ORDER BY ca.id) + 100)::TEXT, 3, '0') as id,
    ca.alias as username,
    ca.name as display_name,
    NULL as avatar_url,
    ROW_NUMBER() OVER (ORDER BY ca.id) + 100 as player_number,
    ca.bio,
    ca.location,
    ca.specialty,
    ca.stakes,
    ca.voice,
    FLOOR(RANDOM() * 5000 + 1000)::INTEGER as xp_total,
    FLOOR(RANDOM() * 50000 + 5000)::INTEGER as total_hands,
    ca.id as content_author_id
FROM content_authors ca
ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    bio = EXCLUDED.bio,
    location = EXCLUDED.location,
    specialty = EXCLUDED.specialty,
    stakes = EXCLUDED.stakes,
    voice = EXCLUDED.voice,
    updated_at = NOW();

-- Verify the insert
DO $$
DECLARE
    horse_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO horse_count FROM public.bot_profiles WHERE id LIKE 'horse-%';
    RAISE NOTICE '🐴 Registered % horses as official users (Player #101-#%)', horse_count, 100 + horse_count;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- CREATE UNIFIED VIEW FOR ALL USERS (real + bots)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.all_users AS
SELECT 
    id::TEXT as id,
    username,
    full_name as display_name,
    NULL as avatar_url,
    NULL::INTEGER as player_number,
    NULL as bio,
    city as location,
    NULL as specialty,
    NULL as stakes,
    FALSE as is_bot,
    xp_total,
    diamonds,
    created_at
FROM public.profiles
UNION ALL
SELECT 
    id,
    username,
    display_name,
    avatar_url,
    player_number,
    bio,
    location,
    specialty,
    stakes,
    TRUE as is_bot,
    xp_total,
    diamonds,
    created_at
FROM public.bot_profiles;

-- Grant access to the view
GRANT SELECT ON public.all_users TO anon;
GRANT SELECT ON public.all_users TO authenticated;
