/**
 * VIP System RPCs & Supporting Tables
 * Creates missing RPC functions and tables needed for VIP membership system
 * Migration: 20260212_vip_system_rpcs
 */

-- ============================================================================
-- 1. diamond_transactions table (audit log for all diamond movements)
-- ============================================================================
CREATE TABLE IF NOT EXISTS diamond_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL, -- positive = credit, negative = debit
    transaction_type TEXT NOT NULL CHECK (transaction_type IN (
        'game_cost', 'game_reward', 'feature_unlock', 'purchase', 
        'bonus', 'refund', 'admin', 'daily_reward', 'achievement'
    )),
    description TEXT,
    metadata JSONB DEFAULT '{}',
    balance_after INTEGER, -- snapshot of balance after transaction
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_diamond_transactions_user_id ON diamond_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_diamond_transactions_type ON diamond_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_diamond_transactions_created_at ON diamond_transactions(created_at DESC);

ALTER TABLE diamond_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view their own transactions"
    ON diamond_transactions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Service role can manage all transactions"
    ON diamond_transactions FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- 2. vip_feature_dismissals table (tracks one-time popup dismissals)
-- ============================================================================
CREATE TABLE IF NOT EXISTS vip_feature_dismissals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL,
    dismissed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_vip_feature_dismissals_user ON vip_feature_dismissals(user_id);

ALTER TABLE vip_feature_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view their own dismissals"
    ON vip_feature_dismissals FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert their own dismissals"
    ON vip_feature_dismissals FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 3. get_user_vip_status RPC
-- Returns true if user is VIP (checks profiles.is_vip)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_vip_status(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_is_vip BOOLEAN;
BEGIN
    SELECT is_vip INTO v_is_vip
    FROM profiles
    WHERE id = p_user_id;
    
    RETURN COALESCE(v_is_vip, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. deduct_diamonds RPC
-- Atomic diamond deduction with balance check and transaction logging
-- ============================================================================
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
    
    -- Log transaction
    INSERT INTO diamond_transactions (
        user_id, amount, transaction_type, description, metadata, balance_after
    ) VALUES (
        p_user_id,
        -p_amount,
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

-- ============================================================================
-- 5. Fix update_profile_vip_status trigger to also sync is_vip field
-- ============================================================================
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
        -- Keep VIP active during grace period but flag it
        UPDATE profiles
        SET vip_tier = NEW.tier
        WHERE id = NEW.user_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
