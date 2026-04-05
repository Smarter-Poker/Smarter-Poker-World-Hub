-- Fix: Ensure all referral/crew tables, indexes, RLS policies, and triggers exist
-- This migration is idempotent — safe to run multiple times

-- ==============================================================================
-- 1. ENSURE TABLES EXIST
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.referrals (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    referrer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    referee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    referral_code_used VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
    reward_claimed_referrer BOOLEAN DEFAULT false,
    reward_claimed_referee BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public.crews (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    avatar_url TEXT,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    crew_code VARCHAR(20) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.crew_members (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    crew_id UUID REFERENCES public.crews(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(crew_id, user_id)
);

-- ==============================================================================
-- 2. ENSURE INDEXES EXIST (idempotent)
-- ==============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_referee ON public.referrals(referee_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_crews_owner ON public.crews(owner_id);
CREATE INDEX IF NOT EXISTS idx_crews_code ON public.crews(crew_code);
CREATE INDEX IF NOT EXISTS idx_crew_members_crew ON public.crew_members(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_members_user ON public.crew_members(user_id);

-- ==============================================================================
-- 3. ENABLE RLS ON ALL TABLES
-- ==============================================================================
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_members ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 4. RLS POLICIES (DROP IF EXISTS + CREATE to be idempotent)
-- ==============================================================================

-- referrals policies
DROP POLICY IF EXISTS "Users can view their own referrals (as referrer or referee)" ON public.referrals;
CREATE POLICY "Users can view their own referrals (as referrer or referee)"
    ON public.referrals FOR SELECT
    USING (auth.uid() = referrer_id OR auth.uid() = referee_id);

DROP POLICY IF EXISTS "Users can insert referrals where they are the referee" ON public.referrals;
CREATE POLICY "Users can insert referrals where they are the referee"
    ON public.referrals FOR INSERT
    WITH CHECK (auth.uid() = referee_id);

DROP POLICY IF EXISTS "Admins can update referrals" ON public.referrals;
CREATE POLICY "Admins can update referrals"
    ON public.referrals FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
    ));

-- crews policies
DROP POLICY IF EXISTS "Anyone can view crews" ON public.crews;
CREATE POLICY "Anyone can view crews"
    ON public.crews FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Authenticated users can create crews" ON public.crews;
CREATE POLICY "Authenticated users can create crews"
    ON public.crews FOR INSERT
    WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = owner_id);

DROP POLICY IF EXISTS "Crew owners can update their crews" ON public.crews;
CREATE POLICY "Crew owners can update their crews"
    ON public.crews FOR UPDATE
    USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Crew owners can delete their crews" ON public.crews;
CREATE POLICY "Crew owners can delete their crews"
    ON public.crews FOR DELETE
    USING (auth.uid() = owner_id);

-- crew_members policies
DROP POLICY IF EXISTS "Anyone can view crew members" ON public.crew_members;
CREATE POLICY "Anyone can view crew members"
    ON public.crew_members FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Authenticated users can join crews" ON public.crew_members;
CREATE POLICY "Authenticated users can join crews"
    ON public.crew_members FOR INSERT
    WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Crew admins or self can manage membership" ON public.crew_members;
CREATE POLICY "Crew admins or self can manage membership"
    ON public.crew_members FOR DELETE
    USING (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM public.crew_members cm 
            WHERE cm.crew_id = public.crew_members.crew_id 
            AND cm.user_id = auth.uid() 
            AND cm.role IN ('owner', 'admin')
        )
    );

DROP POLICY IF EXISTS "Crew admins can update roles" ON public.crew_members;
CREATE POLICY "Crew admins can update roles"
    ON public.crew_members FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.crew_members cm 
            WHERE cm.crew_id = public.crew_members.crew_id 
            AND cm.user_id = auth.uid() 
            AND cm.role IN ('owner', 'admin')
        )
    );

-- ==============================================================================
-- 5. PROFILES referral_code column & trigger
-- ==============================================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE;

CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TRIGGER AS $$
DECLARE
    new_code VARCHAR(20);
    is_unique BOOLEAN := false;
BEGIN
    IF NEW.referral_code IS NULL THEN
        WHILE NOT is_unique LOOP
            new_code := 'SP-' || SUBSTRING(MD5(RANDOM()::TEXT), 1, 6);
            PERFORM 1 FROM public.profiles WHERE referral_code = new_code;
            IF NOT FOUND THEN
                is_unique := true;
            END IF;
        END LOOP;
        NEW.referral_code := UPPER(new_code);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_generate_referral_code ON public.profiles;
CREATE TRIGGER tr_generate_referral_code
    BEFORE INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION generate_referral_code();
