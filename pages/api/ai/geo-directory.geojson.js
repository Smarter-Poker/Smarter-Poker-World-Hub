/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  GET /api/ai/geo-directory.geojson
 *  RFC 7946 GeoJSON Spatial FeatureCollection For Global & Regional Live Poker
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Returns an RFC 7946 `application/geo+json` FeatureCollection containing spatial
 * `Point` features for:
 * - All 12 Major US Regional Live Poker Markets
 * - All 10 International Live Poker Destinations
 * - All 10 Border-State & Airport Travel Corridors
 *
 * Includes coordinates ([longitude, latitude] per RFC 7946 Section 3.1.1),
 * venue/table counts, rake models, tax rules, and canonical HTML + Markdown URLs.
 *
 * House style: Title Case, zero em dashes.
 */

import { POKER_TRAVEL_CORRIDORS, corridorGuidePath } from '../../../src/content/guides/corridors.js';
import { POKER_MARKET_GUIDES, marketGuidePath } from '../../../src/content/guides/markets.js';
import { INTERNATIONAL_POKER_GUIDES, internationalGuidePath } from '../../../src/content/guides/internationalMarkets.js';
import { VENUE_COUNT } from '../../../src/lib/venueCount.mjs';

const US_MARKET_COORDS = {
  'las-vegas-nevada': { lat: 36.1147, lng: -115.1728, stateTax: '0.0% Nevada State Income Tax' },
  'los-angeles-california': { lat: 34.0006, lng: -118.1545, stateTax: 'Up To 13.3% California State Income Tax' },
  'south-florida-miami-hollywood': { lat: 26.0512, lng: -80.2112, stateTax: '0.0% Florida State Income Tax' },
  'houston-texas': { lat: 29.7372, lng: -95.5567, stateTax: '0.0% Texas State Income Tax' },
  'dallas-fort-worth-texas': { lat: 32.8651, lng: -96.9389, stateTax: '0.0% Texas State Income Tax' },
  'austin-san-antonio-texas': { lat: 30.4855, lng: -97.6769, stateTax: '0.0% Texas State Income Tax' },
  'tampa-central-florida': { lat: 27.9942, lng: -82.3752, stateTax: '0.0% Florida State Income Tax' },
  'atlantic-city-new-jersey': { lat: 39.3779, lng: -74.4347, stateTax: '3.0% To 10.75% New Jersey State Tax' },
  'philadelphia-pennsylvania': { lat: 40.1194, lng: -74.9535, stateTax: '3.07% Flat Pennsylvania State Tax' },
  'phoenix-scottsdale-arizona': { lat: 33.5396, lng: -111.8837, stateTax: '2.5% Flat Arizona State Income Tax' },
  'chicago-midwest-illinois': { lat: 41.9961, lng: -87.8631, stateTax: '4.95% Flat Illinois / 3.05% Indiana State Tax' },
  'new-england-boston-foxwoods': { lat: 42.3948, lng: -71.0548, stateTax: '5.0% MA / 0.0% NH / 6.99% CT State Tax' },
};

const INTERNATIONAL_HUB_COORDS = {
  'london-united-kingdom': { lat: 51.5115, lng: -0.1301 },
  'barcelona-spain': { lat: 41.3879, lng: 2.1965 },
  'rozvadov-czech-republic': { lat: 49.6694, lng: 12.5569 },
  'monte-carlo-monaco': { lat: 43.7392, lng: 7.4278 },
  'prague-czech-republic': { lat: 50.0878, lng: 14.4205 },
  'manila-philippines': { lat: 14.5136, lng: 120.9806 },
  'macau-china': { lat: 22.1486, lng: 113.5594 },
  'melbourne-australia': { lat: -37.8226, lng: 144.9585 },
  'montreal-canada': { lat: 45.4024, lng: -73.6815 },
  'nassau-bahamas': { lat: 25.0846, lng: -77.3198 },
};

export function buildGeoDirectoryFeatureCollection() {
  const features = [];

  // 1. 12 US Regional Markets
  for (const m of POKER_MARKET_GUIDES) {
    const coord = US_MARKET_COORDS[m.slug] || { lat: 36.1147, lng: -115.1728, stateTax: 'Statutory State Tax Rules' };
    const path = marketGuidePath(m.slug);
    features.push({
      type: 'Feature',
      id: `us-market-${m.slug}`,
      geometry: {
        type: 'Point',
        coordinates: [Number(coord.lng), Number(coord.lat)],
      },
      properties: {
        featureCategory: 'us_regional_poker_market',
        slug: m.slug,
        name: m.regionName,
        stateCode: m.stateCode,
        venueCountEstimate: m.activeRoomsEstimate,
        rakeModel: m.typicalRakeModel,
        signatureStakes: m.signatureStakes,
        taxRule: coord.stateTax,
        peakSeason: m.peakSeasonAndSeries,
        canonicalUrl: `https://smarter.poker${path}`,
        markdownUrl: `https://smarter.poker${path}.md`,
      },
    });
  }

  // 2. 10 International Poker Destinations
  for (const intl of INTERNATIONAL_POKER_GUIDES) {
    const coord = INTERNATIONAL_HUB_COORDS[intl.slug] || { lat: 51.5115, lng: -0.1301 };
    const path = internationalGuidePath(intl.slug);
    features.push({
      type: 'Feature',
      id: `international-hub-${intl.slug}`,
      geometry: {
        type: 'Point',
        coordinates: [Number(coord.lng), Number(coord.lat)],
      },
      properties: {
        featureCategory: 'international_poker_destination',
        slug: intl.slug,
        name: `${intl.city}, ${intl.country}`,
        region: intl.region,
        currency: intl.currency,
        venueCountEstimate: `${(intl.topPokerRooms || []).length} Flagship Casino Poker Rooms`,
        rakeModel: intl.rakeCap,
        signatureStakes: intl.typicalStakes,
        taxRule: intl.visitorTaxRule,
        flagshipSeries: intl.flagshipSeries,
        canonicalUrl: `https://smarter.poker${path}`,
        markdownUrl: `https://smarter.poker${path}.md`,
      },
    });
  }

  // 3. 10 Border-State & Airport Travel Corridors
  for (const c of POKER_TRAVEL_CORRIDORS) {
    const path = corridorGuidePath(c.slug);
    features.push({
      type: 'Feature',
      id: `travel-corridor-${c.slug}`,
      geometry: {
        type: 'Point',
        coordinates: [Number(c.originCoords.lng), Number(c.originCoords.lat)],
      },
      properties: {
        featureCategory: 'poker_travel_corridor',
        slug: c.slug,
        name: c.name,
        shortTitle: c.shortTitle,
        originCity: c.originCity,
        originAirportCode: c.originAirportCode,
        destinationCount: c.driveOptions.length,
        destinations: c.driveOptions.map((d) => ({
          venueName: d.venueName,
          jurisdiction: d.jurisdiction,
          distanceMiles: d.distanceMiles,
          driveMinutes: d.driveMinutes,
          rakeModel: d.rakeModel,
          taxWithholding: d.taxWithholding,
        })),
        ifThenBecause: c.ifThenBecause,
        canonicalUrl: `https://smarter.poker${path}`,
        markdownUrl: `https://smarter.poker${path}.md`,
      },
    });
  }

  return {
    type: 'FeatureCollection',
    metadata: {
      title: 'Smarter.Poker Global & North American Live Poker Spatial GeoJSON Directory',
      standard: 'RFC 7946 GeoJSON',
      verifiedAt: '2026-11-24',
      totalFeatures: features.length,
      totalVerifiedVenuesInCorpus: VENUE_COUNT,
      counts: {
        usRegionalMarkets: POKER_MARKET_GUIDES.length,
        internationalPokerDestinations: INTERNATIONAL_POKER_GUIDES.length,
        travelCorridors: POKER_TRAVEL_CORRIDORS.length,
      },
      license: 'CC-BY-4.0',
      doi: '10.5281/zenodo.24115647',
      canonicalUrl: 'https://smarter.poker/api/ai/geo-directory.geojson',
    },
    features,
  };
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const payload = buildGeoDirectoryFeatureCollection();

  res.setHeader('Content-Type', 'application/geo+json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Robots-Tag', 'index, follow, max-snippet:-1');
  return res.status(200).send(JSON.stringify(payload, null, 2));
}
