/**
 * Poker Pages API - Aggregated feed of venue, tour, and series pages
 * Returns unified page objects for discovery and follow management
 *
 * GET /api/poker/pages
 *   ?category=venues|tours|series|all (default: all)
 *   ?search=text
 *   ?user_id=X (returns follow status for each page)
 *   ?followed_only=true (only return pages user follows)
 *   ?state=XX (filter venues by state)
 *   ?sort=popular|name|newest (default: popular)
 *   ?limit=50
 */

import { createClient } from '@supabase/supabase-js';
import allVenuesData from '../../../data/all-venues.json';
import tourRegistry from '../../../data/tour-source-registry.json';
import tourSeriesData from '../../../data/poker-tour-series-2026.json';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function buildVenuePages() {
    const venues = allVenuesData.venues || [];
    return venues.map(v => ({
        page_type: 'venue',
        page_id: String(v.id),
        name: v.name,
        subtitle: `${v.city}, ${v.state}`,
        category: v.venue_type === 'casino' ? 'Casino' : v.venue_type === 'card_room' ? 'Card Room' : v.venue_type === 'charity' ? 'Charity' : v.venue_type === 'poker_club' ? 'Poker Club' : 'Venue',
        detail_url: `/hub/venues/${v.id}`,
        state: v.state,
        city: v.city,
        has_tournaments: v.has_tournaments,
        trust_score: v.trust_score || 0,
        phone: v.phone,
        website: v.website,
    }));
}

function buildTourPages() {
    const tours = [];
    for (const [code, tour] of Object.entries(tourRegistry.tours)) {
        if (tour.is_active === false) continue;
        tours.push({
            page_type: 'tour',
            page_id: code,
            name: tour.tour_name,
            subtitle: tour.headquarters || '',
            category: tour.tour_type === 'major' ? 'Major Tour' : tour.tour_type === 'circuit' ? 'Circuit' : tour.tour_type === 'high_roller' ? 'High Roller' : tour.tour_type === 'regional' ? 'Regional' : 'Tour',
            detail_url: `/hub/tours/${code}`,
            tour_type: tour.tour_type,
            established: tour.established,
            official_website: tour.official_website,
            priority: tour.priority || 3,
        });
    }
    return tours.sort((a, b) => (a.priority || 3) - (b.priority || 3));
}

function buildSeriesPages() {
    const allSeries = tourSeriesData.series_2026 || [];
    const today = new Date().toISOString().split('T')[0];
    return allSeries
        .filter(s => s.end_date >= today)
        .map((s, i) => ({
            page_type: 'series',
            page_id: String(s.id || i + 1),
            name: s.name,
            subtitle: s.venue ? `${s.venue}${s.city ? `, ${s.city}` : ''}` : s.location || '',
            category: s.series_type === 'major' ? 'Major Series' : s.series_type === 'circuit' ? 'Circuit' : 'Series',
            detail_url: `/hub/series/${s.id || i + 1}`,
            tour_code: s.tour || s.short_name,
            start_date: s.start_date,
            end_date: s.end_date,
            total_events: s.total_events,
            main_event_buyin: s.main_event_buyin,
        }))
        .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            category = 'all',
            search,
            user_id,
            followed_only,
            state,
            sort = 'popular',
            limit = 60,
        } = req.query;

        // Build pages from each source
        let pages = [];
        if (category === 'all' || category === 'venues') {
            pages.push(...buildVenuePages());
        }
        if (category === 'all' || category === 'tours') {
            pages.push(...buildTourPages());
        }
        if (category === 'all' || category === 'series') {
            pages.push(...buildSeriesPages());
        }

        // Filter by state (venues only)
        if (state) {
            pages = pages.filter(p => p.page_type !== 'venue' || p.state === state.toUpperCase());
        }

        // Search filter
        if (search) {
            const searchLower = search.toLowerCase();
            pages = pages.filter(p =>
                p.name?.toLowerCase().includes(searchLower) ||
                p.subtitle?.toLowerCase().includes(searchLower) ||
                p.category?.toLowerCase().includes(searchLower) ||
                p.page_id?.toLowerCase().includes(searchLower)
            );
        }

        // Get follower counts from Supabase
        let followerCounts = {};
        let userFollows = new Set();

        try {
            // Get follower counts for all page types
            const { data: countData } = await supabase
                .from('page_followers')
                .select('page_type, page_id');

            if (countData) {
                countData.forEach(row => {
                    const key = `${row.page_type}:${row.page_id}`;
                    followerCounts[key] = (followerCounts[key] || 0) + 1;
                });
            }

            // Get user's follows if user_id provided
            if (user_id) {
                const { data: follows } = await supabase
                    .from('page_followers')
                    .select('page_type, page_id')
                    .eq('user_id', user_id);

                if (follows) {
                    follows.forEach(f => {
                        userFollows.add(`${f.page_type}:${f.page_id}`);
                    });
                }
            }
        } catch (e) {
            // Supabase unavailable, continue without follow data
        }

        // Attach follow data to pages
        pages = pages.map(p => ({
            ...p,
            follower_count: followerCounts[`${p.page_type}:${p.page_id}`] || 0,
            is_following: userFollows.has(`${p.page_type}:${p.page_id}`),
        }));

        // Filter to followed only
        if (followed_only === 'true') {
            pages = pages.filter(p => p.is_following);
        }

        // Sort
        if (sort === 'popular') {
            pages.sort((a, b) => {
                // Tours first, then series, then venues
                const typeOrder = { tour: 0, series: 1, venue: 2 };
                const typeA = typeOrder[a.page_type] ?? 3;
                const typeB = typeOrder[b.page_type] ?? 3;
                if (typeA !== typeB) return typeA - typeB;
                // Then by follower count
                return (b.follower_count || 0) - (a.follower_count || 0);
            });
        } else if (sort === 'name') {
            pages.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        } else if (sort === 'newest') {
            // Series by start date, tours by priority, venues by trust
            pages.sort((a, b) => {
                if (a.start_date && b.start_date) return new Date(a.start_date) - new Date(b.start_date);
                if (a.start_date) return -1;
                if (b.start_date) return 1;
                return (b.follower_count || 0) - (a.follower_count || 0);
            });
        }

        const total = pages.length;
        pages = pages.slice(0, parseInt(limit));

        return res.status(200).json({
            success: true,
            data: pages,
            total,
            summary: {
                venues: total - pages.filter(p => p.page_type !== 'venue').length <= total ? buildVenuePages().length : 0,
                tours: buildTourPages().length,
                series: buildSeriesPages().length,
                user_following: userFollows.size,
            },
        });

    } catch (error) {
        console.error('Pages API error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
