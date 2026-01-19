const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/Users/smarter.poker/Downloads/US_Poker_Series_Master_PokerAtlas_Upcoming_asof_2026-01-18.json', 'utf8'));

// Extract unique venues
const venues = new Map();
data.forEach(s => {
    const key = s.venue + '|' + s.city + '|' + s.state;
    if (!venues.has(key)) {
        venues.set(key, { name: s.venue, city: s.city, state: s.state, country: s.country });
    }
});

console.log('Total series:', data.length);
console.log('Unique venues:', venues.size);

// Generate venues SQL
let venuesSql = `-- VENUES SQL (${venues.size} unique venues from PokerAtlas)
INSERT INTO poker_venues (name, city, state, venue_type, is_featured, trust_score, is_active)
VALUES\n`;

const venuesList = Array.from(venues.values());
venuesSql += venuesList.map(v => {
    const name = v.name.replace(/'/g, "''");
    const city = v.city.replace(/'/g, "''");
    const type = name.toLowerCase().includes('club') ? 'poker_club' :
        name.toLowerCase().includes('casino') || name.toLowerCase().includes('resort') ||
            name.toLowerCase().includes("harrah") || name.toLowerCase().includes("horseshoe") ||
            name.toLowerCase().includes("seminole") || name.toLowerCase().includes("hard rock") ? 'casino' : 'card_room';
    return `('${name}', '${city}', '${v.state}', '${type}', false, 4.0, true)`;
}).join(',\n');

venuesSql += `\nON CONFLICT (name, city, state) DO NOTHING;\n\n`;

// Generate series SQL
let seriesSql = `-- SERIES SQL (${data.length} tournament series from PokerAtlas)
INSERT INTO tournament_series (name, short_name, location, start_date, end_date, total_events, series_type, is_featured)
VALUES\n`;

seriesSql += data.map(s => {
    const name = s.series_name.replace(/'/g, "''");
    const venue = s.venue.replace(/'/g, "''");
    const location = `${s.city}, ${s.state}`;
    const shortName = name.includes('WSOP') ? 'WSOP' :
        name.includes('WPT') ? 'WPT' :
            name.includes('MSPT') ? 'MSPT' :
                name.includes('RGPS') || name.includes('RUNGOOD') ? 'RGPS' :
                    name.includes('DeepStack') ? 'DSE' :
                        name.substring(0, 8).toUpperCase();
    const seriesType = name.toLowerCase().includes('circuit') || name.toLowerCase().includes('mspt') || name.toLowerCase().includes('rgps') ? 'circuit' :
        name.toLowerCase().includes('wsop') || name.toLowerCase().includes('wpt') || name.toLowerCase().includes('classic') ? 'major' : 'regional';
    const isFeatured = name.toLowerCase().includes('wsop') || name.toLowerCase().includes('wpt') || name.toLowerCase().includes('classic');
    const endDate = s.end_date || s.start_date;
    const eventCount = s.event_count || 'NULL';

    return `('${name}', '${shortName}', '${location}', '${s.start_date}', '${endDate}', ${eventCount}, '${seriesType}', ${isFeatured})`;
}).join(',\n');

seriesSql += `\nON CONFLICT (name, start_date) DO NOTHING;\n`;

// Write SQL files
fs.writeFileSync('/Users/smarter.poker/Documents/hub-vanguard/supabase/migrations/20260118_bulk_venues.sql', venuesSql);
fs.writeFileSync('/Users/smarter.poker/Documents/hub-vanguard/supabase/migrations/20260118_bulk_series.sql', seriesSql);

console.log('Generated SQL files:');
console.log('- supabase/migrations/20260118_bulk_venues.sql (' + venues.size + ' venues)');
console.log('- supabase/migrations/20260118_bulk_series.sql (' + data.length + ' series)');
