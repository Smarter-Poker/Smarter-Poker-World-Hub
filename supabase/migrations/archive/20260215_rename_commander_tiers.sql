-- =============================================
-- Rename Commander Tiers: starter → home_game, professional → charity, enterprise → club
-- =============================================

-- 1. Update existing subscription records
UPDATE commander_subscriptions SET tier = 'home_game' WHERE tier = 'starter';
UPDATE commander_subscriptions SET tier = 'charity' WHERE tier = 'professional';
UPDATE commander_subscriptions SET tier = 'club' WHERE tier = 'enterprise';

-- 2. Update the tier CHECK constraint
ALTER TABLE commander_subscriptions DROP CONSTRAINT IF EXISTS commander_subscriptions_tier_check;
ALTER TABLE commander_subscriptions ADD CONSTRAINT commander_subscriptions_tier_check 
  CHECK (tier IN ('home_game', 'charity', 'club'));

-- 3. Update poker_venues commander_tier values
UPDATE poker_venues SET commander_tier = 'home_game' WHERE commander_tier = 'starter';
UPDATE poker_venues SET commander_tier = 'charity' WHERE commander_tier = 'professional';
UPDATE poker_venues SET commander_tier = 'club' WHERE commander_tier = 'enterprise';

-- 4. Replace the tier features trigger function
CREATE OR REPLACE FUNCTION set_subscription_tier_features()
RETURNS TRIGGER AS $$
BEGIN
  CASE NEW.tier
    WHEN 'home_game' THEN
      NEW.max_tables := 5;
      NEW.max_staff := 3;
      NEW.max_sms_per_month := 100;
      NEW.monthly_price := 99.00;
      NEW.features := '{
        "club_page": true,
        "waitlist": true,
        "tournaments": true,
        "members_free": true,
        "basic_analytics": true,
        "floor_map": false,
        "dealers": false,
        "kiosk": false,
        "comps": false,
        "promotions": false,
        "staff_schedule": false,
        "tv_displays": false,
        "reports": false,
        "advanced_analytics": false,
        "paid_memberships": false,
        "time_billing": false,
        "membership_plans": false
      }'::jsonb;
    WHEN 'charity' THEN
      NEW.max_tables := 15;
      NEW.max_staff := 10;
      NEW.max_sms_per_month := 500;
      NEW.monthly_price := 199.00;
      NEW.features := '{
        "club_page": true,
        "waitlist": true,
        "tournaments": true,
        "members_free": true,
        "basic_analytics": true,
        "floor_map": true,
        "dealers": true,
        "kiosk": true,
        "comps": true,
        "promotions": true,
        "staff_schedule": true,
        "tv_displays": true,
        "reports": true,
        "advanced_analytics": true,
        "paid_memberships": false,
        "time_billing": false,
        "membership_plans": false
      }'::jsonb;
    WHEN 'club' THEN
      NEW.max_tables := 999;
      NEW.max_staff := 999;
      NEW.max_sms_per_month := 99999;
      NEW.monthly_price := 399.00;
      NEW.features := '{
        "club_page": true,
        "waitlist": true,
        "tournaments": true,
        "members_free": true,
        "basic_analytics": true,
        "floor_map": true,
        "dealers": true,
        "kiosk": true,
        "comps": true,
        "promotions": true,
        "staff_schedule": true,
        "tv_displays": true,
        "reports": true,
        "advanced_analytics": true,
        "paid_memberships": true,
        "time_billing": true,
        "membership_plans": true
      }'::jsonb;
  END CASE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

SELECT 'Tier rename migration complete' as status;
