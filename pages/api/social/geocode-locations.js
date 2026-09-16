/**
 * Geocode Locations API
 * POST /api/social/geocode-locations
 *
 * Geocodes "City, State" strings to lat/lng coordinates.
 * Uses free Nominatim (OpenStreetMap) API first, falls back to Google Geocoding.
 * Stores results in social_pages.metadata.geocoded_locations cache.
 *
 * Body: { page_id, locations: ["Chicago, IL", "Rockford, IL"] }
 * Returns: { success: true, geocoded: { "Chicago, IL": { lat, lng }, ... } }
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { requireAuth } from '../../../src/lib/auth-middleware';
import { reportApiError } from '../../../src/lib/sentryWrap';

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Rate-limit Nominatim: 1 req/sec as per usage policy
const NOMINATIM_DELAY_MS = 1100;

/**
 * Geocode a single "City, State" or "City, ST" string using Nominatim (free).
 * Returns { lat, lng } or null.
 */
async function geocodeWithNominatim(locationStr) {
    try {
        const url = `https://nominatim.openstreetmap.org/search?` +
            `q=${encodeURIComponent(locationStr)}&format=json&limit=1&countrycodes=us`;

        const res = await fetch(url, {
            headers: {
                'User-Agent': 'SmarterPoker/1.0 (https://smarter.poker)',
            },
        });

        if (!res.ok) return null;

        const results = await res.json();
        if (results && results.length > 0) {
            return {
                lat: parseFloat(results[0].lat),
                lng: parseFloat(results[0].lon),
            };
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Geocode using Google Geocoding API (fallback).
 * Requires NEXT_PUBLIC_GOOGLE_MAPS_KEY env var.
 */
async function geocodeWithGoogle(locationStr) {
    const apiKey = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || '').trim();
    if (!apiKey) return null;

    try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?` +
            `address=${encodeURIComponent(locationStr)}&components=country:US&key=${apiKey}`;

        const res = await fetch(url);
        if (!res.ok) return null;

        const data = await res.json();
        if (data.status === 'OK' && data.results && data.results.length > 0) {
            const loc = data.results[0].geometry.location;
            return { lat: loc.lat, lng: loc.lng };
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Geocode a location string, trying Nominatim first, then Google.
 */
async function geocodeLocation(locationStr) {
    if (!locationStr || !locationStr.trim()) return null;

    const cleaned = locationStr.trim();

    // Try Nominatim first (free)
    const nominatimResult = await geocodeWithNominatim(cleaned);
    if (nominatimResult) return nominatimResult;

    // Fallback to Google
    const googleResult = await geocodeWithGoogle(cleaned);
    if (googleResult) return googleResult;

    return null;
}

/**
 * Sleep helper for rate limiting
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default async function handler(req, res) {
  try {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          if (!applyRateLimit(req, res, LIMITS.write)) return;
      }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // BUG #282: No authentication — anyone could trigger external API calls
      // (Nominatim/Google) and write to social_pages.metadata without auth.
      const user = await requireAuth(req, res);
      if (!user) return;

      const { page_id, locations } = req.body;

      if (!page_id) {
          return res.status(400).json({ success: false, error: 'page_id is required' });
      }

      if (!locations || !Array.isArray(locations) || locations.length === 0) {
          return res.status(400).json({ success: false, error: 'locations array is required' });
      }

      // Cap at 10 locations per request
      const toGeocode = locations.slice(0, 10);

      try {
          // Fetch current metadata + verify ownership
          // 2026-08-15 CHECK 13 fix: social_pages has no user_id column
          // (real: owner_id) — the select 42703'd, so this endpoint answered
          // 404 "Page not found" for every page and geocoding never worked.
          const { data: page, error: fetchError } = await getSupabase()
              .from('social_pages')
              .select('metadata, owner_id')
              .eq('id', page_id)
              .maybeSingle();

          if (fetchError || !page) {
              return res.status(404).json({ success: false, error: 'Page not found' });
          }

          // BUG #282 cont: Verify caller owns this page
          const pageOwner = page.owner_id;
          if (pageOwner && pageOwner !== user.id) {
              return res.status(403).json({ success: false, error: 'Not authorized to modify this page' });
          }

          const metadata = page.metadata || {};
          const existing = metadata.geocoded_locations || {};
          const geocoded = { ...existing };
          const results = [];

          for (const loc of toGeocode) {
              const key = loc.trim();
              if (!key) continue;

              // Skip if already cached
              if (geocoded[key] && geocoded[key].lat && geocoded[key].lng) {
                  results.push({ location: key, status: 'cached', ...geocoded[key] });
                  continue;
              }

              // Geocode
              const coords = await geocodeLocation(key);
              if (coords) {
                  geocoded[key] = coords;
                  results.push({ location: key, status: 'geocoded', ...coords });
              } else {
                  results.push({ location: key, status: 'failed' });
              }

              // Rate limit for Nominatim
              await sleep(NOMINATIM_DELAY_MS);
          }

          // Save updated geocoded_locations to metadata
          const { error: updateError } = await getSupabase()
              .from('social_pages')
              .update({
                  metadata: { ...metadata, geocoded_locations: geocoded },
                  updated_at: new Date().toISOString(),
              })
              .eq('id', page_id);

          if (updateError) {
              console.warn('[geocode-locations] Update error:', updateError);
              return res.status(500).json({ success: false, error: 'Failed to save geocoded locations' });
          }

          return res.status(200).json({
              success: true,
              geocoded,
              results,
          });
      } catch (err) {
          console.warn('[geocode-locations] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
