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
import { printPlayerName } from '../../lib/trivia/printPlayerName';

// A player name printed in Title Case without rewriting it ('river_rat22'
// reads 'River_Rat22'). Shared with every other Trivia surface that prints a
// handle; re-exported here for the callers that already import it from this
// component.
export { printPlayerName };

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

    // Rank inks are the master's own: gold, silver, lit blue, then muted.
    const getRankInk = (rank) => {
        if (rank === 1) return 'tc-ink--gold';
        if (rank === 2) return 'tc-ink--silver';
        if (rank === 3) return 'tc-ink--blue';
        return 'tc-ink--muted';
    };

    const handleFilterClick = (next) => {
        if (next === activeFilter) return;
        setActiveFilter(next);
        onFilterChange?.(next);
    };

    const renderRow = (entry, rank, { pinned = false, key = undefined } = {}) => {
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
                <div className={`trivia-lb-rank ${getRankInk(rank)}`}>
                    {formatTriviaDisplayNumber(rank)}
                </div>

                <div className="trivia-lb-user">
                    <span className={`trivia-lb-username ${isCurrentUser ? 'tc-ink--white' : 'tc-ink--silver'}`}>
                        {printPlayerName(entry?.username)}
                    </span>
                    {isCurrentUser && <span className="trivia-lb-you tc-ink--blue">You</span>}
                    {previousRanks.size > 0 && (
                        <span
                            className={`trivia-lb-movement ${delta == null ? 'tc-ink--blue' : delta > 0 ? 'tc-ink--green' : delta < 0 ? 'tc-ink--red' : 'tc-ink--muted'}`}
                            data-dir={delta == null ? 'new' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}
                        >
                            {delta == null ? 'New' : delta > 0 ? `Up ${delta}` : delta < 0 ? `Down ${Math.abs(delta)}` : 'Steady'}
                        </span>
                    )}
                </div>
                <div className="trivia-lb-score tc-ink--silver">{formatTriviaDisplayNumber(readScore(entry))} Pts</div>
                {(time !== null || diamonds > 0) && (
                    <div className="trivia-lb-meta">
                        {time !== null && (
                            <span className="trivia-lb-time">
                                <span className="trivia-lb-datum-label">Time</span>
                                <span className="tc-ink--muted">{time >= 60 ? `${Math.floor(time / 60)} Min ${time % 60} Sec` : `${time} Sec`}</span>
                            </span>
                        )}
                        {diamonds > 0 && (
                            <span className="trivia-lb-diamonds">
                                <span className="trivia-lb-datum-label">Diamonds</span>
                                <span className="tc-ink--gold">{formatTriviaDisplayNumber(diamonds)}</span>
                            </span>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="trivia-lb">
            <div className="trivia-lb-header">
                <h2 className="trivia-lb-title tc-label">Leaderboard</h2>
                {/* The range tabs only exist when the parent can actually re-query.
                    A tab that highlights but never changes the data is worse than
                    no tab at all. Printed as lit words on the glass. */}
                {typeof onFilterChange === 'function' && (
                    <div className="trivia-lb-filters" role="group" aria-label="Leaderboard Range">
                        <button
                            type="button"
                            className={`trivia-lb-filter tc-word ${activeFilter === 'today' ? 'active' : ''}`}
                            aria-pressed={activeFilter === 'today'}
                            onClick={() => handleFilterClick('today')}
                        >
                            Today
                        </button>
                        <button
                            type="button"
                            className={`trivia-lb-filter tc-word ${activeFilter === 'week' ? 'active' : ''}`}
                            aria-pressed={activeFilter === 'week'}
                            onClick={() => handleFilterClick('week')}
                        >
                            This Week
                        </button>
                    </div>
                )}
            </div>

            <div className="trivia-lb-list" role="list" aria-label="Trivia Rankings">
                {loading ? (
                    <div className="trivia-lb-empty" role="listitem">
                        <p className="trivia-console-copy tc-ink--muted">Loading Rankings</p>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="trivia-lb-empty" role="listitem">
                        <p className="trivia-console-copy tc-ink--muted">No Entries Yet. Be The First!</p>
                    </div>
                ) : (
                    rows.map((entry, index) => renderRow(entry, index + 1, { key: entryKey(entry, index) }))
                )}
            </div>

            {showPinnedUserRow && (
                <div className="trivia-lb-pinned-wrap" role="list" aria-label="Your Rank">
                    {renderRow(currentUserEntry, Number(currentUserRank) || rows.length + 1, {
                        pinned: true,
                        key: 'pinned-current-user'
                    })}
                </div>
            )}
        </div>
    );
}
