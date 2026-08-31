import { haversineMiles } from '../../components/poker-near-me/pnm-utils.js';

const DAY_MS = 86_400_000;

function finiteCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function locationKey(city, state) {
  const normalizedCity = normalizedText(city);
  const normalizedState = normalizedText(state);
  return normalizedCity && normalizedState ? `${normalizedCity}|${normalizedState}` : '';
}

function parseDateInput(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    date.getFullYear() !== Number(match[1])
    || date.getMonth() !== Number(match[2]) - 1
    || date.getDate() !== Number(match[3])
  ) return null;
  return date;
}

export function validateTravelDateRange(dateRange = {}) {
  const hasStart = Boolean(dateRange.start);
  const hasEnd = Boolean(dateRange.end);
  if (hasStart !== hasEnd) {
    return { ok: false, error: 'Choose both a start date and an end date, or leave both blank.' };
  }
  if (!hasStart) return { ok: true, startDate: null, endDate: null };
  const startDate = parseDateInput(dateRange.start);
  const endDate = parseDateInput(dateRange.end);
  if (!startDate || !endDate) return { ok: false, error: 'Choose valid travel dates.' };
  if (startDate > endDate) return { ok: false, error: 'The trip end date must be on or after the start date.' };
  return { ok: true, startDate, endDate };
}

function distanceToLegMiles(venue, start, end) {
  const lat = finiteCoordinate(venue?.latitude ?? venue?.lat);
  const lng = finiteCoordinate(venue?.longitude ?? venue?.lng);
  const startLat = finiteCoordinate(start?.lat);
  const startLng = finiteCoordinate(start?.lng);
  const endLat = finiteCoordinate(end?.lat);
  const endLng = finiteCoordinate(end?.lng);
  if ([lat, lng, startLat, startLng, endLat, endLng].some((value) => value == null)) return Infinity;

  const longitudeScale = 69.172 * Math.cos(lat * Math.PI / 180);
  const ax = (startLng - lng) * longitudeScale;
  const ay = (startLat - lat) * 69;
  const bx = (endLng - lng) * longitudeScale;
  const by = (endLat - lat) * 69;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

export function isVenueNearRoute(venue, stops, corridorMiles) {
  if (!Array.isArray(stops) || stops.length < 2) return false;
  const corridor = Number(corridorMiles);
  if (!Number.isFinite(corridor) || corridor <= 0) return false;
  for (let index = 0; index < stops.length - 1; index += 1) {
    if (distanceToLegMiles(venue, stops[index], stops[index + 1]) <= corridor) return true;
  }
  return false;
}

export function interpolateRouteLeg(start, end) {
  const distance = haversineMiles(start.lat, start.lng, end.lat, end.lng);
  const pointCount = Math.max(2, Math.ceil(distance / 20));
  return Array.from({ length: pointCount + 1 }, (_, index) => {
    const ratio = index / pointCount;
    return {
      lat: start.lat + ratio * (end.lat - start.lat),
      lng: start.lng + ratio * (end.lng - start.lng),
    };
  });
}

export function filterSeriesForRoute(series, nearbyVenues, startDate, endDate) {
  if (!startDate || !endDate) return [];
  const venueIds = new Set((nearbyVenues || []).map((venue) => String(venue.id || '')).filter(Boolean));
  const venueNames = new Set((nearbyVenues || []).map((venue) => normalizedText(venue.name)).filter(Boolean));
  const venueLocations = new Set((nearbyVenues || []).map((venue) => locationKey(venue.city, venue.state)).filter(Boolean));

  return (series || []).filter((entry) => {
    const seriesStart = parseDateInput(String(entry.start_date || '').slice(0, 10));
    const seriesEnd = parseDateInput(String(entry.end_date || entry.start_date || '').slice(0, 10));
    if (!seriesStart || !seriesEnd || seriesStart > endDate || seriesEnd < startDate) return false;
    const idMatch = entry.venue_id != null && venueIds.has(String(entry.venue_id));
    const nameMatch = venueNames.has(normalizedText(entry.venue_name || entry.venue));
    const placeMatch = venueLocations.has(locationKey(entry.city, entry.state));
    return idMatch || nameMatch || placeMatch;
  });
}

export function travelDayNames(startDate, endDate, dayNames) {
  if (!startDate || !endDate || startDate > endDate) return new Set();
  const spanDays = Math.floor((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1;
  if (spanDays >= 7) return new Set(dayNames);
  const result = new Set();
  for (let offset = 0; offset < spanDays; offset += 1) {
    const date = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + offset);
    result.add(dayNames[date.getDay()]);
  }
  return result;
}
