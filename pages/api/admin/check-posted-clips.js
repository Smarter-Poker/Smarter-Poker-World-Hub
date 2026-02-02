/**
 * Check posted_clips table for duplicates
 * GET /api/admin/check-posted-clips
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Check table schema
        const { data: schema, error: schemaError } = await supabase
            .from('posted_clips')
            .select('*')
            .limit(1);

        if (schemaError) {
            return res.status(500).json({ error: 'Failed to query table', details: schemaError });
        }

        // Get total count
        const { count, error: countError } = await supabase
            .from('posted_clips')
            .select('*', { count: 'exact', head: true });

        // Check for duplicate video_ids
        const { data: duplicates, error: dupError } = await supabase
            .rpc('check_duplicate_clips');

        // Get recent clips
        const { data: recent, error: recentError } = await supabase
            .from('posted_clips')
            .select('video_id, posted_by, posted_at, clip_source')
            .order('posted_at', { ascending: false })
            .limit(50);

        return res.status(200).json({
            success: true,
            total_clips: count,
            schema_columns: schema && schema.length > 0 ? Object.keys(schema[0]) : [],
            recent_clips: recent || [],
            duplicates: duplicates || [],
            errors: {
                schema: schemaError,
                count: countError,
                duplicates: dupError,
                recent: recentError
            }
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
