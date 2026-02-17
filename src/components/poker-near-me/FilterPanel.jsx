/**
 * FilterPanel - Filter controls for Poker Near Me
 * Filter by game type, stakes, venue type, and radius
 */

import { useState } from 'react';

const GAME_TYPES = [
    { value: 'all', label: 'All Games' },
    { value: 'nlh', label: 'No-Limit Hold\'em' },
    { value: 'plo', label: 'Pot-Limit Omaha' },
    { value: 'plo8', label: 'PLO Hi-Lo' },
    { value: 'mixed', label: 'Mixed Games' },
    { value: 'stud', label: 'Stud' },
    { value: 'other', label: 'Other' }
];

const STAKES_OPTIONS = [
    { value: 'all', label: 'All Stakes' },
    { value: '1/2', label: '$1/$2' },
    { value: '1/3', label: '$1/$3' },
    { value: '2/5', label: '$2/$5' },
    { value: '5/10', label: '$5/$10' },
    { value: '10/20', label: '$10/$20+' }
];

const VENUE_TYPES = [
    { value: 'all', label: 'All Venues' },
    { value: 'casino', label: 'Casino' },
    { value: 'card_room', label: 'Card Room' },
    { value: 'poker_club', label: 'Poker Club' },
    { value: 'charity', label: 'Charity' }
];

const RADIUS_OPTIONS = [
    { value: 10, label: '10 Miles' },
    { value: 25, label: '25 Miles' },
    { value: 50, label: '50 Miles' },
    { value: 100, label: '100 Miles' },
    { value: 250, label: '250 Miles' }
];

export default function FilterPanel({
    filters,
    onFilterChange,
    isExpanded,
    onToggleExpand,
    showRadius = true,
    showVenueType = true
}) {
    const [localFilters, setLocalFilters] = useState(filters || {
        gameType: 'all',
        stakes: 'all',
        venueType: 'all',
        radius: 50,
        hasLiveGames: false,
        hasTournaments: false
    });

    const handleChange = (key, value) => {
        const newFilters = { ...localFilters, [key]: value };
        setLocalFilters(newFilters);
        if (onFilterChange) {
            onFilterChange(newFilters);
        }
    };

    const activeFilterCount = [
        localFilters.gameType !== 'all',
        localFilters.stakes !== 'all',
        localFilters.venueType !== 'all',
        localFilters.hasLiveGames,
        localFilters.hasTournaments
    ].filter(Boolean).length;

    const clearFilters = () => {
        const clearedFilters = {
            gameType: 'all',
            stakes: 'all',
            venueType: 'all',
            radius: 50,
            hasLiveGames: false,
            hasTournaments: false
        };
        setLocalFilters(clearedFilters);
        if (onFilterChange) {
            onFilterChange(clearedFilters);
        }
    };

    // Collapsed view - just show toggle button
    if (!isExpanded) {
        return (
            <button
                onClick={onToggleExpand}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    borderRadius: '10px',
                    background: activeFilterCount > 0 ? 'rgba(0, 212, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                    border: activeFilterCount > 0 ? '1px solid rgba(0, 212, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
                    color: activeFilterCount > 0 ? '#00D4FF' : 'rgba(255, 255, 255, 0.7)',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    width: '100%',
                    justifyContent: 'center'
                }}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                Filters
                {activeFilterCount > 0 && (
                    <span style={{
                        background: '#00D4FF',
                        color: '#000',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '12px',
                        fontWeight: 700
                    }}>
                        {activeFilterCount}
                    </span>
                )}
            </button>
        );
    }

    return (
        <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '16px'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2">
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                    <span style={{ fontSize: '15px', fontWeight: 600, color: '#fff' }}>Filters</span>
                    {activeFilterCount > 0 && (
                        <span style={{
                            background: 'rgba(0, 212, 255, 0.2)',
                            color: '#00D4FF',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '12px',
                            fontWeight: 600
                        }}>
                            {activeFilterCount} active
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {activeFilterCount > 0 && (
                        <button
                            onClick={clearFilters}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                color: '#ef4444',
                                fontSize: '12px',
                                cursor: 'pointer'
                            }}
                        >
                            Clear
                        </button>
                    )}
                    <button
                        onClick={onToggleExpand}
                        style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            color: 'rgba(255, 255, 255, 0.6)',
                            fontSize: '12px',
                            cursor: 'pointer'
                        }}
                    >
                        Hide
                    </button>
                </div>
            </div>

            {/* Filter Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '12px'
            }}>
                {/* Game Type */}
                <div>
                    <label style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'rgba(255, 255, 255, 0.5)',
                        marginBottom: '6px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>
                        Game Type
                    </label>
                    <select
                        value={localFilters.gameType}
                        onChange={e => handleChange('gameType', e.target.value)}
                        style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: localFilters.gameType !== 'all'
                                ? '1px solid rgba(0, 212, 255, 0.4)'
                                : '1px solid rgba(255, 255, 255, 0.15)',
                            color: '#fff',
                            fontSize: '14px',
                            cursor: 'pointer'
                        }}
                    >
                        {GAME_TYPES.map(type => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                    </select>
                </div>

                {/* Stakes */}
                <div>
                    <label style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'rgba(255, 255, 255, 0.5)',
                        marginBottom: '6px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>
                        Stakes
                    </label>
                    <select
                        value={localFilters.stakes}
                        onChange={e => handleChange('stakes', e.target.value)}
                        style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: localFilters.stakes !== 'all'
                                ? '1px solid rgba(0, 212, 255, 0.4)'
                                : '1px solid rgba(255, 255, 255, 0.15)',
                            color: '#fff',
                            fontSize: '14px',
                            cursor: 'pointer'
                        }}
                    >
                        {STAKES_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>

                {/* Venue Type */}
                {showVenueType && (
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'rgba(255, 255, 255, 0.5)',
                            marginBottom: '6px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                        }}>
                            Venue Type
                        </label>
                        <select
                            value={localFilters.venueType}
                            onChange={e => handleChange('venueType', e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: localFilters.venueType !== 'all'
                                    ? '1px solid rgba(0, 212, 255, 0.4)'
                                    : '1px solid rgba(255, 255, 255, 0.15)',
                                color: '#fff',
                                fontSize: '14px',
                                cursor: 'pointer'
                            }}
                        >
                            {VENUE_TYPES.map(type => (
                                <option key={type.value} value={type.value}>{type.label}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Radius */}
                {showRadius && (
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'rgba(255, 255, 255, 0.5)',
                            marginBottom: '6px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                        }}>
                            Search Radius
                        </label>
                        <select
                            value={localFilters.radius}
                            onChange={e => handleChange('radius', parseInt(e.target.value))}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                color: '#fff',
                                fontSize: '14px',
                                cursor: 'pointer'
                            }}
                        >
                            {RADIUS_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Toggle Filters */}
            <div style={{
                display: 'flex',
                gap: '16px',
                marginTop: '16px',
                paddingTop: '16px',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
                <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    color: 'rgba(255, 255, 255, 0.7)',
                    fontSize: '13px'
                }}>
                    <input
                        type="checkbox"
                        checked={localFilters.hasLiveGames}
                        onChange={e => handleChange('hasLiveGames', e.target.checked)}
                        style={{
                            width: '18px',
                            height: '18px',
                            accentColor: '#00D4FF'
                        }}
                    />
                    <span>Live Games Only</span>
                    {localFilters.hasLiveGames && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="#22c55e">
                            <circle cx="12" cy="12" r="6" />
                        </svg>
                    )}
                </label>

                <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    color: 'rgba(255, 255, 255, 0.7)',
                    fontSize: '13px'
                }}>
                    <input
                        type="checkbox"
                        checked={localFilters.hasTournaments}
                        onChange={e => handleChange('hasTournaments', e.target.checked)}
                        style={{
                            width: '18px',
                            height: '18px',
                            accentColor: '#00D4FF'
                        }}
                    />
                    <span>Has Tournaments</span>
                </label>
            </div>
        </div>
    );
}
