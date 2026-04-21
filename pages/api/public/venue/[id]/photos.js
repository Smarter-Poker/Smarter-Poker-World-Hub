/**
 * Public Venue Photos API
 * GET /api/public/venue/[id]/photos - Get public photos for a venue
 */
import { createClient } from '../../../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../../../src/lib/sentryWrap';

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
  try {
    // CDN cache: fresh for 60s, serve stale up to 300s
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    }

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed' }
      });
    }

    try {
      const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
      const id = safeQ(req.query.id);
      const category = safeQ(req.query.category);
      const limit = safeQ(req.query.limit) || 30;
      const offset = safeQ(req.query.offset) || 0;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_ID', message: 'Venue ID required' }
        });
      }

      let query = getSupabase()
        .from('commander_venue_photos')
        .select(`
          id,
          url,
          thumbnail_url,
          caption,
          category,
          is_cover_photo,
          is_featured,
          likes_count,
          created_at
        `, { count: 'exact' })
        .eq('venue_id', id)
        .order('is_featured', { ascending: false })
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (category) {
        query = query.eq('category', category);
      }

      const { data: photos, error, count } = await query;

      // Gracefully handle type mismatch (UUID passed to integer column for social pages)
      if (error) {
        if (error.code === '22P02') {
          return res.status(200).json({
            success: true,
            data: { photos: [], total: 0, limit: parseInt(limit), offset: parseInt(offset) }
          });
        }
        throw error;
      }

      return res.status(200).json({
        success: true,
        data: {
          photos: photos || [],
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      console.error('Public venue photos API error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to fetch photos' }
      });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
