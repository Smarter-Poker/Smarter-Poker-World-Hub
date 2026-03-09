/**
 * GET /api/club-arena/sticker-assets
 * Returns all active sticker_assets for the Club Arena lobby.
 * Auth: Bearer token (any authenticated user)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../src/lib/serverAuth';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!applyRateLimit(req, res, LIMITS.read)) return;

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No auth token' });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    try {
        const { data: stickers, error } = await supabaseAdmin
            .from('sticker_assets')
            .select('key, label, category, storage_path, applies_to, is_dynamic, dynamic_field, sort_order')
            .order('sort_order', { ascending: true });

        if (error) throw error;

        return res.status(200).json({ stickers: stickers || [] });
    } catch (err) {
        console.error('[sticker-assets]', err);
        return res.status(500).json({ error: 'Failed to load sticker assets' });
    }
}
