/**
 * LiveGamesFeed - Real-time feed of live games at poker venues
 * Shows games reported by players with ability to confirm/update
 */

import { useState, useEffect, useCallback } from 'react';

const GAME_TYPE_LABELS = {
    nlh: 'NLH',
    plo: 'PLO',
    plo8: 'PLO8',
    mixed: 'Mixed',
    stud: 'Stud',
    razz: 'Razz',
    omaha: 'Omaha',
    other: 'Other'
};

const GAME_QUALITY_COLORS = {
    soft: { bg: 'rgba(34, 197, 94, 0.2)', text: '#22c55e', label: 'Soft' },
    average: { bg: 'rgba(59, 130, 246, 0.2)', text: '#3b82f6', label: 'Average' },
    tough: { bg: 'rgba(239, 68, 68, 0.2)', text: '#ef4444', label: 'Tough' }
};

function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    return date.toLocaleDateString();
}

function LiveGameCard({ game, onConfirm, onReport, user }) {
    const [confirming, setConfirming] = useState(false);

    const handleConfirm = async () => {
        if (!user) return;
        setConfirming(true);
        try {
            await onConfirm(game.id, 'confirm');
        } finally {
            setConfirming(false);
        }
    };

    const qualityStyle = game.game_quality ? GAME_QUALITY_COLORS[game.game_quality] : null;

    return (
        <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '12px'
        }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
                        {game.venue?.name || game.venue_name || 'Unknown Venue'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                        {game.venue?.city || game.venue_city}, {game.venue?.state || game.venue_state}
                        {game.distance_miles && (
                            <span style={{ marginLeft: '8px', color: '#00D4FF' }}>
                                {game.distance_miles.toFixed(1)} mi
                            </span>
                        )}
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
                        {formatTimeAgo(game.reported_at)}
                    </div>
                    {game.confirmation_count > 1 && (
                        <div style={{
                            fontSize: '11px',
                            color: '#22c55e',
                            marginTop: '2px'
                        }}>
                            {game.confirmation_count} confirmations
                        </div>
                    )}
                </div>
            </div>

            {/* Game Info */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                <span style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    background: 'rgba(0, 212, 255, 0.15)',
                    border: '1px solid rgba(0, 212, 255, 0.3)',
                    color: '#00D4FF',
                    fontSize: '13px',
                    fontWeight: 700
                }}>
                    {GAME_TYPE_LABELS[game.game_type] || game.game_type}
                </span>
                <span style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 600
                }}>
                    ${game.stakes}
                </span>
                {game.table_count > 1 && (
                    <span style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        color: 'rgba(255,255,255,0.7)',
                        fontSize: '12px'
                    }}>
                        {game.table_count} tables
                    </span>
                )}
                {qualityStyle && (
                    <span style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: qualityStyle.bg,
                        color: qualityStyle.text,
                        fontSize: '12px',
                        fontWeight: 500
                    }}>
                        {qualityStyle.label}
                    </span>
                )}
            </div>

            {/* Status */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={game.seats_open > 0 ? '#22c55e' : '#ef4444'} strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span style={{ fontSize: '13px', color: game.seats_open > 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                        {game.seats_open > 0 ? `${game.seats_open} seats open` : 'No seats'}
                    </span>
                </div>
                {game.waitlist_size > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        <span style={{ fontSize: '13px', color: '#f59e0b' }}>
                            {game.waitlist_size} on waitlist
                        </span>
                    </div>
                )}
            </div>

            {/* Notes */}
            {game.notes && (
                <div style={{
                    fontSize: '13px',
                    color: 'rgba(255,255,255,0.6)',
                    fontStyle: 'italic',
                    marginBottom: '12px',
                    padding: '8px 12px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '6px'
                }}>
                    "{game.notes}"
                </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px' }}>
                <button
                    onClick={handleConfirm}
                    disabled={!user || confirming}
                    style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: 'rgba(34, 197, 94, 0.15)',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        color: '#22c55e',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: user ? 'pointer' : 'not-allowed',
                        opacity: user ? 1 : 0.5
                    }}
                >
                    {confirming ? 'Confirming...' : 'Still Running'}
                </button>
                <button
                    onClick={() => onReport(game, 'update')}
                    disabled={!user}
                    style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: 'rgba(59, 130, 246, 0.15)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        color: '#3b82f6',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: user ? 'pointer' : 'not-allowed',
                        opacity: user ? 1 : 0.5
                    }}
                >
                    Update Info
                </button>
                <button
                    onClick={() => onReport(game, 'expired')}
                    disabled={!user}
                    style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#ef4444',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: user ? 'pointer' : 'not-allowed',
                        opacity: user ? 1 : 0.5
                    }}
                >
                    Ended
                </button>
            </div>
        </div>
    );
}

export default function LiveGamesFeed({
    userLocation,
    radiusMiles = 50,
    gameType,
    stakes,
    user,
    refreshTrigger,
    onReportGame
}) {
    const [games, setGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchGames = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            let url = '/api/public/live-games';
            const params = new URLSearchParams();

            if (userLocation) {
                params.set('lat', userLocation.lat);
                params.set('lng', userLocation.lng);
                params.set('radius', radiusMiles);
            }
            if (gameType && gameType !== 'all') params.set('game_type', gameType);
            if (stakes && stakes !== 'all') params.set('stakes', stakes);

            if (params.toString()) {
                url += '?' + params.toString();
            }

            const response = await fetch(url);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch games');
            }

            setGames(data.games || []);
        } catch (err) {
            setError(err.message);
            setGames([]);
        } finally {
            setLoading(false);
        }
    }, [userLocation, radiusMiles, gameType, stakes]);

    useEffect(() => {
        fetchGames();

        // Auto-refresh every 2 minutes
        const interval = setInterval(fetchGames, 120000);
        return () => clearInterval(interval);
    }, [fetchGames, refreshTrigger]);

    const handleConfirm = async (gameId, action) => {
        if (!user) return;

        try {
            const response = await fetch(`/api/public/live-games/${gameId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.token || ''}`
                },
                body: JSON.stringify({ action })
            });

            if (response.ok) {
                // Refresh games
                fetchGames();
            }
        } catch (err) {
            console.error('Error confirming game:', err);
        }
    };

    const handleReport = (game, action) => {
        if (action === 'update' && onReportGame) {
            onReportGame(game.venue || { id: game.venue_id, name: game.venue_name });
        } else if (action === 'expired') {
            handleConfirm(game.id, 'expired');
        }
    };

    if (loading && games.length === 0) {
        return (
            <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: 'rgba(255,255,255,0.5)'
            }}>
                <div style={{
                    width: 40,
                    height: 40,
                    border: '3px solid rgba(255,255,255,0.1)',
                    borderTopColor: '#00D4FF',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto 16px'
                }} />
                Loading live games...
            </div>
        );
    }

    if (error) {
        return (
            <div style={{
                padding: '20px',
                textAlign: 'center',
                color: '#ef4444',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '12px',
                border: '1px solid rgba(239, 68, 68, 0.2)'
            }}>
                {error}
                <button
                    onClick={fetchGames}
                    style={{
                        display: 'block',
                        margin: '12px auto 0',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        background: 'rgba(239, 68, 68, 0.2)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#ef4444',
                        cursor: 'pointer'
                    }}
                >
                    Retry
                </button>
            </div>
        );
    }

    if (games.length === 0) {
        return (
            <div style={{
                padding: '40px 20px',
                textAlign: 'center'
            }}>
                <div style={{
                    width: 60,
                    height: 60,
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px'
                }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <path d="M3 9h18" />
                        <path d="M9 21V9" />
                    </svg>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '15px', marginBottom: '8px' }}>
                    No live games reported
                </div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>
                    Be the first to report a game at a nearby venue!
                </div>
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
            }}>
                <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)' }}>
                    {games.length} live game{games.length !== 1 ? 's' : ''} reported
                </div>
                <button
                    onClick={fetchGames}
                    disabled={loading}
                    style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.7)',
                        fontSize: '12px',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}
                    >
                        <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        <path d="M9 12l2 2 4-4" />
                    </svg>
                    Refresh
                </button>
            </div>

            {/* Games List */}
            {games.map(game => (
                <LiveGameCard
                    key={game.id}
                    game={game}
                    onConfirm={handleConfirm}
                    onReport={handleReport}
                    user={user}
                />
            ))}
        </div>
    );
}
