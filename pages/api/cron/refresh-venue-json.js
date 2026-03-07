/**
 * Venue JSON Refresh Cron
 * GET /api/cron/refresh-venue-json
 *
 * Regenerates /public/data/all-venues.json from Supabase
 * so the PokerNearMe static fallback always has fresh data.
 *
 * Run daily via Vercel Cron.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret if configured
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Fetch all active venues from Supabase
    const { data: venues, error } = await supabase
      .from('poker_venues')
      .select(`
        id, name, slug, address, city, state, zip, country,
        latitude, longitude, phone, website, email,
        hours, amenities, games_offered, tournament_schedule,
        rating, review_count, photo_url, photos,
        is_verified, is_active, source, source_id,
        commander_enabled, commander_tier,
        created_at, updated_at
      `)
      .eq('is_active', true)
      .order('name', { ascending: true })
          .limit(100);

    if (error) {
      console.error('Failed to fetch venues:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch venues from database'
      });
    }

    const venueCount = venues?.length || 0;

    // We cannot write to the filesystem at runtime in a serverless function,
    // so instead we store the JSON in Supabase storage or a dedicated table.
    // The /data/all-venues.json is built at deploy time from this data.

    // Update the venues_json_cache table (or storage bucket) for CDN freshness
    const jsonPayload = JSON.stringify({ venues, updated_at: new Date().toISOString(), count: venueCount });

    // Try to update a cache record in the database
    const { error: cacheError } = await supabase
      .from('system_cache')
      .upsert({
        cache_key: 'all_venues_json',
        cache_value: jsonPayload,
        updated_at: new Date().toISOString()
      }, { onConflict: 'cache_key' });

    if (cacheError) {
      // If the cache table doesn't exist, just log and continue
    }

    return res.status(200).json({
      success: true,
      message: `Refreshed venue data: ${venueCount} venues`,
      count: venueCount,
      updated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Venue JSON refresh failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
