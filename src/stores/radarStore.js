/**
 * Radar Search Store (Zustand)
 * State machine for the Poker Near Me search engine
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useRadarStore = create(
    persist(
        (set, get) => ({
            // === CORE STATE ===
            mode: 'TACTICAL', // 'TACTICAL' (Geo-Radius) | 'STRATEGIC' (Nationwide)
            gameType: 'CASH', // 'CASH' | 'TOURNAMENT'

            // === LOCATION STATE ===
            location: null, // { lat, lng, label } | 'USER_GPS' | null
            userGpsLocation: null, // Cached GPS coordinates

            // === FILTERS ===
            filters: {
                date: { start: new Date(), end: null }, // DateRange
                radius: 25, // miles (5, 25, 100, or null for nationwide)
                stakes: [], // ['1/2', '2/5', '5/10']
                venueTypes: [], // ['casino', 'card_room', 'poker_club']
            },

            // === RESULTS STATE ===
            results: {
                venues: [],
                tournaments: [],
                loading: false,
                error: null,
                lastQuery: null,
            },

            // === UI STATE ===
            ui: {
                commandBarExpanded: true,
                resultsDrawerOpen: false,
                selectedVenue: null,
                hoveredVenue: null,
                mapCenter: null,
                mapZoom: 10,
            },

            // === ACTIONS ===

            /**
             * Set search mode (TACTICAL vs STRATEGIC)
             * Rule 1: If STRATEGIC, disable radius
             */
            setMode: (mode) => set((state) => ({
                mode,
                filters: {
                    ...state.filters,
                    radius: mode === 'STRATEGIC' ? null : 25, // Reset to 25mi for TACTICAL
                },
            })),

            /**
             * Set game type (CASH vs TOURNAMENT)
             * Rule 2: If CASH, lock date to TODAY
             */
            setGameType: (gameType) => set((state) => ({
                gameType,
                filters: {
                    ...state.filters,
                    date: gameType === 'CASH'
                        ? { start: new Date(), end: null }
                        : state.filters.date,
                },
            })),

            /**
             * Set location
             * Rule 3: Auto-trigger re-search after 500ms debounce
             */
            setLocation: (location) => {
                set({ location });

                // Debounced search trigger
                const { searchDebounceTimer } = get();
                if (searchDebounceTimer) clearTimeout(searchDebounceTimer);

                const timer = setTimeout(() => {
                    get().executeSearch();
                }, 500);

                set({ searchDebounceTimer: timer });
            },

            /**
             * Request user GPS location
             */
            requestGPS: async () => {
                try {
                    const position = await new Promise((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, {
                            enableHighAccuracy: true,
                            timeout: 10000,
                        });
                    });

                    const gpsLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        label: 'Your Location',
                    };

                    set({
                        userGpsLocation: gpsLocation,
                        location: gpsLocation,
                    });

                    get().executeSearch();

                } catch (error) {
                    console.error('GPS Error:', error);
                    set((state) => ({
                        results: {
                            ...state.results,
                            error: 'Unable to access GPS. Please enter a location manually.',
                        },
                    }));
                }
            },

            /**
             * Update filters
             */
            setFilters: (updates) => set((state) => ({
                filters: { ...state.filters, ...updates },
            })),

            /**
             * Set radius (5, 25, 100, or null for nationwide)
             */
            setRadius: (radius) => {
                set((state) => ({
                    filters: { ...state.filters, radius },
                    mode: radius === null ? 'STRATEGIC' : 'TACTICAL',
                }));
                get().executeSearch();
            },

            /**
             * Execute search query
             */
            executeSearch: async () => {
                const { mode, gameType, location, filters } = get();

                // Validation
                if (!location && mode === 'TACTICAL') {
                    set((state) => ({
                        results: {
                            ...state.results,
                            error: 'Please set a location for tactical search',
                        },
                    }));
                    return;
                }

                // Set loading state
                set((state) => ({
                    results: {
                        ...state.results,
                        loading: true,
                        error: null,
                    },
                }));

                try {
                    // Build query parameters
                    const params = new URLSearchParams();

                    if (mode === 'TACTICAL' && location) {
                        params.set('lat', location.lat);
                        params.set('lng', location.lng);
                        params.set('radius', filters.radius || 25);
                    }

                    if (gameType === 'TOURNAMENT') {
                        params.set('start_date', filters.date.start.toISOString().split('T')[0]);
                        if (filters.date.end) {
                            params.set('end_date', filters.date.end.toISOString().split('T')[0]);
                        }
                    }

                    if (filters.stakes.length > 0) {
                        params.set('stakes', filters.stakes.join(','));
                    }

                    if (filters.venueTypes.length > 0) {
                        params.set('types', filters.venueTypes.join(','));
                    }

                    // Execute API calls
                    const [venuesRes, tournamentsRes] = await Promise.all([
                        gameType === 'CASH'
                            ? fetch(`/api/poker/venues?${params}`).then(r => r.json())
                            : Promise.resolve({ data: [] }),
                        gameType === 'TOURNAMENT'
                            ? fetch(`/api/poker/series?${params}`).then(r => r.json())
                            : Promise.resolve({ data: [] }),
                    ]);

                    // Update results
                    set({
                        results: {
                            venues: venuesRes.data || [],
                            tournaments: tournamentsRes.data || [],
                            loading: false,
                            error: null,
                            lastQuery: { mode, gameType, location, filters, timestamp: Date.now() },
                        },
                        ui: {
                            ...get().ui,
                            resultsDrawerOpen: true,
                        },
                    });

                } catch (error) {
                    console.error('Search Error:', error);
                    set((state) => ({
                        results: {
                            ...state.results,
                            loading: false,
                            error: 'Search failed. Please try again.',
                        },
                    }));
                }
            },

            /**
             * UI Actions
             */
            toggleCommandBar: () => set((state) => ({
                ui: { ...state.ui, commandBarExpanded: !state.ui.commandBarExpanded },
            })),

            toggleResultsDrawer: () => set((state) => ({
                ui: { ...state.ui, resultsDrawerOpen: !state.ui.resultsDrawerOpen },
            })),

            selectVenue: (venue) => set((state) => ({
                ui: {
                    ...state.ui,
                    selectedVenue: venue,
                    mapCenter: venue ? { lat: venue.lat, lng: venue.lng } : null,
                },
            })),

            hoverVenue: (venue) => set((state) => ({
                ui: { ...state.ui, hoveredVenue: venue },
            })),

            setMapView: (center, zoom) => set((state) => ({
                ui: { ...state.ui, mapCenter: center, mapZoom: zoom },
            })),

            /**
             * Reset search
             */
            reset: () => set({
                mode: 'TACTICAL',
                gameType: 'CASH',
                location: null,
                filters: {
                    date: { start: new Date(), end: null },
                    radius: 25,
                    stakes: [],
                    venueTypes: [],
                },
                results: {
                    venues: [],
                    tournaments: [],
                    loading: false,
                    error: null,
                    lastQuery: null,
                },
            }),
        }),
        {
            name: 'radar-search-store',
            partialize: (state) => ({
                mode: state.mode,
                gameType: state.gameType,
                filters: state.filters,
                userGpsLocation: state.userGpsLocation,
            }),
        }
    )
);

export default useRadarStore;
