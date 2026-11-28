/**
 * LOCATION MEMORY ENGINE
 * Tracks and remembers performance at specific venues
 */

import { supabase } from '../supabase';
import { exactIlikePattern } from './venueNames.mjs';

// deleteLocation, getLocationStats, getLocationAlerts,
// getStakePerformanceAtLocation, storeLocationMemory and getLocationMemories
// used to live here. Nothing called them, and they summed dollar floats over
// unpaged reads, counted overnight sessions as negative hours and reported a
// failed read as an empty venue; they were removed rather than left to be reused.

/**
 * Get or create a location
 */
export async function getOrCreateLocation(
  userId: string,
  name: string,
  venueType: string = 'casino',
  latitude?: number,
  longitude?: number,
  pokerVenueId?: string | number | null
): Promise<string> {
  // Verify auth session — RLS requires auth.uid() = user_id
  const { data: { session } } = await supabase.auth.getSession();
  const authUserId = session?.user?.id || userId;

  // A failed lookup used to fall through to the insert and save a second copy
  // of a venue the player already has.
  const { data: existing, error: lookupError } = await supabase
    .from('bankroll_locations')
    .select('id')
    .eq('user_id', authUserId)
    .ilike('name', exactIlikePattern(name))
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (existing) return existing.id;

  // Create new location using the auth session's user ID
  const insertData = {
    user_id: authUserId,
    name,
    venue_type: venueType,
    latitude,
    longitude,
    poker_venue_id: pokerVenueId ? String(pokerVenueId) : null,
  };

  const { data: newLoc, error } = await supabase
    .from('bankroll_locations')
    .insert(insertData)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!newLoc) throw new Error('Failed to create location');
  return newLoc.id;
}

/**
 * Get all locations for a user
 */
export async function getUserLocations(userId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from('bankroll_locations')
    .select('id, name')
    .eq('user_id', userId)
    .order('name');

  if (error) throw error;
  return data || [];
}

/**
 * Rename a location
 */
export async function renameLocation(
  userId: string,
  locationId: string,
  newName: string
): Promise<void> {
  // Row security turns an update it does not allow into "0 rows, no error",
  // which said "Venue Renamed" while nothing changed. Ask for the row back.
  const { data, error } = await supabase
    .from('bankroll_locations')
    .update({ name: newName })
    .eq('id', locationId)
    .eq('user_id', userId)
    .select('id');

  if (error) throw error;
  if (!data || data.length === 0) throw new Error('This Venue Could Not Be Renamed.');
}

/**
 * Try to detect location from coordinates
 */
export async function detectNearbyLocation(
  userId: string,
  latitude: number,
  longitude: number,
  radiusKm: number = 0.5
): Promise<{ id: string; name: string } | null> {
  // Simple bounding box approach
  const latDelta = radiusKm / 111; // ~111km per degree latitude
  const lonDelta = radiusKm / (111 * Math.cos((latitude * Math.PI) / 180));

  const { data } = await supabase
    .from('bankroll_locations')
    .select('id, name')
    .eq('user_id', userId)
    .gte('latitude', latitude - latDelta)
    .lte('latitude', latitude + latDelta)
    .gte('longitude', longitude - lonDelta)
    .lte('longitude', longitude + lonDelta)
    .limit(1)
    .maybeSingle();

  return data || null;
}
