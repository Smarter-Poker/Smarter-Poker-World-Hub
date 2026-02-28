-- Add bulk_time_packages column to commander_venue_settings
-- This JSONB column stores bulk time package deals for the Time & Billing feature
ALTER TABLE commander_venue_settings
  ADD COLUMN IF NOT EXISTS bulk_time_packages JSONB DEFAULT '[]'::jsonb;

-- Also ensure time_billing_rate and auto_comp_rate columns exist
ALTER TABLE commander_venue_settings
  ADD COLUMN IF NOT EXISTS time_billing_rate NUMERIC DEFAULT 0;

ALTER TABLE commander_venue_settings
  ADD COLUMN IF NOT EXISTS auto_comp_rate NUMERIC DEFAULT 0;
