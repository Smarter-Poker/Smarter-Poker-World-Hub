// Migration: Add missing profile columns for Facebook-style profile
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    try {
        // Add missing columns to profiles table
        const columns = [
            { name: 'hometown', type: 'text', comment: 'User hometown for profile display' },
            { name: 'cover_photo_url', type: 'text', comment: 'Cover photo URL for profile' },
            { name: 'occupation', type: 'text', comment: 'Job title/occupation' }
        ];

        const results = [];

        for (const col of columns) {
            // Use raw SQL to add column if not exists
            const { data, error } = await supabase.rpc('exec_sql', {
                sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ${col.name} ${col.type};`
            });

            if (error) {
                // Try alternative approach - direct insert/update test
                const { error: testError } = await supabase
                    .from('profiles')
                    .select(col.name)
                    .limit(1);

                if (testError && testError.message.includes('does not exist')) {
                    results.push({ column: col.name, status: 'NEEDS_MANUAL_ADD', error: testError.message });
                } else {
                    results.push({ column: col.name, status: 'ALREADY_EXISTS' });
                }
            } else {
                results.push({ column: col.name, status: 'ADDED', data });
            }
        }

        // Test current columns
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('username, hometown, cover_photo_url, occupation')
            .limit(1);

        res.status(200).json({
            message: 'Migration check complete',
            results,
            testProfile: profile?.[0] || null,
            testError: profileError?.message || null,
            sqlToRun: columns.map(c => `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ${c.name} ${c.type};`),
            note: 'If columns show as NEEDS_MANUAL_ADD, run the SQL commands in Supabase SQL Editor'
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
