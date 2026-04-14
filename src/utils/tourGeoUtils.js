// ─── Fallback city coordinates for common poker tour locations ───
export const CITY_COORDS = {
    'las vegas, nv': { lat: 36.1699, lng: -115.1398 },
    'hollywood, fl': { lat: 26.0112, lng: -80.1495 },
    'atlantic city, nj': { lat: 39.3643, lng: -74.4229 },
    'lincoln, ca': { lat: 38.8916, lng: -121.2930 },
    'durant, ok': { lat: 33.9943, lng: -96.3709 },
    'tampa, fl': { lat: 27.9506, lng: -82.4572 },
    'bell gardens, ca': { lat: 33.9653, lng: -118.1514 },
    'elgin, il': { lat: 42.0354, lng: -88.2826 },
    'lake tahoe, nv': { lat: 39.0968, lng: -120.0324 },
    'tunica, ms': { lat: 34.6846, lng: -90.3829 },
    'biloxi, ms': { lat: 30.3960, lng: -88.8853 },
    'cherokee, nc': { lat: 35.4743, lng: -83.3146 },
    'san diego, ca': { lat: 32.7157, lng: -117.1611 },
    'portland, or': { lat: 45.5155, lng: -122.6789 },
    'council bluffs, ia': { lat: 41.2619, lng: -95.8608 },
    'black hawk, co': { lat: 39.7969, lng: -105.4903 },
    'choctaw, ok': { lat: 35.4976, lng: -97.2687 },
    'shreveport, la': { lat: 32.5252, lng: -93.7502 },
    'new orleans, la': { lat: 29.9511, lng: -90.0715 },
    'kinder, la': { lat: 30.4855, lng: -92.8510 },
    'gulfport, ms': { lat: 30.3674, lng: -89.0928 },
    'marksville, la': { lat: 31.1268, lng: -92.0632 },
    'oklahoma city, ok': { lat: 35.4676, lng: -97.5164 },
    'minneapolis, mn': { lat: 44.9778, lng: -93.2650 },
    'kansas city, mo': { lat: 39.0997, lng: -94.5786 },
    'st. louis, mo': { lat: 38.6270, lng: -90.1994 },
    'los angeles, ca': { lat: 34.0522, lng: -118.2437 },
    'phoenix, az': { lat: 33.4484, lng: -112.0740 },
    'chicago, il': { lat: 41.8781, lng: -87.6298 },
    'detroit, mi': { lat: 42.3314, lng: -83.0458 },
    'bismarck, nd': { lat: 46.8083, lng: -100.7837 },
    'fargo, nd': { lat: 46.8772, lng: -96.7898 },
    'deadwood, sd': { lat: 44.3767, lng: -103.7296 },
    'thackerville, ok': { lat: 33.7918, lng: -97.1303 },
    'gary, in': { lat: 41.5934, lng: -87.3464 },
    'mount pleasant, mi': { lat: 43.5978, lng: -84.7753 },
    'prior lake, mn': { lat: 44.7133, lng: -93.4227 },
    'welch, mn': { lat: 44.5669, lng: -92.7233 },
    'charleston, wv': { lat: 38.3498, lng: -81.6326 },
    'temecula, ca': { lat: 33.4936, lng: -117.1484 },
    'west palm beach, fl': { lat: 26.7153, lng: -80.0534 },
    'jacksonville, fl': { lat: 30.3322, lng: -81.6557 },
    'austin, tx': { lat: 30.2672, lng: -97.7431 },
    'round rock, tx': { lat: 30.5083, lng: -97.6789 },
    'houston, tx': { lat: 29.7604, lng: -95.3698 },
    'san jose, ca': { lat: 37.3382, lng: -121.8863 },
    'commerce, ca': { lat: 33.9975, lng: -118.1597 },
    'bossier city, la': { lat: 32.5160, lng: -93.7321 },
    'fort yates, nd': { lat: 46.0886, lng: -100.6301 },
    'mandan, nd': { lat: 46.8267, lng: -100.8891 },
    'dickinson, nd': { lat: 46.8792, lng: -102.7896 },
    'belcourt, nd': { lat: 48.8411, lng: -99.7457 },
    'philadelphia, pa': { lat: 39.9526, lng: -75.1652 },
    'choctaw, ms': { lat: 32.7693, lng: -89.1170 },
};

// ─── Haversine distance calculation (miles) ───
export function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 3959; // Earth radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Find venue coordinates by fuzzy name + city fallback ───
export function findVenueCoords(stop, allVenues) {
    const venueName = (stop.venue || stop.name || '').toLowerCase().trim();
    const location = (stop.location || '').toLowerCase().trim();
    const city = (stop.city || '').toLowerCase().trim();
    const state = (stop.state || '').toLowerCase().trim();

    // Try to extract city from location field (e.g. "Las Vegas, NV")
    const locationCity = location.split(',')[0]?.trim().toLowerCase() || '';
    const locationState = location.split(',')[1]?.trim().toLowerCase() || '';

    if (allVenues && allVenues.length > 0) {
        // 1. Exact venue name match
        let match = allVenues.find(v => v.name && v.name.toLowerCase() === venueName && v.latitude);
        if (match) return match;

        // 2. Venue name contains or is contained in
        if (venueName.length > 3) {
            match = allVenues.find(v => {
                if (!v.name || !v.latitude) return false;
                const n = v.name.toLowerCase();
                return n.includes(venueName) || venueName.includes(n);
            });
            if (match) return match;
        }

        // 3. City + state match (first venue in that city)
        const c = city || locationCity;
        const s = state || locationState;
        if (c && s) {
            match = allVenues.find(v =>
                v.latitude &&
                (v.city || '').toLowerCase() === c &&
                (v.state || '').toLowerCase() === s
            );
            if (match) return match;
        }

        // 4. City-only match
        if (c) {
            match = allVenues.find(v =>
                v.latitude && (v.city || '').toLowerCase() === c
            );
            if (match) return match;
        }
    }

    // 5. Fallback: city coordinate lookup
    const cityKey = location || ((city || locationCity) + (state || locationState ? ', ' + (state || locationState) : ''));
    if (cityKey) {
        const coords = CITY_COORDS[cityKey.toLowerCase()];
        if (coords) return { latitude: coords.lat, longitude: coords.lng, city: locationCity || city, state: locationState || state };
    }

    // 6. Last resort: try matching just city name in fallback table
    const justCity = locationCity || city;
    if (justCity) {
        for (const [key, coords] of Object.entries(CITY_COORDS)) {
            if (key.startsWith(justCity + ',') || key === justCity) {
                return { latitude: coords.lat, longitude: coords.lng, city: justCity, state: locationState || state };
            }
        }
    }

    return null;
}

// ─── Parse informal date strings from registry ───
export function parseStopDates(dateStr) {
    if (!dateStr) return null;
    const MONTHS = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
    const defaultYear = 2026;
    const parts = dateStr.split(/\s*[-–]\s*/);
    
    const parseOne = (s, fallbackMonth) => {
        if (!s) return null;
        s = s.trim().replace(',', '');
        const m = s.match(/^([A-Z][a-z]{2})\s+(\d{1,2})(?:\s+(\d{4}))?/);
        if (m) {
            const month = MONTHS[m[1]];
            if (month === undefined) return null;
            return new Date(m[3] ? parseInt(m[3]) : defaultYear, month, parseInt(m[2]));
        }
        const dayOnly = s.match(/^(\d{1,2})$/);
        if (dayOnly && fallbackMonth !== undefined) {
            return new Date(defaultYear, fallbackMonth, parseInt(dayOnly[1]));
        }
        return null;
    };

    const startDate = parseOne(parts[0]);
    if (!startDate) return null;
    let endDate = null;
    if (parts.length >= 2) {
        endDate = parseOne(parts[parts.length - 1], startDate.getMonth());
        if (endDate && endDate < startDate && !dateStr.includes('2025')) {
            endDate.setFullYear(endDate.getFullYear() + 1);
        }
    } else {
        endDate = startDate;
    }
    return { start: startDate, end: endDate };
}
