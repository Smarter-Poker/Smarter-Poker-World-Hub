/**
 * LEADERBOARD DISPLAY - Trivia rankings
 *
 * Props
 *   entries          array of leaderboard rows (trivia_scores shaped)
 *   currentUserId    highlights + anchors the sticky "your rank" row
 *   filter           'today' | 'week' - the ACTIVE range (controlled by parent)
 *   onFilterChange   (filter) => void. REQUIRED for the range tabs to render.
 *                    Without it the tabs are hidden rather than shown as a
 *                    control that silently does nothing.
 *   previousEntries  optional prior snapshot of `entries`; drives up/down rank
 *                    movement arrows.
 *   currentUserEntry optional row for the signed-in user when they are outside
 *                    the visible slice - rendered as a pinned footer row.
 *   currentUserRank  their real rank (1-based) for that pinned row.
 *   loading          renders a skeleton instead of the empty state.
 *
 * Field mapping note: trivia_scores exposes `time_spent` and `diamonds_earned`.
 * The component previously read `entry.time` / `entry.diamonds`, which are not
 * columns, so those chips never rendered. Both spellings are accepted now.
 */

import { useState, useEffect, useMemo } from 'react';
import { formatTriviaDisplayNumber } from '../../lib/trivia/formatTriviaDisplayNumber';

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
        if (rank === 1) return { color: '#ffd700' };
        if (rank === 2) return { color: '#e4e7ec' };
        if (rank === 3) return { color: '#45adff' };
        return { color: '#9aa5b3' };
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
                className={`trivia-lb-entry${isCurrentUser ? ' current-user' : ''}${pinned ? ' pinned' : ''}`}
                role="listitem"
                aria-current={isCurrentUser ? 'true' : undefined}
            >
                <div className="trivia-lb-rank" style={{ color: style.color }}>
                    {rank}
                </div>

                {previousRanks.size > 0 && (
                    <div className="trivia-lb-movement" data-dir={delta == null ? 'new' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}>
                        {delta == null ? (
                            <span className="trivia-lb-movement-new">New</span>
                        ) : delta > 0 ? (
                            <span>Up {delta}</span>
                        ) : delta < 0 ? (
                            <span>Down {Math.abs(delta)}</span>
                        ) : (
                            <span>Steady</span>
                        )}
                    </div>
                )}

                <div className="trivia-lb-user">
                    <span className="trivia-lb-username">
                        {entry?.username || 'Anonymous'}
                        {isCurrentUser && <span className="trivia-lb-you">You</span>}
                    </span>
                </div>
                <div className="trivia-lb-score">{formatTriviaDisplayNumber(readScore(entry))} Pts</div>
                {time !== null && (
                    <div className="trivia-lb-time">
                        <span className="trivia-lb-datum-label">Time</span>
                        {formatTriviaDisplayNumber(time)}s
                    </div>
                )}
                {diamonds > 0 && (
                    <div className="trivia-lb-diamonds">
                        <span className="trivia-lb-datum-label">Diamonds</span>
                        {formatTriviaDisplayNumber(diamonds)}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="trivia-lb">
            <div className="trivia-lb-header">
                <h3>Leaderboard</h3>
                {/* The range tabs only exist when the parent can actually re-query.
                    A tab that highlights but never changes the data is worse than
                    no tab at all. */}
                {typeof onFilterChange === 'function' && (
                    <div className="trivia-lb-filters">
                        <button
                            type="button"
                            className={`trivia-lb-filter ${activeFilter === 'today' ? 'active' : ''}`}
                            onClick={() => handleFilterClick('today')}
                        >
                            Today
                        </button>
                        <button
                            type="button"
                            className={`trivia-lb-filter ${activeFilter === 'week' ? 'active' : ''}`}
                            onClick={() => handleFilterClick('week')}
                        >
                            This Week
                        </button>
                    </div>
                )}
            </div>

            <div className="trivia-lb-list" role="list" aria-label="Trivia Rankings">
                {loading ? (
                    <div className="trivia-lb-empty">
                        <p>Loading Rankings...</p>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="trivia-lb-empty">
                        <p>No Entries Yet. Be The First!</p>
                    </div>
                ) : (
                    rows.map((entry, index) => renderRow(entry, index + 1, { key: entryKey(entry, index) }))
                )}
            </div>

            {showPinnedUserRow && (
                <div className="trivia-lb-pinned-wrap" role="list" aria-label="Your Rank">
                    <div className="trivia-lb-pinned-divider" />
                    {renderRow(currentUserEntry, Number(currentUserRank) || rows.length + 1, {
                        pinned: true,
                        key: 'pinned-current-user'
                    })}
                </div>
            )}

            <style>{`
                .trivia-lb {
                    width: 100%;
                    min-width: 0;
                    color: #e4e7ec;
                    background: transparent;
                    font-family: Inter, system-ui, sans-serif;
                }

                .trivia-lb-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 16px;
                    padding: 14px 0;
                    border-bottom: 1px solid #050607;
                }

                .trivia-lb-header h3 {
                    display: flex;
                    align-items: center;
                    margin: 0;
                    color: #45adff;
                    font-family: 'Roboto Condensed', Inter, system-ui, sans-serif;
                    font-size: 18px;
                    font-weight: 800;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                }

                .trivia-lb-filters {
                    display: flex;
                    gap: 12px;
                }

                .trivia-lb-filter {
                    min-height: 44px;
                    padding: 8px 2px;
                    background: transparent;
                    border: 0;
                    border-bottom: 2px solid transparent;
                    color: #9aa5b3;
                    font-size: 12px;
                    font-weight: 700;
                    letter-spacing: 0.04em;
                    cursor: pointer;
                    touch-action: manipulation;
                }

                .trivia-lb-filter:active {
                    color: #f4f7fb;
                }

                .trivia-lb-filter.active {
                    border-bottom-color: #45adff;
                    color: #f4f7fb;
                }

                .trivia-lb-list {
                    padding: 0;
                }

                .trivia-lb-empty {
                    padding: 40px 20px;
                    text-align: center;
                    color: #9aa5b3;
                    font-size: 14px;
                }

                .trivia-lb-entry {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    min-height: 56px;
                    padding: 10px 0;
                    border-bottom: 1px solid #050607;
                }

                .trivia-lb-entry:last-child {
                    border-bottom: 0;
                }

                .trivia-lb-entry.current-user {
                    border-inline-start: 3px solid #45adff;
                    padding-inline-start: 9px;
                }

                .trivia-lb-pinned-wrap {
                    padding: 0;
                    background: transparent;
                }

                .trivia-lb-pinned-divider {
                    height: 0;
                    border-top: 2px solid #45adff;
                }

                .trivia-lb-entry.pinned {
                    position: sticky;
                    bottom: 0;
                }

                .trivia-lb-rank {
                    width: 28px;
                    font-weight: 700;
                    font-size: 14px;
                    text-align: center;
                }

                .trivia-lb-movement {
                    display: flex;
                    align-items: center;
                    gap: 2px;
                    min-width: 54px;
                    font-size: 12px;
                    font-weight: 700;
                    color: #9aa5b3;
                }

                .trivia-lb-movement[data-dir="up"] { color: #c8ffd2; }
                .trivia-lb-movement[data-dir="down"] { color: #ff5b6e; }
                .trivia-lb-movement[data-dir="flat"] { color: #9aa5b3; }
                .trivia-lb-movement[data-dir="new"] { color: #fbbf24; }

                .trivia-lb-movement-new {
                    font-size: 12px;
                    letter-spacing: 0.5px;
                }

                .trivia-lb-user {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    flex: 1;
                    min-width: 0;
                }

                .trivia-lb-username {
                    font-size: 14px;
                    color: #e4e7ec;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    min-width: 0;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .trivia-lb-you {
                    font-size: 12px;
                    font-weight: 700;
                    color: #45adff;
                    flex-shrink: 0;
                }

                .trivia-lb-score {
                    font-weight: 600;
                    color: #f4f7fb;
                    font-size: 14px;
                    white-space: nowrap;
                }

                .trivia-lb-time {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 12px;
                    color: #9aa5b3;
                }

                .trivia-lb-diamonds {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 12px;
                    color: #45adff;
                }

                .trivia-lb-datum-label {
                    position: absolute;
                    width: 1px;
                    height: 1px;
                    overflow: hidden;
                    clip: rect(0 0 0 0);
                    white-space: nowrap;
                }

                .trivia-lb-filter:focus-visible {
                    outline: 2px solid #8fd4ff;
                    outline-offset: 2px;
                }

                @media (max-width: 520px) {
                    .trivia-lb-header {
                        align-items: flex-start;
                        flex-direction: column;
                    }

                    .trivia-lb-filters,
                    .trivia-lb-filter {
                        width: 100%;
                    }

                    .trivia-lb-movement,
                    .trivia-lb-time {
                        display: none;
                    }

                    .trivia-lb-entry {
                        gap: 8px;
                    }

                    .trivia-lb-rank {
                        width: 24px;
                    }
                }
            `}</style>
        </div>
    );
}
