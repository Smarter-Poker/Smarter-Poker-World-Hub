/** Source-qualified, reviewable location repair plans. Never guesses a location. */
import { assessVenueLocation } from '../../src/lib/poker-near-me/venueIntegrityServer.js';

const text = (value) => String(value ?? '').trim();
const identity = (value) => text(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const blank = (value) => value === null || value === undefined || value === '';
const ALLOWED_TYPES = new Set(['casino', 'localbusiness', 'place', 'entertainmentbusiness', 'sportsactivitylocation']);

function roomUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname === 'www.pokeratlas.com'
      && /^\/poker-room\/[a-z0-9][a-z0-9-]*\/?$/.test(parsed.pathname)
      && !parsed.search && !parsed.hash ? parsed.href.replace(/\/$/, '') : null;
  } catch { return null; }
}

function publicWebsite(value) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname.includes('.')
      && !['www.pokeratlas.com', 'pokeratlas.com', 'localhost'].includes(parsed.hostname)
      && !parsed.username && !parsed.password ? parsed.href : null;
  } catch { return null; }
}

function entities(value) {
  if (Array.isArray(value)) return value.flatMap(entities);
  if (!value || typeof value !== 'object') return [];
  return [value, ...entities(value['@graph'])];
}

export function qualifyCoordinateRepair(venue, evidence, reviewedIdentity = {}, now = Date.now()) {
  const refuse = (reason) => ({ id: venue?.id, accepted: false, reason });
  if (!Number.isInteger(venue?.id) || venue.id < 1) return refuse('invalid_venue_identity');
  if (venue.is_active !== true || venue.is_suppressed === true || venue.canonical_venue_id != null) return refuse('not_active_canonical');
  if (['home_game', 'tour', 'series', 'charity'].includes(venue.venue_type) || venue.source === 'self_registration') return refuse('private_or_traveling_identity');
  if (![venue.latitude, venue.longitude, venue.lat, venue.lng].every(blank)) return refuse('existing_coordinates_preserved');
  if (!Number.isFinite(Date.parse(venue.location_integrity_revision))) return refuse('missing_concurrency_revision');
  const sourceUrl = roomUrl(evidence?.url);
  const finalUrl = roomUrl(evidence?.final_url);
  if (!sourceUrl || !finalUrl || evidence.id !== venue.id || evidence.status !== 200) return refuse('unqualified_source_response');
  if (sourceUrl !== finalUrl && finalUrl !== roomUrl(reviewedIdentity.finalSourceUrl)) return refuse('unreviewed_redirect');
  if (evidence.closed === true || evidence.error) return refuse('closed_or_failed_source');
  if (!/^[a-f0-9]{64}$/.test(evidence.hash || '') || !Number.isInteger(evidence.bytes) || evidence.bytes < 1000) return refuse('missing_source_provenance');
  const at = Date.parse(evidence.scraped_at);
  if (!Number.isFinite(at) || at > now + 60000 || now - at > 7 * 86400000) return refuse('stale_or_invalid_evidence');
  const expectedName = reviewedIdentity.sourceName || venue.name;
  const expectedCity = reviewedIdentity.sourceCity || venue.city;
  if (!text(expectedName) || !text(expectedCity)) return refuse('missing_place_identity');
  const candidates = entities(evidence.jsonld).filter((entity) => {
    const types = Array.isArray(entity['@type']) ? entity['@type'] : [entity['@type']];
    return types.some((type) => ALLOWED_TYPES.has(text(type).toLowerCase()))
      && identity(entity.name) === identity(expectedName)
      && identity(entity.address?.addressLocality) === identity(expectedCity)
      && text(entity.address?.addressRegion).toUpperCase() === text(venue.state).toUpperCase()
      && ['US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA'].includes(text(entity.address?.addressCountry).toUpperCase())
      && text(entity.address?.streetAddress)
      && !blank(entity.geo?.latitude) && !blank(entity.geo?.longitude);
  });
  if (candidates.length !== 1) return refuse('ambiguous_or_unmatched_physical_entity');
  const entity = candidates[0];
  if (reviewedIdentity.correctCity && identity(reviewedIdentity.correctCity) !== identity(entity.address.addressLocality)) return refuse('unmatched_city_correction');
  const latitude = Number(entity.geo.latitude);
  const longitude = Number(entity.geo.longitude);
  const location = assessVenueLocation({ ...venue, latitude, longitude });
  if (!['verified', 'border'].includes(location.status)) return refuse('coordinate_state_conflict');
  if (venue.address && identity(venue.address) !== identity(entity.address.streetAddress)) return refuse('existing_address_conflict');
  return {
    id: venue.id, accepted: true, name: venue.name, venue_type: venue.venue_type, city: venue.city, state: venue.state,
    expected_revision: venue.location_integrity_revision,
    expected_address: venue.address || null,
    corrected_city: reviewedIdentity.correctCity || venue.city,
    address: venue.address || entity.address.streetAddress,
    website: publicWebsite(entity.url),
    latitude, longitude, location_status: location.status, location_reason: location.reason,
    source_url: finalUrl, source_name: entity.name, source_city: entity.address.addressLocality,
    source_sha256: evidence.hash, source_bytes: evidence.bytes, source_observed_at: evidence.scraped_at,
  };
}

/** Explicit SQL for the configured installer, not an automatic background writer. */
export function coordinateRepairSql(plans) {
  if (!Array.isArray(plans) || !plans.length || plans.length > 100) throw new Error('A bounded nonempty repair plan is required');
  if (new Set(plans.map((plan) => plan.id)).size !== plans.length) throw new Error('Duplicate venue IDs');
  for (const plan of plans) {
    if (plan.accepted !== true || !Number.isInteger(plan.id) || !Number.isFinite(plan.latitude) || !Number.isFinite(plan.longitude)
        || !['verified', 'border'].includes(plan.location_status) || !Number.isFinite(Date.parse(plan.expected_revision))
        || !/^[a-f0-9]{64}$/.test(plan.source_sha256) || !roomUrl(plan.source_url)) throw new Error('Unqualified repair plan');
  }
  const payload = JSON.stringify(plans).replace(/'/g, "''");
  const candidates = `jsonb_to_recordset('${payload}'::jsonb) AS p(id integer,name text,venue_type text,city text,state text,expected_revision timestamptz,expected_address text,address text,corrected_city text,website text,latitude double precision,longitude double precision,location_status text,location_reason text,source_url text,source_sha256 text,source_observed_at timestamptz)`;
  const guard = `v.id=p.id AND v.name=p.name AND v.venue_type=p.venue_type AND v.city=p.city AND v.state=p.state AND v.address IS NOT DISTINCT FROM p.expected_address AND v.location_integrity_revision=p.expected_revision AND v.is_active IS TRUE AND v.is_suppressed IS NOT TRUE AND v.canonical_venue_id IS NULL AND v.latitude IS NULL AND v.longitude IS NULL AND v.lat IS NULL AND v.lng IS NULL AND v.source IS DISTINCT FROM 'self_registration'`;
  return `BEGIN;
DO $repair$
DECLARE matched integer;
BEGIN
  PERFORM v.id FROM public.poker_venues v JOIN ${candidates} ON ${guard} FOR UPDATE OF v;
  GET DIAGNOSTICS matched = ROW_COUNT;
  IF matched <> ${plans.length} THEN RAISE EXCEPTION 'Coordinate repair preimage changed: expected ${plans.length}, found %', matched; END IF;
  WITH before_rows AS MATERIALIZED (
    SELECT v.id,to_jsonb(v) AS before_record FROM public.poker_venues v JOIN ${candidates} ON ${guard}
  ), changed AS (
    UPDATE public.poker_venues v SET latitude=p.latitude,longitude=p.longitude,lat=p.latitude,lng=p.longitude,address=p.address,city=p.corrected_city,website=coalesce(nullif(v.website,''),p.website),pokeratlas_url=coalesce(nullif(v.pokeratlas_url,''),p.source_url),last_verified_at=now(),location_integrity_revision=clock_timestamp()
    FROM ${candidates} WHERE ${guard} RETURNING v.*
  )
  INSERT INTO public.venue_location_integrity_log(venue_id,actor_id,reason,integrity_status,integrity_reason,before_record,after_record)
  SELECT v.id,NULL,'Source-qualified Monday location repair: ' || p.source_url || ' observed ' || p.source_observed_at::text || ' SHA256 ' || p.source_sha256,p.location_status,p.location_reason,b.before_record,to_jsonb(v)
  FROM changed v JOIN before_rows b ON b.id=v.id JOIN ${candidates} ON p.id=v.id;
  GET DIAGNOSTICS matched = ROW_COUNT;
  IF matched <> ${plans.length} THEN RAISE EXCEPTION 'Coordinate repair audit count mismatch'; END IF;
END $repair$;
SELECT id,name,address,city,state,latitude,longitude,location_integrity_revision FROM public.poker_venues WHERE id IN (${plans.map((plan) => plan.id).join(',')}) ORDER BY id;
COMMIT;`;
}
