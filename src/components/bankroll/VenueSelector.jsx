/**
 * VENUE SELECTOR COMPONENT
 * ---------------------------------------------------------------
 * Smart venue picker with venue type classification and auto-suggest
 * from the PokerNearMe database (483+ verified venues).
 *
 * Flow:
 *   1. User picks venue type: Casino, Club, or Home Game
 *   2. Casino/Club → auto-suggest from poker_venues
 *   3. Home Game → manual name entry + optional GPS pin
 *
 * Props:
 *   value       - current venue name string
 *   venueType   - 'casino' | 'poker_club' | 'home_game'
 *   onChange     - (name, venueType, pokerVenueId, lat, lng) => void
 *   userId       - for bankroll_locations linkage
 */

import { useState, useEffect, useRef, useCallback } from 'react';

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
    const [gettingLocation, setGettingLocation] = useState(false);
    const [homeCoords, setHomeCoords] = useState(null);
    const debounceRef = useRef(null);
    const containerRef = useRef(null);

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

        // For home game or when typing custom, fire onChange immediately
        onChange(val, selectedType, null, null, null);
    };

    const handleSelectVenue = (venue) => {
        setSelectedVenue(venue);
        setSearchQuery(venue.name);
        setShowSuggestions(false);
        const lat = venue.latitude ?? venue.lat ?? null;
        const lng = venue.longitude ?? venue.lng ?? null;
        onChange(venue.name, selectedType, venue.id, lat, lng);
    };

    const handleTypeChange = (type) => {
        setSelectedType(type);
        setSearchQuery('');
        setSelectedVenue(null);
        setSuggestions([]);
        setHomeCoords(null);
        onChange('', type, null, null, null);
    };

    const handleUseMyLocation = () => {
        if (!navigator.geolocation) return;
        setGettingLocation(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setHomeCoords(coords);
                setGettingLocation(false);
                // Fire onChange with coordinates
                onChange(searchQuery || 'Home Game', 'home_game', null, coords.lat, coords.lng);
            },
            () => setGettingLocation(false),
            { enableHighAccuracy: true, timeout: 10000 }
        );
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
                            ? 'Enter name or address...'
                            : 'Search venues...'
                    }
                    style={styles.input}
                />
                {isSearching && <span style={styles.spinner}>⟳</span>}
                {selectedVenue && <span style={styles.linked}>✓ Linked</span>}
            </div>

            {/* Home Game — Use My Location */}
            {selectedType === 'home_game' && (
                <div style={styles.homeRow}>
                    <button
                        type="button"
                        onClick={handleUseMyLocation}
                        disabled={gettingLocation}
                        style={styles.locationBtn}
                    >
                        {gettingLocation ? 'Getting location...' : '📍 Use My Location'}
                    </button>
                    {homeCoords && (
                        <span style={styles.coordsText}>
                            {homeCoords.lat.toFixed(4)}, {homeCoords.lng.toFixed(4)}
                        </span>
                    )}
                </div>
            )}

            {/* Auto-Suggest Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
                <div style={styles.dropdown}>
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
                </div>
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
        display: 'flex',
        alignItems: 'center',
        gap: 8,
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
    },
    coordsText: {
        fontSize: 11,
        color: '#b0b3b8',
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
};
