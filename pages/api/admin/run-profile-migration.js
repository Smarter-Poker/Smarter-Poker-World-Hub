// API endpoint to run the SQL migration to add missing profile columns
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    try {
        // Test if columns already exist by trying to select them
        const { data: testData, error: testError } = await supabase
            .from('profiles')
            .select('id, hometown, cover_photo_url, occupation')
            .limit(1);

        if (!testError) {
            // Columns already exist
            return res.status(200).json({
                status: 'OK',
                message: 'All columns already exist',
                columns: ['hometown', 'cover_photo_url', 'occupation'],
                sampleData: testData?.[0] || null
            });
        }

        // If error mentions column doesn't exist, we need to add them
        // Since we can't run ALTER TABLE via supabase-js, return the SQL to run
        res.status(200).json({
            status: 'MIGRATION_NEEDED',
            message: 'Run this SQL in Supabase SQL Editor',
            error: testError.message,
            sql: `
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hometown TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cover_photo_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS occupation TEXT;
            `.trim()
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
