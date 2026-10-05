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

const PERSISTED_UUID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
let serviceClient = null;

function getClient() {
    if (serviceClient) return serviceClient;
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Profile video service configuration is unavailable');
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

    const authorId = String(Array.isArray(req.query.author_id) ? req.query.author_id[0] : req.query.author_id || '').trim();
    if (!PERSISTED_UUID_RE.test(authorId)) {
        return res.status(400).json({ success: false, error: 'Invalid video profile' });
    }

    try {
        const client = getClient();
        const { user } = await getServerUserWithFallback(req, client);
        const owner = user?.id === authorId;
        const { data, error } = await client
            .from('social_posts')
            .select(POST_SELECT)
            .eq('author_id', authorId)
            .or('content_type.eq.video,content_type.eq.live')
            .order('created_at', { ascending: false })
            .limit(120);
        if (error) throw error;
        const rows = Array.isArray(data) ? data : [];
        const context = await readManagedEligibilityContext(rows);
        const eligible = rows.filter(post => (
            (isPublicAudiencePost(post) || (owner && post?.is_deleted !== true))
            && managedVideoPostIsEligible(post, context)
            && nativeVideoIsReady(post)
        )).slice(0, 30);
        // A browser never receives origin_type or the pipeline's metadata.
        return res.status(200).json({ success: true, data: eligible.map(toBrowserPost) });
    } catch (error) {
        console.warn('[api/social/profile-videos] failed:', error?.message || error);
        return res.status(503).json({ success: false, error: 'Profile Videos are temporarily unavailable' });
    }
}
