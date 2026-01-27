/**
 * Venue Photos Staff API
 * GET /api/captain/venues/[id]/photos - List photos
 * POST /api/captain/venues/[id]/photos - Add a photo
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    const { id } = req.query;
    const staffSession = req.headers['x-staff-session'];

    if (req.method === 'GET') {
      // Public access
      const { category, limit = 30, offset = 0 } = req.query;

      let query = supabase
        .from('captain_venue_photos')
        .select('*', { count: 'exact' })
        .eq('venue_id', id)
        .order('is_featured', { ascending: false })
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      return res.status(200).json({
        success: true,
        data: {
          photos: data || [],
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    }

    if (req.method === 'POST') {
      if (!staffSession) {
        return res.status(401).json({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Staff session required' }
        });
      }

      let staff;
      try {
        staff = JSON.parse(staffSession);
      } catch (e) {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_SESSION', message: 'Invalid staff session' }
        });
      }

      const venueId = parseInt(id) || id;
      if (staff.venue_id !== venueId) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Not authorized for this venue' }
        });
      }

      const { url, thumbnail_url, caption, category = 'general', is_cover_photo, is_featured } = req.body;

      if (!url) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_URL', message: 'Photo URL required' }
        });
      }

      // If setting as cover photo, unset existing cover
      if (is_cover_photo) {
        await supabase
          .from('captain_venue_photos')
          .update({ is_cover_photo: false })
          .eq('venue_id', id)
          .eq('is_cover_photo', true);

        // Also update venue's cover_photo_url
        await supabase
          .from('poker_venues')
          .update({ cover_photo_url: url })
          .eq('id', id);
      }

      const { data, error } = await supabase
        .from('captain_venue_photos')
        .insert({
          venue_id: id,
          uploaded_by: staff.user_id || null,
          url,
          thumbnail_url,
          caption,
          category,
          is_cover_photo: is_cover_photo || false,
          is_featured: is_featured || false
        })
        .select()
        .single();

      if (error) throw error;

      return res.status(201).json({
        success: true,
        data: { photo: data }
      });
    }

    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET and POST allowed' }
    });
  } catch (error) {
    console.error('Venue photos API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to process request' }
    });
  }
}
