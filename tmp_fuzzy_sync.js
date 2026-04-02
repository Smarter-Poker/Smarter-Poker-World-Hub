const fs = require('fs');

const publicPath = './public/data/all-venues.json';
const backendPath = './data/venue-source-registry.json';
const tournamentsPath = './data/tournament-venues.json';

const registry = JSON.parse(fs.readFileSync(backendPath));
let publicData = JSON.parse(fs.readFileSync(publicPath));
let publicVenues = Array.isArray(publicData) ? publicData : publicData.venues;
const tournObj = JSON.parse(fs.readFileSync(tournamentsPath));
const tournVenues = Array.isArray(tournObj) ? tournObj : tournObj.venues;

// Normalize names for better matching
function normalize(name) {
    if (!name) return "";
    return name.toLowerCase()
        .replace(/poker room/g, '')
        .replace(/casino/g, '')
        .replace(/resort/g, '')
        .replace(/hotel/g, '')
        .replace(/the /g, '')
        .replace(/['\-&]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

const tournNames = tournVenues.map(t => normalize(t.name)).filter(n => n.length > 0);
const tournIds = new Set(tournVenues.map(t => String(t.id)).filter(id => id && id !== "undefined"));

let totalBackendMatched = 0;
registry.venues.forEach(v => {
    let hasTourneys = false;
    let normName = normalize(v.name);
    
    if (tournIds.has(String(v.id))) {
        hasTourneys = true;
    } else if (tournNames.includes(normName)) {
        hasTourneys = true;
    } else if (tournNames.some(tn => tn.includes(normName) || normName.includes(tn))) {
        // Prevent overly broad fuzzy matches for very short names
        if (normName.length > 5) {
            hasTourneys = true;
        }
    }
    
    // Also, if the source specifically says it has a tournament URL
    if (!hasTourneys && v.sources) {
        if (v.sources.some(s => s.tournament_url || s.tournaments_url || (s.url && s.url.includes('/tournaments')))) {
            hasTourneys = true;
        }
    }

    v.has_tournaments = hasTourneys;
    if (hasTourneys) {
        totalBackendMatched++;
    }
});

fs.writeFileSync(backendPath, JSON.stringify(registry, null, 2));

let totalPublicMatched = 0;
publicVenues.forEach(pv => {
    // Look up the updated registry value
    let backendVenue = registry.venues.find(v => String(v.id) === String(pv.id) || normalize(v.name) === normalize(pv.name));
    if (backendVenue) {
        pv.has_tournaments = backendVenue.has_tournaments;
    } else {
        // Fallback to fuzzy logic directly if not in registry
        let normName = normalize(pv.name);
        pv.has_tournaments = tournNames.includes(normName) || tournNames.some(tn => tn.includes(normName) || normName.includes(tn));
    }
    
    if (pv.has_tournaments) {
        totalPublicMatched++;
    }
});

// Remove Harrahs Joliet from public venues just to ensure it stays gone
let initialLen = publicVenues.length;
publicVenues = publicVenues.filter(v => !(v.name && v.name.toLowerCase().includes('harrah') && v.name.toLowerCase().includes('joliet')));

let outObj = Array.isArray(publicData) ? publicVenues : { ...publicData, venues: publicVenues };
fs.writeFileSync(publicPath, JSON.stringify(outObj, null, 2));

console.log("Total entries in tournament-venues: " + tournVenues.length);
console.log("Total venues assigned tournaments in backend DB: " + totalBackendMatched);
console.log("Total venues assigned tournaments in public MAP: " + totalPublicMatched);
