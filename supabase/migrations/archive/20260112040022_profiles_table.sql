-- ═══════════════════════════════════════════════════════════════════════════
-- PROFILES TABLE — Core user identity storage
-- ═══════════════════════════════════════════════════════════════════════════

-- Create profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    city TEXT,
    state TEXT,
    username TEXT UNIQUE,
    xp_total INTEGER DEFAULT 0,
    diamonds INTEGER DEFAULT 0,
    diamond_multiplier DECIMAL(3,2) DEFAULT 1.00,
    streak_days INTEGER DEFAULT 0,
    skill_tier TEXT DEFAULT 'Newcomer',
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on username for fast lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

-- Policy: Users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Policy: Users can insert their own profile
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Policy: Allow public read for username availability check
DROP POLICY IF EXISTS "Public can check username availability" ON public.profiles;
CREATE POLICY "Public can check username availability" ON public.profiles
    FOR SELECT USING (true);

-- Grant access
GRANT ALL ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
