// API endpoint to apply the link metadata migration
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST required' });
    }

    try {
        // Check if columns already exist
        const { data: testData, error: testError } = await supabase
            .from('social_posts')
            .select('id, link_url, link_title, link_image')
            .limit(1);

        if (!testError) {
            return res.status(200).json({
                status: 'ALREADY_MIGRATED',
                message: 'Link metadata columns already exist',
                columns: ['link_url', 'link_title', 'link_description', 'link_image', 'link_site_name']
            });
        }

        // Columns don't exist - provide SQL for manual execution
        return res.status(200).json({
            status: 'MIGRATION_NEEDED',
            message: 'Please run this SQL in Supabase SQL Editor',
            sql: `
-- Migration: Add link metadata columns to social_posts
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS link_title TEXT;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS link_description TEXT;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS link_image TEXT;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS link_site_name TEXT;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_social_posts_link_url ON social_posts(link_url) WHERE link_url IS NOT NULL;
            `.trim(),
            dashboardUrl: 'https://supabase.com/dashboard/project/kuklfnapbkmacvwxktbh/sql'
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
