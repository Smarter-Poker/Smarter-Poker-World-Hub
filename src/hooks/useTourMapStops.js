import { useMemo } from 'react';
import { resolveCityCoordsArray as resolveCityCoords } from '../data/city-coordinates';
export default function useTourMapStops({ tours, allVenuesForMap, userLocation, selectedCity, filters, globalSearchModeRef, hasSearched, centerLat, centerLng, effRad, consumedVenueNames, consumedVenueStems, charityBestIds, tourPins, filteredVenues }) {
    return useMemo(() => { try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const MONTHS = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };

        function parseStopDates(dateStr) {
            if (!dateStr) return null;
            const parts = dateStr.split(/\s*[-–]\s*/);
            function parseOne(s, fallbackMonth) {
                if (!s) return null;
                s = s.trim().replace(',', '');
                const m = s.match(/^([A-Z][a-z]{2})\s+(\d{1,2})(?:\s+(\d{4}))?/);
                if (m) {
                    const month = MONTHS[m[1]];
                    if (month === undefined) return null;
                    return new Date(m[3] ? parseInt(m[3]) : 2026, month, parseInt(m[2]));
                }
                const dayOnly = s.match(/^(\d{1,2})$/);
                if (dayOnly && fallbackMonth !== undefined) return new Date(2026, fallbackMonth, parseInt(dayOnly[1]));
                return null;
            }
            const start = parseOne(parts[0]);
            if (!start) return null;
            const end = parts.length >= 2 ? (parseOne(parts[parts.length - 1], start.getMonth()) || start) : start;
            return { start, end };
        }

        // ─── Resolve stop coordinates + host venue info by matching against real venue database ───
        // Cross-validates venue DB matches against TOUR_CITY_COORDS to catch bad data
        // Returns { lat, lng, hostLogo?, hostName? } so tour pins can render a double-icon
        function findStopCoords(stop) {
            const venueName = (stop.venue || stop.name || '').toLowerCase();
            const location = (stop.location || '').toLowerCase();
            const locationCity = location.split(',')[0]?.trim() || '';
            const locationState = location.split(',')[1]?.trim() || '';

            // Get trusted city coords for cross-validation
            const trustedCity = resolveCityCoords(stop.location || '');

            // Distance check helper — reject if >15 miles from expected city
            function isTooFar(lat, lng) {
                if (!trustedCity) return false; // no city coords = can't validate, allow it
                const dlat = (lat - trustedCity[0]) * 69;
                const dlng = (lng - trustedCity[1]) * 69 * Math.cos(trustedCity[0] * Math.PI / 180);
                return Math.sqrt(dlat * dlat + dlng * dlng) > 15;
            }

            // Helper: extract host venue metadata from a matched venue
            function withHostInfo(match) {
                return {
                    lat: match.latitude, lng: match.longitude,
                    hostLogo: match.logo_url || match.profile_photo_url || match.cover_photo_url || match.image_url || '',
                    hostName: match.name || '',
                };
            }

            // 1. Exact venue name match against real venue DB
            if (venueName.length > 2 && allVenuesForMap.length > 0) {
                let match = allVenuesForMap.find(v => v.name && v.name.toLowerCase() === venueName && v.latitude);
                if (match && !isTooFar(match.latitude, match.longitude)) {
                    return withHostInfo(match);
                }

                // 2. Partial venue name match (contains)
                if (venueName.length > 5) {
                    match = allVenuesForMap.find(v => {
                        if (!v.name || !v.latitude) return false;
                        const n = v.name.toLowerCase();
                        return n.includes(venueName) || venueName.includes(n);
                    });
                    if (match && !isTooFar(match.latitude, match.longitude)) {
                        return withHostInfo(match);
                    }
                }

                // 3. City + state match (first venue in that city)
                if (locationCity && locationState) {
                    match = allVenuesForMap.find(v =>
                        v.latitude &&
                        (v.city || '').toLowerCase() === locationCity &&
                        (v.state || '').toLowerCase() === locationState
                    );
                    if (match && !isTooFar(match.latitude, match.longitude)) {
                        return withHostInfo(match);
                    }
                }
            }

            // 4. Fallback to TOUR_CITY_COORDS hardcoded map (trusted source)
            if (trustedCity) return { lat: trustedCity[0], lng: trustedCity[1] };

            return null;
        }

        const tourPins = [];
        const seen = new Set();

        const effRad = String(filters.radius).toLowerCase() === 'any' ? 5000 : Number(filters.radius || 50);
        let centerLat = null, centerLng = null;
        if (userLocation) {
            centerLat = userLocation.lat; centerLng = userLocation.lng;
        } else if (selectedCity) {
            centerLat = selectedCity.latitude; centerLng = selectedCity.longitude;
        }

        (tours || []).forEach(tour => {
            const allStops = [
                ...(tour.stops_2026 || []),
                ...(tour.series_2026 || []),
            ];

            // ─── Find current running stop or next upcoming stop (ONE per tour) ───
            let currentRunning = null;
            let nextUpcoming = null;

            for (const stop of allStops) {
                const dates = parseStopDates(stop.dates);
                if (!dates) continue;
                if (dates.start <= today && dates.end >= today) {
                    currentRunning = stop;
                }
                if (dates.start > today) {
                    if (!nextUpcoming) {
                        nextUpcoming = stop;
                    } else {
                        const existingDates = parseStopDates(nextUpcoming.dates);
                        if (existingDates && dates.start < existingDates.start) {
                            nextUpcoming = stop;
                        }
                    }
                }
            }

            const activeStop = currentRunning || nextUpcoming;
            if (!activeStop) return; // No current or upcoming stop — skip this tour

            // 30-day lookahead cap: if the tour isn't currently running,
            // only show the next-upcoming stop if it starts within 30 days.
            // Prevents events months out (e.g. August) from cluttering the map.
            if (!currentRunning && nextUpcoming) {
                const upcomingDates = parseStopDates(nextUpcoming.dates);
                if (upcomingDates) {
                    const daysAway = (upcomingDates.start - today) / (1000 * 60 * 60 * 24);
                    if (daysAway > 30) return; // Too far out — don't show on map yet
                }
            }

            // ─── Resolve coordinates using venue DB, then city map, then tour lat/lng ───
            let resolved = findStopCoords(activeStop);

            // Ultimate fallback: use lat/lng stored directly on the tour object
            if (!resolved && tour.latitude && tour.longitude) {
                resolved = { lat: tour.latitude, lng: tour.longitude };
            }

            if (!resolved) return; // Cannot resolve coordinates — skip

            let lat = resolved.lat;
            let lng = resolved.lng;

            // DISTANCE FILTER — respect radius
            let distanceMi = null;
            if (centerLat !== null && centerLng !== null) {
                const dlat = (lat - centerLat) * 69;
                const dlng = (lng - centerLng) * 69 * Math.cos(centerLat * Math.PI / 180);
                distanceMi = Math.sqrt(dlat * dlat + dlng * dlng);
                if (distanceMi > effRad) return;
            }

            // Dedupe by tour code (ONE pin per tour)
            if (seen.has(tour.tour_code)) return;
            seen.add(tour.tour_code);

            const isActive = !!currentRunning;
            const location = activeStop.location || '';
            const locParts = location.split(',');
            const city = locParts[0]?.trim() || '';
            const state = locParts[1]?.trim() || '';

            // No offset — tour pin sits directly on the host venue.
            // The double-label pill + zIndexOffset: 500 ensures the tour takes visual precedence.

            tourPins.push({
                id: `tour-stop-${tour.tour_code}`,
                name: activeStop.name || `${tour.tour_name || tour.tour_code} — ${city}`,
                stop_name: activeStop.name || activeStop.venue || '',
                stop_venue: activeStop.venue || '',
                venue_type: 'tour_stop',
                tour_code: tour.tour_code,
                tour_name: tour.tour_name || tour.tour_code,
                logo_url: tour.logo_url,
                // Host venue metadata for double-icon rendering
                host_venue_logo_url: resolved.hostLogo || '',
                host_venue_name: resolved.hostName || activeStop.venue || '',
                latitude: lat,
                longitude: lng,
                city,
                state,
                location,
                dates: activeStop.dates || '',
                buyin: activeStop.buyin,
                distance_mi: distanceMi,
                is_running: isActive,
                has_tournaments: true,
                // Lean TourCard data — only the fields TourCard.js reads, matching
                // exactly what the Tours tab passes so the card is identical.
                tour_card_data: {
                    tour_code: tour.tour_code,
                    tour_name: tour.tour_name || tour.tour_code,
                    logo_url: tour.logo_url,
                    tour_type: tour.tour_type || (isActive ? 'circuit' : 'regional'),
                    headquarters: activeStop.venue
                        ? `${activeStop.venue}${city ? ' — ' + city : ''}${state ? ', ' + state : ''}`
                        : location || '',
                    typical_buyins: tour.typical_buyins || null,
                    regions: Array.isArray(tour.regions) ? tour.regions : [],
                    established: tour.established || null,
                    upcoming_series: Array.isArray(tour.upcoming_series)
                        ? tour.upcoming_series
                        : [],
                    official_website: tour.official_website || tour.website || null,
                },
            });
        });

        // ─── Map-only suppression: venues hosted by a tour stop are hidden on the MAP
        // (so only the WSOP logo pin shows, not an overlapping plain venue dot) but they
        // still appear as a VenueCard in the card list alongside the RichTourCard.
        const consumedVenueNames = new Set();
        const consumedVenueStems = new Set();
        tourPins.forEach(tp => {
            if (tp.host_venue_name) {
                const n = tp.host_venue_name.toLowerCase();
                consumedVenueNames.add(n);
                const words = n.split(/\s+/).filter(Boolean);
                if (words.length >= 2) consumedVenueStems.add(words.slice(0, 2).join(' '));
                if (words.length >= 3) consumedVenueStems.add(words.slice(0, 3).join(' '));
            }
        });

        // --- NEW: Deduplicate charity venues so they only show ONE pin (the "next" or primary event) ---
        const charityBestIds = new Set();
        const charityGroups = new Map();

        allVenuesForMap.forEach(v => {
            if (v.venue_type === 'charity' && v.name) {
                let bn = v.name.replace(/\s*\(.*\)/g, ''); // Remove parentheticals like (CCG Poker)
                bn = bn.split(' — ')[0]; // Em dash
                bn = bn.split(' - ')[0]; // En dash / Hyphen
                bn = bn.split(' @ ')[0];
                bn = bn.toLowerCase().trim();
                
                if (!charityGroups.has(bn)) {
                    charityGroups.set(bn, []);
                }
                charityGroups.get(bn).push(v);
            }
        });

        charityGroups.forEach(group => {
            if (group.length === 1) {
                charityBestIds.add(group[0].id);
            } else {
                // Sort to pick the "best" representation — data richness wins over stub records
                const sorted = group.sort((a, b) => {
                    // 1. Prefer venues with actual scrape data (games_offered, tournament_schedule)
                    const aRich = (a.games_offered && a.games_offered.length > 0) || (a.tournament_schedule && a.tournament_schedule.length > 0);
                    const bRich = (b.games_offered && b.games_offered.length > 0) || (b.tournament_schedule && b.tournament_schedule.length > 0);
                    if (aRich && !bRich) return -1;
                    if (bRich && !aRich) return 1;
                    // 2. Prefer complete scrape_status over empty/no_data
                    const statusRank = { complete: 0, verified: 1, scraped_verified: 2, no_data: 99 };
                    const aRank = statusRank[a.scrape_status] ?? 50;
                    const bRank = statusRank[b.scrape_status] ?? 50;
                    if (aRank !== bRank) return aRank - bRank;
                    // 3. Prefer high scrape_confidence
                    const confRank = { high: 0, medium: 1, low: 2, unverified: 99 };
                    const aC = confRank[a.scrape_confidence] ?? 50;
                    const bC = confRank[b.scrape_confidence] ?? 50;
                    if (aC !== bC) return aC - bC;
                    // 4. Highest trust_score, then higher id as final tiebreaker
                    if ((b.trust_score || 0) !== (a.trust_score || 0)) return (b.trust_score || 0) - (a.trust_score || 0);
                    return b.id - a.id;
                });
                charityBestIds.add(sorted[0].id);
            }
        });
        // -------------------------------------------------------------------------------------------------

        // NOTE: never mutate the venue objects held in React state — they are the
        // same references on every recompute, so a written flag (hideOnMap) or a
        // stale distance would survive forever. Build shallow copies instead and
        // recompute hideOnMap/distance_mi from scratch on every pass.
        const filteredVenues = [];
        allVenuesForMap.forEach(v => {
            // Strip out parent tour/series metadata records (e.g. "Illinois Poker Championship")
            // These have coordinates but are NOT playable venues — they're tour containers
            if (v.venue_type === 'series' || v.venue_type === 'tour') return;

            // Recomputed every pass — starts false so a venue reappears on the map
            // as soon as its tour stop rolls past or leaves the radius.
            let hideOnMap = false;

            // MAP-ONLY: if this venue is the host of a tour stop, hide its plain dot on the map
            // (the WSOP logo pin already appears there). The venue card still shows in the list.
            if (v.name) {
                const vName = v.name.toLowerCase();
                const vWords = vName.split(/\s+/).filter(Boolean);
                const nameMatch = consumedVenueNames.has(vName)
                    || (vWords.length >= 2 && consumedVenueStems.has(vWords.slice(0, 2).join(' ')))
                    || (vWords.length >= 3 && consumedVenueStems.has(vWords.slice(0, 3).join(' ')));
                if (nameMatch) hideOnMap = true; // ← card stays, map pin removed
            }
            if (!hideOnMap && v.latitude && v.longitude) {
                for (const tp of tourPins) {
                    const dlat = (v.latitude - tp.latitude) * 69;
                    const dlng = (v.longitude - tp.longitude) * 69 * Math.cos(v.latitude * Math.PI / 180);
                    if (Math.sqrt(dlat * dlat + dlng * dlng) < 0.1) { hideOnMap = true; break; }
                }
            }

            // Charity deduplication (allow only ONE venue per charity brand)
            if (v.venue_type === 'charity' && v.id) {
                if (!charityBestIds.has(v.id)) return;
            }

            let distanceMi = v.distance_mi;

            // Radius filter + distance computation
            // Only enforce the radius when the user has a REAL location (GPS or city).
            // Skip enforcement when no real location is known or during global text searches.
            const hasRealLoc = !!(userLocation || selectedCity);
            if (centerLat !== null && centerLng !== null) {
                if (v.latitude && v.longitude) {
                    const vDlat = (v.latitude - centerLat) * 69;
                    const vDlng = (v.longitude - centerLng) * 69 * Math.cos(centerLat * Math.PI / 180);
                    const vDist = Math.sqrt(vDlat * vDlat + vDlng * vDlng);
                    distanceMi = vDist;
                    if (hasRealLoc && !globalSearchModeRef.current && vDist > effRad) return;
                } else if (hasRealLoc && !globalSearchModeRef.current) {
                    // No coordinates — can't verify distance, exclude from location-based results
                    return;
                }
            }

            filteredVenues.push({ ...v, hideOnMap, distance_mi: distanceMi });
        });
        const combined = [...filteredVenues, ...tourPins];

        // Apply UI filters to BOTH arrays here so BOTH map feeds and list feeds are correctly filtered
        return combined.filter(v => {
            // Only bypass dropdown filters during a global text search, NOT during GPS/city searches
            if (globalSearchModeRef.current && hasSearched) return true;

            const isTour = v.venue_type === 'tour_stop' || v.venue_type === 'series';

            // Venue Type filter
            if (filters.venueType && filters.venueType !== 'all') {
                if (v.venue_type !== filters.venueType) {
                    // special rule: 'card_room' filter also shows 'poker_club'
                    if (!(filters.venueType === 'card_room' && v.venue_type === 'poker_club') &&
                        !(filters.venueType === 'tour_stop' && isTour)) {
                        return false; 
                    }
                }
            }

            // Game Type filter
            if (filters.gameType === 'cash') {
                if (isTour || !(v.games_offered && v.games_offered.length > 0)) return false;
            } else if (filters.gameType === 'mtt') {
                if (!isTour && !v.has_tournaments) return false;
            } else if (filters.gameType === 'mixed') {
                if (isTour || !(v.games_offered && v.games_offered.some(g => /mixed|horse|8-game/i.test(g)))) return false;
            }

            // Stakes filter (exclude tour stops, they don't have stakes_cash)
            if (filters.stakes === '$1/2') {
                if (isTour || !(v.stakes_cash && v.stakes_cash.some(s => s.includes('1/2') || s.includes('1/3')))) return false;
            } else if (filters.stakes === '$2/5') {
                if (isTour || !(v.stakes_cash && v.stakes_cash.some(s => s.includes('2/5')))) return false;
            } else if (filters.stakes === '$5/10+') {
                if (isTour || !(v.stakes_cash && v.stakes_cash.some(s => s.includes('5/10') || s.includes('10/20') || s.includes('25/50')))) return false;
            }

            return true;
        });
    } catch (err) {
        console.warn('[PNM] allVenuesWithTours crash — returning safe empty array:', err);
        return Array.isArray(allVenuesForMap) ? allVenuesForMap : [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allVenuesForMap, tours, filters.radius, userLocation, selectedCity, filters.venueType, filters.gameType, filters.stakes, hasSearched]);
}
