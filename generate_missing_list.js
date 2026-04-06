const fs = require('fs');

const data = JSON.parse(fs.readFileSync('./data/all-venues.json', 'utf8'));
const venues = data.venues || data;

const relevant = venues.filter(x => ['casino', 'card_room', 'poker_club', 'charity'].includes(x.venue_type));
const noTournaments = relevant.filter(x => !x.has_tournaments);

// Group by state
const byState = {};
noTournaments.forEach(v => {
    const state = v.state || 'Unknown';
    if (!byState[state]) byState[state] = [];
    byState[state].push(v);
});

let markdown = `# Venues Without Verified Tournaments (Total: ${noTournaments.length})\n\n`;
markdown += `The following venues are currently marked as not having regular weekly/daily tournaments. If you believe any of these are incorrect, we can manually verify and update them.\n\n`;

const sortedStates = Object.keys(byState).sort();

for (const state of sortedStates) {
    markdown += `## ${state} (${byState[state].length} venues)\n`;
    
    // Sort venues alphabetically within state
    const sortedVenues = byState[state].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    
    for (const v of sortedVenues) {
        markdown += `- **${v.name}** (${v.venue_type.replace('_', ' ')})`;
        if (v.city) markdown += ` - ${v.city}`;
        markdown += `\n`;
    }
    markdown += `\n`;
}

const dir = '/Users/smarter.poker/.gemini/antigravity/brain/f80e6256-8e27-4277-a5cb-6d96a083721e/artifacts';
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(`${dir}/missing_tournaments_list.md`, markdown);
console.log('Successfully generated missing_tournaments_list.md!');
