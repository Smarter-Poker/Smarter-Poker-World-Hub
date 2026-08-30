import { venueIdentityKey } from './venueIntegrity.js';
import { assessVenueLocation } from './venueIntegrityServer.js';

const ISSUE_PRIORITY = Object.freeze({ conflict: 0, missing: 1, duplicate: 2, unverified: 3 });

function safeText(value) {
  return String(value ?? '').trim();
}

function issueRecord(venue, issueType, relatedIds = []) {
  return {
    id: venue.id,
    name: safeText(venue.name) || 'Unnamed venue',
    venue_type: venue.venue_type || 'card_room',
    address: safeText(venue.address),
    city: safeText(venue.city),
    state: safeText(venue.state),
    latitude: venue.latitude ?? venue.lat ?? null,
    longitude: venue.longitude ?? venue.lng ?? null,
    updated_at: venue.updated_at || null,
    data_quality: venue.data_quality || null,
    scrape_status: venue.scrape_status || null,
    issue_type: issueType,
    location_quality: venue.location_quality,
    related_ids: relatedIds,
  };
}

/**
 * Build the operator queue from complete source records. Unlike the public
 * directory, this intentionally does not dedupe first: operators need to see
 * every conflicting source row in order to repair or retire it.
 */
export function buildVenueIntegrityQueue(venues = []) {
  const assessed = (Array.isArray(venues) ? venues : []).filter(Boolean).map((venue) => ({
    ...venue,
    location_quality: assessVenueLocation(venue),
  }));
  const identityGroups = new Map();

  for (const venue of assessed) {
    const key = venueIdentityKey(venue);
    if (!key || !key.startsWith('place:')) continue;
    const group = identityGroups.get(key) || [];
    group.push(venue);
    identityGroups.set(key, group);
  }

  const issues = [];
  const issueIds = new Set();
  for (const venue of assessed) {
    const status = venue.location_quality.status;
    if (!['conflict', 'missing', 'unverified'].includes(status)) continue;
    issues.push(issueRecord(venue, status));
    issueIds.add(String(venue.id));
  }

  let duplicateGroups = 0;
  for (const group of identityGroups.values()) {
    if (group.length < 2) continue;
    duplicateGroups += 1;
    const relatedIds = group.map((venue) => venue.id).filter((id) => id != null);
    for (const venue of group) {
      if (issueIds.has(String(venue.id))) continue;
      issues.push(issueRecord(venue, 'duplicate', relatedIds.filter((id) => String(id) !== String(venue.id))));
      issueIds.add(String(venue.id));
    }
  }

  issues.sort((a, b) => {
    const priority = (ISSUE_PRIORITY[a.issue_type] ?? 99) - (ISSUE_PRIORITY[b.issue_type] ?? 99);
    if (priority) return priority;
    return `${a.state}|${a.city}|${a.name}`.localeCompare(`${b.state}|${b.city}|${b.name}`);
  });

  const counts = { conflict: 0, missing: 0, duplicate: 0, unverified: 0 };
  for (const issue of issues) counts[issue.issue_type] += 1;

  return {
    issues,
    summary: {
      input: assessed.length,
      actionable: issues.length,
      duplicate_groups: duplicateGroups,
      ...counts,
    },
  };
}

export function filterVenueIntegrityQueue(issues = [], { status = 'all', search = '' } = {}) {
  const normalizedStatus = ['all', 'conflict', 'missing', 'duplicate', 'unverified'].includes(status) ? status : 'all';
  const term = safeText(search).toLowerCase();
  return (Array.isArray(issues) ? issues : []).filter((issue) => {
    if (normalizedStatus !== 'all' && issue.issue_type !== normalizedStatus) return false;
    if (!term) return true;
    return [issue.id, issue.name, issue.address, issue.city, issue.state]
      .some((value) => String(value ?? '').toLowerCase().includes(term));
  });
}

export const venueIntegrityOperationsContract = Object.freeze({
  issueTypes: Object.keys(ISSUE_PRIORITY),
  correctionStatuses: ['verified', 'border'],
});
