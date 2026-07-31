/**
 * LEADERBOARD DISPLAY - Trivia rankings
 *
 * Props
 *   entries          array of leaderboard rows (trivia_scores shaped)
 *   currentUserId    highlights + anchors the sticky "your rank" row
 *   filter           'today' | 'week' — the ACTIVE range (controlled by parent)
 *   onFilterChange   (filter) => void. REQUIRED for the range tabs to render.
 *                    Without it the tabs are hidden rather than shown as a
 *                    control that silently does nothing.
 *   previousEntries  optional prior snapshot of `entries`; drives up/down rank
 *                    movement arrows.
 *   currentUserEntry optional row for the signed-in user when they are outside
 *                    the visible slice — rendered as a pinned footer row.
 *   currentUserRank  their real rank (1-based) for that pinned row.
 *   loading          renders a skeleton instead of the empty state.
 *
 * Field mapping note: trivia_scores exposes `time_spent` and `diamonds_earned`.
 * The component previously read `entry.time` / `entry.diamonds`, which are not
 * columns, so those chips never rendered. Both spellings are accepted now.
 */

import { useState, useEffect, useMemo } from 'react';
import { Trophy, Clock, Gem, User, Crown, ChevronUp, ChevronDown, Minus } from 'lucide-react';

function readScore(entry) {
    return Number(entry?.score ?? 0) || 0;
}

function readTime(entry) {
    const v = entry?.time_spent ?? entry?.time;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function readDiamonds(entry) {
    const v = entry?.diamonds_earned ?? entry?.diamonds;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function entryKey(entry, index) {
    return entry?.id ?? entry?.user_id ?? `row-${index}`;
}

export default function LeaderboardDisplay({
    entries = [],
    currentUserId,
    filter = 'today',
    onFilterChange,
    previousEntries = null,
    currentUserEntry = null,
    currentUserRank = null,
    loading = false
}) {
    const [activeFilter, setActiveFilter] = useState(filter);

    // Stay in step with the parent when it owns the range (controlled usage).
    useEffect(() => {
        setActiveFilter(filter);
    }, [filter]);

    const rows = Array.isArray(entries) ? entries : [];

    // Previous-position lookup for the movement arrows.
    const previousRanks = useMemo(() => {
        const map = new Map();
        if (Array.isArray(previousEntries)) {
            previousEntries.forEach((e, i) => {
                const id = e?.user_id ?? e?.id;
                if (id != null && !map.has(id)) map.set(id, i + 1);
            });
        }
        return map;
    }, [previousEntries]);

    const currentUserInList = rows.some(e => e?.user_id && e.user_id === currentUserId);
    const showPinnedUserRow = Boolean(currentUserId && currentUserEntry && !currentUserInList);

    const getRankStyle = (rank) => {
        if (rank === 1) return { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.1)' };
        if (rank === 2) return { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.1)' };
        if (rank === 3) return { color: '#cd7f32', bg: 'rgba(205, 127, 50, 0.1)' };
        return { color: 'rgba(255, 255, 255, 0.5)', bg: 'transparent' };
    };

    const handleFilterClick = (next) => {
        if (next === activeFilter) return;
        setActiveFilter(next);
        onFilterChange?.(next);
    };

    const renderRow = (entry, rank, { pinned = false, key = undefined } = {}) => {
        const style = getRankStyle(rank);
        const isCurrentUser = Boolean(entry?.user_id) && entry.user_id === currentUserId;
        const prevRank = previousRanks.get(entry?.user_id ?? entry?.id);
        const delta = Number.isFinite(prevRank) ? prevRank - rank : null;
        const time = readTime(entry);
        const diamonds = readDiamonds(entry);

        return (
            <div
                key={key}
                className={`leaderboard-entry${isCurrentUser ? ' current-user' : ''}${pinned ? ' pinned' : ''}`}
                style={{ background: isCurrentUser ? 'rgba(35, 116, 225, 0.1)' : style.bg }}
            >
                <div className="rank" style={{ color: style.color }}>
                    {rank <= 3 && !pinned ? <Crown size={16} /> : rank}
                </div>

                {previousRanks.size > 0 && (
                    <div className="movement" data-dir={delta == null ? 'new' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}>
                        {delta == null ? (
                            <span className="movement-new">NEW</span>
                        ) : delta > 0 ? (
                            <>
                                <ChevronUp size={12} />
                                {delta}
                            </>
                        ) : delta < 0 ? (
                            <>
                                <ChevronDown size={12} />
                                {Math.abs(delta)}
                            </>
                        ) : (
                            <Minus size={12} />
                        )}
                    </div>
                )}

                <div className="user-info">
                    <div className="avatar">
                        <User size={16} />
                    </div>
                    <span className="username">
                        {entry?.username || 'Anonymous'}
                        {isCurrentUser && <span className="you-badge">YOU</span>}
                    </span>
                </div>
                <div className="score">{readScore(entry).toLocaleString()} pts</div>
                {time !== null && (
                    <div className="time">
                        <Clock size={14} />
                        {time}s
                    </div>
                )}
                {diamonds > 0 && (
                    <div className="diamonds">
                        <Gem size={14} />
                        {diamonds.toLocaleString()}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="leaderboard">
            <div className="leaderboard-header">
                <h3>
                    <Trophy size={20} />
                    Leaderboard
                </h3>
                {/* The range tabs only exist when the parent can actually re-query.
                    A tab that highlights but never changes the data is worse than
                    no tab at all. */}
                {typeof onFilterChange === 'function' && (
                    <div className="filter-tabs">
                        <button
                            type="button"
                            className={`filter-tab ${activeFilter === 'today' ? 'active' : ''}`}
                            onClick={() => handleFilterClick('today')}
                        >
                            Today
                        </button>
                        <button
                            type="button"
                            className={`filter-tab ${activeFilter === 'week' ? 'active' : ''}`}
                            onClick={() => handleFilterClick('week')}
                        >
                            This Week
                        </button>
                    </div>
                )}
            </div>

            <div className="leaderboard-list">
                {loading ? (
                    <div className="empty-state">
                        <p>Loading Rankings...</p>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="empty-state">
                        <p>No Entries Yet. Be The First!</p>
                    </div>
                ) : (
                    rows.map((entry, index) => renderRow(entry, index + 1, { key: entryKey(entry, index) }))
                )}
            </div>

            {showPinnedUserRow && (
                <div className="pinned-wrap">
                    <div className="pinned-divider" />
                    {renderRow(currentUserEntry, Number(currentUserRank) || rows.length + 1, {
                        pinned: true,
                        key: 'pinned-current-user'
                    })}
                </div>
            )}

            <style>{`
                .leaderboard {
                    background: #18191a;
                    border: 1px solid #4e4f50;
                    border-radius: 12px;
                    overflow: hidden;
                }

                .leaderboard-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px 20px;
                    border-bottom: 1px solid #4e4f50;
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
                    color: #65676b;
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .filter-tab:hover {
                    color: rgba(255, 255, 255, 0.8);
                }

                .filter-tab.active {
                    background: #3a3b3c;
                    color: #ffffff;
                }

                .leaderboard-list {
                    padding: 8px;
                }

                .empty-state {
                    padding: 40px 20px;
                    text-align: center;
                    color: #65676b;
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
                    border: 1px solid rgba(35, 116, 225, 0.3);
                }

                .pinned-wrap {
                    padding: 0 8px 8px;
                    background: rgba(35, 116, 225, 0.04);
                }

                .pinned-divider {
                    height: 1px;
                    margin: 0 8px 8px;
                    background: repeating-linear-gradient(
                        90deg,
                        #4e4f50 0 6px,
                        transparent 6px 12px
                    );
                }

                .leaderboard-entry.pinned {
                    position: sticky;
                    bottom: 0;
                }

                .rank {
                    width: 28px;
                    font-weight: 700;
                    font-size: 14px;
                    text-align: center;
                }

                .movement {
                    display: flex;
                    align-items: center;
                    gap: 2px;
                    min-width: 30px;
                    font-size: 11px;
                    font-weight: 700;
                    color: #65676b;
                }

                .movement[data-dir="up"] { color: #22c55e; }
                .movement[data-dir="down"] { color: #ef4444; }
                .movement[data-dir="flat"] { color: #65676b; }
                .movement[data-dir="new"] { color: #fbbf24; }

                .movement-new {
                    font-size: 9px;
                    letter-spacing: 0.5px;
                }

                .user-info {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    flex: 1;
                    min-width: 0;
                }

                .avatar {
                    width: 32px;
                    height: 32px;
                    background: #3a3b3c;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #65676b;
                    flex-shrink: 0;
                }

                .username {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.9);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    min-width: 0;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .you-badge {
                    font-size: 10px;
                    font-weight: 700;
                    color: #2374e1;
                    background: rgba(35, 116, 225, 0.2);
                    padding: 2px 6px;
                    border-radius: 4px;
                    flex-shrink: 0;
                }

                .score {
                    font-weight: 600;
                    color: #ffffff;
                    font-size: 14px;
                    white-space: nowrap;
                }

                .time {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 12px;
                    color: #65676b;
                }

                .diamonds {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 12px;
                    color: #2374e1;
                }
            `}</style>
        </div>
    );
}
