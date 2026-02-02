/**
 * LEADERBOARD DISPLAY - Trivia rankings
 */

import { useState } from 'react';
import { Trophy, Clock, Gem, User, Crown } from 'lucide-react';

export default function LeaderboardDisplay({ entries = [], currentUserId, filter = 'today' }) {
    const [activeFilter, setActiveFilter] = useState(filter);

    const getRankStyle = (rank) => {
        if (rank === 1) return { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.1)' };
        if (rank === 2) return { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.1)' };
        if (rank === 3) return { color: '#cd7f32', bg: 'rgba(205, 127, 50, 0.1)' };
        return { color: 'rgba(255, 255, 255, 0.5)', bg: 'transparent' };
    };

    return (
        <div className="leaderboard">
            <div className="leaderboard-header">
                <h3>
                    <Trophy size={20} />
                    Leaderboard
                </h3>
                <div className="filter-tabs">
                    <button
                        className={`filter-tab ${activeFilter === 'today' ? 'active' : ''}`}
                        onClick={() => setActiveFilter('today')}
                    >
                        Today
                    </button>
                    <button
                        className={`filter-tab ${activeFilter === 'week' ? 'active' : ''}`}
                        onClick={() => setActiveFilter('week')}
                    >
                        This Week
                    </button>
                </div>
            </div>

            <div className="leaderboard-list">
                {entries.length === 0 ? (
                    <div className="empty-state">
                        <p>No entries yet. Be the first!</p>
                    </div>
                ) : (
                    entries.map((entry, index) => {
                        const rank = index + 1;
                        const style = getRankStyle(rank);
                        const isCurrentUser = entry.user_id === currentUserId;

                        return (
                            <div
                                key={entry.id || index}
                                className={`leaderboard-entry ${isCurrentUser ? 'current-user' : ''}`}
                                style={{ background: isCurrentUser ? 'rgba(14, 165, 233, 0.1)' : style.bg }}
                            >
                                <div className="rank" style={{ color: style.color }}>
                                    {rank <= 3 ? <Crown size={16} /> : rank}
                                </div>
                                <div className="user-info">
                                    <div className="avatar">
                                        <User size={16} />
                                    </div>
                                    <span className="username">
                                        {entry.username || 'Anonymous'}
                                        {isCurrentUser && <span className="you-badge">YOU</span>}
                                    </span>
                                </div>
                                <div className="score">{entry.score} pts</div>
                                {entry.time && (
                                    <div className="time">
                                        <Clock size={14} />
                                        {entry.time}s
                                    </div>
                                )}
                                {entry.diamonds > 0 && (
                                    <div className="diamonds">
                                        <Gem size={14} />
                                        {entry.diamonds}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            <style jsx>{`
                .leaderboard {
                    background: rgba(0, 0, 0, 0.2);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    overflow: hidden;
                }

                .leaderboard-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px 20px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                }

                .leaderboard-header h3 {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin: 0;
                    font-size: 16px;
                    font-weight: 600;
                    color: #fbbf24;
                }

                .filter-tabs {
                    display: flex;
                    gap: 4px;
                }

                .filter-tab {
                    padding: 6px 12px;
                    background: transparent;
                    border: none;
                    border-radius: 6px;
                    color: rgba(255, 255, 255, 0.5);
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .filter-tab:hover {
                    color: rgba(255, 255, 255, 0.8);
                }

                .filter-tab.active {
                    background: rgba(255, 255, 255, 0.1);
                    color: #ffffff;
                }

                .leaderboard-list {
                    padding: 8px;
                }

                .empty-state {
                    padding: 40px 20px;
                    text-align: center;
                    color: rgba(255, 255, 255, 0.4);
                }

                .leaderboard-entry {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 16px;
                    border-radius: 8px;
                    margin-bottom: 4px;
                    transition: background 0.2s;
                }

                .leaderboard-entry:last-child {
                    margin-bottom: 0;
                }

                .leaderboard-entry.current-user {
                    border: 1px solid rgba(14, 165, 233, 0.3);
                }

                .rank {
                    width: 28px;
                    font-weight: 700;
                    font-size: 14px;
                    text-align: center;
                }

                .user-info {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    flex: 1;
                }

                .avatar {
                    width: 32px;
                    height: 32px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: rgba(255, 255, 255, 0.5);
                }

                .username {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.9);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .you-badge {
                    font-size: 10px;
                    font-weight: 700;
                    color: #0ea5e9;
                    background: rgba(14, 165, 233, 0.2);
                    padding: 2px 6px;
                    border-radius: 4px;
                }

                .score {
                    font-weight: 600;
                    color: #ffffff;
                    font-size: 14px;
                }

                .time {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
                }

                .diamonds {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 12px;
                    color: #06b6d4;
                }
            `}</style>
        </div>
    );
}
