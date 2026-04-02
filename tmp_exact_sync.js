const fs = require('fs');

const publicPath = './public/data/all-venues.json';
const backendPath = './data/venue-source-registry.json';
const tournamentsPath = './data/tournament-venues.json';

const registry = JSON.parse(fs.readFileSync(backendPath));
let publicData = JSON.parse(fs.readFileSync(publicPath));
let publicVenues = Array.isArray(publicData) ? publicData : publicData.venues;
const tournObj = JSON.parse(fs.readFileSync(tournamentsPath));
const tournVenues = Array.isArray(tournObj) ? tournObj : tournObj.venues;

// Strip out Harrahs Joliet
publicVenues = publicVenues.filter(v => !(v.name && v.name.toLowerCase().includes('harrah') && v.name.toLowerCase().includes('joliet')));
registry.venues = registry.venues.filter(v => !(v.name && v.name.toLowerCase().includes('harrah') && v.name.toLowerCase().includes('joliet')));

// Get exactly the set of URLs and exact names from the authoritative 205 list
const tournAtlasUrls = new Set(tournVenues.map(t => t.pokerAtlasUrl && t.pokerAtlasUrl.split('/tournaments')[0].toLowerCase()).filter(Boolean));
const tournExactNames = new Set(tournVenues.map(t => t.name && t.name.toLowerCase().trim()).filter(Boolean));

function hasMatch(v) {
    // 1. Check if the venue's PokerAtlas URL base matches one in the 205 list
    // e.g. "https://www.pokeratlas.com/poker-room/rivers-casino-des-plaines"
    if (v.sources) {
        let atlasSource = v.sources.find(s => s.source === 'pokeratlas');
        if (atlasSource && atlasSource.url) {
            let base = atlasSource.url.split('/tournaments')[0].split('/cash-games')[0].toLowerCase();
            if (tournAtlasUrls.has(base)) return true;
        }
        // Direct tournament URLs
        if (v.sources.some(s => s.tournament_url || s.tournaments_url || (s.url && s.url.includes('/tournaments')))) {
            return true;
        }
    } else {
        if (v.pokeratlas_url) {
            let base = v.pokeratlas_url.split('/tournaments')[0].split('/cash-games')[0].toLowerCase();
            if (tournAtlasUrls.has(base)) return true;
        }
    }

    // 2. Exact name matching
    let lowerName = v.name && v.name.toLowerCase().trim();
    if (lowerName && tournExactNames.has(lowerName)) return true;

    // 3. Fallback fuzzy match only if perfectly matching "base" name
    // Replace generic words
    let normV = lowerName.replace(/poker room/g, '').replace(/casino/g, '').replace(/resort/g, '').trim();
    for (let tn of tournExactNames) {
        let normT = tn.replace(/poker room/g, '').replace(/casino/g, '').replace(/resort/g, '').trim();
        if (normV.length > 5 && normT.length > 5 && (normV === normT)) return true;
    }

    return false;
}

let totalBackendMatched = 0;
registry.venues.forEach(v => {
    v.has_tournaments = hasMatch(v);
    if (v.has_tournaments) totalBackendMatched++;
});
fs.writeFileSync(backendPath, JSON.stringify(registry, null, 2));

let totalPublicMatched = 0;
publicVenues.forEach(pv => {
    pv.has_tournaments = hasMatch(pv);
    if (pv.has_tournaments) totalPublicMatched++;
});

let outObj = Array.isArray(publicData) ? publicVenues : { ...publicData, venues: publicVenues };
fs.writeFileSync(publicPath, JSON.stringify(outObj, null, 2));

console.log("Total entries in tournament-venues: " + tournVenues.length);
console.log("Total venues assigned tournaments in backend DB: " + totalBackendMatched);
console.log("Total venues assigned tournaments in public MAP: " + totalPublicMatched);
