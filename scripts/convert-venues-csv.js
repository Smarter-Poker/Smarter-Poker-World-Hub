#!/usr/bin/env node
/**
 * Convert verified-venues-master.csv to all-venues.json
 * Generates a comprehensive JSON file with all 483+ venues, each with a unique ID.
 */

const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '..', 'data', 'verified-venues-master.csv');
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'all-venues.json');

// US State coordinates for approximate lat/lng when GPS unavailable
const STATE_COORDS = {
  'AL': [32.36, -86.30], 'AK': [64.20, -152.49], 'AZ': [33.45, -111.97],
  'AR': [34.75, -92.29], 'CA': [36.78, -119.42], 'CO': [39.55, -105.78],
  'CT': [41.60, -72.76], 'DE': [38.91, -75.53], 'FL': [28.65, -81.52],
  'GA': [33.25, -83.44], 'HI': [21.31, -157.86], 'ID': [43.62, -114.74],
  'IL': [40.63, -89.40], 'IN': [40.27, -86.13], 'IA': [41.88, -93.10],
  'KS': [39.01, -98.48], 'KY': [37.84, -84.27], 'LA': [30.98, -91.96],
  'ME': [45.25, -69.45], 'MD': [39.05, -76.64], 'MA': [42.41, -71.38],
  'MI': [42.73, -84.56], 'MN': [46.73, -94.69], 'MS': [32.35, -89.40],
  'MO': [37.96, -91.83], 'MT': [46.88, -110.36], 'NE': [41.49, -99.90],
  'NV': [36.17, -115.14], 'NH': [43.19, -71.57], 'NJ': [40.06, -74.41],
  'NM': [34.52, -105.87], 'NY': [43.30, -74.22], 'NC': [35.76, -79.02],
  'ND': [47.55, -101.00], 'OH': [40.42, -82.91], 'OK': [35.47, -97.52],
  'OR': [43.80, -120.55], 'PA': [41.20, -77.19], 'RI': [41.58, -71.48],
  'SC': [33.84, -81.16], 'SD': [43.97, -99.90], 'TN': [35.52, -86.58],
  'TX': [31.97, -99.90], 'UT': [39.32, -111.09], 'VT': [44.56, -72.58],
  'VA': [37.43, -78.66], 'WA': [47.75, -120.74], 'WV': [38.60, -80.45],
  'WI': [44.27, -89.62], 'WY': [43.08, -107.29], 'DC': [38.91, -77.04],
};

function parseCSVLine(line) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { parts.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  parts.push(current.trim());
  return parts;
}

function slugify(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function mapVenueType(type) {
  const t = (type || '').toLowerCase().trim();
  if (t === 'casino') return 'casino';
  if (t === 'card room' || t === 'standalone card room') return 'card_room';
  if (t === 'charity poker' || t === 'charity room') return 'charity';
  if (t === 'poker club') return 'poker_club';
  // If type looks like a phone number, CSV row was shifted - default to card_room
  if (/^\(\d{3}\)/.test(t)) return 'card_room';
  if (t.includes('card')) return 'card_room';
  if (t.includes('charity')) return 'charity';
  if (t.includes('club')) return 'poker_club';
  return 'casino';
}

function calculateTrustScore(venue) {
  let score = 1;
  if (venue.website && venue.website !== '-') score++;
  if (venue.poker_atlas_url && venue.poker_atlas_url !== 'Not available') score++;
  if (venue.phone) score++;
  if (venue.hours && venue.hours !== 'Not available') score++;
  return score;
}

// Parse CSV
const csv = fs.readFileSync(CSV_PATH, 'utf8');
const lines = csv.trim().split('\n');
const header = lines[0];
const venues = [];

for (let i = 1; i < lines.length; i++) {
  const parts = parseCSVLine(lines[i]);
  if (parts.length < 5 || !parts[0]) continue;

  const name = parts[0];
  const website = parts[1] && parts[1] !== '-' ? parts[1] : null;
  const address = parts[2] || null;
  const city = parts[3] || '';
  const state = parts[4] || '';
  const phone = parts[5] || null;
  const venueType = mapVenueType(parts[6]);
  const hasTournaments = (parts[7] || '').toLowerCase() === 'yes';
  const pokerAtlasUrl = parts[8] && parts[8] !== 'Not available' ? parts[8] : null;
  const hours = parts[9] && parts[9] !== 'Not available' ? parts[9] : null;

  const coords = STATE_COORDS[state] || [39.83, -98.58]; // Default: center of US

  const venue = {
    id: i,
    name,
    slug: slugify(name),
    website,
    address,
    city,
    state,
    phone,
    venue_type: venueType,
    has_tournaments: hasTournaments,
    poker_atlas_url: pokerAtlasUrl,
    hours,
    latitude: coords[0] + (Math.random() - 0.5) * 0.5, // Slight offset per venue within state
    longitude: coords[1] + (Math.random() - 0.5) * 0.5,
    trust_score: 0,
    is_featured: false,
  };
  venue.trust_score = calculateTrustScore(venue);
  venues.push(venue);
}

// Stats
const byType = {};
venues.forEach(v => { byType[v.venue_type] = (byType[v.venue_type] || 0) + 1; });
const states = [...new Set(venues.map(v => v.state))].sort();

const output = {
  metadata: {
    description: 'All verified poker venues - converted from verified-venues-master.csv',
    generated: new Date().toISOString(),
    total: venues.length,
    by_type: byType,
    states_covered: states.length,
    with_tournaments: venues.filter(v => v.has_tournaments).length,
    with_poker_atlas: venues.filter(v => v.poker_atlas_url).length,
  },
  venues,
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
console.log('Generated', OUTPUT_PATH);
console.log('Total venues:', venues.length);
console.log('By type:', JSON.stringify(byType));
console.log('States:', states.length);
console.log('With tournaments:', venues.filter(v => v.has_tournaments).length);
console.log('With PokerAtlas:', venues.filter(v => v.poker_atlas_url).length);
