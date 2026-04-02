const fs = require('fs');

const publicPath = './public/data/all-venues.json';
const backendPath = './data/venue-source-registry.json';

// Process public/data/all-venues.json
let allVenuesObj;
if (fs.existsSync(publicPath)) {
    allVenuesObj = JSON.parse(fs.readFileSync(publicPath));
    // It's probably an array directly, let's verify format
    let venuesArray = Array.isArray(allVenuesObj) ? allVenuesObj : allVenuesObj.venues;
    if (venuesArray) {
        let initialLen = venuesArray.length;
        venuesArray = venuesArray.filter(v => 
            !(v.name && v.name.toLowerCase().includes('harrah') && v.name.toLowerCase().includes('joliet'))
        );
        let removed = initialLen - venuesArray.length;
        console.log(`Removed ${removed} Harrahs Joliet venues from all-venues.json.`);

        let marked = 0;
        venuesArray.forEach(v => {
            let shouldHaveTournaments = false;
            if (['Chicago', 'Des Plaines', 'Gary', 'Hammond', 'Elgin', 'Aurora'].includes(v.city) || v.state === 'IL') {
                shouldHaveTournaments = true;
            }
            if (v.sources && v.sources.some(s => s.tournament_url || (s.scrape_for && s.scrape_for.includes('tournaments')))) {
                shouldHaveTournaments = true;
            }
            if (shouldHaveTournaments && !v.has_tournaments) {
                v.has_tournaments = true;
                marked++;
            }
        });
        console.log(`Marked additional ${marked} venues as having tournaments in all-venues.json.`);
        
        let outObj = Array.isArray(allVenuesObj) ? venuesArray : { ...allVenuesObj, venues: venuesArray };
        fs.writeFileSync(publicPath, JSON.stringify(outObj, null, 2));
    }
}

// Process data/venue-source-registry.json again just in case
if (fs.existsSync(backendPath)) {
    let registry = JSON.parse(fs.readFileSync(backendPath));
    let initialCount = registry.venues.length;
    registry.venues = registry.venues.filter(v => 
        !(v.name && v.name.toLowerCase().includes('harrah') && v.name.toLowerCase().includes('joliet'))
    );
    let removed = initialCount - registry.venues.length;
    let marked = 0;
    registry.venues.forEach(v => {
        let shouldHaveTournaments = false;
        if (['Chicago', 'Des Plaines', 'Gary', 'Hammond', 'Elgin', 'Aurora'].includes(v.city) || v.state === 'IL') {
            shouldHaveTournaments = true;
        }
        if (v.sources && v.sources.some(s => s.tournament_url || (s.scrape_for && s.scrape_for.includes('tournaments')))) {
            shouldHaveTournaments = true;
        }
        if (shouldHaveTournaments && !v.has_tournaments) {
            v.has_tournaments = true;
            marked++;
        }
    });

    fs.writeFileSync(backendPath, JSON.stringify(registry, null, 2));
    console.log(`Removed ${removed} Harrahs Joliet venues from venue-source-registry.json.`);
}
