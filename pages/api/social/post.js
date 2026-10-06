/**
 * GET /api/social/post?id=<uuid>  ->  { success: true, post }  |  404
 *
 * One post as a browser may see it: the deep link (?post=<id>) and a post the
 * feed is told changed. Before 2026-10-05 the browser read the row itself
 * with `select('*')`, which carried origin_type ('horse' on a horse's clips)
 * and metadata (the publishing pipeline's working notes, only ever on a
 * horse's posts). Those two columns are not granted to the browser roles, so
 * the post is answered here:
 *
 *   1. the row is read AS THE CALLER (their bearer token, or the public key
 *      when signed out), so row-level security decides who may see it exactly
 *      as it did when the browser read it directly; only browser-granted
 *      columns are named, and nothing is embedded: anon has no access to
 *      profiles at all, so an embedded author made every signed-out deep link
 *      (a shared /hub/post/<id> link) fail with 42501 and answer 503;
 *   2. for a row the caller can see, its metadata (reduced to the keys the UI
 *      renders, displayMetadata) and its author's public card (the same four
 *      fields the feed shows) are read with the service role; origin_type is
 *      never read.
 *
 * A horse's post and a human's come back in the same shape.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { BROWSER_POST_SELECT, displayMetadata } from '../../../src/lib/socialPostShape';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENT_OPTIONS = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
/** The author card a post carries: the fields the feed already shows anybody. */
export const POST_AUTHOR_COLUMNS = 'id,username,display_name,full_name,avatar_url';

let serviceClient = null;

function supabaseUrl() {
    return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function getServiceClient() {
    if (serviceClient) return serviceClient;
    const url = supabaseUrl();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Post service configuration is unavailable');
    serviceClient = createClient(url, key, CLIENT_OPTIONS);
    return serviceClient;
}

/** The caller's own view of the table: their token, or the public key when signed out. */
function callerClient(token) {
    const url = supabaseUrl();
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) throw new Error('Post caller configuration is unavailable');
    return createClient(url, anonKey, token
        ? { ...CLIENT_OPTIONS, global: { headers: { Authorization: `Bearer ${token}` } } }
        : CLIENT_OPTIONS);
}

function bearerToken(req) {
    const header = req?.headers?.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
    const token = header.slice(7).trim();
    return token.length >= 20 ? token : null;
}

/** `?id=` -> a lower-cased uuid, or null. Pure; exported for the law test. */
export function parsePostId(query) {
    const raw = Array.isArray(query?.id) ? query.id[0] : query?.id;
    const id = String(raw || '').trim();
    return UUID_RE.test(id) ? id.toLowerCase() : null;
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Authorization');
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return undefined;

    const id = parsePostId(req.query);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid post' });

    try {
        const visible = await callerClient(bearerToken(req))
            .from('social_posts')
            .select(BROWSER_POST_SELECT)
            .eq('id', id)
            .eq('is_deleted', false)
            .maybeSingle();
        if (visible.error) throw visible.error;
        if (!visible.data) return res.status(404).json({ success: false, error: 'Post not found' });

        const service = getServiceClient();
        const authorId = visible.data.author_id;
        const [notes, author] = await Promise.all([
            service
                .from('social_posts')
                .select('metadata')
                .eq('id', id)
                .maybeSingle(),
            authorId
                ? service
                    .from('profiles')
                    .select(POST_AUTHOR_COLUMNS)
                    .eq('id', authorId)
                    .maybeSingle()
                : Promise.resolve({ data: null, error: null }),
        ]);
        if (notes.error) throw notes.error;
        if (author.error) throw author.error;

        const post = {
            ...visible.data,
            author: author.data || null,
            metadata: displayMetadata(notes.data?.metadata),
        };
        return res.status(200).json({ success: true, post });
    } catch (err) {
        console.warn('[api/social/post] failed:', err?.message || err);
        return res.status(503).json({ success: false, error: 'Post is temporarily unavailable' });
    }
}
