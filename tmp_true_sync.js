const fs = require('fs');

const publicPath = './public/data/all-venues.json';
const backendPath = './data/venue-source-registry.json';

let registry = JSON.parse(fs.readFileSync(backendPath));
let publicData = JSON.parse(fs.readFileSync(publicPath));

let totalTournaments = 0;
let registryMap = new Map();

registry.venues.forEach(v => {
    let hasTourneys = false;

    if (v.sources) {
        if (v.sources.some(s => s.scrape_for && s.scrape_for.includes('tournaments'))) {
            hasTourneys = true;
        }
        
        if (v.sources.some(s => s.tournament_url || s.tournaments_url)) {
            hasTourneys = true;
        }

        if (v.sources.some(s => s.source === 'hendonmob' || (s.url && s.url.includes('tournaments')))) {
            hasTourneys = true;
        }
    }

    v.has_tournaments = hasTourneys;
    registryMap.set(String(v.id), hasTourneys); 
    registryMap.set(v.name.toLowerCase(), hasTourneys);

    if (hasTourneys) {
        totalTournaments++;
    }
});

let venuesArray = Array.isArray(publicData) ? publicData : publicData.venues;

let publicTourneys = 0;
venuesArray.forEach(v => {
    let backendVal = registryMap.get(String(v.id));
    if (backendVal === undefined) {
        backendVal = registryMap.get(v.name.toLowerCase());
    }
    
    v.has_tournaments = backendVal === true;
    if (v.has_tournaments) {
        publicTourneys++;
    }
});

fs.writeFileSync(backendPath, JSON.stringify(registry, null, 2));
fs.writeFileSync(publicPath, JSON.stringify(publicData, null, 2));

console.log('Total venues with tournaments in registry (database): ' + totalTournaments);
console.log('Total venues with tournaments in public/map API: ' + publicTourneys);
