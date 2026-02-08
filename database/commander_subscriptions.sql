-- =============================================
-- Club Commander Subscriptions Schema
-- =============================================

-- Subscriptions table
CREATE TABLE IF NOT EXISTS commander_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id),
  
  -- Subscription details
  tier TEXT NOT NULL CHECK (tier IN ('starter', 'professional', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'paused')),
  
  -- Stripe integration
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_payment_method_id TEXT,
  
  -- Billing
  monthly_price DECIMAL(10,2) NOT NULL,
  billing_email TEXT NOT NULL,
  billing_name TEXT,
  billing_address JSONB,
  next_billing_date TIMESTAMPTZ,
  last_payment_date TIMESTAMPTZ,
  last_payment_amount DECIMAL(10,2),
  
  -- Limits based on tier
  max_tables INTEGER NOT NULL DEFAULT 5,
  max_staff INTEGER NOT NULL DEFAULT 3,
  max_sms_per_month INTEGER NOT NULL DEFAULT 100,
  sms_used_this_month INTEGER NOT NULL DEFAULT 0,
  sms_reset_date TIMESTAMPTZ DEFAULT (date_trunc('month', now()) + interval '1 month'),
  
  -- Features (JSON for flexibility)
  features JSONB DEFAULT '{
    "tournaments": false,
    "advanced_analytics": false,
    "api_access": false,
    "white_label": false,
    "priority_support": false
  }',
  
  -- Trial
  trial_ends_at TIMESTAMPTZ DEFAULT (now() + interval '14 days'),
  trial_extended BOOLEAN DEFAULT false,
  
  -- Lifecycle
  canceled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  paused_at TIMESTAMPTZ,
  pause_resumes_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_commander_subscriptions_venue ON commander_subscriptions(venue_id);
CREATE INDEX IF NOT EXISTS idx_commander_subscriptions_owner ON commander_subscriptions(owner_id);
CREATE INDEX IF NOT EXISTS idx_commander_subscriptions_stripe_customer ON commander_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_commander_subscriptions_stripe_sub ON commander_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_commander_subscriptions_status ON commander_subscriptions(status);

-- Unique constraint: one active subscription per venue
CREATE UNIQUE INDEX IF NOT EXISTS idx_commander_subscriptions_venue_active 
ON commander_subscriptions(venue_id) 
WHERE status IN ('trialing', 'active');

-- Subscription invoices/history
CREATE TABLE IF NOT EXISTS commander_subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES commander_subscriptions(id) ON DELETE CASCADE,
  venue_id INTEGER REFERENCES poker_venues(id),
  
  -- Stripe
  stripe_invoice_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  
  -- Invoice details
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'usd',
  status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
  
  -- Period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- URLs
  invoice_pdf_url TEXT,
  hosted_invoice_url TEXT,
  
  -- Timestamps
  due_date TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commander_invoices_subscription ON commander_subscription_invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_commander_invoices_venue ON commander_subscription_invoices(venue_id);
CREATE INDEX IF NOT EXISTS idx_commander_invoices_stripe ON commander_subscription_invoices(stripe_invoice_id);

-- Add social hub columns to poker_venues if not exist
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS social_hub_page_id TEXT;
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS social_hub_page_url TEXT;
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS registration_completed_at TIMESTAMPTZ;
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;

-- Function to set tier features
CREATE OR REPLACE FUNCTION set_subscription_tier_features()
RETURNS TRIGGER AS $$
BEGIN
  CASE NEW.tier
    WHEN 'starter' THEN
      NEW.max_tables := 5;
      NEW.max_staff := 3;
      NEW.max_sms_per_month := 100;
      NEW.monthly_price := 99.00;
      NEW.features := '{
        "tournaments": false,
        "advanced_analytics": false,
        "api_access": false,
        "white_label": false,
        "priority_support": false
      }'::jsonb;
    WHEN 'professional' THEN
      NEW.max_tables := 15;
      NEW.max_staff := 10;
      NEW.max_sms_per_month := 500;
      NEW.monthly_price := 199.00;
      NEW.features := '{
        "tournaments": true,
        "advanced_analytics": true,
        "api_access": false,
        "white_label": false,
        "priority_support": true
      }'::jsonb;
    WHEN 'enterprise' THEN
      NEW.max_tables := 999;
      NEW.max_staff := 999;
      NEW.max_sms_per_month := 99999;
      NEW.monthly_price := 399.00;
      NEW.features := '{
        "tournaments": true,
        "advanced_analytics": true,
        "api_access": true,
        "white_label": true,
        "priority_support": true
      }'::jsonb;
  END CASE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_tier_features_on_insert
BEFORE INSERT ON commander_subscriptions
FOR EACH ROW
EXECUTE FUNCTION set_subscription_tier_features();

CREATE TRIGGER set_tier_features_on_update
BEFORE UPDATE OF tier ON commander_subscriptions
FOR EACH ROW
WHEN (OLD.tier IS DISTINCT FROM NEW.tier)
EXECUTE FUNCTION set_subscription_tier_features();

-- Function to reset monthly SMS count
CREATE OR REPLACE FUNCTION reset_monthly_sms_counts()
RETURNS void AS $$
BEGIN
  UPDATE commander_subscriptions
  SET 
    sms_used_this_month = 0,
    sms_reset_date = date_trunc('month', now()) + interval '1 month'
  WHERE sms_reset_date <= now();
END;
$$ LANGUAGE plpgsql;

-- Function to check SMS limit before sending
CREATE OR REPLACE FUNCTION check_sms_limit(p_venue_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  v_sub RECORD;
BEGIN
  SELECT * INTO v_sub 
  FROM commander_subscriptions 
  WHERE venue_id = p_venue_id 
    AND status IN ('trialing', 'active')
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  IF v_sub.sms_used_this_month >= v_sub.max_sms_per_month THEN
    RETURN false;
  END IF;
  
  -- Increment counter
  UPDATE commander_subscriptions
  SET sms_used_this_month = sms_used_this_month + 1
  WHERE id = v_sub.id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS
ALTER TABLE commander_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_subscription_invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Owners can view their subscriptions"
ON commander_subscriptions FOR SELECT
USING (owner_id = auth.uid());

CREATE POLICY "Owners can update their subscriptions"
ON commander_subscriptions FOR UPDATE
USING (owner_id = auth.uid());

CREATE POLICY "Service role full access to subscriptions"
ON commander_subscriptions FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Owners can view their invoices"
ON commander_subscription_invoices FOR SELECT
USING (
  venue_id IN (
    SELECT venue_id FROM commander_subscriptions WHERE owner_id = auth.uid()
  )
);

-- Updated at trigger
CREATE TRIGGER update_commander_subscriptions_updated_at
BEFORE UPDATE ON commander_subscriptions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Verify
SELECT 'commander_subscriptions table created' as status;
SELECT 'commander_subscription_invoices table created' as status;
