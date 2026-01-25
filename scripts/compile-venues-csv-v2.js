#!/usr/bin/env node
/**
 * Compile all poker venues from SQL migration files into a single CSV
 * Version 2 - Better parsing of SQL INSERT statements
 */

const fs = require('fs');
const path = require('path');

// Files to process
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

function parseVenueFromLine(line) {
    // Match pattern: ('name', 'type', 'address', 'city', 'state', 'phone', 'website', ARRAY[...], ARRAY[...], tables, 'hours', score, featured)
    const regex = /\('([^']*)'(?:,\s*)?'([^']*)'(?:,\s*)?'([^']*)'(?:,\s*)?'([^']*)'(?:,\s*)?'([^']*)'(?:,\s*)?'([^']*)'(?:,\s*)?(?:'([^']*)'|NULL)(?:,\s*)?(ARRAY\[[^\]]*\])(?:,\s*)?(ARRAY\[[^\]]*\])(?:,\s*)?(\d+)(?:,\s*)?'([^']*)'(?:,\s*)?([\d.]+)(?:,\s*)?(true|false)/i;

    const match = line.match(regex);
    if (!match) return null;

    const cleanArray = (arr) => {
        if (!arr) return '';
        return arr
            .replace(/ARRAY\[/g, '')
            .replace(/\]/g, '')
            .replace(/'/g, '')
            .split(',')
            .map(s => s.trim())
            .join(', ');
    };

    return {
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
        hours_weekday: match[11],
        trust_score: match[12],
        is_featured: match[13]
    };
}

function processAllFiles() {
    const allVenues = [];
    const seen = new Set();

    for (const file of SQL_FILES) {
        const filePath = path.join(process.cwd(), file);
        if (!fs.existsSync(filePath)) {
            console.log(`Skipping ${file} - not found`);
            continue;
        }

        console.log(`Processing ${file}...`);
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        for (const line of lines) {
            // Skip comments and non-data lines
            if (line.trim().startsWith('--') || !line.includes("('")) continue;

            const venue = parseVenueFromLine(line);
            if (venue && venue.name) {
                const key = `${venue.name}|${venue.city}|${venue.state}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    allVenues.push(venue);
                }
            }
        }
    }

    return allVenues;
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

    const escapeCSV = (val) => {
        if (!val) return '';
        val = String(val);
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            return '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
    };

    const rows = [headers.join(',')];

    for (const v of venues) {
        const slug = generatePokerAtlasSlug(v.name);
        const pokeratlasUrl = `https://www.pokeratlas.com/poker-room/${slug}`;
        const offersTournaments = 'Yes';

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
            escapeCSV(v.hours_weekday || '24/7'),
            escapeCSV(v.games_offered),
            escapeCSV(v.stakes_cash),
            escapeCSV(v.poker_tables),
            escapeCSV(offersTournaments),
            escapeCSV(v.trust_score),
            escapeCSV(v.is_featured === 'true' ? 'Yes' : 'No')
        ];

        rows.push(row.join(','));
    }

    return rows.join('\n');
}

console.log('='.repeat(60));
console.log('Poker Venues CSV Compiler v2');
console.log('='.repeat(60));

const venues = processAllFiles();
console.log(`\nTotal unique venues found: ${venues.length}`);

const csv = generateCSV(venues);
const outputPath = path.join(process.cwd(), 'poker_clubs_master.csv');
fs.writeFileSync(outputPath, csv);

console.log(`\nCSV written to: ${outputPath}`);
console.log('='.repeat(60));
