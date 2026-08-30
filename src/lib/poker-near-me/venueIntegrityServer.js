import usStates from '../../../public/data/us-states-simplified.json' with { type: 'json' };
import { dedupeVenueRecords, summarizeVenueIntegrity } from './venueIntegrity.js';

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};
const STATE_CODES = Object.fromEntries(Object.entries(STATE_NAMES).map(([code, name]) => [name.toLowerCase(), code]));
const FEATURES = new Map((usStates?.features || []).map((feature) => [feature?.properties?.name, feature]));
const BORDER_TOLERANCE_DEGREES = 0.2;

function finiteCoordinate(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeState(value) {
  const text = String(value || '').trim();
  const upper = text.toUpperCase();
  return STATE_NAMES[upper] ? upper : STATE_CODES[text.toLowerCase()] || null;
}

function polygonsFor(feature) {
  if (feature?.geometry?.type === 'Polygon') return [feature.geometry.coordinates];
  if (feature?.geometry?.type === 'MultiPolygon') return feature.geometry.coordinates;
  return [];
}

function pointInRing(lng, lat, ring = []) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] || [];
    const [xj, yj] = ring[j] || [];
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;
    const crosses = ((yi > lat) !== (yj > lat))
      && (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lng, lat, polygon = []) {
  if (!pointInRing(lng, lat, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(lng, lat, hole));
}

function pointSegmentDistance(lng, lat, start, end) {
  const [x1, y1] = start || [];
  const [x2, y2] = end || [];
  if (![x1, y1, x2, y2].every(Number.isFinite)) return Infinity;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((lng - x1) * dx + (lat - y1) * dy) / lengthSquared)) : 0;
  const x = x1 + t * dx;
  const y = y1 + t * dy;
  return Math.hypot(lng - x, lat - y);
}

function distanceToFeature(lng, lat, feature) {
  let distance = Infinity;
  for (const polygon of polygonsFor(feature)) {
    for (const ring of polygon) {
      for (let index = 1; index < ring.length; index += 1) {
        distance = Math.min(distance, pointSegmentDistance(lng, lat, ring[index - 1], ring[index]));
      }
    }
  }
  return distance;
}

export function assessVenueLocation(venue) {
  const latitude = finiteCoordinate(venue?.latitude ?? venue?.lat);
  const longitude = finiteCoordinate(venue?.longitude ?? venue?.lng);
  const hasCoordinates = latitude !== null && longitude !== null;
  if (!hasCoordinates) return { status: 'missing', mappable: false, reason: 'coordinates_missing' };
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { status: 'conflict', mappable: false, reason: 'coordinates_invalid' };
  }
  if (venue?.venue_type === 'home_game') {
    return { status: 'approximate', mappable: true, reason: 'privacy_protected' };
  }

  const stateCode = normalizeState(venue?.state || venue?.location_state);
  const stateName = stateCode ? STATE_NAMES[stateCode] : null;
  const feature = stateName ? FEATURES.get(stateName) : null;
  // The simplified shape intentionally omits AK/HI. Do not make a claim when a
  // canonical boundary is unavailable or when the record is outside the US.
  if (!feature) return { status: 'unverified', mappable: true, reason: 'boundary_unavailable' };
  if (polygonsFor(feature).some((polygon) => pointInPolygon(longitude, latitude, polygon))) {
    return { status: 'verified', mappable: true, reason: 'state_coordinate_match' };
  }
  if (distanceToFeature(longitude, latitude, feature) <= BORDER_TOLERANCE_DEGREES) {
    return { status: 'border', mappable: true, reason: 'near_state_border' };
  }
  return { status: 'conflict', mappable: false, reason: 'state_coordinate_conflict' };
}

export function applyVenueIntegrity(venues = []) {
  const assessed = (Array.isArray(venues) ? venues : []).filter(Boolean).map((venue) => ({
    ...venue,
    location_quality: assessVenueLocation(venue),
  }));
  const { venues: deduped, duplicateCount } = dedupeVenueRecords(assessed);
  return {
    venues: deduped,
    summary: {
      ...summarizeVenueIntegrity(deduped),
      duplicate_count: duplicateCount,
      output: deduped.length,
    },
  };
}

export const venueIntegrityServerContract = Object.freeze({
  borderToleranceDegrees: BORDER_TOLERANCE_DEGREES,
  boundarySource: 'us-states-simplified',
});
