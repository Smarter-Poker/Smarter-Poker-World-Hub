/**
 * 🏆 LEADERBOARD ORB COMPONENT
 * src/app/social/components/LeaderboardOrb.jsx
 * 
 * 3D-cylinder layout showing top influencers by XP earned.
 * Spatial competition visualization.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSupabase } from '../../providers/SupabaseProvider';

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 TIER CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const TIER_CONFIG = {
    BRONZE: { color: '#CD7F32', glow: 'rgba(205, 127, 50, 0.4)', icon: '🥉' },
    SILVER: { color: '#C0C0C0', glow: 'rgba(192, 192, 192, 0.4)', icon: '🥈' },
    GOLD: { color: '#FFD700', glow: 'rgba(255, 215, 0, 0.4)', icon: '🥇' },
    GTO_MASTER: { color: '#9400D3', glow: 'rgba(148, 0, 211, 0.4)', icon: '👑' }
};

const TIMEFRAME_OPTIONS = [
    { key: '24h', label: '24 Hours', icon: '⏰' },
    { key: '7d', label: '7 Days', icon: '📅' },
    { key: '30d', label: '30 Days', icon: '🗓️' },
    { key: 'all', label: 'All Time', icon: '🌟' }
];

// ═══════════════════════════════════════════════════════════════════════════
// 🎖️ LEADERBOARD ENTRY COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const LeaderboardEntry = ({ entry, index, isCurrentUser, onClick }) => {
    const tier = TIER_CONFIG[entry.tier] || TIER_CONFIG.BRONZE;
    const isTopThree = index < 3;
    const rankIcons = ['🥇', '🥈', '🥉'];

    return (
        <div
            className={`leaderboard-entry ${isTopThree ? 'top-three' : ''} ${isCurrentUser ? 'current-user' : ''}`}
            style={{
                '--tier-color': tier.color,
                '--tier-glow': tier.glow,
                '--entry-delay': `${index * 0.05}s`
            }}
            onClick={() => onClick?.(entry.user_id)}
        >
            {/* Rank */}
            <div className="entry-rank">
                {isTopThree ? (
                    <span className="rank-icon">{rankIcons[index]}</span>
                ) : (
                    <span className="rank-number">{entry.rank}</span>
                )}
            </div>

            {/* User Info */}
            <div className="entry-user">
                <div className="user-avatar">
                    {entry.avatar_url ? (
                        <img src={entry.avatar_url} alt={entry.username} />
                    ) : (
                        <div className="avatar-placeholder">
                            {entry.username?.[0]?.toUpperCase() || '?'}
                        </div>
                    )}
                    <div className="tier-badge">{tier.icon}</div>
                </div>
                <div className="user-info">
                    <span className="user-name">
                        {entry.username}
                        {entry.is_verified && <span className="verified">✓</span>}
                    </span>
                    <span className="user-level">Level {entry.level}</span>
                </div>
            </div>

            {/* Stats */}
            <div className="entry-stats">
                <div className="stat xp">
                    <span className="stat-value">{entry.xp_earned.toLocaleString()}</span>
                    <span className="stat-label">XP</span>
                </div>
                {entry.diamonds_earned > 0 && (
                    <div className="stat diamonds">
                        <span className="stat-icon">💎</span>
                        <span className="stat-value">{entry.diamonds_earned}</span>
                    </div>
                )}
            </div>

            <style>{`
        .leaderboard-entry {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          animation: entry-slide-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
          animation-delay: var(--entry-delay);
        }

        @keyframes entry-slide-in {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .leaderboard-entry:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: var(--tier-color);
          transform: translateX(4px);
        }

        .leaderboard-entry.top-three {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.05), transparent);
          border-color: var(--tier-color);
          box-shadow: 0 0 20px var(--tier-glow);
        }

        .leaderboard-entry.current-user {
          background: rgba(0, 255, 255, 0.1);
          border-color: #00FFFF;
        }

        .entry-rank {
          width: 40px;
          text-align: center;
        }

        .rank-icon {
          font-size: 1.5rem;
        }

        .rank-number {
          font-family: 'Exo 2', sans-serif;
          font-size: 1.1rem;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.5);
        }

        .entry-user {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .user-avatar {
          position: relative;
          width: 40px;
          height: 40px;
        }

        .user-avatar img,
        .avatar-placeholder {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid var(--tier-color);
        }

        .avatar-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, var(--tier-color), rgba(0,0,0,0.3));
          color: white;
          font-weight: 700;
        }

        .tier-badge {
          position: absolute;
          bottom: -4px;
          right: -4px;
          font-size: 0.9rem;
          filter: drop-shadow(0 0 4px var(--tier-glow));
        }

        .user-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .user-name {
          font-weight: 600;
          color: white;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .verified {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 14px;
          height: 14px;
          background: #00BFFF;
          border-radius: 50%;
          font-size: 0.6rem;
          color: white;
        }

        .user-level {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.4);
        }

        .entry-stats {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .stat {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }

        .stat.xp .stat-value {
          font-family: 'Exo 2', sans-serif;
          font-size: 1.1rem;
          font-weight: 700;
          color: #00FFFF;
        }

        .stat-label {
          font-size: 0.7rem;
          color: rgba(255, 255, 255, 0.4);
        }

        .stat.diamonds {
          flex-direction: row;
          align-items: center;
          gap: 4px;
        }

        .stat.diamonds .stat-value {
          font-weight: 600;
          color: #9400D3;
        }
      `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 🏆 LEADERBOARD ORB COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const LeaderboardOrb = ({
    limit = 10,
    currentUserId,
    onUserClick,
    showTimeframeSelector = true
}) => {
    const { supabase } = useSupabase();
    const [entries, setEntries] = useState([]);
    const [timeframe, setTimeframe] = useState('24h');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Fetch leaderboard data
    const fetchLeaderboard = useCallback(async () => {
        if (!supabase) return;

        setIsLoading(true);
        setError(null);

        try {
            const { data, error: fetchError } = await supabase.rpc('fn_get_social_leaderboard', {
                p_limit: limit,
                p_timeframe: timeframe
            });

            if (fetchError) throw fetchError;
            setEntries(data || []);
        } catch (err) {
            console.error('Leaderboard fetch error:', err);
            setError('Failed to load leaderboard');
        } finally {
            setIsLoading(false);
        }
    }, [supabase, limit, timeframe]);

    useEffect(() => {
        fetchLeaderboard();
    }, [fetchLeaderboard]);

    // Calculate current user's position
    const currentUserEntry = useMemo(() => {
        if (!currentUserId) return null;
        return entries.find(e => e.user_id === currentUserId);
    }, [entries, currentUserId]);

    return (
        <div className="leaderboard-orb glass-card">
            {/* Header */}
            <header className="orb-header">
                <div className="header-title">
                    <span className="title-icon">🏆</span>
                    <h3>Top Influencers</h3>
                </div>

                {/* Timeframe Selector */}
                {showTimeframeSelector && (
                    <div className="timeframe-selector">
                        {TIMEFRAME_OPTIONS.map(opt => (
                            <button
                                key={opt.key}
                                className={`timeframe-btn ${timeframe === opt.key ? 'active' : ''}`}
                                onClick={() => setTimeframe(opt.key)}
                                title={opt.label}
                            >
                                {opt.icon}
                            </button>
                        ))}
                    </div>
                )}
            </header>

            {/* Content */}
            <div className="orb-content">
                {isLoading ? (
                    <div className="loading-state">
                        <div className="loading-spinner" />
                        <span>Loading rankings...</span>
                    </div>
                ) : error ? (
                    <div className="error-state">
                        <span>⚠️ {error}</span>
                        <button onClick={fetchLeaderboard}>Retry</button>
                    </div>
                ) : entries.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">📊</span>
                        <span>No data yet</span>
                        <span className="empty-hint">Be the first to earn XP!</span>
                    </div>
                ) : (
                    <div className="entries-list">
                        {entries.map((entry, index) => (
                            <LeaderboardEntry
                                key={entry.user_id}
                                entry={entry}
                                index={index}
                                isCurrentUser={entry.user_id === currentUserId}
                                onClick={onUserClick}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Current User Footer */}
            {currentUserEntry && (
                <footer className="current-user-footer">
                    <span>Your Rank: #{currentUserEntry.rank}</span>
                    <span>{currentUserEntry.xp_earned.toLocaleString()} XP earned</span>
                </footer>
            )}

            <style>{`
        .leaderboard-orb {
          overflow: hidden;
        }

        .orb-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .header-title {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .header-title h3 {
          font-family: 'Exo 2', sans-serif;
          font-size: 1.1rem;
          color: white;
          margin: 0;
        }

        .title-icon {
          font-size: 1.3rem;
        }

        .timeframe-selector {
          display: flex;
          gap: 4px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 8px;
          padding: 4px;
        }

        .timeframe-btn {
          padding: 6px 10px;
          background: transparent;
          border: none;
          border-radius: 6px;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .timeframe-btn:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .timeframe-btn.active {
          background: rgba(0, 255, 255, 0.2);
        }

        .orb-content {
          padding: 16px;
          max-height: 400px;
          overflow-y: auto;
        }

        .entries-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .loading-state,
        .error-state,
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 40px 20px;
          color: rgba(255, 255, 255, 0.5);
          text-align: center;
        }

        .loading-spinner {
          width: 30px;
          height: 30px;
          border: 3px solid rgba(0, 255, 255, 0.2);
          border-top-color: #00FFFF;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .empty-icon {
          font-size: 3rem;
          opacity: 0.5;
        }

        .empty-hint {
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.3);
        }

        .error-state button {
          padding: 8px 16px;
          background: rgba(255, 68, 68, 0.2);
          border: 1px solid rgba(255, 68, 68, 0.3);
          border-radius: 8px;
          color: #FF6B6B;
          cursor: pointer;
        }

        .current-user-footer {
          display: flex;
          justify-content: space-between;
          padding: 12px 20px;
          background: rgba(0, 255, 255, 0.05);
          border-top: 1px solid rgba(0, 255, 255, 0.2);
          font-size: 0.85rem;
          color: #00FFFF;
        }
      `}</style>
        </div>
    );
};

export default LeaderboardOrb;
