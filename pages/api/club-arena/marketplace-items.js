/**
 * GET /api/club-arena/marketplace-items
 * 
 * Fetches available active marketplace items for a club and the user's purchase history.
 * 
 * Query: ?clubId=xxx
 * Auth: Bearer token (any club member)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
const { isUUID } = require('../../../src/lib/club-arena/validate');
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
      if (!applyRateLimit(req, res, 'club-arena/marketplace-items')) return;
      if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'No auth token' });

      const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { clubId } = req.query;
      if (!clubId) return res.status(400).json({ error: 'clubId required' });
      if (!isUUID(clubId)) return res.status(400).json({ error: 'Invalid clubId format' });

      try {
          // Verify membership and get chip balance
          const { data: membership } = await getSupabase()
              .from('club_members')
              .select('chip_balance, role')
              .eq('club_id', clubId)
              .eq('user_id', user.id)
              .maybeSingle();

          if (!membership) return res.status(403).json({ error: 'Not a club member' });

          // Fetch active items
          const { data: items, error: itemsErr } = await getSupabase()
              .from('club_shop_items')
              .select('id, name, description, price, category, image_url, item_type')
              .eq('club_id', clubId)
              .eq('is_active', true)
              .order('price', { ascending: true });

          if (itemsErr) throw itemsErr;

          // Fetch user's own purchases
          const { data: purchases, error: purErr } = await getSupabase()
              .from('club_shop_purchases')
              .select('id, item_id, price_paid, created_at')
              .eq('club_id', clubId)
              .eq('buyer_id', user.id)
              .order('created_at', { ascending: false });

          if (purErr) throw purErr;

          return res.status(200).json({
              success: true,
              items: items || [],
              purchases: purchases || [],
              balance: membership.chip_balance || 0,
              role: membership.role
          });
      } catch (err) {
          console.error('[marketplace-items]', err);
          return res.status(500).json({ error: 'Failed to fetch marketplace data', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
      }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
