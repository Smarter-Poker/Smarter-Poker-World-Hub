/**
 * ONE-TIME MIGRATION RUNNER
 * Run the hendon_biggest_cash migration on production
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Security: Only allow from localhost or with secret
    const secret = req.headers['x-migration-secret'];
    if (secret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Run the migration SQL
        const { data, error } = await supabase.rpc('exec_sql', {
            sql: `
                -- Add hendon_biggest_cash column to profiles table
                ALTER TABLE public.profiles
                ADD COLUMN IF NOT EXISTS hendon_biggest_cash DECIMAL(15,2);

                -- Add biggest_cash to hendon_scrape_log table
                ALTER TABLE public.hendon_scrape_log
                ADD COLUMN IF NOT EXISTS biggest_cash DECIMAL(15,2);
            `
        });

        if (error) {
            console.error('Migration error:', error);
            return res.status(500).json({ error: error.message });
        }

        // Update the function
        const { data: funcData, error: funcError } = await supabase.rpc('exec_sql', {
            sql: `
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

                GRANT EXECUTE ON FUNCTION fn_update_hendon_data TO service_role;
            `
        });

        if (funcError) {
            console.error('Function update error:', funcError);
            return res.status(500).json({ error: funcError.message });
        }

        return res.status(200).json({
            success: true,
            message: 'Migration completed successfully'
        });

    } catch (error) {
        console.error('Unexpected error:', error);
        return res.status(500).json({ error: error.message });
    }
}
