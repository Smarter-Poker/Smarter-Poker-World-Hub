-- Club Commander: Membership Plans & Pricing
-- Allows clubs to set daily/weekly/monthly/yearly membership prices per tier

CREATE TABLE IF NOT EXISTS commander_membership_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER NOT NULL REFERENCES poker_venues(id) ON DELETE CASCADE,
  
  -- Plan identity
  tier TEXT NOT NULL,                    -- 'standard', 'gold', 'platinum', 'vip', or custom
  name TEXT NOT NULL,                    -- Display name: 'Gold Membership', 'VIP Access', etc.
  description TEXT,                      -- What's included
  color TEXT DEFAULT '#1877F2',          -- Badge color
  sort_order INTEGER DEFAULT 0,
  
  -- Pricing (null = not offered at this interval)
  price_daily DECIMAL(10,2),             -- e.g. $20/day
  price_weekly DECIMAL(10,2),            -- e.g. $100/week
  price_monthly DECIMAL(10,2),           -- e.g. $300/month
  price_yearly DECIMAL(10,2),            -- e.g. $2500/year
  
  -- Seat fee override (if this tier gets a different hourly rate)
  seat_fee_override DECIMAL(10,2),       -- null = use default game rate
  seat_fee_discount_pct DECIMAL(5,2) DEFAULT 0,  -- e.g. 10 = 10% off seat fees
  
  -- Perks
  comp_multiplier DECIMAL(5,2) DEFAULT 1.0,  -- 1.5 = earn 50% more comp points
  priority_waitlist BOOLEAN DEFAULT false,    -- Bumps to front of waitlist
  free_food_drinks BOOLEAN DEFAULT false,
  free_parking BOOLEAN DEFAULT false,
  guest_passes_per_month INTEGER DEFAULT 0,
  reserved_seating BOOLEAN DEFAULT false,
  tournament_discount_pct DECIMAL(5,2) DEFAULT 0,
  
  -- Custom perks (flexible JSON for venue-specific benefits)
  custom_perks JSONB DEFAULT '[]',       -- [{name: "Free massage/hr", value: "1"}]
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  max_members INTEGER,                   -- null = unlimited
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(venue_id, tier)
);

CREATE INDEX IF NOT EXISTS idx_membership_plans_venue ON commander_membership_plans(venue_id, is_active);

-- Seed default plans for existing venues (they can customize later)
-- This runs idempotently - won't duplicate if already exists
INSERT INTO commander_membership_plans (venue_id, tier, name, description, color, sort_order, price_daily, price_monthly, price_yearly, comp_multiplier, priority_waitlist)
SELECT 
  v.id,
  tier.tier,
  tier.name,
  tier.description,
  tier.color,
  tier.sort_order,
  tier.price_daily,
  tier.price_monthly,
  tier.price_yearly,
  tier.comp_multiplier,
  tier.priority_waitlist
FROM poker_venues v
CROSS JOIN (VALUES
  ('standard', 'Standard', 'Basic access to the poker room', '#B0B3B8', 0, NULL, NULL, NULL, 1.0, false),
  ('gold', 'Gold Member', 'Priority seating and comp bonuses', '#F59E0B', 1, 25.00, 199.00, 1999.00, 1.25, false),
  ('platinum', 'Platinum Member', 'Premium benefits and reserved seating', '#94A3B8', 2, 40.00, 349.00, 3499.00, 1.5, true),
  ('vip', 'VIP', 'All-access with maximum perks', '#8B5CF6', 3, 75.00, 599.00, 5999.00, 2.0, true)
) AS tier(tier, name, description, color, sort_order, price_daily, price_monthly, price_yearly, comp_multiplier, priority_waitlist)
WHERE EXISTS (SELECT 1 FROM commander_subscriptions cs WHERE cs.venue_id = v.id)
ON CONFLICT (venue_id, tier) DO NOTHING;
