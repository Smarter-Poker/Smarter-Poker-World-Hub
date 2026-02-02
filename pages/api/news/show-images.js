/**
 * Show what images are actually stored in the database
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data: articles } = await supabase
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

    return res.status(200).json({ articles: summary });
}
