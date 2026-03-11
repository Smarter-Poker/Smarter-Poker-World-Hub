-- Diamond Store Database Schema
-- Creates tables for purchases, subscriptions, and merchandise orders

-- Diamond Purchases Table
CREATE TABLE IF NOT EXISTS diamond_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_payment_intent_id TEXT,
    stripe_checkout_session_id TEXT,
    package_name TEXT NOT NULL,
    diamonds_amount INTEGER NOT NULL,
    price_usd DECIMAL(10, 2) NOT NULL,
    bonus_diamonds INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    payment_method TEXT DEFAULT 'stripe',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ
);

-- VIP Subscriptions Table
CREATE TABLE IF NOT EXISTS vip_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_subscription_id TEXT UNIQUE,
    stripe_customer_id TEXT,
    tier TEXT NOT NULL CHECK (tier IN ('monthly', 'annual')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'unpaid', 'trialing')),
    price_usd DECIMAL(10, 2) NOT NULL,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Merchandise Orders Table
CREATE TABLE IF NOT EXISTS merchandise_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_payment_intent_id TEXT,
    stripe_checkout_session_id TEXT,
    items JSONB NOT NULL, -- Array of {item_name, quantity, price}
    total_usd DECIMAL(10, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'canceled', 'refunded')),
    shipping_address JSONB,
    tracking_number TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ
);

-- Add VIP fields to profiles if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'vip_tier') THEN
        ALTER TABLE profiles ADD COLUMN vip_tier TEXT CHECK (vip_tier IN ('monthly', 'annual'));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'vip_expires_at') THEN
        ALTER TABLE profiles ADD COLUMN vip_expires_at TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'vip_canceled_at') THEN
        ALTER TABLE profiles ADD COLUMN vip_canceled_at TIMESTAMPTZ;
    END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_diamond_purchases_user_id ON diamond_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_diamond_purchases_status ON diamond_purchases(status);
CREATE INDEX IF NOT EXISTS idx_diamond_purchases_created_at ON diamond_purchases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diamond_purchases_stripe_payment_intent ON diamond_purchases(stripe_payment_intent_id);

CREATE INDEX IF NOT EXISTS idx_vip_subscriptions_user_id ON vip_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_vip_subscriptions_status ON vip_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_vip_subscriptions_stripe_subscription ON vip_subscriptions(stripe_subscription_id);

CREATE INDEX IF NOT EXISTS idx_merchandise_orders_user_id ON merchandise_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_merchandise_orders_status ON merchandise_orders(status);
CREATE INDEX IF NOT EXISTS idx_merchandise_orders_created_at ON merchandise_orders(created_at DESC);

-- RLS Policies

-- Diamond Purchases
ALTER TABLE diamond_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own purchases"
    ON diamond_purchases FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all purchases"
    ON diamond_purchases FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- VIP Subscriptions
ALTER TABLE vip_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscriptions"
    ON vip_subscriptions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all subscriptions"
    ON vip_subscriptions FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Merchandise Orders
ALTER TABLE merchandise_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own orders"
    ON merchandise_orders FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all orders"
    ON merchandise_orders FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Function to update VIP status on profile
CREATE OR REPLACE FUNCTION update_profile_vip_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'active' OR NEW.status = 'trialing' THEN
        UPDATE profiles
        SET 
            vip_tier = NEW.tier,
            vip_expires_at = NEW.current_period_end,
            vip_canceled_at = NULL
        WHERE id = NEW.user_id;
    ELSIF NEW.status = 'canceled' THEN
        UPDATE profiles
        SET 
            vip_tier = NULL,
            vip_canceled_at = NEW.canceled_at
        WHERE id = NEW.user_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-update profile VIP status
DROP TRIGGER IF EXISTS trigger_update_profile_vip ON vip_subscriptions;
CREATE TRIGGER trigger_update_profile_vip
    AFTER INSERT OR UPDATE ON vip_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_profile_vip_status();

-- Function to add diamonds to user balance
CREATE OR REPLACE FUNCTION add_diamonds_to_balance(
    p_user_id UUID,
    p_amount INTEGER
)
RETURNS JSONB AS $$
DECLARE
    v_new_balance INTEGER;
BEGIN
    UPDATE profiles
    SET diamonds = COALESCE(diamonds, 0) + p_amount
    WHERE id = p_user_id
    RETURNING diamonds INTO v_new_balance;
    
    RETURN jsonb_build_object(
        'success', true,
        'new_balance', v_new_balance,
        'added', p_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
