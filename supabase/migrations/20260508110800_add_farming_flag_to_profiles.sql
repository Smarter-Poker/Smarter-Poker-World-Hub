-- Add farming flag to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_farming_flagged BOOLEAN DEFAULT false;

-- Add index for fast querying
CREATE INDEX IF NOT EXISTS idx_profiles_farming_flagged ON public.profiles(is_farming_flagged);
