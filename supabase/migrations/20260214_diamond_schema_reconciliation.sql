-- ═══════════════════════════════════════════════════════════════════════════
-- Diamond Transactions Schema Reconciliation
-- Ensures diamond_transactions has ALL columns from both migration paths.
-- Safe to run on any existing schema state (uses IF NOT EXISTS checks).
-- ═══════════════════════════════════════════════════════════════════════════

-- Add VIP system columns if they don't exist (original schema only has type/source)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'diamond_transactions' AND column_name = 'transaction_type') THEN
        ALTER TABLE diamond_transactions ADD COLUMN transaction_type TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'diamond_transactions' AND column_name = 'description') THEN
        ALTER TABLE diamond_transactions ADD COLUMN description TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'diamond_transactions' AND column_name = 'balance_after') THEN
        ALTER TABLE diamond_transactions ADD COLUMN balance_after INTEGER;
    END IF;

    -- Add original columns if they don't exist (VIP schema only has transaction_type)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'diamond_transactions' AND column_name = 'type') THEN
        ALTER TABLE diamond_transactions ADD COLUMN type TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'diamond_transactions' AND column_name = 'source') THEN
        ALTER TABLE diamond_transactions ADD COLUMN source TEXT;
    END IF;
END $$;

-- Ensure vip_subscriptions has all columns (original migration missing tier/canceled_at)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'vip_subscriptions' AND column_name = 'tier') THEN
        ALTER TABLE vip_subscriptions ADD COLUMN tier TEXT DEFAULT 'monthly' CHECK (tier IN ('monthly', 'annual'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'vip_subscriptions' AND column_name = 'canceled_at') THEN
        ALTER TABLE vip_subscriptions ADD COLUMN canceled_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'vip_subscriptions' AND column_name = 'price_usd') THEN
        ALTER TABLE vip_subscriptions ADD COLUMN price_usd DECIMAL(10, 2) DEFAULT 0;
    END IF;
END $$;

-- Ensure profiles has all VIP-related columns
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'is_vip') THEN
        ALTER TABLE profiles ADD COLUMN is_vip BOOLEAN DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'vip_tier') THEN
        ALTER TABLE profiles ADD COLUMN vip_tier TEXT CHECK (vip_tier IN ('monthly', 'annual'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'vip_expires_at') THEN
        ALTER TABLE profiles ADD COLUMN vip_expires_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'vip_canceled_at') THEN
        ALTER TABLE profiles ADD COLUMN vip_canceled_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'stripe_customer_id') THEN
        ALTER TABLE profiles ADD COLUMN stripe_customer_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'diamonds') THEN
        ALTER TABLE profiles ADD COLUMN diamonds INTEGER DEFAULT 0;
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Fix deduct_diamonds to work with unified schema
-- Writes to BOTH type and transaction_type for maximum compatibility
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION deduct_diamonds(
    p_user_id UUID,
    p_amount INTEGER,
    p_source TEXT DEFAULT 'game_cost',
    p_metadata JSONB DEFAULT '{}'
)
RETURNS JSONB AS $$
DECLARE
    v_current_balance INTEGER;
    v_new_balance INTEGER;
BEGIN
    -- Lock the row to prevent race conditions
    SELECT COALESCE(diamonds, 0) INTO v_current_balance
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;
    
    -- Check sufficient balance
    IF v_current_balance < p_amount THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient diamonds',
            'balance', v_current_balance,
            'required', p_amount
        );
    END IF;
    
    -- Deduct
    v_new_balance := v_current_balance - p_amount;
    
    UPDATE profiles
    SET diamonds = v_new_balance
    WHERE id = p_user_id;
    
    -- Log transaction (write to both column sets for compatibility)
    INSERT INTO diamond_transactions (
        user_id, amount, transaction_type, type, source, description, metadata, balance_after
    ) VALUES (
        p_user_id,
        -p_amount,
        p_source,
        'spend',
        p_source,
        'Diamond deduction: ' || p_source,
        p_metadata,
        v_new_balance
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'balance', v_new_balance,
        'deducted', p_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- Fix award_diamonds to work with unified schema
-- Updates profiles.diamonds (canonical balance source) and logs transaction
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION award_diamonds(
    p_user_id UUID,
    p_amount INTEGER,
    p_source TEXT DEFAULT 'game_reward',
    p_metadata JSONB DEFAULT '{}'
)
RETURNS JSONB AS $$
DECLARE
    v_new_balance INTEGER;
BEGIN
    -- Award diamonds on profiles (canonical balance)
    UPDATE profiles
    SET diamonds = COALESCE(diamonds, 0) + p_amount
    WHERE id = p_user_id
    RETURNING diamonds INTO v_new_balance;
    
    -- Check if user exists
    IF v_new_balance IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found'
        );
    END IF;
    
    -- Also update user_diamonds if row exists (for Memory Matrix compatibility)
    UPDATE user_diamonds
    SET balance = balance + p_amount,
        lifetime_earned = lifetime_earned + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    -- Log transaction (write to both column sets for compatibility)
    INSERT INTO diamond_transactions (
        user_id, amount, transaction_type, type, source, description, metadata, balance_after
    ) VALUES (
        p_user_id,
        p_amount,
        p_source,
        'earn',
        p_source,
        'Diamond award: ' || p_source,
        p_metadata,
        v_new_balance
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'balance', v_new_balance,
        'awarded', p_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- Fix add_diamonds_to_balance to accept all 5 params that callers pass
-- Called by: stripe webhook, trivia crons, training APIs, arcade APIs
-- Original version only took (p_user_id, p_amount) — callers pass 5 params
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop the old 2-param version first (different signature = different function in PG)
DROP FUNCTION IF EXISTS add_diamonds_to_balance(UUID, INTEGER);

CREATE OR REPLACE FUNCTION add_diamonds_to_balance(
    p_user_id UUID,
    p_amount INTEGER,
    p_type TEXT DEFAULT 'bonus',
    p_description TEXT DEFAULT NULL,
    p_reference_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_new_balance INTEGER;
BEGIN
    -- Update profiles.diamonds (canonical balance)
    UPDATE profiles
    SET diamonds = COALESCE(diamonds, 0) + p_amount
    WHERE id = p_user_id
    RETURNING diamonds INTO v_new_balance;

    IF v_new_balance IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found'
        );
    END IF;

    -- Also update user_diamonds if row exists
    UPDATE user_diamonds
    SET balance = balance + p_amount,
        lifetime_earned = lifetime_earned + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Log transaction (write to both column sets)
    INSERT INTO diamond_transactions (
        user_id, amount, transaction_type, type, source, description, metadata, balance_after
    ) VALUES (
        p_user_id,
        p_amount,
        p_type,
        'earn',
        p_type,
        COALESCE(p_description, 'Diamond credit: ' || p_type),
        CASE WHEN p_reference_id IS NOT NULL 
            THEN jsonb_build_object('reference_id', p_reference_id) 
            ELSE '{}' 
        END,
        v_new_balance
    );

    RETURN jsonb_build_object(
        'success', true,
        'new_balance', v_new_balance,
        'added', p_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- Fix update_profile_vip_status trigger to sync is_vip
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_profile_vip_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'active' OR NEW.status = 'trialing' THEN
        UPDATE profiles
        SET 
            is_vip = true,
            vip_tier = NEW.tier,
            vip_expires_at = NEW.current_period_end,
            vip_canceled_at = NULL
        WHERE id = NEW.user_id;
    ELSIF NEW.status = 'canceled' THEN
        UPDATE profiles
        SET 
            is_vip = false,
            vip_tier = NULL,
            vip_canceled_at = NEW.canceled_at
        WHERE id = NEW.user_id;
    ELSIF NEW.status IN ('past_due', 'unpaid') THEN
        -- Keep VIP active during grace period
        UPDATE profiles
        SET vip_tier = NEW.tier
        WHERE id = NEW.user_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
