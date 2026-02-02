import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    try {
        // Try to query the table
        const { data, error, count } = await supabase
            .from('sports_clips')
            .select('*', { count: 'exact', head: true });

        if (error) {
            return res.status(200).json({
                table_exists: false,
                error: error.message,
                code: error.code,
                hint: error.hint,
                action_required: 'Run migration in Supabase Dashboard SQL Editor',
                migration_file: 'supabase/migrations/20260129_sports_clips_table.sql'
            });
        }

        return res.status(200).json({
            table_exists: true,
            row_count: count,
            status: count === 0 ? 'Table empty - run scraper' : 'Table has data',
            next_step: count === 0 ? 'POST /api/cron/scrape-sports-clips' : 'Ready to post'
        });

    } catch (error) {
        return res.status(500).json({
            error: error.message,
            stack: error.stack
        });
    }
}
