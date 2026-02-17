/**
 * VENUE SELECTOR COMPONENT
 * ---------------------------------------------------------------
 * Smart venue picker with venue type classification and auto-suggest
 * from the PokerNearMe database (483+ verified venues).
 *
 * Flow:
 *   1. User picks venue type: Casino, Club, or Home Game
 *   2. Casino/Club → auto-suggest from poker_venues
 *   3. Home Game → manual name entry + interactive map picker
 *
 * Props:
 *   value       - current venue name string
 *   venueType   - 'casino' | 'poker_club' | 'home_game'
 *   onChange     - (name, venueType, pokerVenueId, lat, lng) => void
 *   userId       - for bankroll_locations linkage
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import LocationMapPicker from './LocationMapPicker';

const VENUE_TYPES = [
    { id: 'casino', label: 'Casino / Card Room' },
    { id: 'poker_club', label: 'Club' },
    { id: 'home_game', label: 'Home Game' },
];

export default function VenueSelector({ value, venueType, onChange, userId }) {
    const [selectedType, setSelectedType] = useState(venueType || 'casino');
    const [searchQuery, setSearchQuery] = useState(value || '');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedVenue, setSelectedVenue] = useState(null); // full poker_venues object
    const [showMapPicker, setShowMapPicker] = useState(false);
    const [homeCoords, setHomeCoords] = useState(null);
    const [homeAddress, setHomeAddress] = useState('');
    const [savedLocations, setSavedLocations] = useState([]); // user's saved bankroll_locations
    const debounceRef = useRef(null);
    const containerRef = useRef(null);

    // Load user's saved locations from bankroll_locations on mount
    useEffect(() => {
        if (!userId) return;
        const loadSavedLocations = async () => {
            try {
                const { supabase } = await import('../../lib/supabase');
                const { data, error } = await supabase
                    .from('bankroll_locations')
                    .select('id, name, venue_type, latitude, longitude')
                    .eq('user_id', userId)
                    .order('name');
                if (!error && data) {
                    setSavedLocations(data);
                }
            } catch (err) {
                console.error('[VenueSelector] Failed to load saved locations:', err);
            }
        };
        loadSavedLocations();
    }, [userId]);

    // Close suggestions on outside click
    useEffect(() => {
        const handleClick = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Filter saved locations by search query — show ALL saved locations regardless of venue type
    const filteredSavedLocations = useMemo(() => {
        if (!savedLocations.length) return [];
        if (!searchQuery.trim()) return savedLocations;
        const q = searchQuery.toLowerCase();
        return savedLocations.filter(loc => loc.name.toLowerCase().includes(q));
    }, [savedLocations, searchQuery]);

    // Debounced search against /api/poker/venues
    const searchVenues = useCallback(async (query) => {
        if (!query || query.length < 2) {
            setSuggestions([]);
            return;
        }
        setIsSearching(true);
        try {
            const typeParam = selectedType === 'poker_club' ? '&type=poker_club' : '';
            const res = await fetch(`/api/poker/venues?search=${encodeURIComponent(query)}${typeParam}&limit=8`);
            const data = await res.json();
            if (data.success && data.data) {
                setSuggestions(data.data);
                setShowSuggestions(true);
            }
        } catch (err) {
            console.error('[VenueSelector] Search failed:', err);
        } finally {
            setIsSearching(false);
        }
    }, [selectedType]);

    const handleInputChange = (e) => {
        const val = e.target.value;
        setSearchQuery(val);
        setSelectedVenue(null);

        // Debounce search for casino/club
        if (selectedType !== 'home_game') {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => searchVenues(val), 300);
        }

        // Show saved-location suggestions while typing (especially for home games)
        if (val.trim().length > 0) {
            setShowSuggestions(true);
        } else {
            setShowSuggestions(false);
        }

        // For home game or when typing custom, fire onChange immediately
        onChange(val, selectedType, null, homeCoords?.lat || null, homeCoords?.lng || null);
    };

    const handleSelectVenue = (venue) => {
        setSelectedVenue(venue);
        setSearchQuery(venue.name);
        setShowSuggestions(false);
        const lat = venue.latitude ?? venue.lat ?? null;
        const lng = venue.longitude ?? venue.lng ?? null;
        onChange(venue.name, selectedType, venue.id, lat, lng);
    };

    // Select a saved location (from bankroll_locations)
    const handleSelectSavedLocation = (loc) => {
        const locType = loc.venue_type || selectedType;
        setSearchQuery(loc.name);
        setSelectedType(locType);
        setShowSuggestions(false);
        if (loc.latitude && loc.longitude) {
            setHomeCoords({ lat: loc.latitude, lng: loc.longitude });
        }
        onChange(loc.name, locType, null, loc.latitude || null, loc.longitude || null);
    };

    const handleTypeChange = (type) => {
        setSelectedType(type);
        setSearchQuery('');
        setSelectedVenue(null);
        setSuggestions([]);
        setHomeCoords(null);
        setHomeAddress('');
        onChange('', type, null, null, null);
    };

    const handleMapConfirm = ({ lat, lng, address }) => {
        setHomeCoords({ lat, lng });
        setHomeAddress(address);
        setShowMapPicker(false);
        // Fire onChange with updated coordinates
        onChange(searchQuery || 'Home Game', 'home_game', null, lat, lng);
    };

    return (
        <div ref={containerRef} style={styles.container}>
            {/* Venue Type Selector */}
            <div style={styles.typePicker}>
                {VENUE_TYPES.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => handleTypeChange(t.id)}
                        style={{
                            ...styles.typeBtn,
                            ...(selectedType === t.id ? styles.typeBtnActive : {}),
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Saved Location Quick Picks (for home games and all types) */}
            {filteredSavedLocations.length > 0 && !searchQuery.trim() && (
                <div style={styles.savedRow}>
                    <span style={styles.savedLabel}>Recent:</span>
                    <div style={styles.savedChips}>
                        {filteredSavedLocations.slice(0, 5).map((loc) => (
                            <button
                                key={loc.id}
                                type="button"
                                onClick={() => handleSelectSavedLocation(loc)}
                                style={styles.savedChip}
                            >
                                {loc.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Search / Input Field */}
            <div style={styles.inputRow}>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={handleInputChange}
                    onFocus={() => {
                        if (suggestions.length > 0) setShowSuggestions(true);
                    }}
                    placeholder={
                        selectedType === 'home_game'
                            ? 'Name this location...'
                            : 'Search venues...'
                    }
                    style={styles.input}
                />
                {isSearching && <span style={styles.spinner}>⟳</span>}
                {selectedVenue && <span style={styles.linked}>✓ Linked</span>}
            </div>

            {/* Home Game — Map Pin Section */}
            {selectedType === 'home_game' && searchQuery.trim().length > 0 && (
                <div style={styles.homeRow}>
                    {!homeCoords ? (
                        <>
                            <button
                                type="button"
                                onClick={() => setShowMapPicker(true)}
                                style={styles.locationBtn}
                            >
                                📍 Add to Map
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    onChange(searchQuery, 'home_game', null, null, null);
                                }}
                                style={{ ...styles.locationBtn, color: '#b0b3b8' }}
                            >
                                Skip
                            </button>
                        </>
                    ) : (
                        <div style={styles.confirmedLocation}>
                            <span style={styles.pinIcon}>📍</span>
                            <div style={styles.confirmedInfo}>
                                <span style={styles.confirmedLabel}>Location Pinned</span>
                                <span style={styles.confirmedAddress}>
                                    {homeAddress || `${homeCoords.lat.toFixed(4)}, ${homeCoords.lng.toFixed(4)}`}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowMapPicker(true)}
                                style={styles.editPinBtn}
                            >
                                Edit
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Auto-Suggest Dropdown — merges saved locations + venue search results */}
            {showSuggestions && (filteredSavedLocations.length > 0 || suggestions.length > 0) && searchQuery.trim().length > 0 && (
                <div style={styles.dropdown}>
                    {/* Saved locations matching the query */}
                    {filteredSavedLocations.length > 0 && (
                        <>
                            <div style={styles.dropdownSectionLabel}>Your Saved Locations</div>
                            {filteredSavedLocations.map((loc) => (
                                <button
                                    key={`saved-${loc.id}`}
                                    type="button"
                                    onClick={() => handleSelectSavedLocation(loc)}
                                    style={styles.suggestion}
                                >
                                    <div style={styles.suggestionName}>📍 {loc.name}</div>
                                    <div style={styles.suggestionMeta}>
                                        {(loc.venue_type || 'home_game').replace('_', ' ')}
                                    </div>
                                </button>
                            ))}
                        </>
                    )}
                    {/* Venue search results */}
                    {suggestions.length > 0 && (
                        <>
                            {filteredSavedLocations.length > 0 && (
                                <div style={styles.dropdownSectionLabel}>Search Results</div>
                            )}
                            {suggestions.map((venue) => (
                                <button
                                    key={venue.id}
                                    type="button"
                                    onClick={() => handleSelectVenue(venue)}
                                    style={styles.suggestion}
                                >
                                    <div style={styles.suggestionName}>{venue.name}</div>
                                    <div style={styles.suggestionMeta}>
                                        {venue.city}{venue.state ? `, ${venue.state}` : ''}
                                        {venue.venue_type && (
                                            <span style={styles.venueType}>
                                                {' · '}{venue.venue_type.replace('_', ' ')}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </>
                    )}
                </div>
            )}

            {/* Map Picker Modal */}
            {showMapPicker && (
                <LocationMapPicker
                    initialLat={homeCoords?.lat}
                    initialLng={homeCoords?.lng}
                    onConfirm={handleMapConfirm}
                    onClose={() => setShowMapPicker(false)}
                />
            )}
        </div>
    );
}

const styles = {
    container: {
        position: 'relative',
        width: '100%',
    },
    typePicker: {
        display: 'flex',
        gap: 6,
        marginBottom: 8,
    },
    typeBtn: {
        flex: 1,
        padding: '8px 4px',
        fontSize: 12,
        fontWeight: 500,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        color: '#b0b3b8',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
    },
    typeBtnActive: {
        background: 'rgba(35,116,225,0.2)',
        borderColor: '#2374e1',
        color: '#fff',
        fontWeight: 600,
    },
    inputRow: {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
    },
    input: {
        width: '100%',
        padding: '10px 12px',
        fontSize: 14,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        color: '#e4e6eb',
        outline: 'none',
    },
    spinner: {
        position: 'absolute',
        right: 10,
        color: '#2374e1',
        fontSize: 16,
        animation: 'spin 1s linear infinite',
    },
    linked: {
        position: 'absolute',
        right: 10,
        color: '#22c55e',
        fontSize: 11,
        fontWeight: 600,
    },
    homeRow: {
        marginTop: 8,
    },
    locationBtn: {
        padding: '8px 14px',
        fontSize: 12,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        color: '#e4e6eb',
        cursor: 'pointer',
        marginRight: 8,
    },
    confirmedLocation: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        background: 'rgba(34,197,94,0.08)',
        border: '1px solid rgba(34,197,94,0.25)',
        borderRadius: 10,
    },
    pinIcon: {
        fontSize: 18,
        flexShrink: 0,
    },
    confirmedInfo: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
    },
    confirmedLabel: {
        fontSize: 12,
        fontWeight: 600,
        color: '#4ade80',
    },
    confirmedAddress: {
        fontSize: 11,
        color: '#b0b3b8',
        lineHeight: 1.3,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
    },
    editPinBtn: {
        padding: '6px 12px',
        fontSize: 11,
        fontWeight: 600,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 6,
        color: '#b0b3b8',
        cursor: 'pointer',
        flexShrink: 0,
    },
    dropdown: {
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        marginTop: 4,
        background: '#242526',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        overflow: 'hidden',
        zIndex: 100,
        maxHeight: 280,
        overflowY: 'auto',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    },
    suggestion: {
        display: 'block',
        width: '100%',
        padding: '10px 14px',
        background: 'none',
        border: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        cursor: 'pointer',
        textAlign: 'left',
        color: '#e4e6eb',
        transition: 'background 0.1s',
    },
    suggestionName: {
        fontSize: 13,
        fontWeight: 600,
        color: '#e4e6eb',
    },
    suggestionMeta: {
        fontSize: 11,
        color: '#b0b3b8',
        marginTop: 2,
    },
    venueType: {
        color: '#65676b',
    },
    dropdownSectionLabel: {
        padding: '6px 14px 4px',
        fontSize: 10,
        fontWeight: 700,
        color: 'rgba(255,255,255,0.35)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
    },
    savedRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
        flexWrap: 'wrap',
    },
    savedLabel: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.4)',
        fontWeight: 500,
        flexShrink: 0,
    },
    savedChips: {
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
    },
    savedChip: {
        padding: '5px 12px',
        fontSize: 12,
        fontWeight: 500,
        background: 'rgba(35,116,225,0.15)',
        border: '1px solid rgba(35,116,225,0.3)',
        borderRadius: 16,
        color: '#60a5fa',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
    },
};

