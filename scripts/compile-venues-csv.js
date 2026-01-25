#!/usr/bin/env node
/**
 * Compile all poker venues from SQL migration files into a single CSV
 * CRITICAL: Preserves exact data relationships - no mixing of venue data
 */

const fs = require('fs');
const path = require('path');

// Files to process in order - ALL files with venue data
const SQL_FILES = [
    'supabase/migrations/20260118_poker_venues_schema.sql',
    'supabase/migrations/20260118_master_poker_database.sql',
    'supabase/migrations/20260118_bulk_venues.sql',
    'supabase/migrations/20260118_venues_comprehensive_part1.sql',
    'supabase/migrations/20260118_venues_comprehensive_part2.sql',
    'supabase/migrations/20260118_venues_comprehensive_part3.sql',
    'supabase/migrations/20260118_venues_comprehensive_part4.sql',
    'supabase/migrations/20260119_insert_30_venues.sql',
    'supabase/seeds/captain_seed_data.sql',
    'COPY_PASTE_VENUES.sql',
    'BATCH_1_NEVADA.sql',
    'BATCH_2_CALIFORNIA.sql',
    'BATCH_3_FLORIDA_NJ.sql',
];

// Generate PokerAtlas slug from venue name
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

// Parse a single SQL INSERT statement for venues
function parseVenueInsert(sql) {
    const venues = [];

    // Match VALUES blocks
    const valuesMatch = sql.match(/VALUES\s*([\s\S]*?)(?:ON CONFLICT|;)/i);
    if (!valuesMatch) return venues;

    const valuesBlock = valuesMatch[1];

    // Split into individual venue records - each starts with ('
    const records = valuesBlock.split(/\),\s*\n\s*\(/);

    for (let record of records) {
        // Clean up the record
        record = record.replace(/^\s*\(?\s*'/, "'").replace(/\)\s*$/, '');

        // Parse fields - this is tricky due to nested arrays
        const venue = parseVenueRecord(record);
        if (venue && venue.name) {
            venues.push(venue);
        }
    }

    return venues;
}

// Parse a single venue record
function parseVenueRecord(record) {
    try {
        // Extract fields by finding quoted strings and values
        const fields = [];
        let current = '';
        let inQuote = false;
        let inArray = false;
        let depth = 0;

        for (let i = 0; i < record.length; i++) {
            const char = record[i];
            const prevChar = i > 0 ? record[i-1] : '';

            if (char === "'" && prevChar !== "'") {
                inQuote = !inQuote;
                current += char;
            } else if (char === '[' || (char === 'A' && record.substr(i, 5) === 'ARRAY')) {
                inArray = true;
                depth++;
                current += char;
            } else if (char === ']') {
                depth--;
                if (depth === 0) inArray = false;
                current += char;
            } else if (char === ',' && !inQuote && !inArray) {
                fields.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        if (current.trim()) {
            fields.push(current.trim());
        }

        // Clean field values
        const cleanField = (f) => {
            if (!f || f === 'NULL' || f === 'null') return '';
            f = f.trim();
            if (f.startsWith("'") && f.endsWith("'")) {
                return f.slice(1, -1).replace(/''/g, "'");
            }
            if (f.startsWith('ARRAY[')) {
                // Parse array
                const arrContent = f.match(/ARRAY\[(.*)\]/);
                if (arrContent) {
                    return arrContent[1].replace(/'/g, '').split(',').map(s => s.trim()).join(', ');
                }
            }
            return f;
        };

        // Map to venue object based on column order from schema
        // Column order: name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured
        return {
            name: cleanField(fields[0]),
            venue_type: cleanField(fields[1]),
            address: cleanField(fields[2]),
            city: cleanField(fields[3]),
            state: cleanField(fields[4]),
            phone: cleanField(fields[5]),
            website: cleanField(fields[6]),
            games_offered: cleanField(fields[7]),
            stakes_cash: cleanField(fields[8]),
            poker_tables: cleanField(fields[9]),
            hours_weekday: cleanField(fields[10]),
            trust_score: cleanField(fields[11]),
            is_featured: cleanField(fields[12])
        };
    } catch (e) {
        console.error('Error parsing record:', e.message);
        return null;
    }
}

// Process all SQL files
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
        const sql = fs.readFileSync(filePath, 'utf8');

        // Find all INSERT INTO poker_venues statements
        const insertPattern = /INSERT INTO poker_venues[^;]+;/gi;
        const inserts = sql.match(insertPattern) || [];

        for (const insert of inserts) {
            const venues = parseVenueInsert(insert);
            for (const venue of venues) {
                // Dedupe by name+city+state
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

// Generate CSV
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

        // Determine if offers tournaments based on venue type
        const offersTournaments = v.venue_type === 'casino' || v.venue_type === 'card_room' || v.venue_type === 'poker_club' ? 'Yes' : 'Unknown';

        const row = [
            escapeCSV(v.name),
            escapeCSV(v.city),
            escapeCSV(v.state),
            escapeCSV(v.venue_type),
            escapeCSV(v.address),
            escapeCSV(v.phone),
            escapeCSV(v.website),
            '', // Email - not in source data
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

// Main
console.log('='.repeat(60));
console.log('Poker Venues CSV Compiler');
console.log('='.repeat(60));

const venues = processAllFiles();
console.log(`\nTotal unique venues found: ${venues.length}`);

const csv = generateCSV(venues);
const outputPath = path.join(process.cwd(), 'poker_clubs_master.csv');
fs.writeFileSync(outputPath, csv);

console.log(`\nCSV written to: ${outputPath}`);
console.log('='.repeat(60));
