-- Fix late_reg_levels to allow text formats like '2-4 hours', 'Registration open until 2:00 PM', or 'Level 6' instead of strictly integers.
ALTER TABLE poker_events ALTER COLUMN late_reg_levels TYPE text USING late_reg_levels::text;
