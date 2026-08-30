const BOUND_KEYS = Object.freeze(['north', 'south', 'east', 'west']);

function scalar(value) {
  if (Array.isArray(value)) return value[0];
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') return null;
  return String(value);
}

/**
 * Parse a public map viewport without silently accepting partial or malformed
 * coordinates. East may be lower than west for a viewport crossing the date line.
 */
export function parsePokerMapBounds(input = {}) {
  if (BOUND_KEYS.some((key) => Array.isArray(input[key]) || (input[key] && typeof input[key] === 'object'))) {
    return { bounds: null, error: 'Map bounds must be scalar values' };
  }
  const raw = Object.fromEntries(BOUND_KEYS.map((key) => [key, scalar(input[key])]));
  const supplied = BOUND_KEYS.filter((key) => raw[key] !== null);
  if (supplied.length === 0) return { bounds: null, error: null };
  if (supplied.length !== BOUND_KEYS.length) {
    return { bounds: null, error: 'north, south, east, and west must be provided together' };
  }

  const bounds = Object.fromEntries(BOUND_KEYS.map((key) => [key, Number(raw[key])]));
  if (BOUND_KEYS.some((key) => !Number.isFinite(bounds[key]))) {
    return { bounds: null, error: 'Map bounds must be finite numbers' };
  }
  if (bounds.north < -90 || bounds.north > 90 || bounds.south < -90 || bounds.south > 90) {
    return { bounds: null, error: 'north and south must be between -90 and 90' };
  }
  if (bounds.east < -180 || bounds.east > 180 || bounds.west < -180 || bounds.west > 180) {
    return { bounds: null, error: 'east and west must be between -180 and 180' };
  }
  if (bounds.north <= bounds.south) {
    return { bounds: null, error: 'north must be greater than south' };
  }
  return { bounds, error: null };
}

export function isVenueWithinPokerMapBounds(venue, bounds) {
  if (!bounds) return true;
  const latitude = Number(venue?.latitude ?? venue?.lat);
  const longitude = Number(venue?.longitude ?? venue?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  const latitudeMatches = latitude >= bounds.south && latitude <= bounds.north;
  const longitudeMatches = bounds.east >= bounds.west
    ? longitude >= bounds.west && longitude <= bounds.east
    : longitude >= bounds.west || longitude <= bounds.east;
  return latitudeMatches && longitudeMatches;
}

export function pokerMapBoundsFromLeaflet(bounds) {
  if (!bounds) return null;
  const candidate = {
    north: Number(bounds.getNorth?.()),
    south: Number(bounds.getSouth?.()),
    east: Number(bounds.getEast?.()),
    west: Number(bounds.getWest?.()),
  };
  return BOUND_KEYS.every((key) => Number.isFinite(candidate[key])) ? candidate : null;
}

export function appendPokerMapBounds(params, bounds) {
  if (!params || !bounds) return params;
  BOUND_KEYS.forEach((key) => params.set(key, String(Math.round(bounds[key] * 10000) / 10000)));
  return params;
}

export const pokerMapBoundsContract = Object.freeze({
  queryKeys: BOUND_KEYS,
  coordinatePrecision: 4,
  supportsDateLine: true,
});
