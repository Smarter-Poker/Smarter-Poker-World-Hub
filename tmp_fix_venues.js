const fs = require('fs');
const registry = JSON.parse(fs.readFileSync('./data/venue-source-registry.json'));

let initialCount = registry.venues.length;
registry.venues = registry.venues.filter(v => 
    !(v.name.toLowerCase().includes('harrah') && v.name.toLowerCase().includes('joliet'))
);
let removed = initialCount - registry.venues.length;

let marked = 0;
registry.venues.forEach(v => {
    let shouldHaveTournaments = false;
    
    // Chicago area
    if (['Chicago', 'Des Plaines', 'Gary', 'Hammond', 'Elgin', 'Aurora'].includes(v.city) || v.state === 'IL') {
        shouldHaveTournaments = true;
    }
    
    // Check if they have a PokerAtlas tournament_url or Bravo tournament link or any tournament indicators
    if (v.sources && v.sources.some(s => s.tournament_url || (s.scrape_for && s.scrape_for.includes('tournaments')))) {
        shouldHaveTournaments = true;
    }

    if (shouldHaveTournaments && !v.has_tournaments) {
        v.has_tournaments = true;
        marked++;
    }
});

fs.writeFileSync('./data/venue-source-registry.json', JSON.stringify(registry, null, 2));

console.log('Removed ' + removed + ' Harrahs Joliet venues.');
console.log('Marked an additional ' + marked + ' venues as having tournaments.');
console.log('Total venues now with tournaments: ' + registry.venues.filter(v => v.has_tournaments).length);
