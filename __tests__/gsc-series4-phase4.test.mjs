/**
 * GSC & AEO SERIES 4 PHASE 4: HTTP 410 GONE FOR SUPPRESSED VENUES & WITHDRAWN TOURNAMENT SERIES
 *
 * Verifies:
 *   1. pages/hub/venues/[id].js sets res.statusCode = 410 and returns isGone: true
 *      when a venue is suppressed (is_suppressed === true) without a canonical_venue_id,
 *      while preserving permanent 301/308 redirect when canonical_venue_id is set.
 *   2. VenueDetailPage disables SWR background polling when isGone is true and renders
 *      the Withdrawn DeepRouteNotice with active directory fallback links.
 *   3. pages/hub/series/[id].js sets res.statusCode = 410 when status === 'gone'
 *      and does not retry 410 Gone responses in SWR.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('pages/hub/venues/[id].js returns HTTP 410 Gone for suppressed venues without a canonical redirect', () => {
  const venueCode = read('pages/hub/venues/[id].js');
  assert.match(venueCode, /if \(data && data\.is_suppressed && data\.canonical_venue_id\)/);
  assert.match(venueCode, /if \(data && data\.is_suppressed\) \{\s*confirmedGone = true;/);
  assert.match(venueCode, /if \(!venue && confirmedGone\) \{\s*res\.statusCode = 410;/);
  assert.match(venueCode, /isGone:\s*true/);
});

test('VenueDetailPage gates SWR fetch on !isGone and renders Withdrawn notice', () => {
  const venueCode = read('pages/hub/venues/[id].js');
  assert.match(venueCode, /export default function VenueDetailPage\(\{ venueId = null, initialVenue = null, isGone = false \}\)/);
  assert.match(venueCode, /const swrKey = \(id && !isGone\) \? `\/api\/poker\/venues\?id=\$\{id\}` : null;/);
  assert.match(venueCode, /pill=\{isGone \? 'Withdrawn' : 'Not Found'\}/);
});

test('pages/hub/series/[id].js returns HTTP 410 Gone and skips SWR retries on 410', () => {
  const seriesCode = read('pages/hub/series/[id].js');
  assert.match(seriesCode, /else if \(status === 'gone'\) \{[\s\S]{0,200}?res\.statusCode = 410;/);
  assert.match(seriesCode, /if \(seriesRes\.status === 410\) throw new Error\('Series removed \(410 Gone\)'\);/);
  assert.match(seriesCode, /error\.message\.includes\('410'\)/);
});
