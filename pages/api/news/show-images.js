/**
 * Show what images are actually stored in the database
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    try {
        const { data: articles } = await getSupabase()
            .from('poker_news')
            .select('id, title, image_url, source_name, source_url')
            .order('published_at', { ascending: false })
            .limit(10);

        const summary = (articles || []).map(a => ({
            title: a.title?.substring(0, 50),
            source: a.source_name,
            image: a.image_url?.substring(0, 80),
            isDefault: a.image_url?.includes('unsplash') || a.image_url?.includes('pexels') || a.image_url?.includes('googleusercontent'),
            sourceUrl: a.source_url?.substring(0, 60)
        }));

        res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
        return res.status(200).json({ articles: summary });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[news/show-images] Error:', err?.message || err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
