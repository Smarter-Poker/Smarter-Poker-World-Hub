/**
 * Poker Tours API - Get traveling poker tour information
 * Supports filtering by tour type, region, and search
 */
import { createClient } from '@supabase/supabase-js';
import tourRegistry from '../../../data/tour-source-registry.json';
import tourSeriesData from '../../../data/poker-tour-series-2026.json';
import allVenuesData from '../../../data/all-venues.json';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Build tours list from registry
function getToursFromRegistry() {
    const tours = [];
    for (const [code, tour] of Object.entries(tourRegistry.tours)) {
        if (tour.is_active === false) continue; // Skip defunct tours
        tours.push({
            tour_code: code,
            tour_name: tour.tour_name,
            tour_type: tour.tour_type,
            priority: tour.priority || 3,
            official_website: tour.official_website,
            headquarters: tour.headquarters,
            established: tour.established,
            typical_buyins: tour.typical_buyins,
            regions: tour.regions || [],
            notes: tour.notes,
            series_2026: tour.series_2026 || [],
            stops_2026: tour.stops_2026 || []
        });
    }
    return tours.sort((a, b) => a.priority - b.priority);
}

// Build venue name → ID lookup for cross-linking
function buildVenueNameLookup() {
    const venues = Array.isArray(allVenuesData) ? allVenuesData : allVenuesData.venues || [];
    const lookup = {};
    venues.forEach(v => {
        if (v.name && v.id) {
            lookup[v.name.toLowerCase()] = v.id;
        }
    });
    return lookup;
}

function findVenueId(venueName, lookup) {
    if (!venueName) return null;
    const lower = venueName.toLowerCase();
    // Exact match
    if (lookup[lower]) return lookup[lower];
    // Partial match: check if any venue name is contained in the series venue string
    for (const [name, id] of Object.entries(lookup)) {
        if (lower.indexOf(name) !== -1 || name.indexOf(lower) !== -1) return id;
    }
    return null;
}

const venueLookup = buildVenueNameLookup();

// Get tour series/stops for 2026
function getUpcomingSeries(tourCode) {
    const series = tourSeriesData.series_2026 || [];
    const today = new Date().toISOString().split('T')[0];

    // Assign global numeric IDs (matching series API: index + 1)
    const withIds = series.map((s, i) => ({
        ...s,
        id: i + 1,
        venue_id: findVenueId(s.venue, venueLookup),
    }));

    return withIds
        .filter(s => {
            if (tourCode && s.tour !== tourCode) return false;
            return s.end_date >= today;
        })
        .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            type,           // major, circuit, high_roller, regional, grassroots
            region,         // US, Europe, Asia
            search,
            tour_code,      // Specific tour
            include_series, // Include upcoming series
            limit = 50
        } = req.query;

        // Try to get from database first
        let dbTours = [];
        try {
            const { data, error } = await supabase
                .from('tour_source_registry')
                .select('*')
                .eq('is_active', true)
                .order('tour_type', { ascending: true });

            if (!error && data && data.length > 0) {
                dbTours = data;
            }
        } catch (e) {
            // DB not available, use fallback
        }

        // Use registry as fallback/primary source
        let tours = dbTours.length > 0 ? dbTours : getToursFromRegistry();

        // Filter by tour type
        if (type) {
            tours = tours.filter(t => t.tour_type === type);
        }

        // Filter by region
        if (region) {
            tours = tours.filter(t =>
                t.regions?.includes(region) ||
                t.regions?.includes(region.toUpperCase())
            );
        }

        // Search by name
        if (search) {
            const searchLower = search.toLowerCase();
            tours = tours.filter(t =>
                t.tour_name?.toLowerCase().includes(searchLower) ||
                t.tour_code?.toLowerCase().includes(searchLower) ||
                t.headquarters?.toLowerCase().includes(searchLower)
            );
        }

        // Get specific tour
        if (tour_code) {
            tours = tours.filter(t =>
                t.tour_code === tour_code.toUpperCase()
            );
        }

        // Optionally include upcoming series for each tour
        if (include_series === 'true') {
            tours = tours.map(tour => ({
                ...tour,
                upcoming_series: getUpcomingSeries(tour.tour_code).slice(0, 5)
            }));
        }

        // Get upcoming series count for summary
        const upcomingSeries = getUpcomingSeries(null);
        const seriesByTour = {};
        upcomingSeries.forEach(s => {
            seriesByTour[s.tour] = (seriesByTour[s.tour] || 0) + 1;
        });

        return res.status(200).json({
            success: true,
            data: tours.slice(0, parseInt(limit)),
            total: tours.length,
            summary: {
                total_tours: tours.length,
                by_type: countByField(tours, 'tour_type'),
                upcoming_series_count: upcomingSeries.length,
                series_by_tour: seriesByTour
            },
            metadata: {
                source: dbTours.length > 0 ? 'database' : 'registry',
                last_updated: tourRegistry.metadata?.created || '2026-01-26'
            }
        });

    } catch (error) {
        console.error('Tours API error:', error);
        // Return fallback data
        const tours = getToursFromRegistry();
        return res.status(200).json({
            success: true,
            data: tours,
            total: tours.length,
            error: error.message
        });
    }
}

function countByField(items, field) {
    const counts = {};
    items.forEach(item => {
        const value = item[field] || 'unknown';
        counts[value] = (counts[value] || 0) + 1;
    });
    return counts;
}
