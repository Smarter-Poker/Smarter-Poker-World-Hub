/**
 * Temporary migration endpoint - execute Phase 2 DDL
 * DELETE THIS FILE AFTER MIGRATION
 */
import { createClient } from '../../../src/lib/supabaseServerClient';

let _sb = null;
function getSupabase() {
    if (!_sb) {
        _sb = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co',
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _sb;
}

export default async function handler(req, res) {
    // Only allow with admin secret
    const secret = req.headers['x-admin-secret'] || req.query.secret;
    if (secret !== process.env.ADMIN_ROUTE_SECRET) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const sb = getSupabase();
    const results = [];

    // 1. Add is_pinned if missing (probably exists)
    try {
        const { error } = await sb.rpc('exec_sql', { sql_text: "ALTER TABLE social_page_posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false" });
        results.push({ step: 'is_pinned', error: error?.message || null });
    } catch (e) {
        results.push({ step: 'is_pinned', error: e.message });
    }

    // 2. Add post_type column
    try {
        const { error } = await sb.rpc('exec_sql', { sql_text: "ALTER TABLE social_page_posts ADD COLUMN IF NOT EXISTS post_type TEXT DEFAULT 'regular'" });
        results.push({ step: 'post_type', error: error?.message || null });
    } catch (e) {
        results.push({ step: 'post_type', error: e.message });
    }

    // 3. Add reaction_type column
    try {
        const { error } = await sb.rpc('exec_sql', { sql_text: "ALTER TABLE social_page_post_likes ADD COLUMN IF NOT EXISTS reaction_type TEXT DEFAULT 'like'" });
        results.push({ step: 'reaction_type', error: error?.message || null });
    } catch (e) {
        results.push({ step: 'reaction_type', error: e.message });
    }

    // 4. Create comment_likes table
    try {
        const { error } = await sb.rpc('exec_sql', {
            sql_text: `CREATE TABLE IF NOT EXISTS social_page_comment_likes (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                comment_id UUID REFERENCES social_page_post_comments(id) ON DELETE CASCADE,
                user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ DEFAULT now(),
                UNIQUE(comment_id, user_id)
            )`
        });
        results.push({ step: 'comment_likes_table', error: error?.message || null });
    } catch (e) {
        results.push({ step: 'comment_likes_table', error: e.message });
    }

    return res.status(200).json({ results });
}
