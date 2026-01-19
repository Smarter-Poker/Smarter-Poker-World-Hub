/**
 * Poker Venues API - Get casinos, clubs, and card rooms
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Fallback venues when DB unavailable
const FALLBACK_VENUES = [
    { id: 1, name: "Bellagio", venue_type: "casino", city: "Las Vegas", state: "NV", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$3", "$2/$5", "$5/$10"], poker_tables: 40, trust_score: 4.8, is_featured: true },
    { id: 2, name: "Commerce Casino", venue_type: "card_room", city: "Commerce", state: "CA", games_offered: ["NLH", "PLO", "Mixed"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 200, trust_score: 4.3, is_featured: true },
    { id: 3, name: "Seminole Hard Rock", venue_type: "casino", city: "Hollywood", state: "FL", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 45, trust_score: 4.7, is_featured: true },
    { id: 4, name: "Borgata", venue_type: "casino", city: "Atlantic City", state: "NJ", games_offered: ["NLH", "PLO", "Mixed"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 85, trust_score: 4.6, is_featured: true },
    { id: 5, name: "Lodge Poker Club", venue_type: "poker_club", city: "Austin", state: "TX", games_offered: ["NLH", "PLO", "Mixed"], stakes_cash: ["$1/$3", "$2/$5", "$5/$10"], poker_tables: 40, trust_score: 4.8, is_featured: true },
];

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            state,
            city,
            type,
            lat,
            lng,
            radius = 50, // km
            limit = 50,
            featured
        } = req.query;

        let query = supabase
            .from('poker_venues')
            .select('*')
            .eq('is_active', true)
            .order('trust_score', { ascending: false })
            .limit(parseInt(limit));

        // Filter by state
        if (state) {
            query = query.eq('state', state.toUpperCase());
        }

        // Filter by city
        if (city) {
            query = query.ilike('city', `%${city}%`);
        }

        // Filter by venue type
        if (type) {
            query = query.eq('venue_type', type);
        }

        // Filter featured only
        if (featured === 'true') {
            query = query.eq('is_featured', true);
        }

        const { data, error } = await query;

        if (error || !data?.length) {
            // Filter fallback if needed
            let filtered = FALLBACK_VENUES;
            if (state) filtered = filtered.filter(v => v.state === state.toUpperCase());
            if (type) filtered = filtered.filter(v => v.venue_type === type);
            return res.status(200).json({ success: true, data: filtered.slice(0, parseInt(limit)) });
        }

        return res.status(200).json({ success: true, data });
    } catch (error) {
        return res.status(200).json({ success: true, data: FALLBACK_VENUES });
    }
}
