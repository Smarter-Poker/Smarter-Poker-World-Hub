import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Auth check
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Authorization required' });

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Invalid token' });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
        return res.status(403).json({ error: 'Admin routes are disabled in production' });
    }

    const { type } = req.body; // 'test', 'cycle', 'daily', 'publish'

    try {
        const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
        const host = req.headers.host || 'localhost:3000';
        const baseUrl = `${protocol}://${host}`;

        let endpoint = '/api/cron/horses-stories';

        // In a real expanded app, different types might hit different endpoints.
        // For now, we hit the main horses cron engine to generate stories.
        const startTime = Date.now();
        const cronRes = await fetch(`${baseUrl}${endpoint}`, {
            headers: {
                'Authorization': `Bearer ${process.env.CRON_SECRET}`
            }
        });

        const cronData = await cronRes.json().catch(() => ({ error: 'Invalid response from cron' }));
        const duration_seconds = Math.round((Date.now() - startTime) / 1000);

        // Log the run to pipeline_runs
        const runData = {
            run_type: type,
            text_posts_created: cronData.text_stories || 0,
            videos_created: cronData.video_stories || 0,
            errors: (cronData.success === false || cronData.error) ? 1 : 0,
            duration_seconds: duration_seconds
        };

        // Insert and select the created record to return to frontend
        const { data: insertedRun, error: insertError } = await supabase
            .from('pipeline_runs')
            .insert(runData)
            .select()
            .single();

        if (insertError) {
            console.error('Failed to log pipeline run:', insertError);
        }

        return res.status(200).json({
            success: true,
            run: insertedRun || { ...runData, id: Date.now(), started_at: new Date().toISOString() },
            details: cronData
        });
    } catch (e) {
        console.error('Pipeline Trigger Error:', e);
        return res.status(500).json({ error: e.message });
    }
}
