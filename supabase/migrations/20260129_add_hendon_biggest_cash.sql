-- Add hendon_biggest_cash column to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS hendon_biggest_cash DECIMAL(15,2);

-- Add biggest_cash to hendon_scrape_log table
ALTER TABLE public.hendon_scrape_log
ADD COLUMN IF NOT EXISTS biggest_cash DECIMAL(15,2);

-- Update the fn_update_hendon_data function to include biggest_cash
CREATE OR REPLACE FUNCTION fn_update_hendon_data(
    p_profile_id UUID,
    p_total_cashes INTEGER,
    p_total_earnings DECIMAL(15,2),
    p_best_finish TEXT,
    p_biggest_cash DECIMAL(15,2) DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.profiles
    SET 
        hendon_total_cashes = p_total_cashes,
        hendon_total_earnings = p_total_earnings,
        hendon_best_finish = p_best_finish,
        hendon_biggest_cash = p_biggest_cash,
        hendon_last_scraped = NOW()
    WHERE id = p_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service role (for cron job)
GRANT EXECUTE ON FUNCTION fn_update_hendon_data TO service_role;
