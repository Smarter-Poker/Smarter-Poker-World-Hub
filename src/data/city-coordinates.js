/**
 * city-coordinates.js — Shared city coordinate database for Poker Near Me
 * 
 * Single source of truth for all poker city locations.
 * Used by both poker-near-me.js and poker-near-me-lobby.js.
 * 
 * Format: { 'city, state': { lat, lng } }  (lowercase keys)
 */

const CITY_COORDINATES = {
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
    'el cajon, ca': { lat: 32.7948, lng: -116.9625 },
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
    'scottsdale, az': { lat: 33.4942, lng: -111.9261 },
    'chicago, il': { lat: 41.8781, lng: -87.6298 },
    'east chicago, in': { lat: 41.6354, lng: -87.4473 },
    'gary, in': { lat: 41.5934, lng: -87.3464 },
    'detroit, mi': { lat: 42.3314, lng: -83.0458 },
    'bismarck, nd': { lat: 46.8083, lng: -100.7837 },
    'fargo, nd': { lat: 46.8772, lng: -96.7898 },
    'deadwood, sd': { lat: 44.3767, lng: -103.7296 },
    'thackerville, ok': { lat: 33.7918, lng: -97.1303 },
    'mount pleasant, mi': { lat: 43.5978, lng: -84.7753 },
    'prior lake, mn': { lat: 44.7133, lng: -93.4227 },
    'welch, mn': { lat: 44.5669, lng: -92.7233 },
    'columbus, mn': { lat: 45.2448, lng: -93.0343 },
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
    'robinsonville, ms': { lat: 34.8213, lng: -90.3155 },
    'verona, ny': { lat: 43.1311, lng: -75.5721 },
    'dallas, tx': { lat: 32.7767, lng: -96.7970 },
    'stateline, nv': { lat: 38.9669, lng: -119.9405 },
    'rohnert park, ca': { lat: 38.3396, lng: -122.7011 },
    // Additional cities from main page only (merged superset)
    'larchwood, ia': { lat: 43.4525, lng: -96.5378 },
    'riverside, ia': { lat: 41.4797, lng: -91.5829 },
    'st. charles, mo': { lat: 38.7881, lng: -90.4974 },
    'milwaukee, wi': { lat: 43.0389, lng: -87.9065 },
    'battle creek, mi': { lat: 42.3212, lng: -85.1797 },
    'cleveland, oh': { lat: 41.4993, lng: -81.6944 },
    'cincinnati, oh': { lat: 39.1031, lng: -84.5120 },
    'columbus, oh': { lat: 39.9612, lng: -82.9988 },
    'pittsburgh, pa': { lat: 40.4406, lng: -79.9959 },
    'denver, co': { lat: 39.7392, lng: -104.9903 },
    'salt lake city, ut': { lat: 40.7608, lng: -111.8910 },
    'reno, nv': { lat: 39.5296, lng: -119.8138 },
    'laughlin, nv': { lat: 35.1679, lng: -114.5716 },
    'henderson, nv': { lat: 36.0395, lng: -114.9817 },
    'miami, fl': { lat: 25.7617, lng: -80.1918 },
    'orlando, fl': { lat: 28.5383, lng: -81.3792 },
    'daytona beach, fl': { lat: 29.2108, lng: -81.0228 },
    'memphis, tn': { lat: 35.1495, lng: -90.0490 },
    'nashville, tn': { lat: 36.1627, lng: -86.7816 },
    'atlanta, ga': { lat: 33.7490, lng: -84.3880 },
    'charlotte, nc': { lat: 35.2271, lng: -80.8431 },
    'richmond, va': { lat: 37.5407, lng: -77.4360 },
    'baltimore, md': { lat: 39.2904, lng: -76.6122 },
    'washington, dc': { lat: 38.9072, lng: -77.0369 },
    'boston, ma': { lat: 42.3601, lng: -71.0589 },
    'new york, ny': { lat: 40.7128, lng: -74.0060 },
    'minnetonka, mn': { lat: 44.9211, lng: -93.4687 },
    'burnsville, mn': { lat: 44.7677, lng: -93.2777 },
    'isle, mn': { lat: 46.1478, lng: -93.4694 },
    'pompano beach, fl': { lat: 26.2379, lng: -80.1248 },
    'pine bluff, ar': { lat: 34.2284, lng: -92.0032 },
    'north kansas city, mo': { lat: 39.1336, lng: -94.5669 },
    'sacramento, ca': { lat: 38.5816, lng: -121.4944 },
    'san francisco, ca': { lat: 37.7749, lng: -122.4194 },
    'tulsa, ok': { lat: 36.1540, lng: -95.9928 },
    'sioux city, ia': { lat: 42.4999, lng: -96.4003 },
    'vicksburg, ms': { lat: 32.3526, lng: -90.8779 },
    'natchez, ms': { lat: 31.5604, lng: -91.4032 },
    'lake charles, la': { lat: 30.2266, lng: -93.2174 },
    'baton rouge, la': { lat: 30.4515, lng: -91.1871 },
    'hammond, in': { lat: 41.5834, lng: -87.5001 },
    'joliet, il': { lat: 41.5250, lng: -88.0817 },
};

/**
 * Resolve city coordinates from a location string.
 * Tries exact match first, then falls back to city-prefix match.
 * 
 * @param {string} location - Location string like "Las Vegas, NV"
 * @returns {{ lat: number, lng: number } | null}
 */
export function resolveCityCoords(location) {
    if (!location) return null;
    const key = location.toLowerCase().trim();
    if (CITY_COORDINATES[key]) return CITY_COORDINATES[key];
    const cityPart = key.split(',')[0].trim();
    for (const [k, v] of Object.entries(CITY_COORDINATES)) {
        if (k.startsWith(cityPart + ',')) return v;
    }
    return null;
}

/**
 * Get the full coordinates map (for use in useMemo callbacks that need iteration).
 * @returns {Object} The full CITY_COORDINATES map
 */
export function getCityCoordinatesMap() {
    return CITY_COORDINATES;
}

/**
 * Convert { lat, lng } format to [lat, lng] array format.
 * Used by the main poker-near-me page which expects array format.
 * @param {string} location
 * @returns {[number, number] | null}
 */
export function resolveCityCoordsArray(location) {
    const coords = resolveCityCoords(location);
    if (!coords) return null;
    return [coords.lat, coords.lng];
}

export default CITY_COORDINATES;
