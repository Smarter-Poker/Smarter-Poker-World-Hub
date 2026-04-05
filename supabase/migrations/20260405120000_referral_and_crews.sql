-- Migration: Tier 4.2 Viral Growth (Referrals & Crews)
-- Date: 2026-04-05

-- ==============================================================================
-- 1. REFERRALS TABLE
-- Tracks the viral loop of users inviting other users
-- ==============================================================================
DROP TABLE IF EXISTS public.referrals CASCADE;
DROP TABLE IF EXISTS public.crews CASCADE;
CREATE TABLE IF NOT EXISTS public.referrals (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    referrer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    referee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE, -- A user can only be referred once
    referral_code_used VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
    reward_claimed_referrer BOOLEAN DEFAULT false,
    reward_claimed_referee BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX idx_referrals_referee ON public.referrals(referee_id);
CREATE INDEX idx_referrals_referrer ON public.referrals(referrer_id);

-- Enable RLS for referrals
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own referrals (as referrer or referee)"
    ON public.referrals FOR SELECT
    USING (auth.uid() = referrer_id OR auth.uid() = referee_id);

CREATE POLICY "Users can insert referrals where they are the referee"
    ON public.referrals FOR INSERT
    WITH CHECK (auth.uid() = referee_id);

-- Admins/Server-side can update status to 'completed'
CREATE POLICY "Admins can update referrals"
    ON public.referrals FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
    ));

-- ==============================================================================
-- 2. CREWS TABLE
-- Tracks groups of friends/players (Leaderboards, Group Chats)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.crews (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    avatar_url TEXT,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    crew_code VARCHAR(20) UNIQUE NOT NULL, -- Used for inviting members
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_crews_owner ON public.crews(owner_id);
CREATE INDEX idx_crews_code ON public.crews(crew_code);

-- Enable RLS for crews
ALTER TABLE public.crews ENABLE ROW LEVEL SECURITY;

-- Anyone can see basic crew info
CREATE POLICY "Anyone can view crews"
    ON public.crews FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can create crews"
    ON public.crews FOR INSERT
    WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = owner_id);

CREATE POLICY "Crew owners can update their crews"
    ON public.crews FOR UPDATE
    USING (auth.uid() = owner_id);

CREATE POLICY "Crew owners can delete their crews"
    ON public.crews FOR DELETE
    USING (auth.uid() = owner_id);

-- ==============================================================================
-- 3. CREW MEMBERS TABLE
-- Maps users to crews with roles
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.crew_members (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    crew_id UUID REFERENCES public.crews(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(crew_id, user_id) -- A user can only be in a specific crew once
);

CREATE INDEX idx_crew_members_crew ON public.crew_members(crew_id);
CREATE INDEX idx_crew_members_user ON public.crew_members(user_id);

-- Enable RLS
ALTER TABLE public.crew_members ENABLE ROW LEVEL SECURITY;

-- Anyone can see who is in a crew
CREATE POLICY "Anyone can view crew members"
    ON public.crew_members FOR SELECT
    USING (true);

-- Users can join a crew
CREATE POLICY "Authenticated users can join crews"
    ON public.crew_members FOR INSERT
    WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

-- Crew admins/owners can update roles or remove members; users can remove themselves (leave crew)
CREATE POLICY "Crew admins or self can manage membership"
    ON public.crew_members FOR DELETE
    USING (
        auth.uid() = user_id -- self
        OR EXISTS (
            SELECT 1 FROM public.crew_members cm 
            WHERE cm.crew_id = public.crew_members.crew_id 
            AND cm.user_id = auth.uid() 
            AND cm.role IN ('owner', 'admin')
        )
    );

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
-- 4. PROFILES EXTENSION
-- Add personal referral code to profiles
-- ==============================================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE;

-- We need a function to automatically generate a referral code when a user is created
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TRIGGER AS $$
DECLARE
    new_code VARCHAR(20);
    is_unique BOOLEAN := false;
BEGIN
    -- Only generate if it doesn't have one
    IF NEW.referral_code IS NULL THEN
        WHILE NOT is_unique LOOP
            -- Generate a random 8-character alphanumeric string (e.g. SP-A8F2K4)
            new_code := 'SP-' || SUBSTRING(MD5(RANDOM()::TEXT), 1, 6);
            
            -- Check uniqueness
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

-- Trigger to auto-generate referral code on profile creation
DROP TRIGGER IF EXISTS tr_generate_referral_code ON public.profiles;
CREATE TRIGGER tr_generate_referral_code
    BEFORE INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION generate_referral_code();
