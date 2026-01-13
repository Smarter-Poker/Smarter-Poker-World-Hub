-- ═══════════════════════════════════════════════════════════════════════════
-- EXTEND PROFILES TABLE WITH FULL EDITABLE FIELDS + HENDONMOB INTEGRATION
-- Social profile fields and poker-specific information
-- ═══════════════════════════════════════════════════════════════════════════

-- Add new profile fields
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS country TEXT,
ADD COLUMN IF NOT EXISTS website TEXT,
ADD COLUMN IF NOT EXISTS twitter TEXT,
ADD COLUMN IF NOT EXISTS instagram TEXT,
ADD COLUMN IF NOT EXISTS favorite_game TEXT,
ADD COLUMN IF NOT EXISTS home_casino TEXT,
ADD COLUMN IF NOT EXISTS hendon_url TEXT,
ADD COLUMN IF NOT EXISTS hendon_total_cashes INTEGER,
ADD COLUMN IF NOT EXISTS hendon_total_earnings DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS hendon_best_finish TEXT,
ADD COLUMN IF NOT EXISTS hendon_last_scraped TIMESTAMPTZ;

-- Create index on hendon_url for scraping jobs
CREATE INDEX IF NOT EXISTS idx_profiles_hendon_url ON public.profiles(hendon_url) WHERE hendon_url IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- HENDONMOB SCRAPE LOG TABLE
-- Track scraping history and prevent hammering their servers
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.hendon_scrape_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    hendon_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, success, failed
    total_cashes INTEGER,
    total_earnings DECIMAL(15,2),
    best_finish TEXT,
    raw_data JSONB,
    error_message TEXT,
    scraped_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for finding pending scrapes
CREATE INDEX IF NOT EXISTS idx_hendon_scrape_pending ON public.hendon_scrape_log(status) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.hendon_scrape_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own scrape logs
DROP POLICY IF EXISTS "Users can view own scrape logs" ON public.hendon_scrape_log;
CREATE POLICY "Users can view own scrape logs" ON public.hendon_scrape_log
    FOR SELECT USING (auth.uid() = profile_id);

-- Grant access
GRANT SELECT ON public.hendon_scrape_log TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTION: Queue a HendonMob profile for scraping
-- Called when user saves their profile with a HendonMob URL
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_queue_hendon_scrape()
RETURNS TRIGGER AS $$
BEGIN
    -- Only queue if hendon_url changed and is not null
    IF NEW.hendon_url IS NOT NULL AND 
       (OLD.hendon_url IS NULL OR NEW.hendon_url != OLD.hendon_url) THEN
        
        INSERT INTO public.hendon_scrape_log (profile_id, hendon_url, status)
        VALUES (NEW.id, NEW.hendon_url, 'pending');
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to queue scrape when profile is updated with HendonMob URL
DROP TRIGGER IF EXISTS trg_queue_hendon_scrape ON public.profiles;
CREATE TRIGGER trg_queue_hendon_scrape
    AFTER INSERT OR UPDATE OF hendon_url ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION fn_queue_hendon_scrape();

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTION: Update profile with scraped HendonMob data
-- Called by the weekly scraping job
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_update_hendon_data(
    p_profile_id UUID,
    p_total_cashes INTEGER,
    p_total_earnings DECIMAL(15,2),
    p_best_finish TEXT
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.profiles
    SET 
        hendon_total_cashes = p_total_cashes,
        hendon_total_earnings = p_total_earnings,
        hendon_best_finish = p_best_finish,
        hendon_last_scraped = NOW()
    WHERE id = p_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service role (for cron job)
GRANT EXECUTE ON FUNCTION fn_update_hendon_data TO service_role;
