#!/usr/bin/env node
/**
 * Generate SQL import scripts for venues and tournament series
 */

const fs = require('fs');
const path = require('path');

// Read the venues CSV
const venuesCsvPath = path.join(__dirname, '..', 'data', 'verified-venues-master.csv');
const seriesCsvPath = '/tmp/tournament_series_raw.csv';

function escapeSQL(str) {
    if (!str || str === '-' || str === 'Not available') return 'NULL';
    return `'${str.replace(/'/g, "''")}'`;
}

function parseVenueType(type) {
    const typeMap = {
        'Casino': 'casino',
        'Standalone Card Room': 'card_room',
        'Poker Club': 'poker_club',
        'Charity Room': 'poker_club',
        'Charity Poker': 'poker_club',
        'Card Room': 'card_room'
    };
    return typeMap[type] || 'card_room';
}

function generateVenuesSQL() {
    console.log('Generating venues SQL...');

    const csv = fs.readFileSync(venuesCsvPath, 'utf8');
    const lines = csv.trim().split('\n');
    const header = lines[0];

    let sql = `-- ============================================
-- IMPORT ALL 484 VERIFIED VENUES
-- Run this in Supabase SQL Editor
-- ============================================

-- Clear existing venues first (optional - uncomment if needed)
-- TRUNCATE TABLE poker_venues CASCADE;

INSERT INTO poker_venues (name, website, address, city, state, phone, venue_type, games_offered, stakes_cash, trust_score, is_verified, is_active)
VALUES
`;

    const values = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        // Parse CSV (handle quoted fields)
        const fields = [];
        let current = '';
        let inQuotes = false;

        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                fields.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        fields.push(current.trim());

        const [venue, website, address, city, state, phone, type, tournaments, pokeratlasUrl, hours] = fields;

        if (!venue || !city || !state) continue;

        const venueType = parseVenueType(type);
        const hasTournaments = tournaments === 'Yes';
        const gamesOffered = hasTournaments ? "ARRAY['NLH', 'PLO']" : "ARRAY['NLH']";

        values.push(`(${escapeSQL(venue)}, ${escapeSQL(website)}, ${escapeSQL(address)}, ${escapeSQL(city)}, ${escapeSQL(state)}, ${escapeSQL(phone)}, '${venueType}', ${gamesOffered}, ARRAY['$1/$2', '$2/$5'], 4.0, true, true)`);
    }

    sql += values.join(',\n') + '\nON CONFLICT (name, city, state) DO UPDATE SET\n    website = EXCLUDED.website,\n    address = EXCLUDED.address,\n    phone = EXCLUDED.phone,\n    is_verified = true,\n    updated_at = NOW();\n';

    console.log(`Generated SQL for ${values.length} venues`);
    return sql;
}

function parseDateRange(dateStr) {
    // Parse dates like "Jan 1-12 '26" or "Feb 5-16 '26" or "May 27 - Jul 16 '26"
    const months = {
        'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
        'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
        'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
    };

    // Handle TBD dates
    if (dateStr.includes('TBD') || dateStr.includes('Various')) {
        return { start: '2026-06-01', end: '2026-12-31' };
    }

    // Try to extract start and end dates
    const match = dateStr.match(/([A-Za-z]+)\s+(\d+)(?:\s*-\s*(\d+))?\s*'?(\d{2})?/);
    const match2 = dateStr.match(/([A-Za-z]+)\s+(\d+)[^A-Za-z]*-\s*([A-Za-z]+)\s+(\d+)\s*'?(\d{2})?/);

    if (match2) {
        // Format: "Jan 7 - Mar 1 '26"
        const startMonth = months[match2[1]] || '01';
        const startDay = match2[2].padStart(2, '0');
        const endMonth = months[match2[3]] || startMonth;
        const endDay = match2[4].padStart(2, '0');
        const year = match2[5] ? `20${match2[5]}` : '2026';
        return {
            start: `${year}-${startMonth}-${startDay}`,
            end: `${year}-${endMonth}-${endDay}`
        };
    } else if (match) {
        // Format: "Jan 1-12 '26"
        const month = months[match[1]] || '01';
        const startDay = match[2].padStart(2, '0');
        const endDay = match[3] ? match[3].padStart(2, '0') : startDay;
        const year = match[4] ? `20${match[4]}` : '2026';
        return {
            start: `${year}-${month}-${startDay}`,
            end: `${year}-${month}-${endDay}`
        };
    }

    return { start: '2026-01-01', end: '2026-12-31' };
}

function getSeriesType(name) {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('wsop') && !nameLower.includes('circuit')) return 'major';
    if (nameLower.includes('wpt')) return 'major';
    if (nameLower.includes('pgt') || nameLower.includes('pokergo')) return 'major';
    if (nameLower.includes('mspt')) return 'circuit';
    if (nameLower.includes('rgps') || nameLower.includes('rungood')) return 'circuit';
    if (nameLower.includes('wsop circuit')) return 'circuit';
    return 'regional';
}

function getShortName(name) {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('wsop circuit')) return 'WSOPC';
    if (nameLower.includes('wsop')) return 'WSOP';
    if (nameLower.includes('wpt')) return 'WPT';
    if (nameLower.includes('pgt') || nameLower.includes('pokergo')) return 'PGT';
    if (nameLower.includes('mspt')) return 'MSPT';
    if (nameLower.includes('rgps') || nameLower.includes('rungood')) return 'RGPS';
    if (nameLower.includes('deepstack')) return 'DSE';
    return null;
}

function generateSeriesSQL() {
    console.log('Generating tournament series SQL...');

    if (!fs.existsSync(seriesCsvPath)) {
        console.log('Tournament series CSV not found at', seriesCsvPath);
        return '';
    }

    const csv = fs.readFileSync(seriesCsvPath, 'utf8');
    const lines = csv.trim().split('\n');

    let sql = `
-- ============================================
-- IMPORT 115 TOURNAMENT SERIES FOR 2026
-- Run this in Supabase SQL Editor
-- ============================================

-- Clear existing series first (optional - uncomment if needed)
-- TRUNCATE TABLE tournament_series;

INSERT INTO tournament_series (name, short_name, location, start_date, end_date, website, series_type, is_featured)
VALUES
`;

    const values = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        const parts = line.split(',');
        if (parts.length < 4) continue;

        const name = parts[0].trim();
        const dates = parts[1].trim();
        const location = parts[2].trim();
        const website = parts[3].trim();

        if (!name) continue;

        const { start, end } = parseDateRange(dates);
        const seriesType = getSeriesType(name);
        const shortName = getShortName(name);
        const isFeatured = seriesType === 'major';

        values.push(`(${escapeSQL(name)}, ${shortName ? escapeSQL(shortName) : 'NULL'}, ${escapeSQL(location)}, '${start}', '${end}', ${escapeSQL(website)}, '${seriesType}', ${isFeatured})`);
    }

    sql += values.join(',\n') + '\nON CONFLICT DO NOTHING;\n';

    console.log(`Generated SQL for ${values.length} tournament series`);
    return sql;
}

// Generate both SQL files
const venuesSQL = generateVenuesSQL();
const seriesSQL = generateSeriesSQL();

// Write to files
const outputDir = path.join(__dirname, '..', 'supabase', 'imports');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(path.join(outputDir, 'import-484-venues.sql'), venuesSQL);
fs.writeFileSync(path.join(outputDir, 'import-115-series.sql'), seriesSQL);

// Also write combined file
fs.writeFileSync(path.join(outputDir, 'import-all-data.sql'), venuesSQL + '\n\n' + seriesSQL);

console.log('\nSQL files generated:');
console.log('  - supabase/imports/import-484-venues.sql');
console.log('  - supabase/imports/import-115-series.sql');
console.log('  - supabase/imports/import-all-data.sql');
