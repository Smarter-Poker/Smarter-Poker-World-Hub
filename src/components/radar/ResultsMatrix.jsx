/**
 * Results Matrix - Virtualized list view for search results
 * Supports 1000+ items with smooth scrolling
 */

import React, { useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';
import useRadarStore from '@/stores/radarStore';

export default function ResultsMatrix() {
    const {
        gameType,
        results,
        ui,
        toggleResultsDrawer,
        selectVenue,
        hoverVenue,
    } = useRadarStore();

    // Combine venues and tournaments into single list
    const items = useMemo(() => {
        if (gameType === 'CASH') {
            return results.venues.map(v => ({ type: 'venue', data: v }));
        } else {
            return results.tournaments.map(t => ({ type: 'tournament', data: t }));
        }
    }, [gameType, results.venues, results.tournaments]);

    // Row renderer for virtualized list
    const Row = ({ index, style }) => {
        const item = items[index];
        const isHovered = ui.hoveredVenue?.id === item.data.id;
        const isSelected = ui.selectedVenue?.id === item.data.id;

        if (item.type === 'venue') {
            return (
                <div
                    style={style}
                    className={`result-item venue ${isHovered ? 'hovered' : ''} ${isSelected ? 'selected' : ''}`}
                    onClick={() => selectVenue(item.data)}
                    onMouseEnter={() => hoverVenue(item.data)}
                    onMouseLeave={() => hoverVenue(null)}
                >
                    <div className="result-header">
                        <h3 className="venue-name">{item.data.name}</h3>
                        {item.data.distance_mi && (
                            <span className="distance">{item.data.distance_mi.toFixed(1)} mi</span>
                        )}
                    </div>
                    <div className="result-meta">
                        <span className="location">{item.data.city}, {item.data.state}</span>
                        {item.data.poker_tables && (
                            <span className="tables">{item.data.poker_tables} tables</span>
                        )}
                    </div>
                    {item.data.games_offered && (
                        <div className="games-tags">
                            {item.data.games_offered.slice(0, 3).map(game => (
                                <span key={game} className="game-tag">{game}</span>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        // Tournament row
        return (
            <div
                style={style}
                className={`result-item tournament ${isHovered ? 'hovered' : ''} ${isSelected ? 'selected' : ''}`}
                onClick={() => selectVenue(item.data)}
                onMouseEnter={() => hoverVenue(item.data)}
                onMouseLeave={() => hoverVenue(null)}
            >
                <div className="result-header">
                    <h3 className="tournament-name">{item.data.name}</h3>
                    {item.data.main_event_guaranteed && (
                        <span className="guarantee">${(item.data.main_event_guaranteed / 1000).toFixed(0)}K GTD</span>
                    )}
                </div>
                <div className="result-meta">
                    <span className="location">{item.data.location}</span>
                    <span className="dates">
                        {new Date(item.data.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {item.data.end_date && ` - ${new Date(item.data.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    </span>
                </div>
                {item.data.total_events && (
                    <div className="tournament-stats">
                        <span className="stat">{item.data.total_events} events</span>
                        {item.data.main_event_buyin && (
                            <span className="stat">${item.data.main_event_buyin} Main</span>
                        )}
                    </div>
                )}
            </div>
        );
    };

    if (!ui.resultsDrawerOpen) return null;

    return (
        <>
            {/* Desktop: Left Sidebar */}
            <div className="results-matrix desktop">
                <div className="matrix-header">
                    <h2 className="matrix-title">
                        {gameType === 'CASH' ? 'Cash Games' : 'Tournaments'}
                    </h2>
                    <span className="matrix-count">{items.length} results</span>
                    <button className="close-btn" onClick={toggleResultsDrawer}>×</button>
                </div>

                <div className="matrix-body">
                    {items.length > 0 ? (
                        <List
                            height={window.innerHeight - 120}
                            itemCount={items.length}
                            itemSize={120}
                            width="100%"
                        >
                            {Row}
                        </List>
                    ) : (
                        <div className="empty-state">
                            <div className="empty-icon">🎯</div>
                            <p>No results found</p>
                            <span>Try adjusting your search parameters</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Mobile: Slide-up Drawer */}
            <div className="results-matrix mobile">
                <div className="drawer-handle" onClick={toggleResultsDrawer}>
                    <div className="handle-bar"></div>
                </div>

                <div className="matrix-header">
                    <h2 className="matrix-title">
                        {gameType === 'CASH' ? 'Cash Games' : 'Tournaments'}
                    </h2>
                    <span className="matrix-count">{items.length}</span>
                </div>

                <div className="matrix-body">
                    {items.length > 0 ? (
                        <List
                            height={window.innerHeight * 0.6}
                            itemCount={items.length}
                            itemSize={120}
                            width="100%"
                        >
                            {Row}
                        </List>
                    ) : (
                        <div className="empty-state">
                            <div className="empty-icon">🎯</div>
                            <p>No results found</p>
                        </div>
                    )}
                </div>
            </div>

            <style jsx global>{`
        /* Desktop Sidebar */
        .results-matrix.desktop {
          position: fixed;
          left: 0;
          top: 0;
          width: 400px;
          height: 100vh;
          background: rgba(10, 15, 30, 0.95);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-right: 1px solid rgba(0, 212, 255, 0.2);
          z-index: 900;
          display: flex;
          flex-direction: column;
        }

        .results-matrix.mobile {
          display: none;
        }

        .matrix-header {
          padding: 20px 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .matrix-title {
          font-size: 18px;
          font-weight: 700;
          color: white;
          margin: 0;
        }

        .matrix-count {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.6);
        }

        .close-btn {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          font-size: 28px;
          cursor: pointer;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .close-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }

        .matrix-body {
          flex: 1;
          overflow: hidden;
        }

        /* Result Items */
        .result-item {
          padding: 16px 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          cursor: pointer;
          transition: all 0.2s;
        }

        .result-item:hover {
          background: rgba(0, 212, 255, 0.05);
          border-left: 3px solid #00d4ff;
          padding-left: 21px;
        }

        .result-item.hovered {
          background: rgba(0, 212, 255, 0.1);
          border-left: 3px solid #00d4ff;
          padding-left: 21px;
        }

        .result-item.selected {
          background: rgba(0, 212, 255, 0.15);
          border-left: 3px solid #00d4ff;
          padding-left: 21px;
        }

        .result-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 8px;
        }

        .venue-name,
        .tournament-name {
          font-size: 16px;
          font-weight: 600;
          color: white;
          margin: 0;
          flex: 1;
        }

        .distance {
          font-size: 14px;
          color: #00d4ff;
          font-weight: 600;
          white-space: nowrap;
          margin-left: 12px;
        }

        .guarantee {
          font-size: 13px;
          color: #fbbf24;
          font-weight: 600;
          white-space: nowrap;
          margin-left: 12px;
        }

        .result-meta {
          display: flex;
          gap: 12px;
          margin-bottom: 8px;
        }

        .result-meta span {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.6);
        }

        .games-tags,
        .tournament-stats {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .game-tag,
        .stat {
          background: rgba(0, 212, 255, 0.1);
          color: #00d4ff;
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
        }

        .stat {
          background: rgba(168, 85, 247, 0.1);
          color: #a855f7;
        }

        /* Empty State */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: rgba(255, 255, 255, 0.4);
          padding: 40px;
          text-align: center;
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
          opacity: 0.5;
        }

        .empty-state p {
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 8px 0;
        }

        .empty-state span {
          font-size: 13px;
        }

        /* Mobile Drawer */
        @media (max-width: 768px) {
          .results-matrix.desktop {
            display: none;
          }

          .results-matrix.mobile {
            display: flex;
            flex-direction: column;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            max-height: 70vh;
            background: rgba(10, 15, 30, 0.98);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-top: 1px solid rgba(0, 212, 255, 0.2);
            border-radius: 20px 20px 0 0;
            z-index: 900;
            transform: translateY(0);
            transition: transform 0.3s ease;
          }

          .drawer-handle {
            padding: 12px 0;
            display: flex;
            justify-content: center;
            cursor: pointer;
          }

          .handle-bar {
            width: 40px;
            height: 4px;
            background: rgba(255, 255, 255, 0.3);
            border-radius: 2px;
          }

          .matrix-header {
            padding: 12px 20px;
          }

          .close-btn {
            display: none;
          }
        }
      `}</style>
        </>
    );
}
