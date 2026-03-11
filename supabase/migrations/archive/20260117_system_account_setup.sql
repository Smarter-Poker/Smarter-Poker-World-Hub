-- ═══════════════════════════════════════════════════════════════════════════
-- SYSTEM ACCOUNT SETUP — Smarter.Poker Official Account
-- Creates the official system account for automated daily content injection
-- ═══════════════════════════════════════════════════════════════════════════

-- Define the system account UUID (fixed for consistency)
DO $$
DECLARE
    v_system_uuid UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
    -- Insert the Smarter.Poker system account into profiles
    -- Use INSERT ... ON CONFLICT to make this migration idempotent
    INSERT INTO profiles (
        id,
        username,
        full_name,
        email,
        xp_total,
        diamonds,
        skill_tier,
        email_verified,
        created_at,
        updated_at
    ) VALUES (
        v_system_uuid,
        'smarter.poker',
        'Smarter.Poker',
        'system@smarter.poker',
        999999,  -- High XP to show authority
        0,
        'System',
        true,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        full_name = EXCLUDED.full_name,
        updated_at = NOW();

    RAISE NOTICE '✅ System account created/updated: %', v_system_uuid;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICY UPDATE — Allow service role to post as system account
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop existing insert policy and recreate with system account support
DROP POLICY IF EXISTS "Users can create their own posts" ON social_posts;

-- New policy: Users can create their own posts OR service role can create system posts
CREATE POLICY "Users can create their own posts"
    ON social_posts
    FOR INSERT
    WITH CHECK (
        -- Normal users can only create posts as themselves
        author_id = auth.uid()
        OR
        -- Service role can create posts for the system account
        (
            auth.jwt() ->> 'role' = 'service_role'
            AND author_id = '00000000-0000-0000-0000-000000000001'::UUID
        )
    );

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_system_uuid UUID := '00000000-0000-0000-0000-000000000001';
    v_username TEXT;
BEGIN
    -- Verify system account exists
    SELECT username INTO v_username
    FROM profiles
    WHERE id = v_system_uuid;

    IF v_username IS NULL THEN
        RAISE EXCEPTION '❌ System account not found!';
    ELSE
        RAISE NOTICE '✅ System account verified: % (UUID: %)', v_username, v_system_uuid;
    END IF;

    -- Verify RLS policy exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'social_posts' 
        AND policyname = 'Users can create their own posts'
    ) THEN
        RAISE EXCEPTION '❌ RLS policy not found!';
    ELSE
        RAISE NOTICE '✅ RLS policy verified for social_posts';
    END IF;
END;
$$;
