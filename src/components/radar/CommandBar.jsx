/**
 * Command Bar - The Radar HUD
 * Floating glassmorphic search interface for Poker Near Me
 */

import React, { useState, useEffect, useRef } from 'react';
import useRadarStore from '@/stores/radarStore';

export default function CommandBar() {
    const {
        mode,
        gameType,
        location,
        filters,
        results,
        setMode,
        setGameType,
        setLocation,
        setRadius,
        setFilters,
        requestGPS,
        executeSearch,
    } = useRadarStore();

    const [searchInput, setSearchInput] = useState('');
    const [inputType, setInputType] = useState(null); // 'zip' | 'city' | 'venue'
    const searchDebounce = useRef(null);

    // Detect input type (ZIP vs City vs Venue name)
    useEffect(() => {
        if (!searchInput) {
            setInputType(null);
            return;
        }

        // ZIP code pattern (5 digits or 5+4)
        if (/^\d{5}(-\d{4})?$/.test(searchInput)) {
            setInputType('zip');
        }
        // City, State pattern
        else if (/^[a-zA-Z\s]+,\s*[A-Z]{2}$/.test(searchInput)) {
            setInputType('city');
        }
        // Venue name (default)
        else {
            setInputType('venue');
        }
    }, [searchInput]);

    // Handle search input with debounce
    const handleSearchInput = (value) => {
        setSearchInput(value);

        if (searchDebounce.current) clearTimeout(searchDebounce.current);

        searchDebounce.current = setTimeout(async () => {
            if (!value) return;

            // Geocode the input
            try {
                const geocoded = await geocodeLocation(value);
                if (geocoded) {
                    setLocation(geocoded);
                }
            } catch (error) {
                console.error('Geocoding failed:', error);
            }
        }, 500);
    };

    // Geocode location using Google Maps API (or fallback)
    const geocodeLocation = async (query) => {
        // TODO: Implement actual geocoding
        // For now, return mock data
        return {
            lat: 30.2672,
            lng: -97.7431,
            label: query,
        };
    };

    // Handle GPS button
    const handleGPSClick = () => {
        requestGPS();
    };

    // Handle scope toggle (radius)
    const handleScopeChange = (newRadius) => {
        setRadius(newRadius);
    };

    return (
        <div className="command-bar">
            {/* Main HUD Container */}
            <div className="hud-container">
                {/* Game Type Toggle */}
                <div className="game-type-toggle">
                    <button
                        className={`toggle-btn ${gameType === 'CASH' ? 'active' : ''}`}
                        onClick={() => setGameType('CASH')}
                    >
                        <span className="icon">💵</span>
                        CASH
                    </button>
                    <button
                        className={`toggle-btn ${gameType === 'TOURNAMENT' ? 'active' : ''}`}
                        onClick={() => setGameType('TOURNAMENT')}
                    >
                        <span className="icon">🏆</span>
                        TOURNAMENT
                    </button>
                </div>

                {/* Omni-Search Input */}
                <div className="omni-search">
                    <div className="search-input-wrapper">
                        <input
                            type="text"
                            className="search-input"
                            placeholder="ZIP, City, or Casino Name..."
                            value={searchInput}
                            onChange={(e) => handleSearchInput(e.target.value)}
                        />
                        {inputType && (
                            <span className="input-type-badge">{inputType.toUpperCase()}</span>
                        )}
                    </div>

                    {/* GPS Button */}
                    <button className="gps-btn" onClick={handleGPSClick} title="Use My Location">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="2" />
                            <path d="M10 2V6M10 14V18M2 10H6M14 10H18" stroke="currentColor" strokeWidth="2" />
                        </svg>
                    </button>
                </div>

                {/* Date Commander (only for tournaments) */}
                {gameType === 'TOURNAMENT' && (
                    <div className="date-commander">
                        <button className="date-pill">
                            <span className="icon">📅</span>
                            <span>{filters.date.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                            {filters.date.end && (
                                <span> - {filters.date.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                            )}
                        </button>
                    </div>
                )}

                {/* Scope Toggle (Radius) */}
                <div className="scope-toggle">
                    <button
                        className={`scope-btn ${filters.radius === 5 ? 'active' : ''}`}
                        onClick={() => handleScopeChange(5)}
                        disabled={mode === 'STRATEGIC'}
                    >
                        5mi
                    </button>
                    <button
                        className={`scope-btn ${filters.radius === 25 ? 'active' : ''}`}
                        onClick={() => handleScopeChange(25)}
                        disabled={mode === 'STRATEGIC'}
                    >
                        25mi
                    </button>
                    <button
                        className={`scope-btn ${filters.radius === 100 ? 'active' : ''}`}
                        onClick={() => handleScopeChange(100)}
                        disabled={mode === 'STRATEGIC'}
                    >
                        100mi
                    </button>
                    <button
                        className={`scope-btn nationwide ${filters.radius === null ? 'active' : ''}`}
                        onClick={() => handleScopeChange(null)}
                    >
                        🇺🇸 USA
                    </button>
                </div>

                {/* Status Indicator */}
                <div className="status-indicator">
                    {results.loading && (
                        <div className="scanning-pulse">
                            <span className="pulse-dot"></span>
                            <span>Scanning...</span>
                        </div>
                    )}
                    {!results.loading && results.error && (
                        <div className="error-message">
                            <span className="icon">⚠️</span>
                            <span>{results.error}</span>
                        </div>
                    )}
                    {!results.loading && !results.error && (results.venues.length > 0 || results.tournaments.length > 0) && (
                        <div className="results-count">
                            <span className="count">{results.venues.length + results.tournaments.length}</span>
                            <span className="label">targets acquired</span>
                        </div>
                    )}
                    {!results.loading && !results.error && results.venues.length === 0 && results.tournaments.length === 0 && results.lastQuery && (
                        <div className="no-results">
                            <span className="icon">🎯</span>
                            <span>No Hostiles Found</span>
                        </div>
                    )}
                </div>
            </div>

            <style jsx>{`
        .command-bar {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 1000;
          width: 90%;
          max-width: 1200px;
        }

        .hud-container {
          background: rgba(10, 15, 30, 0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(0, 212, 255, 0.3);
          border-radius: 16px;
          padding: 16px 24px;
          box-shadow: 
            0 8px 32px rgba(0, 0, 0, 0.4),
            0 0 40px rgba(0, 212, 255, 0.1);
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        /* Game Type Toggle */
        .game-type-toggle {
          display: flex;
          gap: 8px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 8px;
          padding: 4px;
        }

        .toggle-btn {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.5px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .toggle-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.9);
        }

        .toggle-btn.active {
          background: linear-gradient(135deg, #00d4ff 0%, #0099cc 100%);
          color: white;
          box-shadow: 0 0 20px rgba(0, 212, 255, 0.4);
        }

        .toggle-btn .icon {
          font-size: 14px;
        }

        /* Omni-Search */
        .omni-search {
          flex: 1;
          min-width: 300px;
          display: flex;
          gap: 8px;
        }

        .search-input-wrapper {
          flex: 1;
          position: relative;
        }

        .search-input {
          width: 100%;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 10px 16px;
          color: white;
          font-size: 14px;
          outline: none;
          transition: all 0.2s;
        }

        .search-input:focus {
          border-color: #00d4ff;
          box-shadow: 0 0 20px rgba(0, 212, 255, 0.2);
        }

        .search-input::placeholder {
          color: rgba(255, 255, 255, 0.4);
        }

        .input-type-badge {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: rgba(0, 212, 255, 0.2);
          color: #00d4ff;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.5px;
        }

        .gps-btn {
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          transition: all 0.2s;
        }

        .gps-btn:hover {
          background: rgba(0, 212, 255, 0.1);
          border-color: #00d4ff;
          color: #00d4ff;
        }

        /* Date Commander */
        .date-commander {
          display: flex;
          gap: 8px;
        }

        .date-pill {
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 8px 16px;
          color: white;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .date-pill:hover {
          border-color: #00d4ff;
          background: rgba(0, 212, 255, 0.1);
        }

        /* Scope Toggle */
        .scope-toggle {
          display: flex;
          gap: 6px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 8px;
          padding: 4px;
        }

        .scope-btn {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.5px;
          cursor: pointer;
          transition: all 0.2s;
          min-width: 50px;
        }

        .scope-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.9);
        }

        .scope-btn.active {
          background: linear-gradient(135deg, #00d4ff 0%, #0099cc 100%);
          color: white;
          box-shadow: 0 0 15px rgba(0, 212, 255, 0.3);
        }

        .scope-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .scope-btn.nationwide {
          min-width: 70px;
        }

        /* Status Indicator */
        .status-indicator {
          min-width: 150px;
          text-align: right;
        }

        .scanning-pulse {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          color: #00d4ff;
          font-size: 12px;
          font-weight: 600;
        }

        .pulse-dot {
          width: 8px;
          height: 8px;
          background: #00d4ff;
          border-radius: 50%;
          animation: pulse 1.5s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(1.2);
          }
        }

        .error-message {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #ef4444;
          font-size: 12px;
        }

        .results-count {
          display: flex;
          align-items: baseline;
          gap: 6px;
          color: #10b981;
        }

        .results-count .count {
          font-size: 18px;
          font-weight: 700;
        }

        .results-count .label {
          font-size: 11px;
          opacity: 0.8;
        }

        .no-results {
          display: flex;
          align-items: center;
          gap: 6px;
          color: rgba(255, 255, 255, 0.5);
          font-size: 12px;
        }

        /* Mobile Responsive */
        @media (max-width: 768px) {
          .command-bar {
            width: 95%;
            top: 10px;
          }

          .hud-container {
            padding: 12px 16px;
            gap: 12px;
          }

          .omni-search {
            min-width: 100%;
            order: 3;
          }

          .status-indicator {
            min-width: auto;
            flex: 1;
            text-align: left;
          }
        }
      `}</style>
        </div>
    );
}
