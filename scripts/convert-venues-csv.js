#!/usr/bin/env node
/**
 * Convert verified-venues-master.csv to all-venues.json
 * Generates a comprehensive JSON file with all 483+ venues, each with a unique ID.
 */

const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '..', 'data', 'verified-venues-master.csv');
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'all-venues.json');

// State coordinates for approximate lat/lng
const STATE_COORDS = {
  'AL': { lat: 32.3182, lng: -86.9023 },
  'AK': { lat: 64.2008, lng: -152.4937 },
  'AZ': { lat: 33.4942, lng: -111.9261 },
  'AR': { lat: 34.7465, lng: -92.2896 },
  'CA': { lat: 34.0522, lng: -118.2437 },
  'CO': { lat: 39.7985, lng: -105.5044 },
  'CT': { lat: 41.4741, lng: -71.9604 },
  'DE': { lat: 39.1582, lng: -75.5244 },
  'FL': { lat: 26.1224, lng: -80.1373 },
  'GA': { lat: 33.7490, lng: -84.3880 },
  'HI': { lat: 19.8968, lng: -155.5828 },
  'ID': { lat: 43.6150, lng: -116.2023 },
  'IL': { lat: 42.0111, lng: -87.8406 },
  'IN': { lat: 39.7684, lng: -86.1581 },
  'IA': { lat: 41.4460, lng: -91.0751 },
  'KS': { lat: 37.6872, lng: -97.3301 },
  'KY': { lat: 38.2527, lng: -85.7585 },
  'LA': { lat: 29.9511, lng: -90.0715 },
  'ME': { lat: 43.6591, lng: -70.2568 },
  'MD': { lat: 39.1637, lng: -76.7247 },
  'MA': { lat: 42.3601, lng: -71.0589 },
  'MI': { lat: 42.3100, lng: -85.1658 },
  'MN': { lat: 44.7866, lng: -93.4877 },
  'MS': { lat: 30.3960, lng: -88.8853 },
  'MO': { lat: 38.6270, lng: -90.1994 },
  'MT': { lat: 46.8797, lng: -110.3626 },
  'NE': { lat: 41.2565, lng: -95.9345 },
  'NV': { lat: 36.1699, lng: -115.1398 },
  'NH': { lat: 43.2081, lng: -71.5376 },
  'NJ': { lat: 39.3643, lng: -74.4229 },
  'NM': { lat: 35.0844, lng: -106.6504 },
  'NY': { lat: 43.0760, lng: -75.6988 },
  'NC': { lat: 35.4676, lng: -83.3149 },
  'ND': { lat: 46.8772, lng: -96.7898 },
  'OH': { lat: 39.9612, lng: -82.9988 },
  'OK': { lat: 33.9137, lng: -96.3707 },
  'OR': { lat: 44.9916, lng: -123.9615 },
  'PA': { lat: 40.1105, lng: -74.8526 },
  'RI': { lat: 41.8240, lng: -71.4128 },
  'SC': { lat: 34.0007, lng: -81.0348 },
  'SD': { lat: 44.3668, lng: -100.3538 },
  'TN': { lat: 36.1627, lng: -86.7816 },
  'TX': { lat: 30.2672, lng: -97.7431 },
  'UT': { lat: 40.7608, lng: -111.8910 },
  'VT': { lat: 44.2601, lng: -72.5754 },
  'VA': { lat: 37.5407, lng: -77.4360 },
  'WA': { lat: 47.2868, lng: -122.2029 },
  'WV': { lat: 38.3498, lng: -81.6326 },
  'WI': { lat: 43.0389, lng: -87.9065 },
  'WY': { lat: 42.7559, lng: -107.3025 },
  'DC': { lat: 38.9072, lng: -77.0369 },
};

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function generateSlug(name, city, state) {
  const raw = `${name}-${city}-${state}`;
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

function mapVenueType(type) {
  const t = (type || '').toLowerCase().trim();
  if (t === 'casino') return 'casino';
  if (t === 'card room' || t === 'standalone card room') return 'card_room';
  if (t === 'charity poker' || t === 'charity room') return 'charity';
  if (t === 'poker club') return 'poker_club';
  // If type looks like a phone number, the CSV row was shifted - default to card_room
  if (t.match(/^\(\d{3}\)/)) return 'card_room';
  return 'casino';
}

const csv = fs.readFileSync(CSV_PATH, 'utf-8');
const lines = csv.split('\n').filter(l => l.trim());
const header = parseCSVLine(lines[0]);

console.log('CSV Header:', header);
console.log(`Total data lines: ${lines.length - 1}`);

const venues = [];

for (let i = 1; i < lines.length; i++) {
  const fields = parseCSVLine(lines[i]);
  if (fields.length < 7) continue;

  const name = fields[0] || '';
  const website = fields[1] || '';
  const address = fields[2] || '';
  const city = fields[3] || '';
  const state = fields[4] || '';
  const phone = fields[5] || '';
  const type = fields[6] || '';
  const tournaments = (fields[7] || '').toLowerCase() === 'yes';
  const pokerAtlasUrl = fields[8] || '';
  const hours = fields[9] || '';

  if (!name) continue;

  const id = i;
  const slug = generateSlug(name, city, state);
  const venueType = mapVenueType(type);
  const coords = STATE_COORDS[state] || { lat: 39.8283, lng: -98.5795 };

  venues.push({
    id,
    slug,
    name,
    venue_type: venueType,
    city,
    state,
    address: address && address !== '-' ? `${address}, ${city}, ${state}` : `${city}, ${state}`,
    phone: phone && phone !== '-' ? phone : null,
    website: website && website !== '-' ? (website.startsWith('http') ? website : `https://${website}`) : null,
    hours: hours && hours !== 'Not available' && hours !== '-' ? hours : null,
    has_tournaments: tournaments,
    poker_atlas_url: pokerAtlasUrl || null,
    lat: coords.lat,
    lng: coords.lng,
    trust_score: tournaments ? 4.0 : 3.5,
    is_featured: false
  });
}

// Mark well-known venues as featured
const featuredNames = [
  'Bellagio', 'Commerce Casino', 'Seminole Hard Rock Hollywood',
  'Borgata', 'Wynn', 'Venetian', 'ARIA', 'The Lodge',
  'Bay 101', 'Thunder Valley', 'Foxwoods', 'Mohegan Sun',
  'WinStar', 'Choctaw', 'Harrah', 'bestbet',
  'MGM', 'Hard Rock', 'Rivers Casino'
];

venues.forEach(v => {
  if (featuredNames.some(fn => v.name.toLowerCase().includes(fn.toLowerCase()))) {
    v.is_featured = true;
    v.trust_score = 4.5;
  }
});

const output = {
  metadata: {
    description: "All verified poker venues - casinos, card rooms, clubs, and charity rooms",
    source: "verified-venues-master.csv",
    lastUpdated: new Date().toISOString().split('T')[0],
    totalVenues: venues.length,
    byType: {
      casino: venues.filter(v => v.venue_type === 'casino').length,
      card_room: venues.filter(v => v.venue_type === 'card_room').length,
      poker_club: venues.filter(v => v.venue_type === 'poker_club').length,
      charity: venues.filter(v => v.venue_type === 'charity').length,
    },
    byState: {},
    withTournaments: venues.filter(v => v.has_tournaments).length,
  },
  venues
};

// Count by state
venues.forEach(v => {
  output.metadata.byState[v.state] = (output.metadata.byState[v.state] || 0) + 1;
});

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
console.log(`\nWritten ${venues.length} venues to ${OUTPUT_PATH}`);
console.log(`By type:`, output.metadata.byType);
console.log(`With tournaments: ${output.metadata.withTournaments}`);
console.log(`States covered: ${Object.keys(output.metadata.byState).length}`);
