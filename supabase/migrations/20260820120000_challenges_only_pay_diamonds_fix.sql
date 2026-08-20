-- Ensure all challenges only pay out in diamonds (max 25) and never in chips
UPDATE public.daily_challenge_catalog
SET 
  chip_reward = 0,
  diamond_reward = CASE
    WHEN diamond_reward > 25 THEN 25
    ELSE diamond_reward
  END;
