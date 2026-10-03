import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const UUID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
let serviceClient = null;

function getClient() {
  if (serviceClient) return serviceClient;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Reel removal service configuration is unavailable');
  serviceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return serviceClient;
}

function validId(value) {
  const id = String(value || '').trim();
  return UUID_RE.test(id) ? id : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Accept-Encoding, Authorization');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!applyRateLimit(req, res, LIMITS.write)) return;

  const reelId = validId(req.body?.reel_id);
  if (!reelId || Object.prototype.hasOwnProperty.call(req.body || {}, 'source_post_id')) {
    return res.status(400).json({ success: false, error: 'Invalid Reel removal target' });
  }

  try {
    const client = getClient();
    const { user, error: authError } = await getServerUserWithFallback(req, client);
    if (authError || !user?.id) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { data: targets, error: targetError } = await client
      .from('social_reels')
      .select('id,author_id')
      .eq('id', reelId);
    if (targetError) throw targetError;
    if (!targets?.length) return res.status(404).json({ success: false, error: 'Reel not found' });
    if (targets.some((row) => row.author_id !== user.id)) {
      return res.status(403).json({ success: false, error: 'You can remove only your own Reels' });
    }

    const { data: removed, error: removeError } = await client.rpc('remove_owned_social_reel', {
      p_reel_id: reelId,
      p_owner_id: user.id,
    });
    if (removeError) throw removeError;
    const removedCount = Number(removed?.removed);
    if (!Number.isInteger(removedCount) || removedCount < 1) {
      throw new Error('Reel removal did not update the complete alias group');
    }
    return res.status(200).json({ success: true, removed: removedCount });
  } catch (error) {
    console.warn('[api/reels/remove] failed:', error?.message || error);
    return res.status(503).json({ success: false, error: 'The Reel could not be removed right now' });
  }
}
