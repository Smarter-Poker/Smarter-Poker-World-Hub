import { buildDiscoveryUrl } from '../../components/poker-near-me/discoveryController.js';
/** Private, bounded planning documents. Public links are projections, never stored URLs. */
export function planningInvalid(message) { return Object.assign(new Error(message), { status: 400, confirmedRefusal: true }); }
export function planningObject(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw planningInvalid(`Invalid ${label}`);
  return value;
}
export function planningSameUuid(left, right) {
  try { return planningUuid(left) === planningUuid(right); }
  catch (_) { return false; }
}
export function planningText(value, max, label, required = false) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value) || (required && !value.trim())) throw planningInvalid(`Invalid ${label}`);
  return value.trim();
}
export function planningUuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw planningInvalid('Invalid request or plan ID');
  return value.toLowerCase();
}
export function planningDate(value) {
  if (value === '') return value;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw planningInvalid('Invalid travel date');
  return value;
}
export function validateSearchDocument(input) {
  planningObject(input, ['schemaVersion', 'query', 'filters', 'location'], 'search');
  if (input.schemaVersion !== 1) throw planningInvalid('Invalid search version');
  const filters = planningObject(input.filters, ['state', 'game', 'stakes', 'date', 'type'], 'filters');
  const type = filters.type || 'all';
  if (!['all', 'venues', 'live', 'tournaments', 'series', 'tours', 'home-games'].includes(type)) throw planningInvalid('Invalid search type');
  const state = planningText(filters.state || '', 2, 'state').toUpperCase();
  if (state && !/^[A-Z]{2}$/.test(state)) throw planningInvalid('Invalid state');
  let location = null;
  if (input.location != null) {
    planningObject(input.location, ['city', 'state'], 'location');
    const locationState = planningText(input.location.state || '', 2, 'location state').toUpperCase();
    if (locationState && !/^[A-Z]{2}$/.test(locationState)) throw planningInvalid('Invalid location state');
    location = { city: planningText(input.location.city || '', 100, 'city'), state: locationState };
  }
  return { schemaVersion: 1, query: planningText(input.query || '', 200, 'query'), filters: { state, game: planningText(filters.game || '', 40, 'game'), stakes: planningText(filters.stakes || '', 40, 'stakes'), date: planningText(filters.date || '', 40, 'date'), type }, location };
}
export function validateTripDocument(input) {
  planningObject(input, ['schemaVersion', 'origin', 'destination', 'waypoints', 'corridorMi', 'dateRange', 'venueIds', 'seriesIds'], 'trip');
  if (input.schemaVersion !== 1 || ![25, 50, 100].includes(input.corridorMi) || !Array.isArray(input.waypoints) || input.waypoints.length > 8) throw planningInvalid('Invalid trip');
  planningObject(input.dateRange, ['start', 'end'], 'travel dates');
  const start = planningDate(input.dateRange.start || ''); const end = planningDate(input.dateRange.end || '');
  if (Boolean(start) !== Boolean(end) || (start && end < start)) throw planningInvalid('Use an ordered start and end date');
  const venueIds = input.venueIds || [];
  if (!Array.isArray(venueIds) || venueIds.length > 50 || venueIds.some(id => !Number.isSafeInteger(id) || id < 1)) throw planningInvalid('Invalid venue IDs');
  const seriesIds = input.seriesIds || [];
  if (!Array.isArray(seriesIds) || seriesIds.length > 50 || seriesIds.some(id => !Number.isSafeInteger(id) || id < 1)) throw planningInvalid('Invalid series IDs');
  return { schemaVersion: 1, origin: planningText(input.origin, 160, 'origin', true), destination: planningText(input.destination, 160, 'destination', true), waypoints: input.waypoints.map(value => planningText(value, 160, 'waypoint', true)), corridorMi: input.corridorMi, dateRange: { start, end }, venueIds: [...new Set(venueIds)], seriesIds: [...new Set(seriesIds)] };
}
export function validatePlanMutation(input) {
  planningObject(input, ['operation_id', 'action', 'id', 'kind', 'name', 'document', 'expected_revision'], 'plan request');
  const operation_id = planningUuid(input.operation_id); const id = planningUuid(input.id);
  if (!['create', 'update', 'delete'].includes(input.action)) throw planningInvalid('Invalid plan action');
  const payload = { action: input.action, id };
  if (input.action !== 'create') {
    if (!Number.isSafeInteger(input.expected_revision) || input.expected_revision < 1) throw planningInvalid('Invalid plan revision');
    payload.expected_revision = input.expected_revision;
  }
  if (input.action !== 'delete') {
    if (!['search', 'trip'].includes(input.kind)) throw planningInvalid('Invalid plan kind');
    Object.assign(payload, { kind: input.kind, name: planningText(input.name, 80, 'plan name', true), document: input.kind === 'search' ? validateSearchDocument(input.document) : validateTripDocument(input.document) });
  }
  return { operation_id, payload };
}
export function validatePreferencePatch(input) {
  const booleans = ['geofenceAlerts', 'locationEnabled', 'showNewcomerFriendly', 'locationPromptDismissed', 'manualLocation'];
  planningObject(input, [...booleans, 'lastLocation', 'lastLocationCity', 'lastLocationState', 'locationEnabledAt'], 'preferences');
  if (!Object.keys(input).length) throw planningInvalid('A preference patch is required');
  const patch = {};
  for (const [key, value] of Object.entries(input)) {
    if (booleans.includes(key)) { if (typeof value !== 'boolean') throw planningInvalid(`Invalid ${key}`); patch[key] = value; }
    else if (key === 'lastLocation') {
      if (value === null) patch[key] = null;
      else {
        planningObject(value, ['lat', 'lng'], 'coordinates');
        if (!Number.isFinite(value.lat) || !Number.isFinite(value.lng) || Math.abs(value.lat) > 90 || Math.abs(value.lng) > 180) throw planningInvalid('Invalid coordinates');
        patch[key] = { lat: value.lat, lng: value.lng };
      }
    } else if (key === 'locationEnabledAt') {
      const text = planningText(value, 40, key);
      planningDate(text.slice(0, 10));
      if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(text) || !Number.isFinite(Date.parse(text))) throw planningInvalid('Invalid location time');
      patch[key] = text;
    } else patch[key] = planningText(value, 100, key);
  }
  return patch;
}
export function buildSavedSearchUrl(input) {
  const document = validateSearchDocument(input);
  const canonical = buildDiscoveryUrl({ activeTab: 'venues', searchQuery: document.query });
  const params = new URLSearchParams(canonical.url.split('?')[1] || '');
  params.set('pnm_planning', JSON.stringify(document));
  return `/hub/poker-near-me/lobby?${params}`;
}
export function buildSafeTripShareUrl(input) {
  const document = validateTripDocument(input);
  if (!document.venueIds.length && !document.seriesIds.length) throw planningInvalid('Choose a published venue or event before sharing. Private starting points are never shared.');
  const params = new URLSearchParams();
  if (document.venueIds.length) params.set('planVenues', document.venueIds.join(','));
  if (document.seriesIds.length) params.set('planSeries', document.seriesIds.join(','));
  if (document.dateRange.start) { params.set('start', document.dateRange.start); params.set('end', document.dateRange.end); }
  return `/hub/poker-near-me/roadtrip?${params}`;
}
