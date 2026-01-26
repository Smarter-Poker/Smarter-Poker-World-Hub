/**
 * Live Games API
 *
 * Returns simulated real-time cash game data for poker venues.
 * In production, this would integrate with venue APIs or Captain platform data.
 *
 * Endpoints:
 *   GET /api/poker/live-games - Get currently running games
 *   GET /api/poker/live-games?state=NV - Filter by state
 *   GET /api/poker/live-games?stakes=1/2,2/5 - Filter by stakes
 *   GET /api/poker/live-games?game=NLH,PLO - Filter by game type
 *   GET /api/poker/live-games?lat=36.1&lng=-115.1 - Sort by distance
 */

import tournamentVenues from '../../../data/tournament-venues.json';

// Stake configurations for different venue types
const STAKES_CONFIG = {
    Casino: {
        NLH: ['1/2', '1/3', '2/5', '5/10', '10/20', '25/50'],
        PLO: ['1/2', '2/5', '5/10', '10/25', '25/50'],
        Mixed: ['10/20', '20/40', '40/80']
    },
    'Card Room': {
        NLH: ['1/2', '1/3', '2/5', '5/10'],
        PLO: ['1/2', '2/5', '5/10'],
        Mixed: ['8/16', '15/30']
    },
    Charity: {
        NLH: ['1/2', '1/3', '2/5'],
        PLO: ['1/2', '2/5'],
        Mixed: []
    }
};

// Generate realistic wait times based on time of day and venue type
function generateWaitTime(venueType, gameType, stakes) {
    const hour = new Date().getHours();
    const isWeekend = [0, 6].includes(new Date().getDay());

    // Base wait time
    let baseWait = venueType === 'Casino' ? 15 : 8;

    // Time adjustments
    if (hour >= 18 && hour <= 23) baseWait *= 2; // Evening rush
    if (hour >= 12 && hour < 18) baseWait *= 1.3; // Afternoon
    if (isWeekend) baseWait *= 1.5;

    // Stakes adjustments (higher stakes = shorter waits)
    const stakesNum = parseInt(stakes.split('/')[1] || '2');
    if (stakesNum >= 10) baseWait *= 0.5;
    if (stakesNum >= 25) baseWait *= 0.3;

    // PLO typically shorter waits
    if (gameType === 'PLO') baseWait *= 0.7;

    // Add randomness
    return Math.max(0, Math.round(baseWait + (Math.random() * 10 - 5)));
}

// Generate number of tables running
function generateTableCount(venueType, gameType, stakes) {
    const hour = new Date().getHours();
    const isWeekend = [0, 6].includes(new Date().getDay());

    let baseTables = venueType === 'Casino' ? 4 : 2;
    if (venueType === 'Charity') baseTables = 1;

    // Evening = more tables
    if (hour >= 18 && hour <= 23) baseTables *= 1.5;
    if (isWeekend) baseTables *= 1.3;

    // Lower stakes = more tables
    const stakesNum = parseInt(stakes.split('/')[1] || '2');
    if (stakesNum <= 3) baseTables *= 1.2;
    if (stakesNum >= 25) baseTables *= 0.4;

    return Math.max(1, Math.round(baseTables + (Math.random() * 2 - 1)));
}

// Generate action level (how busy/juicy the games are)
function generateActionLevel() {
    const r = Math.random();
    if (r > 0.7) return { level: 'hot', label: 'Hot Action', color: '#ef4444' };
    if (r > 0.4) return { level: 'good', label: 'Good Action', color: '#22c55e' };
    return { level: 'normal', label: 'Normal', color: '#3b82f6' };
}

// Calculate distance between two points
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Approximate coordinates for venues (in production, stored in DB)
const CITY_COORDS = {
    'Las Vegas,NV': { lat: 36.1699, lng: -115.1398 },
    'Henderson,NV': { lat: 36.0395, lng: -114.9817 },
    'Reno,NV': { lat: 39.5296, lng: -119.8138 },
    'Los Angeles,CA': { lat: 34.0522, lng: -118.2437 },
    'Houston,TX': { lat: 29.7604, lng: -95.3698 },
    'Dallas,TX': { lat: 32.7767, lng: -96.7970 },
    'Austin,TX': { lat: 30.2672, lng: -97.7431 },
    'San Antonio,TX': { lat: 29.4241, lng: -98.4936 },
    'Phoenix,AZ': { lat: 33.4484, lng: -112.0740 },
    'Scottsdale,AZ': { lat: 33.4942, lng: -111.9261 },
    'Miami,FL': { lat: 25.7617, lng: -80.1918 },
    'Tampa,FL': { lat: 27.9506, lng: -82.4572 },
    'default': { lat: 39.8283, lng: -98.5795 } // Center of USA
};

function getVenueCoords(city, state) {
    const key = `${city},${state}`;
    return CITY_COORDS[key] || CITY_COORDS['default'];
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            state,
            stakes,
            game,
            lat,
            lng,
            radius = 100,
            limit = 100,
            minTables = 0
        } = req.query;

        const userLat = lat ? parseFloat(lat) : null;
        const userLng = lng ? parseFloat(lng) : null;
        const requestedStakes = stakes ? stakes.split(',') : null;
        const requestedGames = game ? game.split(',').map(g => g.toUpperCase()) : ['NLH', 'PLO'];

        let liveGames = [];
        const now = new Date();

        // Generate live games for each venue
        tournamentVenues.venues.forEach(venue => {
            // Filter by state
            if (state && venue.state !== state.toUpperCase()) return;

            const venueCoords = getVenueCoords(venue.city, venue.state);
            let distance = null;

            // Calculate distance if user location provided
            if (userLat && userLng) {
                distance = calculateDistance(userLat, userLng, venueCoords.lat, venueCoords.lng);
                if (distance > parseFloat(radius)) return; // Outside radius
            }

            const stakeOptions = STAKES_CONFIG[venue.type] || STAKES_CONFIG['Card Room'];

            // Generate games for this venue
            requestedGames.forEach(gameType => {
                const availableStakes = stakeOptions[gameType] || [];

                availableStakes.forEach(stakeLevel => {
                    // Filter by requested stakes
                    if (requestedStakes && !requestedStakes.includes(stakeLevel)) return;

                    // Randomly determine if this game is running (higher chance during peak hours)
                    const hour = now.getHours();
                    let runningChance = 0.4;
                    if (hour >= 11 && hour <= 14) runningChance = 0.6; // Lunch
                    if (hour >= 18 && hour <= 23) runningChance = 0.85; // Evening
                    if (hour >= 0 && hour <= 6) runningChance = 0.2; // Late night

                    // Las Vegas always has more action
                    if (venue.state === 'NV') runningChance *= 1.3;

                    if (Math.random() > runningChance) return;

                    const tableCount = generateTableCount(venue.type, gameType, stakeLevel);
                    if (tableCount < parseInt(minTables)) return;

                    const waitTime = generateWaitTime(venue.type, gameType, stakeLevel);
                    const action = generateActionLevel();

                    liveGames.push({
                        id: `${venue.name}-${gameType}-${stakeLevel}`.replace(/[^a-zA-Z0-9]/g, '-'),
                        venue: {
                            name: venue.name,
                            city: venue.city,
                            state: venue.state,
                            type: venue.type,
                            pokerAtlasUrl: venue.pokerAtlasUrl
                        },
                        game: {
                            type: gameType,
                            stakes: stakeLevel,
                            minBuyin: parseInt(stakeLevel.split('/')[1]) * 20,
                            maxBuyin: parseInt(stakeLevel.split('/')[1]) * 100
                        },
                        status: {
                            tables: tableCount,
                            waitTime: waitTime,
                            waitList: Math.floor(waitTime / 3),
                            action: action,
                            lastUpdated: now.toISOString()
                        },
                        distance: distance ? Math.round(distance * 10) / 10 : null
                    });
                });
            });
        });

        // Sort by distance if location provided, otherwise by action level
        if (userLat && userLng) {
            liveGames.sort((a, b) => (a.distance || 9999) - (b.distance || 9999));
        } else {
            // Sort by action level (hot first), then by tables
            const actionOrder = { hot: 0, good: 1, normal: 2 };
            liveGames.sort((a, b) => {
                const actionDiff = actionOrder[a.status.action.level] - actionOrder[b.status.action.level];
                if (actionDiff !== 0) return actionDiff;
                return b.status.tables - a.status.tables;
            });
        }

        // Calculate stats
        const stats = {
            totalGames: liveGames.length,
            totalTables: liveGames.reduce((sum, g) => sum + g.status.tables, 0),
            avgWaitTime: liveGames.length > 0
                ? Math.round(liveGames.reduce((sum, g) => sum + g.status.waitTime, 0) / liveGames.length)
                : 0,
            byGameType: {},
            byStakes: {},
            byState: {},
            hotGames: liveGames.filter(g => g.status.action.level === 'hot').length
        };

        liveGames.forEach(g => {
            stats.byGameType[g.game.type] = (stats.byGameType[g.game.type] || 0) + 1;
            stats.byStakes[g.game.stakes] = (stats.byStakes[g.game.stakes] || 0) + 1;
            stats.byState[g.venue.state] = (stats.byState[g.venue.state] || 0) + 1;
        });

        return res.status(200).json({
            success: true,
            timestamp: now.toISOString(),
            games: liveGames.slice(0, parseInt(limit)),
            stats,
            filters: {
                state: state || null,
                stakes: requestedStakes,
                games: requestedGames,
                location: userLat && userLng ? { lat: userLat, lng: userLng, radius: parseFloat(radius) } : null
            }
        });

    } catch (error) {
        console.error('Live games API error:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            games: []
        });
    }
}
