import { venueIdentityKey } from './venueIntegrity.js';
import { assessVenueLocation } from './venueIntegrityServer.js';

const SOURCE_FIELDS = 'id,name,venue_type,address,city,state,latitude,longitude,lat,lng,phone,website,profile_photo_url,cover_photo_url,logo_url,location_integrity_revision,data_quality,scrape_status,last_scraped_at,last_scraped,is_active,is_suppressed';
const PRIORITY = Object.freeze({ conflict: 0, missing: 1, duplicate: 2, unverified: 3, incomplete: 4, stale: 5 });

function missingFields(venue) {
  const missing = [];
  if (!String(venue.address || '').trim()) missing.push('address');
  if (!String(venue.phone || '').trim()) missing.push('phone');
  if (!String(venue.website || '').trim()) missing.push('website');
  if (![venue.profile_photo_url, venue.cover_photo_url, venue.logo_url].some((value) => String(value || '').trim())) missing.push('artwork');
  if ((venue.latitude ?? venue.lat) == null || (venue.longitude ?? venue.lng) == null) missing.push('coordinates');
  return missing;
}

function staleSource(venue, now) {
  const value = venue.last_scraped_at || venue.last_scraped;
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  return !Number.isFinite(timestamp) || now - timestamp > 30 * 24 * 60 * 60 * 1000;
}

export function buildVenueIntegrityStateRows(venues = [], now = Date.now()) {
  const source = (Array.isArray(venues) ? venues : []).filter((venue) => venue?.id != null);
  const duplicateGroups = new Map();
  for (const venue of source) {
    const active = venue.is_active !== false && venue.is_suppressed !== true;
    if (!active || ['series', 'tour', 'home_game'].includes(venue.venue_type)) continue;
    const key = venueIdentityKey(venue);
    if (!key?.startsWith('place:')) continue;
    const group = duplicateGroups.get(key) || [];
    group.push(venue.id);
    duplicateGroups.set(key, group);
  }
  const duplicatesById = new Map();
  for (const ids of duplicateGroups.values()) {
    if (ids.length < 2) continue;
    ids.forEach((id) => duplicatesById.set(String(id), ids.filter((other) => String(other) !== String(id))));
  }

  return source.map((venue) => {
    const active = venue.is_active !== false && venue.is_suppressed !== true;
    const location = assessVenueLocation(venue);
    const missing = missingFields(venue);
    const related = duplicatesById.get(String(venue.id)) || [];
    const issues = [];
    if (active && ['conflict', 'missing', 'unverified'].includes(location.status)) issues.push(location.status);
    if (active && related.length) issues.push('duplicate');
    if (active && missing.length) issues.push('incomplete');
    if (active && staleSource(venue, now)) issues.push('stale');
    const uniqueIssues = [...new Set(issues)];
    const primary = Object.keys(PRIORITY).find((issue) => uniqueIssues.includes(issue)) || null;
    return {
      venue_id: venue.id,
      name: venue.name || 'Unnamed venue',
      venue_type: venue.venue_type || null,
      address: venue.address || null,
      city: venue.city || '',
      state: venue.state || '',
      latitude: venue.latitude ?? venue.lat ?? null,
      longitude: venue.longitude ?? venue.lng ?? null,
      revision: venue.location_integrity_revision,
      active,
      location_status: location.status,
      location_reason: location.reason,
      mappable: location.mappable,
      issue_types: uniqueIssues,
      primary_issue: primary,
      priority: primary ? PRIORITY[primary] : 99,
      related_ids: related,
      missing_fields: missing,
      completeness_score: Math.max(0, 100 - missing.length * 20),
      last_scraped_at: venue.last_scraped_at || venue.last_scraped || null,
      data_quality: venue.data_quality || null,
      scrape_status: venue.scrape_status || null,
      assessed_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    };
  });
}

export async function syncVenueIntegrityState(supabase, { venueIds = null } = {}) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from('poker_venues').select(SOURCE_FIELDS)
      .order('id', { ascending: true }).range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  const requested = venueIds ? new Set(venueIds.map(String)) : null;
  const stateRows = buildVenueIntegrityStateRows(rows).filter((row) => !requested || requested.has(String(row.venue_id)));
  for (let index = 0; index < stateRows.length; index += 200) {
    const { error } = await supabase.from('venue_location_integrity_state')
      .upsert(stateRows.slice(index, index + 200), { onConflict: 'venue_id' });
    if (error) throw error;
  }
  return {
    source_rows: rows.length,
    synced_rows: stateRows.length,
    actionable: stateRows.filter((row) => row.primary_issue).length,
  };
}

export const venueIntegrityStateContract = Object.freeze({
  issuePriority: PRIORITY,
  freshnessDays: 30,
  batchSize: 200,
});
