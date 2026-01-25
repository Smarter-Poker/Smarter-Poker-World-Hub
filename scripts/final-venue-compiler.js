#!/usr/bin/env node
/**
 * FINAL Poker Venues CSV Compiler
 * Extracts ALL venues from SQL migration files
 */

const fs = require('fs');
const path = require('path');

const SQL_FILES = [
    'supabase/migrations/20260118_venues_comprehensive_part1.sql',
    'supabase/migrations/20260118_venues_comprehensive_part2.sql',
    'supabase/migrations/20260118_venues_comprehensive_part3.sql',
    'supabase/migrations/20260118_venues_comprehensive_part4.sql',
];

function generatePokerAtlasSlug(name) {
    return name
        .toLowerCase()
        .replace(/['']/g, '')
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function extractVenuesFromSQL(content) {
    const venues = [];

    // Split by INSERT INTO and process each block
    const blocks = content.split(/INSERT INTO poker_venues/i);

    for (const block of blocks) {
        if (!block.includes('VALUES')) continue;

        // Find all lines that start with ('
        const lines = block.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();

            // Skip comments and non-data lines
            if (trimmed.startsWith('--') || !trimmed.startsWith("('")) continue;

            // Extract the venue data
            const match = trimmed.match(/^\('([^']+)',\s*'([^']+)',\s*'([^']*)',\s*'([^']+)',\s*'([^']+)',\s*'([^']*)',\s*(?:'([^']*)'|NULL),\s*ARRAY\[([^\]]*)\],\s*ARRAY\[([^\]]*)\],\s*(\d+),\s*'([^']+)',\s*([\d.]+),\s*(true|false)/);

            if (match) {
                const cleanArray = (str) => str ? str.replace(/'/g, '').split(',').map(s => s.trim()).join(', ') : '';

                venues.push({
                    name: match[1],
                    venue_type: match[2],
                    address: match[3],
                    city: match[4],
                    state: match[5],
                    phone: match[6],
                    website: match[7] || '',
                    games_offered: cleanArray(match[8]),
                    stakes_cash: cleanArray(match[9]),
                    poker_tables: match[10],
                    hours: match[11],
                    trust_score: match[12],
                    is_featured: match[13]
                });
            }
        }
    }

    return venues;
}

function processAllFiles() {
    const allVenues = [];
    const seen = new Set();

    for (const file of SQL_FILES) {
        const filePath = path.join(process.cwd(), file);
        if (!fs.existsSync(filePath)) {
            console.log(`  Skipping ${file} - not found`);
            continue;
        }

        console.log(`  Processing ${file}...`);
        const content = fs.readFileSync(filePath, 'utf8');
        const venues = extractVenuesFromSQL(content);

        console.log(`    Found ${venues.length} venues`);

        for (const venue of venues) {
            const key = `${venue.name}|${venue.city}|${venue.state}`;
            if (!seen.has(key)) {
                seen.add(key);
                allVenues.push(venue);
            }
        }
    }

    return allVenues;
}

function escapeCSV(val) {
    if (!val) return '';
    val = String(val);
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
}

function generateCSV(venues) {
    const headers = [
        'Venue Name',
        'City',
        'State',
        'Venue Type',
        'Address',
        'Phone',
        'Website',
        'Email',
        'PokerAtlas URL',
        'Hours',
        'Games Offered',
        'Stakes',
        'Tables',
        'Offers Tournaments',
        'Trust Score',
        'Featured'
    ];

    const rows = [headers.join(',')];

    for (const v of venues) {
        const slug = generatePokerAtlasSlug(v.name);
        const pokeratlasUrl = `https://www.pokeratlas.com/poker-room/${slug}`;

        const row = [
            escapeCSV(v.name),
            escapeCSV(v.city),
            escapeCSV(v.state),
            escapeCSV(v.venue_type),
            escapeCSV(v.address),
            escapeCSV(v.phone),
            escapeCSV(v.website),
            '', // Email
            escapeCSV(pokeratlasUrl),
            escapeCSV(v.hours || '24/7'),
            escapeCSV(v.games_offered),
            escapeCSV(v.stakes_cash),
            escapeCSV(v.poker_tables),
            'Yes',
            escapeCSV(v.trust_score),
            v.is_featured === 'true' ? 'Yes' : 'No'
        ];

        rows.push(row.join(','));
    }

    return rows.join('\n');
}

// Main
console.log('');
console.log('='.repeat(60));
console.log('POKER VENUES MASTER CSV COMPILER');
console.log('='.repeat(60));
console.log('');

const venues = processAllFiles();

console.log('');
console.log(`TOTAL UNIQUE VENUES: ${venues.length}`);
console.log('');

// Count by state
const byState = {};
for (const v of venues) {
    byState[v.state] = (byState[v.state] || 0) + 1;
}
console.log('BY STATE:');
Object.entries(byState)
    .sort((a, b) => b[1] - a[1])
    .forEach(([state, count]) => console.log(`  ${state}: ${count}`));

const csv = generateCSV(venues);
const outputPath = path.join(process.cwd(), 'poker_clubs_master.csv');
fs.writeFileSync(outputPath, csv);

console.log('');
console.log(`CSV SAVED: ${outputPath}`);
console.log('='.repeat(60));
