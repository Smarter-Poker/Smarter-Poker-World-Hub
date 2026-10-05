import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import {
    POST_SELECT,
    isPublicAudiencePost,
    managedVideoPostIsEligible,
    nativeVideoIsReady,
    readManagedEligibilityContext,
} from './feed';
import { toBrowserPost } from '../../../src/lib/socialPostShape';

let serviceClient = null;

function getClient() {
    if (serviceClient) return serviceClient;
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Saved post service configuration is unavailable');
    serviceClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return serviceClient;
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Accept-Encoding, Authorization');
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    try {
        const client = getClient();
        const { user, error: authError } = await getServerUserWithFallback(req, client);
        if (authError || !user?.id) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        const { data: bookmarks, error: bookmarkError } = await client
            .from('social_interactions')
            .select('post_id,created_at')
            .eq('user_id', user.id)
            .eq('interaction_type', 'bookmark')
            .order('created_at', { ascending: false })
            .limit(500);
        if (bookmarkError) throw bookmarkError;
        const ids = [...new Set((bookmarks || []).map(row => row?.post_id).filter(Boolean))];
        if (!ids.length) return res.status(200).json({ success: true, data: [] });

        const { data, error } = await client.from('social_posts').select(POST_SELECT).in('id', ids);
        if (error) throw error;
        const rows = Array.isArray(data) ? data : [];
        const context = await readManagedEligibilityContext(rows);
        const order = new Map(ids.map((id, index) => [id, index]));
        const eligible = rows.filter(post => (
            (isPublicAudiencePost(post) || (post?.author_id === user.id && post?.is_deleted !== true))
            && managedVideoPostIsEligible(post, context)
            && nativeVideoIsReady(post)
        )).sort((left, right) => (order.get(left.id) ?? 999) - (order.get(right.id) ?? 999));
        // A browser never receives origin_type or the pipeline's metadata.
        return res.status(200).json({ success: true, data: eligible.map(toBrowserPost) });
    } catch (error) {
        console.warn('[api/social/saved-posts] failed:', error?.message || error);
        return res.status(503).json({ success: false, error: 'Saved Posts are temporarily unavailable' });
    }
}
